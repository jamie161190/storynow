// Background worker for v2 paid full stories.
// Takes a storyId via request body, loads the persisted story_text (the full
// ~2200-word story written by Claude in the preview-worker pass), runs
// chunked ElevenLabs TTS → uploads audio → marks delivered → sends story-
// ready email. NO Claude call here: the story text is already authoritative.
//
// Architecture (single-Claude, two-pass audio):
//   1. preview-worker generates the full story text once, saves story_text,
//      and renders the first ~290 words as the preview MP3.
//   2. After payment, this worker reads story_text and renders the WHOLE
//      thing through TTS as the final delivery audio. The customer hears
//      the same opening they heard in the preview because it's the same
//      Claude generation.
//
// Fallback path: if a story row reaches this worker without story_text
// (e.g. it was created before the new architecture shipped), the worker
// falls back to the legacy "re-run brief + Claude" path. Logged loudly.
//
// Bypasses job_queue: same reason as brief-worker (the job_queue.job_type
// CHECK constraint doesn't include 'full-v2' and a queued insert fails
// silently). Triggered by /api/stripe-webhook-paid after successful payment.

import { analyzeBrief } from './lib/brief-analyst.mjs';
import { sanitiseStoryData, SYSTEM_PROMPT, buildUserPrompt, getWordCount } from './lib/story-prompts.mjs';
import { chunkedTTS, uploadAudio, callClaude } from './lib/audio-pipeline.mjs';
import { v2ToV1 } from './lib/v2-to-v1.mjs';
import { emailStoryReady } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';
import { normalizeNameList } from './lib/format-names.mjs';

// 5 voices in the funnel. "British (warm)" was Grace (American) and got removed.
const VOICE_MAP = {
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh', // Dorothy, british female
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal', // Eric, irish male
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz', // Ethan, american male
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO', // Callum, scottish male
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'  // James, australian male
};
const DEFAULT_VOICE = 'ThT5KcBeYPX3keUQqHPh'; // Dorothy, british female

const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

// wordCountForAge removed — full-worker no longer calls Claude on the
// happy path. Legacy fallback uses getWordCount() from story-prompts.mjs.


