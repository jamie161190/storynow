// ============================================================
// GENERATE PREVIEW — Does all work inline (no background function)
// Calls Anthropic API + ElevenLabs TTS directly via fetch().
// Returns the complete result. Also saves to Supabase so
// check-preview can recover if the connection drops.
// ============================================================

import { SYSTEM_PROMPT, buildPreviewPrompt } from './lib/story-prompts.mjs';

export default async (req) => {
  // ── Rate limiting: max 5 previews per IP per hour ──
  const clientIP = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `preview_${clientIP}`;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const rlCheck = await fetch(
        `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rateLimitKey)}&created_at=gte.${oneHourAgo}&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );
      if (rlCheck.ok) {
        const recent = await rlCheck.json();
        if (recent.length >= 5) {
          console.log('Rate limited:', clientIP, recent.length, 'requests in last hour');
          return new Response(JSON.stringify({ error: 'You have reached the preview limit. Please try again later.' }), {
            status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }
          });
        }
      }
      // Record this request
      await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: rateLimitKey, created_at: new Date().toISOString() })
      });
    } catch (rlErr) {
      console.error('Rate limit check failed (allowing request):', rlErr.message);
    }
  }

  // Guard: check env vars
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Story service not configured (missing AI key)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Voice service not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { storyData, voiceId, jobId } = await req.json();

    // Validate jobId
    if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input size limits
    if (storyData?.extraDetails && storyData.extraDetails.length > 1000) {
      return new Response(JSON.stringify({ error: 'Extra details too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.customScenario && storyData.customScenario.length > 2000) {
      return new Response(JSON.stringify({ error: 'Custom scenario too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.personalMessage && storyData.personalMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Personal message too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.giftMessage && storyData.giftMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Gift message too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.themeDetail && storyData.themeDetail.length > 500) {
      return new Response(JSON.stringify({ error: 'Theme detail too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.sidekickName && storyData.sidekickName.length > 200) {
      return new Response(JSON.stringify({ error: 'Sidekick name too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validate category
    const validCategories = ['bedtime', 'journey', 'learning', 'custom'];
    if (!storyData?.category || !validCategories.includes(storyData.category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log('Generating preview inline for job:', jobId, 'category:', storyData.category);
    const startTime = Date.now();

    // ── Step 1: Call Anthropic API with thinking for best quality ──
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
    for (let attempt = 0; attempt < 2; attempt++) {
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
      console.error('Anthropic API error (attempt ' + (attempt + 1) + '):', apiResponse.status, errBody);
      if (attempt < 1 && (apiResponse.status === 429 || apiResponse.status >= 500)) {
        await new Promise(r => setTimeout(r, apiResponse.status === 429 ? 3000 : 1000));
        continue;
      }
    }

    if (!apiResponse.ok) {
      return new Response(JSON.stringify({ error: 'Story generation failed. Please try again.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiResult = await apiResponse.json();
    let previewStory = '';
    for (const block of apiResult.content) {
      if (block.type === 'text') {
        previewStory += block.text;
      }
    }
    console.log('Preview text generated in', Date.now() - startTime, 'ms, words:', previewStory.split(' ').length);

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

    // ── Save partial result BEFORE TTS so polling can recover if function times out ──
    if (supabaseUrl && supabaseKey && jobId) {
      try {
        await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: JSON.stringify({ status: 'generating_audio', fullStory: previewText, previewStory, storyData })
        });
        console.log('Partial result saved for job:', jobId);
      } catch (e) {
        console.error('Failed to save partial result:', e.message);
      }
    }

    // ── Step 3: Generate TTS via ElevenLabs ──
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    console.log('Generating TTS with voice:', useVoiceId);

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
      console.error('ElevenLabs error:', ttsResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Voice generation failed. Please try again.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    console.log('TTS generated in', Date.now() - ttsStart, 'ms, total:', Date.now() - startTime, 'ms');

    // ── Build result ──
    const result = { success: true, previewAudio: audioBase64, previewStory, storyData };

    // Save to Supabase as well (for polling fallback if connection drops)
    if (supabaseUrl && supabaseKey && jobId) {
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
      } catch (e) { /* non-critical */ }
    }

    // Return result directly
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Generate preview error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', debug: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-preview' };
