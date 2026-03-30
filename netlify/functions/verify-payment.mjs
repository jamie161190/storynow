import Stripe from 'stripe';

export default async (req) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    let sessionId;
    if (req.method === 'POST') {
      const body = await req.json();
      sessionId = body.session_id;
    } else {
      const url = new URL(req.url);
      sessionId = url.searchParams.get('session_id');
    }

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing session_id parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return new Response(JSON.stringify({ success: false, error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const isSuccessful = session.payment_status === 'paid';

    return new Response(JSON.stringify({
      success: isSuccessful,
      paymentStatus: session.payment_status,
      customerEmail: isSuccessful ? (session.customer_details?.email || session.customer_email) : undefined,
      metadata: isSuccessful ? (session.metadata || {}) : undefined
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Payment verification error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Payment verification failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/verify-payment' };