export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!supabaseUrl || !supabaseKey || !anthropicKey || !elevenKey) {
    console.error('[FULL-V2-WORKER] Missing env vars');
    return resp({ ok: false, error: 'env' }, 500);
  }

  let storyId;
  try {
    const body = await req.json();
    storyId = body?.storyId || body?.story_id;
  } catch {}
  if (!storyId) {
    const url = new URL(req.url);
    storyId = url.searchParams.get('storyId') || url.searchParams.get('story_id');
  }
  if (!storyId) return resp({ ok: false, error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  console.log('[FULL-V2-WORKER] Story', storyId);

  const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,story_data,access_token,gift_recipient_email,payment_status,status,audio_url,story_text`, { headers });
  if (!sRes.ok) {
    console.error('[FULL-V2-WORKER] Lookup failed:', sRes.status);
    return resp({ ok: false, error: 'lookup failed' }, 500);
  }
  const sRows = await sRes.json();
  if (!sRows.length) return resp({ ok: false, error: 'story not found' }, 404);
  const story = sRows[0];

  // Sanity: must be paid (defensive — webhook should only fire post-payment)
  if (story.payment_status !== 'paid') {
    console.error('[FULL-V2-WORKER] Refusing to generate full story for unpaid row, status:', story.payment_status);
    return resp({ ok: false, error: 'not paid' }, 400);
  }

  // Idempotency: if a story is already delivered, skip. Stops a Stripe webhook
  // retry (or accidental re-trigger) from generating a duplicate story / sending
  // a second story-ready email / charging Claude+ElevenLabs again.
  if (story.status === 'delivered' && story.audio_url) {
    console.log('[FULL-V2-WORKER] Already delivered — skipping');
    return resp({ ok: true, skipped: true, audio_url: story.audio_url });
  }

  const rawData = story.story_data || {};
  const storyData = sanitiseStoryData(v2ToV1(rawData));
  const childList = normalizeNameList(story.child_name) || 'them';
  const requesterName = storyData.giftFrom || (storyData.children?.[0]?.parentName) || '';

  // ── Source the story text ──────────────────────────────────────────────
  // Primary path (new architecture): story_text was persisted by the
  // preview-worker as the full Claude generation. We just render it. No
  // Claude call here. Same words the customer heard in preview.
  //
  // Fallback path: row predates the new architecture, story_text is null.
  // Re-run brief + Claude with full target word count. Logged loudly so we
  // can find these stragglers in production.
  let storyText = (story.story_text || '').trim();
  if (storyText) {
    console.log('[FULL-V2-WORKER] Using persisted story_text (' + storyText.length + ' chars). No Claude call needed.');
  } else {
    console.warn('[FULL-V2-WORKER] No persisted story_text — falling back to legacy Claude generation. Story:', storyId);
    let brief;
    try {
      brief = await analyzeBrief(storyData);
    } catch (err) {
      console.error('[FULL-V2-WORKER] Brief failed (legacy path):', err.message);
      await markFailed(supabaseUrl, headersJson, storyId, 'brief analyst: ' + err.message?.slice(0, 200));
      return resp({ ok: false, error: 'brief failed' }, 500);
    }
    const targetWords = getWordCount('long', storyData);
    try {
      const userPrompt = buildUserPrompt(brief, targetWords, storyData.category || 'bedtime');
      storyText = await callClaude({
        apiKey: anthropicKey,
        system: SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 16000,
        temperature: 1
      });
      if (!storyText) throw new Error('Empty story text');
    } catch (err) {
      console.error('[FULL-V2-WORKER] Text gen failed (legacy path):', err.message);
      await markFailed(supabaseUrl, headersJson, storyId, 'text gen: ' + err.message?.slice(0, 200));
      return resp({ ok: false, error: 'text gen failed' }, 500);
    }
  }

  // ── ElevenLabs TTS, chunked + concatenated ─────────────────────────────
  let audioBuf;
  try {
    const voiceId = VOICE_MAP[rawData.voice] || VOICE_MAP[storyData.voice] || DEFAULT_VOICE;
    audioBuf = await chunkedTTS({ text: storyText, voiceId, elevenKey, label: 'FULL-V2-WORKER' });
  } catch (err) {
    console.error('[FULL-V2-WORKER] TTS failed:', err.message);
    await markFailed(supabaseUrl, headersJson, storyId, 'tts: ' + err.message?.slice(0, 200));
    return resp({ ok: false, error: 'tts failed' }, 500);
  }

  // Upload combined audio
  let audioUrl;
  try {
    audioUrl = await uploadAudio({
      supabaseUrl, supabaseKey,
      fileName: `full-v2/${storyId}-${Date.now()}.mp3`,
      audioBuf
    });
  } catch (err) {
    console.error('[FULL-V2-WORKER] Upload failed:', err.message);
    await markFailed(supabaseUrl, headersJson, storyId, 'upload: ' + err.message?.slice(0, 200));
    return resp({ ok: false, error: 'upload failed' }, 500);
  }

  // Update story
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({
      audio_url: audioUrl,
      story_text: storyText,
      status: 'delivered',
      delivered_at: new Date().toISOString()
    })
  });

  // Send story-ready email to buyer
  if (resendKey && story.email){
    const storyUrl = `${appUrl}/listen/${storyId}?t=${story.access_token}`;
    const tmpl = emailStoryReady({
      firstName: requesterName,
      childList,
      storyTitle: '',
      storyUrl,
      mp3Url: audioUrl,
      jamieNote: ''
    });
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: BRAND_FROM, to: [story.email], reply_to: 'jamie@heartheirname.com',
          subject: tmpl.subject, html: tmpl.html, text: tmpl.text, headers: RESEND_LIST_UNSUB
        })
      });
    } catch (e) { console.error('[FULL-V2-WORKER] Buyer email failed:', e.message); }
  }

  // Gift mode: also send to recipient
  if (resendKey && story.gift_recipient_email && rawData.isGift){
    const { emailGiftClaim } = await import('./lib/email-templates-v2.mjs');
    const claimUrl = `${appUrl}/listen/${storyId}?t=${story.access_token}`;
    const giftTmpl = emailGiftClaim({
      recipientName: '',
      fromName: rawData.giftFrom || 'Your friend',
      childName: childList,
      giftMessage: rawData.giftMessage || '',
      claimUrl
    });
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: BRAND_FROM, to: [story.gift_recipient_email], reply_to: 'jamie@heartheirname.com',
          subject: giftTmpl.subject, html: giftTmpl.html, text: giftTmpl.text, headers: RESEND_LIST_UNSUB
        })
      });
    } catch (e) { console.error('[FULL-V2-WORKER] Gift email failed:', e.message); }
  }

  console.log('[FULL-V2-WORKER] Done. Story at', audioUrl);
  return resp({ ok: true, audio_url: audioUrl });
};

async function markFailed(supabaseUrl, headersJson, storyId, error) {
  // Read existing story_data so we can preserve everything else when patching
  // the last_error field. Best-effort — if read fails, still set status.
  let existingData = {};
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=story_data`, { headers: headersJson });
    if (r.ok) {
      const rows = await r.json();
      existingData = rows[0]?.story_data || {};
    }
  } catch {}
  const merged = { ...existingData, last_error: { at: new Date().toISOString(), error: String(error).slice(0, 500) } };
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ status: 'full_failed', story_data: merged })
  }).catch(() => {});
  console.error('[FULL-V2-WORKER] Marked failed:', error);
}

// prepareTTSText now lives in lib/tts-text.mjs (handles em-dash strip too).

function resp(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }

export const config = { type: 'experimental-background' };
