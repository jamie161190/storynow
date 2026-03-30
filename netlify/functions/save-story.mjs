// Saves a purchased story metadata to Supabase
import Stripe from 'stripe';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const reqBody = await req.json();
    const { email, storyData, audioUrl, voiceId, stripeSessionId } = reqBody;
    const fullStoryText = reqBody.previewStoryText || reqBody.fullStoryText || '';

    if (!email || !storyData) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Payment verification ──────────────────────────────────
    if (!stripeSessionId) {
      return new Response(JSON.stringify({ error: 'Missing payment session' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

    if (!session || session.payment_status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Payment not confirmed' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    // ─────────────────────────────────────────────────────────

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    // Check for duplicate saves with same session ID
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?stripe_session_id=eq.${encodeURIComponent(stripeSessionId)}&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const existing = await checkRes.json();
    if (existing && existing.length > 0) {
      // Already saved, return the existing record instead of duplicating
      return new Response(JSON.stringify({
        success: true,
        storyId: existing[0].id,
        audioUrl: audioUrl
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Use upsert on stripe_session_id to prevent race condition duplicates
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify({
        email: email,
        child_name: storyData.childName,
        category: storyData.category,
        length: storyData.length,
        story_text: fullStoryText,
        voice_id: voiceId,
        audio_url: audioUrl || null,
        stripe_session_id: stripeSessionId || null,
        is_gift: storyData.isGift || false,
        gift_email: storyData.giftEmail || null,
        gift_from: storyData.giftFrom || null,
        gift_message: storyData.giftMessage || null,
        story_data: storyData
      })
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('Database insert error:', err);
      return new Response(JSON.stringify({ error: 'Failed to save story' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const insertData = await insertRes.json();
    const saved = Array.isArray(insertData) ? insertData[0] : insertData;

    return new Response(JSON.stringify({
      success: true,
      storyId: saved.id,
      audioUrl: audioUrl
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Save story error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/save-story' };
