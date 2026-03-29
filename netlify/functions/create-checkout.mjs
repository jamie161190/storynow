import Stripe from 'stripe';

const PRICING = {
  standard: { duration: 'standard (5 min)', price: 299, currency: 'gbp' },
  long: { duration: 'long (15 min)', price: 499, currency: 'gbp' },
  epic: { duration: 'epic (30 min)', price: 799, currency: 'gbp' }
};

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { storyData, priceTier } = await req.json();

    if (!storyData || !priceTier || !PRICING[priceTier]) {
      return new Response(JSON.stringify({ error: 'Invalid storyData or priceTier' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(Netlify.env.get('STRIPE_SECRET_KEY'));
    const siteUrl = req.headers.get('origin') || process.env.URL || 'https://storytold.netlify.app';
    const pricing = PRICING[priceTier];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: pricing.currency,
            product_data: {
              name: `Storytold - ${pricing.duration} story`,
              description: `Personalized story for ${storyData.childName}`,
              images: [] // Add image URL if available
            },
            unit_amount: pricing.price
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${siteUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: siteUrl,
      metadata: {
        childName: storyData.childName,
        priceTier: priceTier,
        category: storyData.category,
        length: storyData.length
      }
    });

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
