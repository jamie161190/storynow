import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildFullStoryPrompt } from './story-prompts.mjs';

// TTS chunk helper: splits text into chunks at sentence boundaries
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
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    offset = 10 + size;
  }
  if (offset >= bytes.length) return bytes;
  return bytes.slice(offset);
}

// Strip Xing/LAME VBR info frame from the first MP3 frame
function stripXingFrame(bytes) {
  let i = 0;
  while (i < bytes.length - 4) {
    if (bytes[i] === 0xFF && (bytes[i + 1] & 0xE0) === 0xE0) {
      const mpegV1 = (bytes[i + 1] & 0x08) === 0x08;
      const stereo = (bytes[i + 3] & 0xC0) !== 0xC0;
      const xingOffset = mpegV1 ? (stereo ? 36 : 21) : (stereo ? 21 : 13);
      const tagPos = i + xingOffset;
      if (tagPos + 4 < bytes.length) {
        const tag = String.fromCharCode(bytes[tagPos], bytes[tagPos + 1], bytes[tagPos + 2], bytes[tagPos + 3]);
        if (tag === 'Xing' || tag === 'Info') {
          const bitrateIndex = (bytes[i + 2] >> 4) & 0x0F;
          const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;
          const padding = (bytes[i + 2] >> 1) & 0x01;
          const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
          const sampleRates = mpegV1 ? [44100, 48000, 32000, 0] : [22050, 24000, 16000, 0];
          const bitrate = bitrates[bitrateIndex] * 1000;
          const sampleRate = sampleRates[sampleRateIndex];
          if (bitrate && sampleRate) {
            const frameSize = Math.floor((mpegV1 ? 144 : 72) * bitrate / sampleRate) + padding;
            console.log('Stripped Xing/Info VBR frame (' + frameSize + ' bytes)');
            return new Uint8Array([...bytes.slice(0, i), ...bytes.slice(i + frameSize)]);
          }
        }
      }
      break;
    }
    i++;
  }
  return bytes;
}

