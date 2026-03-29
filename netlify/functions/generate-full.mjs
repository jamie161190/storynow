import Stripe from 'stripe';

export default async (req) => {
  try {
    const { fullStory, voiceId, childName, sessionId } = await req.json();

    // ── Payment verification (server-side) ──────────────────
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing payment session' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not confirmed' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }
    // ─────────────────────────────────────────────────────────

    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';

    // Generate audio via ElevenLabs
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: fullStory,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) throw new Error('Audio generation failed');

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // Upload to Supabase Storage
    let audioUrl = null;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

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
          body: new Uint8Array(audioBuffer)
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

    return new Response(JSON.stringify({
      success: true,
      fullAudio: audioBase64,
      audioUrl: audioUrl
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-full' };
