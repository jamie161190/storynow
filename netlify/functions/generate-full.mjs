// ============================================================
// GENERATE FULL — Thin gateway function
// Validates payment, triggers the background worker, returns immediately.
// The actual story + TTS generation happens in full-worker-background.mjs
// which has a 15-minute timeout (Netlify background function).
// The frontend polls check-full.mjs for the result.
// ============================================================

import Stripe from 'stripe';

export default async (req) => {
  try {
    const { storyData, previewStory, voiceId, childName, sessionId, jobId } = await req.json();

    // Validate jobId to prevent path traversal
    if (jobId && !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate required fields for split approach
    if (!storyData || !previewStory) {
      return new Response(JSON.stringify({ error: 'Missing story data or preview' }), {
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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if this session already generated audio (prevent replay)
    if (sessionId) {
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
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Voice service not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Story service not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Payment validated. The frontend will call the background function directly.
    console.log('Payment validated for job:', jobId, '. Frontend will trigger background worker.');

    return new Response(JSON.stringify({ success: true, jobId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Your payment is confirmed, please try again or contact hello@storytold.ai' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-full' };
