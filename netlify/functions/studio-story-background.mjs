// Studio Story Background Worker: Generates story text + TTS audio, saves to Supabase.
// Follows same pattern as full-worker-background.mjs.

import { SYSTEM_PROMPT, buildPreviewPrompt, buildCompleteStoryPrompt, sanitiseStoryData } from './lib/story-prompts.mjs';

// Preprocess story text for natural TTS pauses
function prepareTTSText(text) {
  text = text.replace(/\.\s*\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\.\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\s*\.\.\.\s*/g, '. ');
  text = text.replace(/\.\s*\.\s+/g, '. ');
  text = text.replace(/\s{3,}/g, ' ');
  return text.trim();
}

// Split text into TTS-friendly chunks
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

// Strip ID3v2 tags from MP3 data
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

// Strip Xing/LAME VBR info frame
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

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        const waitMs = res.status === 429 ? 8000 : 2000 * (attempt + 1);
        console.log(`[STUDIO-BG] TTS retry ${attempt + 1} after ${res.status}, waiting ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function saveJobResult(supabaseUrl, supabaseKey, jobId, result) {
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/studio-jobs/${jobId}.json`, {
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
    console.error('[STUDIO-BG] Failed to save job result:', e.message);
  }
}

export const handler = async (event) => {
  console.log('[STUDIO-BG] Handler started');

  let jobId;
  try {
    const parsed = JSON.parse(event.body);
    const { storyData: rawStoryData, voiceId, length, durationMins, music, jobId: jid } = parsed;
    jobId = jid;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('[STUDIO-BG] Supabase not configured');
      return { statusCode: 200 };
    }

    const storyData = sanitiseStoryData ? sanitiseStoryData(rawStoryData) : rawStoryData;

    // ── Step 1: Generate story text with Claude ──
    // ~150 words per minute of narration
    const targetWords = durationMins ? Math.round(durationMins * 150) : null;
    console.log('[STUDIO-BG] Generating story text for:', storyData.childName, 'duration:', durationMins, 'mins, target words:', targetWords);

    const isPreview = length === 'preview';
    const promptFn = isPreview ? buildPreviewPrompt : buildCompleteStoryPrompt;
    const model = isPreview ? 'claude-sonnet-4-6' : 'claude-opus-4-6';
    // Override word count in storyData so the prompt uses it
    if (targetWords) storyData._targetWords = targetWords;

    let apiResponse;
    for (let attempt = 0; attempt < 5; attempt++) {
      apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          temperature: 1,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: promptFn(storyData) }]
        })
      });
      if (apiResponse.ok) break;
      const shouldRetry = apiResponse.status === 429 || apiResponse.status === 529 || apiResponse.status >= 500;
      if (attempt < 4 && shouldRetry) {
        const waitMs = apiResponse.status === 429 ? 8000 : 4000 * (attempt + 1);
        console.log(`[STUDIO-BG] Claude ${apiResponse.status}, retrying in ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
    }

    if (!apiResponse.ok) {
      const errBody = await apiResponse.text();
      console.error('[STUDIO-BG] Claude error:', apiResponse.status, errBody);
      await saveJobResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'Story generation failed. Please try again.' });
      return { statusCode: 200 };
    }

    const apiResult = await apiResponse.json();
    let storyText = '';
    for (const block of apiResult.content) {
      if (block.type === 'text') storyText += block.text;
    }
    console.log('[STUDIO-BG] Story generated, words:', storyText.split(' ').length);

    // Build message intro if personal message exists
    let messageIntro = '';
    if (storyData.personalMessage) {
      messageIntro = `Before we begin, there is a special message for ${storyData.childName}. ... ${storyData.personalMessage} ... And now, on with the story. ... `;
    }

    const fullText = messageIntro + storyText;

    // Save partial result
    await saveJobResult(supabaseUrl, supabaseKey, jobId, {
      status: 'generating_audio',
      storyText: fullText,
      childName: storyData.childName
    });

    // ── Step 2: Generate TTS audio with ElevenLabs ──
    console.log('[STUDIO-BG] Generating TTS audio');
    const ttsText = prepareTTSText(fullText);
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';

    const chunks = splitIntoChunks(ttsText);
    const audioChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[STUDIO-BG] TTS chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      const ttsResponse = await fetchWithRetry(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: chunks[i],
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
        })
      });

      if (!ttsResponse.ok) {
        console.error('[STUDIO-BG] TTS error on chunk', i, ':', ttsResponse.status);
        await saveJobResult(supabaseUrl, supabaseKey, jobId, {
          success: false,
          storyText: fullText,
          childName: storyData.childName,
          error: 'Voice generation failed on chunk ' + (i + 1)
        });
        return { statusCode: 200 };
      }

      let audioBytes = new Uint8Array(await ttsResponse.arrayBuffer());
      audioBytes = stripID3(audioBytes);
      if (i > 0) audioBytes = stripXingFrame(audioBytes);
      audioChunks.push(audioBytes);
    }

    // Merge audio chunks
    const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Upload audio to Supabase storage
    const audioPath = `studio/${jobId}.mp3`;
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${audioPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true'
      },
      body: merged.buffer
    });

    let audioUrl = null;
    if (uploadRes.ok) {
      audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${audioPath}`;
      console.log('[STUDIO-BG] Audio uploaded:', audioUrl);
    } else {
      console.error('[STUDIO-BG] Audio upload failed:', uploadRes.status);
    }

    // Save final result
    await saveJobResult(supabaseUrl, supabaseKey, jobId, {
      success: true,
      storyText: fullText,
      audioUrl,
      childName: storyData.childName,
      voiceId: useVoiceId,
      length,
      generatedAt: new Date().toISOString()
    });

    console.log('[STUDIO-BG] Complete for job:', jobId);
    return { statusCode: 200 };

  } catch (e) {
    console.error('[STUDIO-BG] Fatal error:', e.message, e.stack);
    if (jobId) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY;
      if (supabaseUrl && supabaseKey) {
        await saveJobResult(supabaseUrl, supabaseKey, jobId, { success: false, error: e.message });
      }
    }
    return { statusCode: 200 };
  }
};

export const config = { path: '/api/studio-story-background' };
