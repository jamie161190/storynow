// Creates a Stripe Checkout session for a "say thank you" payment
// Redirects back to the story page on completion

import Stripe from 'stripe';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { amount, storyId, message, displayName } = await req.json();

    if (!amount || amount < 1 || !storyId) {
      return new Response(JSON.stringify({ error: 'Missing amount or story' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'Say thank you',
            description: 'Supporting Hear Their Name'
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      metadata: {
        type: 'donation',
        story_id: storyId,
        message: (message || '').slice(0, 500),
        display_name: (displayName || '').slice(0, 100)
      },
      success_url: `https://heartheirname.com/story/${storyId}?thankyou=1`,
      cancel_url: `https://heartheirname.com/story/${storyId}`
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Donation checkout error:', err.message);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/create-donation' };
