// Retry Worker: Processes failed story generations from the retry queue.
// Called by a scheduled task every 3 minutes. Picks up pending items,
// retries Anthropic + ElevenLabs, uploads audio, saves story, and
// emails the customer when their story is ready.

import { SYSTEM_PROMPT, buildFullStoryPrompt, buildCompleteStoryPrompt } from './lib/story-prompts.mjs';

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

// Strip ID3v2 tags from MP3 data (ElevenLabs adds these to each chunk)
function stripID3(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (u8.length > 10 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    const size = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    return u8.slice(10 + size);
  }
  return u8;
}

function stripXingFrame(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  for (let i = 0; i < Math.min(u8.length - 4, 200); i++) {
    if ((u8[i] === 0x58 && u8[i+1] === 0x69 && u8[i+2] === 0x6E && u8[i+3] === 0x67) ||
        (u8[i] === 0x49 && u8[i+1] === 0x6E && u8[i+2] === 0x66 && u8[i+3] === 0x6F)) {
      let frameStart = i;
      while (frameStart > 0 && !(u8[frameStart] === 0xFF && (u8[frameStart+1] & 0xE0) === 0xE0)) frameStart--;
      let frameEnd = i + 4;
      while (frameEnd < u8.length - 1 && !(u8[frameEnd] === 0xFF && (u8[frameEnd+1] & 0xE0) === 0xE0)) frameEnd++;
      return new Uint8Array([...u8.slice(0, frameStart), ...u8.slice(frameEnd)]);
    }
  }
  return u8;
}

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  console.log('[RETRY] Checking retry queue...');

  // List items in retry-queue bucket
  let items;
  try {
    const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/stories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix: 'retry-queue/', limit: 10 })
    });
    items = await listRes.json();
  } catch (e) {
    console.error('[RETRY] Failed to list queue:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to read queue' }), { status: 500 });
  }

  if (!items || !items.length || (items.length === 1 && items[0].name === '.emptyFolderPlaceholder')) {
    console.log('[RETRY] Queue empty, nothing to do');
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  let processed = 0;

  for (const item of items) {
    if (item.name === '.emptyFolderPlaceholder') continue;

    // Fetch the retry job data
    let jobData;
    try {
      const getRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/retry-queue/${item.name}`, {
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      });
      jobData = await getRes.json();
    } catch (e) {
      console.error('[RETRY] Failed to read job:', item.name, e.message);
      continue;
    }

    // Skip if too many attempts (max 10)
    if (jobData.attempts >= 10) {
      console.error('[RETRY] Job exceeded max attempts, alerting:', jobData.retryId);
      // TODO: Send alert to Jamie
      continue;
    }

    console.log('[RETRY] Processing:', jobData.retryId, 'attempt:', jobData.attempts + 1);

    const { storyData, previewStory, voiceId, childName, sessionId, fromScratch, customerEmail } = jobData;

    // Update attempt count
    jobData.attempts += 1;
    jobData.lastAttempt = new Date().toISOString();
    await fetch(`${supabaseUrl}/storage/v1/object/stories/retry-queue/${item.name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: JSON.stringify(jobData)
    });

    try {
      // ── Step 1: Generate story with Anthropic ──
      let apiResponse;
      for (let attempt = 0; attempt < 3; attempt++) {
        apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 16000,
            temperature: 1,
            thinking: { type: 'enabled', budget_tokens: 5000 },
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: fromScratch ? buildCompleteStoryPrompt(storyData) : buildFullStoryPrompt(storyData, previewStory) }]
          })
        });
        if (apiResponse.ok) break;
        if (attempt < 2 && (apiResponse.status === 429 || apiResponse.status === 529 || apiResponse.status >= 500)) {
          const waitMs = apiResponse.status === 429 ? 8000 : 5000 * (attempt + 1);
          console.log('[RETRY] Anthropic ' + apiResponse.status + ', waiting ' + waitMs + 'ms');
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

      if (!apiResponse.ok) {
        console.error('[RETRY] Anthropic still failing for', jobData.retryId);
        continue; // Will be picked up on next scheduled run
      }

      const apiResult = await apiResponse.json();
      let continuationText = '';
      for (const block of apiResult.content) {
        if (block.type === 'text') continuationText += block.text;
      }
      console.log('[RETRY] Story generated, words:', continuationText.split(' ').length);

      // ── Step 2: Build full story text ──
      let messageIntro = '';
      if (storyData.isGift && storyData.giftFrom) {
        const giftMsg = storyData.giftMessage || storyData.personalMessage;
        messageIntro = `This story was made just for you, ${storyData.childName}, with love from ${storyData.giftFrom}. ... `;
        if (giftMsg) messageIntro += `${giftMsg} ... `;
        messageIntro += `And now, your story begins. ... `;
      } else if (storyData.personalMessage) {
        messageIntro = `Before we begin, there is a special message for ${storyData.childName}. ... ${storyData.personalMessage} ... And now, on with the story. ... `;
      }

      const fullStoryText = fromScratch
        ? messageIntro + continuationText
        : messageIntro + previewStory + '\n\n' + continuationText;

      // ── Step 3: Generate TTS ──
      const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
      const chunks = splitIntoChunks(fullStoryText);

      const audioBuffers = [];
      const results = await Promise.all(chunks.map((chunk) =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: chunk,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        }).then(async (res) => {
          if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
          return res.arrayBuffer();
        })
      ));
      audioBuffers.push(...results);

      // ── Step 4: Combine MP3 chunks ──
      const processedBuffers = audioBuffers.map(buf => stripID3(buf));
      if (processedBuffers.length > 1) processedBuffers[0] = stripXingFrame(processedBuffers[0]);

      const totalLength = processedBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of processedBuffers) {
        combined.set(buf, offset);
        offset += buf.byteLength;
      }

      // ── Step 5: Upload to Supabase Storage ──
      const safeName = (childName || 'story').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      const fileName = `${Date.now()}-retry-${safeName}.mp3`;

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'audio/mpeg',
          'x-upsert': 'true'
        },
        body: combined
      });

      if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status);

      const audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;
      console.log('[RETRY] Audio uploaded:', audioUrl);

      // ── Step 6: Save story to database ──
      let storyId = null;
      if (customerEmail) {
        try {
          const childSessionId = sessionId || 'retry_' + Date.now();
          const saveRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              customer_email: customerEmail,
              child_name: storyData.childName,
              category: storyData.category,
              audio_url: audioUrl,
              stripe_session_id: childSessionId,
              voice_id: useVoiceId,
              story_data: storyData
            })
          });
          const saved = await saveRes.json();
          if (saved && saved[0]) storyId = saved[0].id;
        } catch (dbErr) {
          console.error('[RETRY] DB save error:', dbErr.message);
        }
      }

      // ── Step 7: Email the customer ──
      if (customerEmail) {
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          const listenUrl = storyId ? `https://storytold.ai?listen=${encodeURIComponent(storyId)}` : 'https://storytold.ai';
          const safeChild = (childName || 'Your child').replace(/[<>&"']/g, '');

          try {
            const safeEmail = (customerEmail || '').replace(/[<>&"']/g, '');
            const categoryLabel = storyData.category === 'learning' ? 'Learning Adventure' : storyData.category === 'journey' ? 'Adventure Story' : 'Bedtime Story';
            const waText = encodeURIComponent(`Listen to ${childName}'s personalised audio story!\n\n${listenUrl}\n\nMade with storytold.ai`);

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'Storytold <hello@storytold.ai>',
                to: [customerEmail],
                subject: `${safeChild}'s story is ready!`,
                html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:24px;text-align:center;margin:0 0 8px;">🎧</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">${safeChild}'s story is ready!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Thank you for creating something truly special. ${safeChild}'s personalised ${categoryLabel.toLowerCase()} (~15 min) has been created and is ready to enjoy.
      </p>
      ${storyId ? `<div style="text-align:center;margin:0 0 24px;">
        <a href="${listenUrl}" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Listen to ${safeChild}'s story</a>
      </div>` : ''}
      <div style="background:#FFF0E5;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 8px;font-size:15px;color:#2D2844;font-weight:700;">Share with the whole family</p>
        <p style="margin:0 0 12px;font-size:13px;color:#666;line-height:1.5;">Grandparents, aunties, uncles. Let everyone hear ${safeChild}'s story. No extra cost.</p>
        <a href="https://wa.me/?text=${waText}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:10px 24px;border-radius:50px;font-size:14px;font-weight:600;">Share on WhatsApp</a>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 16px;">
        You can replay your story any time. Just visit storytold.ai, tap <strong>My Stories</strong>, and log in with this email:
      </p>
      <div style="background:#F8F5FF;border-radius:10px;padding:12px;text-align:center;margin:0 0 20px;">
        <p style="margin:0;font-size:16px;font-weight:700;color:#7C5CFC;">${safeEmail}</p>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">
        We hope ${safeChild} loves every second of it.
      </p>
      <div style="background:#E3FAEB;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:15px;color:#2D2844;font-weight:700;">Loved it?</p>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5;">Create another story for a child you love.</p>
        <a href="https://storytold.ai" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-size:15px;font-weight:600;">Create another story</a>
      </div>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know them by name.</p>
  </div>
</body>
</html>`
              })
            });
            console.log('[RETRY] Email sent to:', customerEmail);
          } catch (emailErr) {
            console.error('[RETRY] Email failed:', emailErr.message);
          }
        }
      }

      // ── Step 8: Remove from retry queue ──
      await fetch(`${supabaseUrl}/storage/v1/object/stories/retry-queue/${item.name}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
      });

      console.log('[RETRY] Successfully processed and removed:', jobData.retryId);
      processed++;

    } catch (retryErr) {
      console.error('[RETRY] Failed attempt for', jobData.retryId, ':', retryErr.message);
      // Job stays in queue, will be retried on next run
    }
  }

  console.log('[RETRY] Done. Processed:', processed, 'of', items.length);
  return new Response(JSON.stringify({ processed }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '@hourly'
};
