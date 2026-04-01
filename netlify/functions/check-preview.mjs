export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return new Response(JSON.stringify({ ready: false, error: 'Missing jobId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate jobId format to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return new Response(JSON.stringify({ ready: false, error: 'Invalid job ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ ready: false, error: 'Storage not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (!res.ok) {
      // Not ready yet
      return new Response(JSON.stringify({ ready: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await res.json();

    // If the background worker saved an error, pass it through
    if (result.success === false && result.error) {
      return new Response(JSON.stringify({ ready: true, success: false, error: result.error }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If result already has audio, return it immediately
    if (result.previewAudio) {
      return new Response(JSON.stringify({ ready: true, ...result }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PARTIAL RESULT: story text is ready but audio generation was interrupted.
    // Generate the preview audio here so polling can recover.
    if (result.status === 'generating_audio' && result.fullStory) {
      console.log('Found partial result for job', jobId, ', generating preview audio...');

      if (!process.env.ELEVENLABS_API_KEY) {
        // Can't generate audio, but at least return the story text
        return new Response(JSON.stringify({ ready: true, ...result, previewAudio: null }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        // Build preview text from the full story (same logic as generate-preview)
        const fullStory = result.fullStory;
        // If there's a gift/message intro, it's already prepended to fullStory
        // Take first ~75 words for the preview
        const words = fullStory.split(' ');
        let previewSnippet = words.slice(0, 75).join(' ');
        const lastEnd = previewSnippet.search(/[.!?][^.!?]*$/);
        if (lastEnd > 40) previewSnippet = previewSnippet.substring(0, lastEnd + 1);
        const previewText = previewSnippet + ' ... To hear what happens next, unlock the full story.';

        const voiceId = url.searchParams.get('voiceId') || 'EXAVITQu4vr4xnSDxMaL';
        const useVoiceId = (/^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';

        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: previewText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.35, similarity_boost: 0.80, style: 0.40, use_speaker_boost: true }
          })
        });

        if (ttsRes.ok) {
          const audioBase64 = Buffer.from(await ttsRes.arrayBuffer()).toString('base64');
          const completeResult = { success: true, previewAudio: audioBase64, previewStory: result.previewStory || result.fullStory, fullStory: result.fullStory, storyData: result.storyData };

          // Save the complete result back to Supabase for future polls
          try {
            await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
                'Content-Type': 'application/json',
                'x-upsert': 'true'
              },
              body: JSON.stringify(completeResult)
            });
          } catch (e) { /* non-critical */ }

          return new Response(JSON.stringify({ ready: true, ...completeResult }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (ttsErr) {
        console.error('check-preview TTS recovery failed:', ttsErr.message);
      }

      // TTS failed but story text is available, keep polling
      // (maybe the main function is still running and will complete)
      return new Response(JSON.stringify({ ready: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback: return whatever we have
    return new Response(JSON.stringify({ ready: true, ...result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ready: false }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/check-preview' };
