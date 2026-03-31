import Stripe from 'stripe';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const storyData = body.storyData || {};
    const childName = storyData.childName || body.childName || 'your child';
    const customerEmail = body.customerEmail || null;
    const previewStoryText = body.previewStoryText || body.fullStoryText || '';
    const selectedVoiceId = body.selectedVoiceId || '';
    const additionalChildren = body.additionalChildren || storyData.additionalChildren || [];

    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(stripeKey);
    const siteUrl = req.headers.get('origin') || process.env.URL || 'https://storytold.ai';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'Storytold: Personalised Audio Story',
              description: additionalChildren.length > 0
                ? `Personalised stories for ${childName}, ${additionalChildren.map(c => c.childName).join(', ')}`
                : `A personalised story for ${childName}`
            },
            unit_amount: 1999
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: `${siteUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: siteUrl,
      metadata: {
        childName: childName,
        category: storyData.category || '',
        length: storyData.length || '',
        additionalChildren: additionalChildren.map(c => c.childName).join(', ') || ''
      }
    });

    // Save pending story data to Supabase Storage so it survives the redirect
    // (sessionStorage gets wiped on many mobile browsers during cross-site redirect)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (supabaseUrl && supabaseKey && previewStoryText) {
      try {
        const pendingData = JSON.stringify({ storyData: { ...storyData, additionalChildren }, previewStoryText, selectedVoiceId });
        const fileName = `pending/${session.id}.json`;

        await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: pendingData
        });
      } catch (pendingErr) {
        // Non-fatal: sessionStorage may still work, so don't block checkout
        console.error('Failed to save pending story data:', pendingErr.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Stripe checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/create-checkout' };
