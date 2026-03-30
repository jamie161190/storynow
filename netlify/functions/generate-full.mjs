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

// Fetch with retry for TTS calls
async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (attempt < retries && res.status >= 500) {
        console.log(`TTS retry ${attempt + 1} after status ${res.status}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        console.log(`TTS retry ${attempt + 1} after error: ${err.message}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export default async (req) => {
  try {
    const { fullStory, voiceId, childName, sessionId, jobId } = await req.json();

    if (!fullStory) {
      return new Response(JSON.stringify({ error: 'Missing story text' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('ELEVENLABS_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Voice service not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';

    const startTime = Date.now();
    console.log('Generating full audio:', { childName, voiceId: useVoiceId, storyLength: fullStory.length });

    // Split long stories into chunks for reliable TTS
    const chunks = splitIntoChunks(fullStory);
    console.log(`Split story into ${chunks.length} chunks`);

    const audioBuffers = [];
    for (let i = 0; i < chunks.length; i++) {
      const ttsStart = Date.now();
      const ttsResponse = await fetchWithRetry(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: chunks[i],
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });

      if (!ttsResponse.ok) {
        const errText = await ttsResponse.text();
        console.error(`TTS chunk ${i + 1}/${chunks.length} failed:`, ttsResponse.status, errText);
        throw new Error('Audio generation failed on chunk ' + (i + 1));
      }
      console.log(`TTS chunk ${i + 1}/${chunks.length} done in ${Date.now() - ttsStart}ms`);
      audioBuffers.push(await ttsResponse.arrayBuffer());
    }

    // Combine all audio chunks into a single buffer
    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of audioBuffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    const audioBase64 = Buffer.from(combined).toString('base64');
    console.log('Total full audio time:', Date.now() - startTime, 'ms, size:', Math.round(audioBase64.length / 1024), 'KB');

    // Upload to Supabase Storage
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    let audioUrl = null;

    if (supabaseUrl && supabaseKey) {
      const safeName = (childName || 'story').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      const fileName = `${Date.now()}-${safeName}.mp3`;

      try {
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

        if (uploadRes.ok) {
          audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;
        } else {
          console.error('Storage upload error:', await uploadRes.text());
        }
      } catch (uploadErr) {
        console.error('Storage upload failed:', uploadErr.message);
      }
    }

    const result = {
      success: true,
      fullAudio: audioBase64,
      audioUrl: audioUrl
    };

    // Save result to Supabase so frontend can retrieve it if HTTP connection timed out
    if (jobId && supabaseUrl && supabaseKey) {
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
        console.log('Saved full result for job:', jobId);
      } catch (saveErr) {
        console.error('Failed to save full result:', saveErr.message);
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-full' };
