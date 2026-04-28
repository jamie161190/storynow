// Background worker for v2 paid full stories.
// Pulls 'full-v2' jobs, runs brief analyst → Claude full story (~2000 words) → ElevenLabs TTS
// → upload audio → mark story ready → send story-ready email.

import { analyzeBrief } from './lib/brief-analyst.mjs';
import { sanitiseStoryData, SYSTEM_PROMPT, buildUserPrompt, getOldestAge } from './lib/story-prompts.mjs';
import { emailStoryReady } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

const VOICE_MAP = {
  'British (warm)':       'oWAxZDx7w5VEj9dCyTzz',
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh',
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal',
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz',
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO',
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'
};
const DEFAULT_VOICE = 'oWAxZDx7w5VEj9dCyTzz';

const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

// Word count by oldest age (matches existing pipeline)
function wordCountForAge(age){
  if (age >= 8) return 2200;
  if (age >= 6) return 2000;
  if (age >= 4) return 1700;
  return 1400;
}

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!supabaseUrl || !supabaseKey || !anthropicKey || !elevenKey) {
    console.error('[FULL-V2-WORKER] Missing env'); return resp({ ok: true });
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  try {
    const slotRes = await fetch(`${supabaseUrl}/rest/v1/rpc/try_claim_worker_slot`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ p_job_type: 'full-v2' })
    });
    if (slotRes.ok) {
      const slot = await slotRes.json();
      if (slot === false) { console.log('[FULL-V2-WORKER] Slot busy'); return resp({ ok: true }); }
    }
  } catch {}

  const startedAt = Date.now();
  const MAX_RUN_MS = 12 * 60 * 1000;

  while (Date.now() - startedAt < MAX_RUN_MS) {
    let claimed;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_next_job`, {
        method: 'POST', headers: headersJson, body: JSON.stringify({ p_job_type: 'full-v2' })
      });
      if (!r.ok) break;
      claimed = await r.json();
      if (!claimed || !claimed.id) break;
    } catch (e) { console.error(e); break; }

    const jobId = claimed.id;
    const storyId = claimed.story_id;
    console.log('[FULL-V2-WORKER] Job', jobId, 'story', storyId);

    try {
      const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,story_data,access_token,gift_recipient_email`, { headers });
      const sRows = await sRes.json();
      if (!sRows.length) { await failJob(supabaseUrl, headersJson, jobId, 'Story not found'); continue; }
      const story = sRows[0];
      const storyData = sanitiseStoryData(story.story_data || {});
      const childList = story.child_name || 'them';
      const requesterName = storyData.giftFrom || (storyData.children?.[0]?.parentName) || '';

      // Brief
      const brief = await analyzeBrief(storyData);

      // Word count based on oldest child's age
      const oldestAge = getOldestAge(storyData) || 6;
      const targetWords = wordCountForAge(oldestAge);

      // Generate full story
      const userPrompt = buildUserPrompt(brief, targetWords, storyData.storyKind || storyData.category || 'bedtime', { isPreview: false });
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          temperature: 1,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!claudeRes.ok) {
        const errBody = await claudeRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `Claude ${claudeRes.status}: ${errBody.slice(0,300)}`);
        continue;
      }
      const claudeData = await claudeRes.json();
      let storyText = '';
      for (const block of claudeData.content || []) {
        if (block.type === 'text') storyText += block.text;
      }
      storyText = storyText.trim();
      if (!storyText) { await failJob(supabaseUrl, headersJson, jobId, 'Empty story text'); continue; }

      // TTS
      const voiceId = VOICE_MAP[storyData.voice] || DEFAULT_VOICE;
      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prepareTTSText(storyText),
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
        })
      });
      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `ElevenLabs ${ttsRes.status}: ${errText.slice(0,300)}`);
        continue;
      }
      const audioBuf = await ttsRes.arrayBuffer();

      // Upload
      const fileName = `full-v2/${storyId}-${Date.now()}.mp3`;
      const upRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
        body: audioBuf
      });
      if (!upRes.ok) {
        const errText = await upRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `Storage upload failed: ${errText.slice(0,300)}`);
        continue;
      }
      const audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;

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

      // Mark job done
      await fetch(`${supabaseUrl}/rest/v1/job_queue?id=eq.${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ status: 'done', finished_at: new Date().toISOString() })
      });

      // Send story-ready email to buyer
      if (resendKey && story.email){
        const storyUrl = `${appUrl}/listen/${storyId}?t=${story.access_token}`;
        const tmpl = emailStoryReady({
          firstName: requesterName,
          childList,
          storyTitle: brief?.title || '',
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
        } catch (e) { console.error('[FULL-V2-WORKER] Email failed:', e.message); }
      }

      // If gift mode, also send to recipient with the gift template
      if (resendKey && story.gift_recipient_email && storyData.isGift){
        const { emailGiftClaim } = await import('./lib/email-templates-v2.mjs');
        const claimUrl = `${appUrl}/listen/${storyId}?t=${story.access_token}`;
        const giftTmpl = emailGiftClaim({
          recipientName: '',
          fromName: storyData.giftFrom || 'Your friend',
          childName: childList,
          giftMessage: storyData.giftMessage || '',
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
    } catch (err) {
      console.error('[FULL-V2-WORKER] Error:', err.message);
      await failJob(supabaseUrl, headersJson, jobId, err.message?.slice(0, 500));
    }
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/release_worker_slot`, {
      method: 'POST', headers: headersJson, body: JSON.stringify({ p_job_type: 'full-v2' })
    });
  } catch {}

  if (Date.now() - startedAt >= MAX_RUN_MS) {
    try { await fetch(`${appUrl}/.netlify/functions/full-worker-v2-background`, { method: 'POST' }); } catch {}
  }

  return resp({ ok: true });
};

async function failJob(supabaseUrl, headersJson, jobId, errMsg) {
  await fetch(`${supabaseUrl}/rest/v1/job_queue?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ status: 'failed', error: errMsg, finished_at: new Date().toISOString() })
  });
}

function prepareTTSText(text) {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
}

function resp(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

export const config = { type: 'experimental-background' };
