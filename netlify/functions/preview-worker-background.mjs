// Preview Worker Background Function (v1 format for 15-min timeout)
// Generates preview story text via Anthropic + TTS audio via ElevenLabs,
// saves result to Supabase for polling by check-preview.
// Triggered by generate-preview.mjs which returns 202 immediately.

import { SYSTEM_PROMPT, buildPreviewPrompt } from './lib/story-prompts.mjs';

async function saveJobResult(supabaseUrl, supabaseKey, jobId, result) {
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
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
    console.error('[PREVIEW-BG] Failed to save job result:', e.message);
  }
}

export const handler = async (event) => {
  let jobId;
  try {
    const { storyData, voiceId, jobId: jid } = JSON.parse(event.body);
    jobId = jid;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[PREVIEW-BG] Storage not configured');
      return { statusCode: 200 };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[PREVIEW-BG] ANTHROPIC_API_KEY not set');
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false, error: 'Story service not configured'
      });
      return { statusCode: 200 };
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('[PREVIEW-BG] ELEVENLABS_API_KEY not set');
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false, error: 'Voice service not configured'
      });
      return { statusCode: 200 };
    }

    console.log('[PREVIEW-BG] Starting preview generation for job:', jobId, 'category:', storyData?.category);
    const startTime = Date.now();

    // ── Step 1: Call Anthropic API with retry ──
    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      temperature: 0.8,
      thinking: {
        type: 'enabled',
        budget_tokens: 1024
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPreviewPrompt(storyData) }]
    });

    let apiResponse;
    for (let attempt = 0; attempt < 3; attempt++) {
      apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: apiBody
      });
      if (apiResponse.ok) break;
      const errBody = await apiResponse.text();
      console.error('[PREVIEW-BG] Anthropic API error (attempt ' + (attempt + 1) + '):', apiResponse.status, errBody);
      if (attempt < 2 && (apiResponse.status === 429 || apiResponse.status >= 500)) {
        const waitMs = apiResponse.status === 429 ? 5000 : 2000 * (attempt + 1);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
    }

    if (!apiResponse.ok) {
      console.error('[PREVIEW-BG] Anthropic API failed after retries');
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false, error: 'Story generation failed. Please try again.'
      });
      return { statusCode: 200 };
    }

    const apiResult = await apiResponse.json();
    let previewStory = '';
    for (const block of apiResult.content) {
      if (block.type === 'text') {
        previewStory += block.text;
      }
    }
    console.log('[PREVIEW-BG] Preview text generated in', Date.now() - startTime, 'ms, words:', previewStory.split(' ').length);

    // ── Step 2: Build message intro ──
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

    const previewText = messageIntro + previewStory + ' ... ... To hear what happens next, unlock the full story.';

    // ── Save partial result BEFORE TTS so check-preview can recover if needed ──
    await saveJobResult(supabaseUrl, supabaseKey, jobId, {
      status: 'generating_audio', fullStory: previewText, previewStory, storyData
    });
    console.log('[PREVIEW-BG] Partial result saved for job:', jobId);

    // ── Step 3: Generate TTS via ElevenLabs ──
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    console.log('[PREVIEW-BG] Generating TTS with voice:', useVoiceId);

    const ttsStart = Date.now();
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error('[PREVIEW-BG] ElevenLabs error:', ttsResponse.status, errText);
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false, error: 'Voice generation failed. Please try again.'
      });
      return { statusCode: 200 };
    }

    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    console.log('[PREVIEW-BG] TTS generated in', Date.now() - ttsStart, 'ms, total:', Date.now() - startTime, 'ms');

    // ── Save complete result ──
    const result = { success: true, previewAudio: audioBase64, previewStory, storyData };
    await saveJobResult(supabaseUrl, supabaseKey, jobId, result);
    console.log('[PREVIEW-BG] Complete result saved for job:', jobId);

    return { statusCode: 200 };
  } catch (err) {
    console.error('[PREVIEW-BG] Error:', err.message, err.stack);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (jobId && supabaseUrl && supabaseKey) {
      await saveJobResult(supabaseUrl, supabaseKey, jobId, {
        success: false, error: 'Preview generation failed. Please try again.'
      });
    }
    return { statusCode: 200 };
  }
};
