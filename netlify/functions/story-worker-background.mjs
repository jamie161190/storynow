import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildPreviewPrompt } from './story-prompts.mjs';

// ============================================================
// BACKGROUND FUNCTION HANDLER
// This runs with a 15-minute timeout (Netlify background function).
// It generates a short preview opening, generates TTS for it,
// then saves the result for polling to pick up.
// Full story generation happens after purchase in generate-full.
// ============================================================
export const handler = async (event) => {
  let jobId;
  try {
    const { storyData, voiceId, jobId: jid } = JSON.parse(event.body);
    jobId = jid;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    console.log('[BG] Starting preview generation for job:', jobId, 'category:', storyData.category);

    // ── Generate preview opening with Anthropic ──
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const startTime = Date.now();
    let previewStory;
    try {
      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        temperature: 1,
        thinking: {
          type: 'enabled',
          budget_tokens: 500
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPreviewPrompt(storyData) }],
        stream: true
      });

      let storyText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            storyText += event.delta.text;
          }
        }
      }
      previewStory = storyText;
      console.log('[BG] Preview generated in', Date.now() - startTime, 'ms, words:', previewStory.split(' ').length);
    } catch (apiErr) {
      console.error('[BG] Anthropic API error after', Date.now() - startTime, 'ms:', apiErr.message);
      if (jobId && supabaseUrl && supabaseKey) {
        try {
          await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'x-upsert': 'true'
            },
            body: JSON.stringify({ success: false, error: 'Story generation failed: ' + apiErr.message })
          });
        } catch (e) { /* best effort */ }
      }
      return { statusCode: 200 };
    }

    // ── Build message intro ──
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

    // Use the full preview text for TTS (all ~200 words for ~30s of audio)
    const previewText = messageIntro + previewStory + ' ... ... To hear what happens next, unlock the full story.';

    // ── Generate TTS ──
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    console.log('[BG] Generating TTS with voice:', useVoiceId);

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
      console.error('[BG] ElevenLabs error after', Date.now() - ttsStart, 'ms:', ttsResponse.status, errText);
      if (jobId && supabaseUrl && supabaseKey) {
        try {
          await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'x-upsert': 'true'
            },
            body: JSON.stringify({ success: false, error: 'Voice generation failed. Please try again.' })
          });
        } catch (e) { /* best effort */ }
      }
      return { statusCode: 200 };
    }
    console.log('[BG] TTS generated in', Date.now() - ttsStart, 'ms');
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    console.log('[BG] Total time:', Date.now() - startTime, 'ms, audio size:', Math.round(audioBase64.length / 1024), 'KB');

    // ── Save preview result (opening text + audio) ──
    // Full story generation happens after purchase in generate-full.mjs
    const result = { success: true, previewAudio: audioBase64, previewStory, storyData };
    if (jobId && supabaseUrl && supabaseKey) {
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
        console.log('[BG] Saved complete result for job:', jobId);
      } catch (saveErr) {
        console.error('[BG] Failed to save complete result:', saveErr.message);
      }
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error('[BG] Background worker error:', err.message, err.stack);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (jobId && supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: JSON.stringify({ success: false, error: err.message })
        });
      } catch (e) { /* best effort */ }
    }
    return { statusCode: 200 };
  }
};
