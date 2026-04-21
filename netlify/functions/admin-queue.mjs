// Admin Queue API: manages the story order queue.
// Actions: list (pending/delivered), generate-tts, regenerate, send, rewrite-request
// Protected by ADMIN_SECRET header.

import { SYSTEM_PROMPT, buildRegeneratePrompt, buildCompleteStoryPrompt } from './lib/story-prompts.mjs';
import { logError } from './lib/log-error.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// TTS helpers (same as full-worker-background)
function prepareTTSText(text) {
  text = text.replace(/\.\s*\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\.\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\s*\.\.\.\s*/g, '. ');
  text = text.replace(/\.\s*\.\s+/g, '. ');
  text = text.replace(/\s{3,}/g, ' ');
  return text.trim();
}

function splitIntoChunks(text, maxChars = 4000) {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function stripID3(buffer) {
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    offset = 10 + size;
  }
  return bytes.slice(offset);
}

function stripXingFrame(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 4 || (bytes[0] & 0xFF) !== 0xFF || (bytes[1] & 0xE0) !== 0xE0) return bytes;
  const mpegV = (bytes[1] >> 3) & 0x03;
  const layer = (bytes[1] >> 1) & 0x03;
  const sr = (bytes[2] >> 2) & 0x03;
  if (mpegV === 0x01 || layer === 0x00 || sr === 0x03) return bytes;
  const brIdx = (bytes[2] >> 4) & 0x0F;
  const brTable = [[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]];
  const srTable = [[44100,48000,32000],[22050,24000,16000],[11025,12000,8000]];
  const vi = mpegV === 0x03 ? 0 : (mpegV === 0x02 ? 1 : 2);
  const li = layer === 0x03 ? 0 : (layer === 0x02 ? 1 : 2);
  const bitrate = (brTable[li] && brTable[li][brIdx]) ? brTable[li][brIdx] * 1000 : 0;
  const sampleRate = (srTable[vi] && srTable[vi][sr]) ? srTable[vi][sr] : 0;
  if (!bitrate || !sampleRate) return bytes;
  const padding = (bytes[2] >> 1) & 0x01;
  const samplesPerFrame = layer === 0x03 ? 1152 : (layer === 0x02 ? 1152 : 384);
  const frameLen = Math.floor((samplesPerFrame * bitrate) / (8 * sampleRate)) + padding;
  if (frameLen <= 4 || frameLen > bytes.length) return bytes;
  const sideInfoOffset = mpegV === 0x03 ? ((bytes[3] & 0xC0) === 0xC0 ? 17 : 32) : ((bytes[3] & 0xC0) === 0xC0 ? 9 : 17);
  const headerEnd = 4 + sideInfoOffset;
  if (headerEnd + 4 > frameLen) return bytes;
  const slice = bytes.slice(headerEnd, Math.min(headerEnd + 8, bytes.length));
  const tag = String.fromCharCode(...slice);
  if (tag.startsWith('Xing') || tag.startsWith('Info')) {
    return bytes.slice(frameLen);
  }
  return bytes;
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries - 1) return res;
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export default async (req) => {
  // Auth check
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.get('x-admin-secret') || req.headers.get('authorization');
  if (!adminSecret || authHeader !== adminSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  if (!supabaseUrl || !supabaseKey) return json({ error: 'Storage not configured' }, 503);

  // ── LIST: Get orders by status ──
  if (action === 'list') {
    const status = url.searchParams.get('status') || 'pending';
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const statusFilter = status === 'pending' ? 'status=in.(pending,generating,ready)' : `status=eq.${encodeURIComponent(status)}`;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?${statusFilter}&select=id,email,child_name,category,voice_id,story_text,audio_url,story_data,status,feedback,rejected_versions,gift_delivery_preference,is_gift,gift_email,gift_from,created_at&order=created_at.desc&limit=${limit}`,
      { headers }
    );
    if (!res.ok) return json({ error: 'Failed to query stories' }, 500);
    const stories = await res.json();
    return json({ stories });
  }

  // ── GET: Single story detail ──
  if (action === 'get') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { headers }
    );
    if (!res.ok) return json({ error: 'Failed to query story' }, 500);
    const stories = await res.json();
    return json({ story: stories[0] || null });
  }

  // ── GENERATE-TEXT: Generate story text only (no audio) ──
  // ── UPDATE-DATA: Save edited customer input ──
  if (action === 'update-data' && req.method === 'POST') {
    const body = await req.json();
    const { storyId, updates } = body;
    if (!storyId || !updates) return json({ error: 'Missing storyId or updates' }, 400);

    // Fetch current story_data
    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=story_data,child_name&limit=1`,
      { headers }
    );
    if (!storyRes.ok) return json({ error: 'Failed to fetch story' }, 500);
    const stories = await storyRes.json();
    if (!stories.length) return json({ error: 'Story not found' }, 404);

    const sd = stories[0].story_data || {};

    // Merge updates into story_data
    for (const key in updates) {
      if (key === 'children' && Array.isArray(updates.children)) {
        if (!sd.children) sd.children = [];
        updates.children.forEach(function(child, i) {
          if (!sd.children[i]) sd.children[i] = {};
          for (const k in child) { sd.children[i][k] = child[k]; }
        });
      } else {
        sd[key] = updates[key];
      }
    }

    // Update child_name if childName changed
    const newChildName = updates.childName || (sd.children ? sd.children.map(c => c.name).join(', ') : null);
    const patchData = { story_data: sd };
    if (newChildName) patchData.child_name = newChildName;

    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify(patchData)
    });

    console.log(`[ADMIN-QUEUE] Story data updated for ${storyId}`);
    return json({ success: true });
  }

  // ── UPDATE-TEXT: Save edited story text ──
  if (action === 'update-text' && req.method === 'POST') {
    const body = await req.json();
    const { storyId, storyText } = body;
    if (!storyId || !storyText) return json({ error: 'Missing storyId or storyText' }, 400);

    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ story_text: storyText })
    });

    console.log(`[ADMIN-QUEUE] Story text updated for ${storyId}`);
    return json({ success: true });
  }

  // ── GENERATE-TEXT: Generate story text only (no audio) ──
  if (action === 'generate-text' && req.method === 'POST') {
    const body = await req.json();
    const { storyId } = body;
    if (!storyId) return json({ error: 'Missing storyId' }, 400);

    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=*&limit=1`,
      { headers }
    );
    if (!storyRes.ok) return json({ error: 'Failed to fetch story' }, 500);
    const stories = await storyRes.json();
    if (!stories.length) return json({ error: 'Story not found' }, 404);
    const story = stories[0];
    const sd = story.story_data || {};

    if (story.story_text) return json({ success: true, message: 'Story text already exists', wordCount: story.story_text.split(/\s+/).length });

    console.log(`[ADMIN-QUEUE] Generating complete story text for ${storyId}...`);
    try {
      const fullPrompt = buildCompleteStoryPrompt(sd);
      const genRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          temperature: 1,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: fullPrompt }]
        })
      });
      if (!genRes.ok) throw new Error('Claude API ' + genRes.status);
      const genResult = await genRes.json();
      let storyText = '';
      for (const block of genResult.content) { if (block.type === 'text') storyText += block.text; }

      let messageIntro = '';
      if (sd.personalMessage) {
        messageIntro = 'Before we begin, there is a special message for ' + sd.childName + '. ... ' + sd.personalMessage + ' ... And now, on with the story. ... ';
      }
      const fullText = messageIntro + storyText + ' ... ... A Hear Their Name original ... made with love.';

      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ story_text: fullText })
      });

      const wordCount = fullText.split(/\s+/).length;
      console.log(`[ADMIN-QUEUE] Story text generated: ${wordCount} words`);
      return json({ success: true, wordCount });
    } catch (genErr) {
      console.error('[ADMIN-QUEUE] Story text generation error:', genErr.message);
      return json({ error: 'Story generation failed: ' + genErr.message }, 500);
    }
  }

  // ── GENERATE-TTS: Generate audio from existing story text ──
  if (action === 'generate-tts' && req.method === 'POST') {
    const body = await req.json();
    const { storyId } = body;
    if (!storyId) return json({ error: 'Missing storyId' }, 400);

    // Fetch the story to get voice_id and story_data
    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,story_text,voice_id,story_data,child_name&limit=1`,
      { headers }
    );
    if (!storyRes.ok) return json({ error: 'Failed to fetch story' }, 500);
    const stories = await storyRes.json();
    if (!stories.length) return json({ error: 'Story not found' }, 404);
    const story = stories[0];

    if (!story.story_text) return json({ error: 'No story text yet. Generate story first.' }, 400);

    // Set status to generating
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ status: 'generating' })
    });

    // Trigger full-worker-background which handles TTS reliably (15 min timeout)
    fetch('https://heartheirname.com/.netlify/functions/full-worker-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'tts-only',
        storyData: story.story_data,
        voiceId: story.voice_id,
        jobId: storyId,
        storyText: story.story_text,
        childName: story.child_name
      })
    }).catch(e => console.error('[ADMIN-QUEUE] TTS trigger failed:', e.message));

    console.log(`[ADMIN-QUEUE] TTS generation triggered for ${storyId}`);
    return json({ success: true, message: 'Generating audio in background. Refresh in a few minutes.' });
  }

  // ── REGENERATE: Rewrite story with feedback, then generate TTS ──
  if (action === 'regenerate' && req.method === 'POST') {
    const body = await req.json();
    const { storyId, notes } = body;
    if (!storyId) return json({ error: 'Missing storyId' }, 400);

    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=*&limit=1`,
      { headers }
    );
    if (!storyRes.ok) return json({ error: 'Failed to fetch story' }, 500);
    const stories = await storyRes.json();
    if (!stories.length) return json({ error: 'Story not found' }, 404);
    const story = stories[0];

    // Archive the bad version before clearing
    const patchData = { story_text: null, status: 'pending', audio_url: null };
    if (story.story_text) {
      const rejectedVersions = story.rejected_versions || [];
      rejectedVersions.push({
        text: story.story_text,
        rejected_at: new Date().toISOString(),
        notes: notes || null
      });
      patchData.rejected_versions = rejectedVersions;
      console.log(`[ADMIN-QUEUE] Archived rejected version #${rejectedVersions.length} for ${storyId}`);
    }

    // Save notes as feedback so the background function can use them
    if (notes) patchData.feedback = notes;

    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify(patchData)
    });

    // Trigger background function to regenerate
    fetch('https://heartheirname.com/.netlify/functions/story-text-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId })
    }).catch(e => console.error('[ADMIN-QUEUE] Regen trigger failed:', e.message));

    console.log(`[ADMIN-QUEUE] Regeneration triggered for ${storyId}`);
    return json({ success: true, message: 'Regenerating in background. Refresh in about a minute.' });
  }

  // ── SEND: Deliver story to customer via email ──
  if (action === 'send' && req.method === 'POST') {
    const body = await req.json();
    const { storyId, customMessage } = body;
    if (!storyId) return json({ error: 'Missing storyId' }, 400);

    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=*&limit=1`,
      { headers }
    );
    if (!storyRes.ok) return json({ error: 'Failed to fetch story' }, 500);
    const stories = await storyRes.json();
    if (!stories.length) return json({ error: 'Story not found' }, 404);
    const story = stories[0];

    if (!story.audio_url) return json({ error: 'No audio generated yet' }, 400);
    if (!story.email) return json({ error: 'No customer email' }, 400);

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return json({ error: 'Email not configured' }, 503);

    const sd = story.story_data || {};
    const isMulti = sd.isMultiChild && sd.children && sd.children.length > 1;
    const safeChild = esc(story.child_name || 'your child');
    const requesterName = esc(sd.requesterName || '');
    const listenUrl = `https://heartheirname.com/story/${encodeURIComponent(storyId)}`;

    const subject = isMulti ? "Their story is ready" : `${story.child_name}'s story is ready`;
    const greeting = requesterName ? `Hi ${requesterName},` : 'Hi,';

    const customBlock = (customMessage && customMessage.trim())
      ? `<p style="margin:0 0 16px;line-height:1.75">${esc(customMessage.trim()).replace(/\n/g, '<br>')}</p>`
      : '';

    const emailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333">
<p style="margin:0 0 16px;line-height:1.75">${greeting}</p>
<p style="margin:0 0 16px;line-height:1.75">${isMulti ? "Their story is ready for you." : safeChild + "'s story is ready for you."}</p>
${customBlock}
<p style="text-align:center;margin:24px 0"><a href="${listenUrl}" style="display:inline-block;background:#6B2F93;color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-size:1rem;font-weight:700">${isMulti ? "Listen to their story" : "Listen to " + safeChild + "'s story"}</a></p>
<p style="margin:0 0 16px;line-height:1.75">${isMulti ? "We hope it becomes something they ask to hear again and again." : "We hope it becomes something " + safeChild.split("'")[0] + " asks to hear again and again."}</p>
<p style="margin:24px 0 2px;line-height:1.75;font-weight:600">Jamie and Chase</p>
<p style="margin:0;font-size:13px;color:#999">Hear Their Name</p>
</div>`;

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: BRAND_FROM,
          to: [story.email],
          subject,
          html: emailHtml
        })
      });
      const emailData = await emailRes.json();
      if (!emailRes.ok) {
        console.error('[ADMIN-QUEUE] Email failed:', emailData);
        return json({ error: 'Email failed' }, 500);
      }

      // Update status to delivered with timestamp
      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ status: 'delivered', delivered_at: new Date().toISOString() })
      });

      console.log(`[ADMIN-QUEUE] Story ${storyId} delivered to ${story.email}`);
      return json({ success: true });
    } catch (err) {
      console.error('[ADMIN-QUEUE] Send error:', err.message);
      return json({ error: 'Send failed: ' + err.message }, 500);
    }
  }

  // ── REWRITE-REQUEST: Customer requests changes to a delivered story ──
  if (action === 'rewrite-request' && req.method === 'POST') {
    const body = await req.json();
    const { storyId, feedback: rewriteFeedback, token } = body;
    if (!storyId || !rewriteFeedback) return json({ error: 'Missing storyId or feedback' }, 400);

    // Validate customer auth token (not admin secret, this comes from the customer)
    if (token) {
      const tokenCheck = await fetch(
        `${supabaseUrl}/rest/v1/auth_tokens?token=eq.${encodeURIComponent(token)}&select=email&limit=1`,
        { headers }
      );
      if (tokenCheck.ok) {
        const tokens = await tokenCheck.json();
        if (!tokens.length) return json({ error: 'Invalid session' }, 401);
      }
    }

    // Update the story: set feedback, change status back to pending for queue
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ feedback: rewriteFeedback, status: 'pending' })
    });

    console.log(`[ADMIN-QUEUE] Rewrite request for ${storyId}: ${rewriteFeedback.slice(0, 100)}`);
    return json({ success: true });
  }

  return json({ error: 'Unknown action: ' + action }, 400);
};

export const config = { path: '/api/admin-queue' };
