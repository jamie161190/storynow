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
// Without stripping, concatenated chunks have headers mid-file causing pops/glitches
function stripID3(buffer) {
  const bytes = new Uint8Array(buffer);
  // ID3v2 header: starts with "ID3" (0x49, 0x44, 0x33)
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    // ID3v2 size is stored in 4 bytes (synchsafe integer) at offset 6-9
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    const headerSize = 10 + size; // 10 byte header + tag data
    if (headerSize < bytes.length) {
      return bytes.slice(headerSize);
    }
  }
  return bytes;
}

// Fetch with retry and rate limit handling for TTS calls
async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      // Rate limited (429) or server error (5xx): wait and retry
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

import Stripe from 'stripe';

export default async (req) => {
  try {
    const { fullStory, voiceId, childName, sessionId, jobId } = await req.json();

    if (!fullStory) {
      return new Response(JSON.stringify({ error: 'Missing story text' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Payment verification: this endpoint must only work for paid sessions
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing payment session' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not confirmed' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('ELEVENLABS_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Voice service not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';

    const startTime = Date.now();
    console.log('Generating full audio:', { childName, voiceId: useVoiceId, storyLength: fullStory.length });

    // Split long stories into chunks for reliable TTS
    const chunks = splitIntoChunks(fullStory);
    console.log(`Split story into ${chunks.length} chunks`);

    // Generate TTS for all chunks (2 at a time to stay within rate limits)
    const audioBuffers = [];
    const BATCH_SIZE = 2;

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

      console.log(`TTS batch ${Math.floor(i / BATCH_SIZE) + 1} (chunks ${i + 1}-${i + batch.length}) done in ${Date.now() - batchStart}ms`);
      audioBuffers.push(...results);
    }

    // Combine chunks: strip ID3 headers from all but the first chunk to avoid audio glitches
    const processedBuffers = audioBuffers.map((buf, idx) => {
      if (idx === 0) return new Uint8Array(buf); // keep first chunk's header
      return stripID3(buf); // strip headers from subsequent chunks
    });

    const totalLength = processedBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of processedBuffers) {
      combined.set(buf, offset);
      offset += buf.byteLength;
    }

    console.log('Total full audio time:', Date.now() - startTime, 'ms, size:', Math.round(totalLength / 1024), 'KB');

    // Upload audio to Supabase Storage (always use URL, never inline base64 for full stories)
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
      console.error('Storage upload error:', errText);
      throw new Error('Failed to save audio file');
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;
    console.log('Audio uploaded:', audioUrl);

    // Small response: just the URL (no base64, which would exceed Netlify's 6MB response limit)
    const result = { success: true, audioUrl };

    // Save result to Supabase so frontend can retrieve it if HTTP connection timed out
    if (jobId) {
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