// Fetch with retry for TTS calls
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (attempt + 1);
        console.log(`TTS retry ${attempt + 1} after status ${res.status}, waiting ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        console.log(`TTS retry ${attempt + 1} after error: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ============================================================
// BACKGROUND FUNCTION HANDLER
// Generates the full story text (continuing from preview opening),
// then generates TTS audio for the complete story, uploads to
// Supabase, and saves the result for polling.
// ============================================================
export const handler = async (event) => {
  let jobId;
  try {
    const { storyData, previewStory, voiceId, childName, sessionId, jobId: jid } = JSON.parse(event.body);
    jobId = jid;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[FULL-BG] Storage not configured');
      return { statusCode: 200 };
    }

    console.log('[FULL-BG] Starting full story generation for job:', jobId);

    // ── Step 1: Generate the rest of the story with Anthropic ──
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const storyStart = Date.now();

    let continuationText;
    try {
      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature: 1,
        thinking: {
          type: 'enabled',
          budget_tokens: 5000
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildFullStoryPrompt(storyData, previewStory) }],
        stream: true
      });

      let storyText = '';
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'text_delta') {
            storyText += ev.delta.text;
          }
        }
      }
      continuationText = storyText;
      console.log('[FULL-BG] Story continuation generated in', Date.now() - storyStart, 'ms, words:', continuationText.split(' ').length);
    } catch (apiErr) {
      console.error('[FULL-BG] Anthropic API error:', apiErr.message);
      if (jobId) {
        await saveJobResult(supabaseUrl, supabaseKey, jobId, {
          success: false,
          error: 'Story generation failed. Your payment is confirmed, please try again or contact hello@storytold.ai'
        });
      }
      return { statusCode: 200 };
    }

    // ── Step 2: Build the complete story text ──
    let messageIntro = '';
    if (storyData.isGift && storyData.giftFrom) {
      const giftMsg = storyData.giftMessage || storyData.personalMessage;
      messageIntro = `This story was made just for you, ${storyData.childName}, with love from ${storyData.giftFrom}. ... `;
      if (giftMsg) {
        messageIntro += `${giftMsg} ... `;
      }
      messageIntro += `And now, your story begins. ... `;
    } else if (storyData.personalMessage) {
      messageIntro = `Before we begin, there is a special message for ${storyData.childName}. ... ${storyData.personalMessage} ... And now, on with the story. ... `;
    }

    const fullStoryText = messageIntro + previewStory + '\n\n' + continuationText;
    console.log('[FULL-BG] Complete story:', fullStoryText.split(' ').length, 'words');

    // ── Step 3: Generate TTS for the complete story ──
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    const chunks = splitIntoChunks(fullStoryText);
    console.log(`[FULL-BG] Split into ${chunks.length} TTS chunks`);

    const audioBuffers = [];
    const BATCH_SIZE = 2;
    const ttsStart = Date.now();

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchStart = Date.now();

      const results = await Promise.all(batch.map((chunk, batchIdx) =>
        fetchWithRetry(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
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
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`TTS chunk ${i + batchIdx + 1} failed (${res.status}): ${errText}`);
          }
          return res.arrayBuffer();
        })
      ));

      console.log(`[FULL-BG] TTS batch ${Math.floor(i / BATCH_SIZE) + 1} done in ${Date.now() - batchStart}ms`);
      audioBuffers.push(...results);
    }

    console.log('[FULL-BG] All TTS done in', Date.now() - ttsStart, 'ms');

    // ── Step 4: Combine MP3 chunks ──
    const processedBuffers = audioBuffers.map((buf) => stripID3(buf));
    if (processedBuffers.length > 1) {
      processedBuffers[0] = stripXingFrame(processedBuffers[0]);
    }

    const totalLength = processedBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of processedBuffers) {
      combined.set(buf, offset);
      offset += buf.byteLength;
    }

    console.log('[FULL-BG] Combined audio:', Math.round(totalLength / 1024), 'KB');

    // ── Step 5: Upload to Supabase Storage ──
    const safeName = (childName || 'story').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}.mp3`;

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

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[FULL-BG] Storage upload error:', errText);
      throw new Error('Failed to save audio file');
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;
    console.log('[FULL-BG] Audio uploaded:', audioUrl);
    console.log('[FULL-BG] Total time:', Date.now() - storyStart, 'ms');

    // ── Step 6: Save result for polling ──
    const result = { success: true, audioUrl };

    // Save to stories table if we have a stripe session
    if (sessionId && sessionId !== 'bypass-' + sessionId.split('-')[1]) {
      try {
        const existingCheck = await fetch(
          `${supabaseUrl}/rest/v1/stories?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            }
          }
        );
        if (existingCheck.ok) {
          const existing = await existingCheck.json();
          if (existing.length > 0) {
            // Update existing record with audio URL
            await fetch(
              `${supabaseUrl}/rest/v1/stories?id=eq.${existing[0].id}`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'apikey': supabaseKey,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ audio_url: audioUrl })
              }
            );
          }
        }
      } catch (dbErr) {
        console.error('[FULL-BG] DB update error:', dbErr.message);
      }
    }

    // Save job result for polling
    if (jobId) {
      await saveJobResult(supabaseUrl, supabaseKey, jobId, result);
      console.log('[FULL-BG] Saved result for job:', jobId);
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error('[FULL-BG] Error:', err.message, err.stack);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (jobId && supabaseUrl && supabaseKey) {
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false,
        error: 'Audio generation failed. Your payment is confirmed, please try again or contact hello@storytold.ai'
      });
    }
    return { statusCode: 200 };
  }
};

async function saveJobResult(supabaseUrl, supabaseKey, jobId, result) {
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/full-jobs/${jobId}.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: JSON.stringify(result)
    });
  } catch (e) {
    console.error('[FULL-BG] Failed to save job result:', e.message);
  }
}
