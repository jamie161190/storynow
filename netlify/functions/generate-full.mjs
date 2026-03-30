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
  let offset = 0;
  // ID3v2 header: starts with "ID3" (0x49, 0x44, 0x33)
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    // ID3v2 size is stored in 4 bytes (synchsafe integer) at offset 6-9
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    offset = 10 + size; // 10 byte header + tag data
  }
  if (offset >= bytes.length) return bytes;
  return bytes.slice(offset);
}

// Strip Xing/LAME VBR info frame from the first MP3 frame.
// ElevenLabs TTS chunks include a Xing header with the frame count for that chunk only.
// When chunks are concatenated the first chunk's Xing header reports the wrong total
// duration, causing browsers to show ~4 min instead of ~15 min and breaking seek.
// Removing it forces the browser to estimate duration from file size (correct for CBR).
function stripXingFrame(bytes) {
  // Find the first MP3 sync word (0xFF 0xE0+ bits)
  let i = 0;
  while (i < bytes.length - 4) {
    if (bytes[i] === 0xFF && (bytes[i + 1] & 0xE0) === 0xE0) {
      // Found an MP3 frame header. Check if this frame contains Xing/Info tag.
      // Xing/Info tag appears at a fixed offset depending on MPEG version and channel mode.
      // MPEG1: offset 36 (stereo) or 21 (mono) from frame start
      // MPEG2/2.5: offset 21 (stereo) or 13 (mono) from frame start
      const mpegV1 = (bytes[i + 1] & 0x08) === 0x08;
      const stereo = (bytes[i + 3] & 0xC0) !== 0xC0; // not mono
      const xingOffset = mpegV1 ? (stereo ? 36 : 21) : (stereo ? 21 : 13);
      const tagPos = i + xingOffset;
      if (tagPos + 4 < bytes.length) {
        const tag = String.fromCharCode(bytes[tagPos], bytes[tagPos + 1], bytes[tagPos + 2], bytes[tagPos + 3]);
        if (tag === 'Xing' || tag === 'Info') {
          // This entire frame is a VBR info frame, skip it.
          // Calculate frame size from the header to know how many bytes to skip.
          const bitrateIndex = (bytes[i + 2] >> 4) & 0x0F;
          const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;
          const padding = (bytes[i + 2] >> 1) & 0x01;
          // Bitrate table for MPEG1 Layer III
          const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
          const sampleRates = mpegV1 ? [44100, 48000, 32000, 0] : [22050, 24000, 16000, 0];
          const bitrate = bitrates[bitrateIndex] * 1000;
          const sampleRate = sampleRates[sampleRateIndex];
          if (bitrate && sampleRate) {
            const frameSize = Math.floor((mpegV1 ? 144 : 72) * bitrate / sampleRate) + padding;
            console.log('Stripped Xing/Info VBR frame (' + frameSize + ' bytes) for correct duration');
            return new Uint8Array([...bytes.slice(0, i), ...bytes.slice(i + frameSize)]);
          }
        }
      }
      break; // First frame wasn't Xing, done
    }
    i++;
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

    // Validate jobId to prevent path traversal
    if (jobId && !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input size validation
    if (fullStory && fullStory.length > 50000) {
      return new Response(JSON.stringify({ error: 'Story text too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // TEMPORARY: bypass payment verification for testing
    // To re-enable, remove this block and uncomment the payment verification below
    const BYPASS_PAYMENT = true;

    if (!BYPASS_PAYMENT) {
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
    } // end BYPASS_PAYMENT check

    // Prevent session replay: one payment = one full audio generation
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if this session already generated audio
    const existingCheck = await fetch(
      `${supabaseUrl}/rest/v1/stories?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id,audio_url&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    if (existingCheck.ok) {
      const existing = await existingCheck.json();
      if (existing.length > 0 && existing[0].audio_url) {
        console.log('Session already used, returning existing audio:', sessionId);
        return new Response(JSON.stringify({ success: true, audioUrl: existing[0].audio_url }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
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

    // Combine chunks: strip ID3 headers from all chunks, then strip Xing VBR frame
    // from the first chunk so the browser calculates duration from file size (correct)
    // instead of trusting the Xing header (which only knows about chunk 1)
    const processedBuffers = audioBuffers.map((buf) => stripID3(buf));

    // Strip VBR info frame from the first chunk before concatenation
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
    return new Response(JSON.stringify({ error: 'Audio generation failed. Your payment is confirmed, please try again or contact hello@storytold.ai' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-full' };
