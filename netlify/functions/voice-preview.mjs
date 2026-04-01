export default async (req) => {
  const url = new URL(req.url);
  const voiceId = url.searchParams.get('id');

  if (!voiceId || !/^[a-zA-Z0-9]+$/.test(voiceId)) {
    return new Response(JSON.stringify({ success: false, error: 'Missing or invalid voice ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  try {
    // 1. Check if we already have a cached preview in Supabase storage
    if (supabaseUrl && supabaseKey) {
      try {
        const cachedRes = await fetch(
          `${supabaseUrl}/storage/v1/object/public/stories/voice-previews/${voiceId}.mp3`
        );
        if (cachedRes.ok) {
          // Cached preview exists, return its public URL
          return new Response(JSON.stringify({
            success: true,
            preview_url: `${supabaseUrl}/storage/v1/object/public/stories/voice-previews/${voiceId}.mp3`,
            cached: true
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=604800' // Cache for 7 days
            }
          });
        }
      } catch (e) { /* no cache, continue */ }
    }

    // 2. Try to get the voice's built-in preview URL from ElevenLabs
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': apiKey }
    });
    const data = await res.json();

    if (data.preview_url) {
      return new Response(JSON.stringify({
        success: true,
        preview_url: data.preview_url,
        name: data.name
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // 3. No preview URL available (library voices not in account).
    //    Generate a short TTS sample and cache it in Supabase.
    const voiceName = data.name || 'this voice';
    const sampleText = `Hello there. I'm ${voiceName}, and I'd love to tell them a story. Imagine a world made just for them, where every detail is something they love.`;

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: sampleText,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
      })
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('TTS preview failed:', ttsRes.status, errText);
      return new Response(JSON.stringify({ success: false, error: 'Could not generate voice sample' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    // 4. Cache in Supabase storage so we never generate this again
    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/storage/v1/object/stories/voice-previews/${voiceId}.mp3`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'audio/mpeg',
            'x-upsert': 'true'
          },
          body: audioBuffer
        });
        console.log('Cached voice preview for:', voiceId);

        // Return the public Supabase URL
        return new Response(JSON.stringify({
          success: true,
          preview_url: `${supabaseUrl}/storage/v1/object/public/stories/voice-previews/${voiceId}.mp3`,
          name: voiceName,
          generated: true
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=604800'
          }
        });
      } catch (e) {
        console.warn('Failed to cache preview:', e.message);
      }
    }

    // 5. Fallback: return as base64 data URI
    const base64 = Buffer.from(audioBuffer).toString('base64');
    return new Response(JSON.stringify({
      success: true,
      preview_url: 'data:audio/mpeg;base64,' + base64,
      name: voiceName,
      generated: true
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (err) {
    console.error('Voice preview error:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/voice-preview' };
