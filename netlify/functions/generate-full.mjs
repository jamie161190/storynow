// ============================================================
// CREATE PENDING ORDER
// Validates payment, copies story text from preview job to stories table,
// creates a pending order for admin queue processing.
// No generation happens here. The full audio is generated later by admin.
// ============================================================

import Stripe from 'stripe';

export default async (req) => {
  try {
    const body = await req.json();
    const { storyData, sessionId, jobId, customerEmail, voiceId, feedback, giftDeliveryPreference } = body;

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

    // Validate payment
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

    const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
    const headersJson = { ...headers, 'Content-Type': 'application/json' };

    // Check if this session already has an order (prevent duplicate)
    const existingCheck = await fetch(
      `${supabaseUrl}/rest/v1/stories?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id,status&limit=1`,
      { headers }
    );
    if (existingCheck.ok) {
      const existing = await existingCheck.json();
      if (existing.length > 0) {
        console.log('Order already exists for session:', sessionId, 'status:', existing[0].status);
        return new Response(JSON.stringify({ success: true, orderId: existing[0].id, status: existing[0].status }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Fetch the full story text from the preview job
    let storyText = '';
    if (jobId && /^[a-zA-Z0-9_-]+$/.test(jobId)) {
      try {
        const previewRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, { headers });
        if (previewRes.ok) {
          const previewData = await previewRes.json();
          storyText = previewData.fullStory || previewData.previewStory || '';
        }
      } catch (e) {
        console.error('Failed to fetch preview job:', e.message);
      }
    }

    const email = customerEmail || session.customer_details?.email || session.customer_email || '';

    // Create the pending order in stories table
    const orderData = {
      email,
      child_name: storyData?.childName || '',
      category: storyData?.category || '',
      length: storyData?.length || 'long',
      story_text: storyText,
      voice_id: voiceId || null,
      audio_url: null,
      stripe_session_id: sessionId,
      is_gift: storyData?.isGift || false,
      gift_email: storyData?.giftEmail || null,
      gift_from: storyData?.giftFrom || null,
      gift_message: storyData?.giftMessage || null,
      story_data: storyData || {},
      status: 'pending',
      feedback: feedback || null,
      gift_delivery_preference: giftDeliveryPreference || null
    };

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
      method: 'POST',
      headers: { ...headersJson, 'Prefer': 'return=representation' },
      body: JSON.stringify(orderData)
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('Failed to create order:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const inserted = await insertRes.json();
    const orderId = inserted[0]?.id || null;
    console.log('Pending order created:', orderId, 'for', email, '- child:', storyData?.childName);

    return new Response(JSON.stringify({ success: true, orderId, status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Create order error:', err.message);
    return new Response(JSON.stringify({ error: 'Something went wrong. Your payment is confirmed. Please contact jamie@heartheirname.com' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-full' };
