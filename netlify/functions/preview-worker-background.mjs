// Background worker: pulls queued preview jobs, runs full pipeline (brief analyst → Claude
// short story → ElevenLabs TTS → Supabase Storage upload → email).
// Triggered by /api/verify after email verification, or via direct POST.
// Self-retriggers if more jobs queued at the 12-minute mark.

import { analyzeBrief } from './lib/brief-analyst.mjs';
import { sanitiseStoryData, SYSTEM_PROMPT, buildUserPrompt, getOldestAge } from './lib/story-prompts.mjs';
import { v2ToV1 } from './lib/v2-to-v1.mjs';
import { emailPreviewReady } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

// 6 voices from the brief mapped to ElevenLabs voice IDs
const VOICE_MAP = {
  'British (warm)':       'oWAxZDx7w5VEj9dCyTzz', // Grace
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh', // Dorothy
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal', // Eric
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz', // Ethan
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO', // Callum
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'  // James
};
const DEFAULT_VOICE = 'oWAxZDx7w5VEj9dCyTzz';

const PREVIEW_WORD_COUNT = 290; // ~2 min at 145wpm
const PREVIEW_DURATION_TARGET_MIN = 2;

const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!supabaseUrl || !supabaseKey || !anthropicKey || !elevenKey) {
    console.error('[PREVIEW-WORKER] Missing env vars');
    return resp({ ok: true });
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  // Try to claim a worker slot (mutex)
  try {
    const slotRes = await fetch(`${supabaseUrl}/rest/v1/rpc/try_claim_worker_slot`, {
      method: 'POST', headers: headersJson,
      body: JSON.stringify({ p_job_type: 'preview-v2' })
    });
    if (slotRes.ok) {
      const slot = await slotRes.json();
      if (slot === false) { console.log('[PREVIEW-WORKER] Slot busy, exiting'); return resp({ ok: true }); }
    }
  } catch {}

  const startedAt = Date.now();
  const MAX_RUN_MS = 12 * 60 * 1000; // 12 min, then self-retrigger

  while (Date.now() - startedAt < MAX_RUN_MS) {
    // Claim next preview job
    let claimed;
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_next_job`, {
        method: 'POST', headers: headersJson,
        body: JSON.stringify({ p_job_type: 'preview' })
      });
      if (!r.ok) break;
      claimed = await r.json();
      if (!claimed || !claimed.id) break; // no more jobs
    } catch (e) {
      console.error('[PREVIEW-WORKER] Claim error:', e.message); break;
    }

    const jobId = claimed.id;
    const storyId = claimed.story_id;
    console.log('[PREVIEW-WORKER] Processing job', jobId, 'story', storyId);

    try {
      // Fetch story row
      const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,story_data,version`, { headers });
      const sRows = await sRes.json();
      if (!sRows.length) { await failJob(supabaseUrl, headersJson, jobId, 'Story not found'); continue; }
      const story = sRows[0];
      const rawData = story.story_data || {};
      const storyData = sanitiseStoryData(v2ToV1(rawData));
      const childList = story.child_name || (storyData.children?.map(c => c.name).filter(Boolean).join(' & ')) || 'them';
      const requesterName = storyData.giftFrom || (storyData.children?.[0]?.parentName) || '';

      // 1. Brief analyst
      console.log('[PREVIEW-WORKER] Running brief analyst...');
      const brief = await analyzeBrief(storyData);

      // 2. Generate 2-min preview text via Claude
      console.log('[PREVIEW-WORKER] Generating preview text...');
      const userPrompt = buildUserPrompt(brief, PREVIEW_WORD_COUNT, storyData.category || 'bedtime', { isPreview: true });
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          temperature: 1,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!claudeRes.ok) {
        const errBody = await claudeRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `Claude error ${claudeRes.status}: ${errBody.slice(0, 300)}`);
        continue;
      }
      const claudeData = await claudeRes.json();
      let previewText = '';
      for (const block of claudeData.content || []) {
        if (block.type === 'text') previewText += block.text;
      }
      previewText = previewText.trim();
      if (!previewText) { await failJob(supabaseUrl, headersJson, jobId, 'Empty story text'); continue; }

      // Trim to roughly 2 minutes (≈ 290 words)
      previewText = trimToWordCount(previewText, PREVIEW_WORD_COUNT + 30);
      previewText += "\n\n... To hear what happens next, the full 15-minute story is one tap away.";

      // 3. ElevenLabs TTS
      const voiceId = VOICE_MAP[rawData.voice] || VOICE_MAP[storyData.voice] || DEFAULT_VOICE;
      console.log('[PREVIEW-WORKER] Generating audio with voice', voiceId);
      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prepareTTSText(previewText),
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
        })
      });
      if (!ttsRes.ok) {
        const errText = await ttsRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `ElevenLabs ${ttsRes.status}: ${errText.slice(0, 300)}`);
        continue;
      }
      const audioBuf = await ttsRes.arrayBuffer();

      // 4. Upload to Supabase storage
      const fileName = `previews/${storyId}-${Date.now()}.mp3`;
      const upRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
        body: audioBuf
      });
      if (!upRes.ok) {
        const errText = await upRes.text();
        await failJob(supabaseUrl, headersJson, jobId, `Storage upload failed: ${errText.slice(0, 300)}`);
        continue;
      }
      const previewUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;

      // 5. Update story
      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({
          preview_url: previewUrl,
          preview_text: previewText,
          preview_ready_at: new Date().toISOString(),
          status: 'preview_ready'
        })
      });

      // 6. Mark job done
      await fetch(`${supabaseUrl}/rest/v1/job_queue?id=eq.${encodeURIComponent(jobId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ status: 'done', finished_at: new Date().toISOString() })
      });

      // 7. Get access_token + send preview-ready email
      const sRes2 = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=access_token`, { headers });
      const accessToken = (await sRes2.json())?.[0]?.access_token || '';
      if (resendKey && story.email) {
        const previewListenUrl = `${appUrl}/preview/${storyId}?t=${accessToken}`;
        const tmpl = emailPreviewReady({
          firstName: requesterName,
          childList,
          previewTitle: brief?.title || '',
          previewUrl: previewListenUrl
        });
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: BRAND_FROM,
              to: [story.email],
              reply_to: 'jamie@heartheirname.com',
              subject: tmpl.subject,
              html: tmpl.html,
              text: tmpl.text,
              headers: RESEND_LIST_UNSUB
            })
          });
        } catch (e) { console.error('[PREVIEW-WORKER] Email send failed:', e.message); }
      }

      console.log('[PREVIEW-WORKER] Job', jobId, 'done in', Date.now() - startedAt, 'ms');
    } catch (err) {
      console.error('[PREVIEW-WORKER] Job error:', err.message);
      await failJob(supabaseUrl, headersJson, jobId, err.message?.slice(0, 500));
    }
  }

  // Release slot
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/release_worker_slot`, {
      method: 'POST', headers: headersJson,
      body: JSON.stringify({ p_job_type: 'preview-v2' })
    });
  } catch {}

  // If we hit the time limit, self-retrigger
  if (Date.now() - startedAt >= MAX_RUN_MS) {
    try { await fetch(`${appUrl}/.netlify/functions/preview-worker-background`, { method: 'POST' }); } catch {}
  }

  return resp({ ok: true });
};

async function failJob(supabaseUrl, headersJson, jobId, errMsg) {
  await fetch(`${supabaseUrl}/rest/v1/job_queue?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ status: 'failed', error: errMsg, finished_at: new Date().toISOString() })
  });
}

function trimToWordCount(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  // Find the last sentence end before maxWords
  const truncated = words.slice(0, maxWords).join(' ');
  const lastEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
  return lastEnd > maxWords * 3 ? truncated.slice(0, lastEnd + 1) : truncated + '…';
}

function prepareTTSText(text) {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();
}

function resp(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

export const config = { type: 'experimental-background' };
