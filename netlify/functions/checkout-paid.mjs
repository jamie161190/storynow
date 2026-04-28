// POST /api/checkout-paid { storyId, accessToken }
// Creates a Stripe Checkout Session for £24.99 (or applies returning-customer £5 discount).
// Returns { url } for redirect.

import Stripe from 'stripe';
import { getSessionFromHeaders } from './lib/auth.mjs';

const PRICE_PENCE = 2499;
const RETURNING_DISCOUNT_PENCE = 500;
const CURRENCY = 'gbp';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!stripeKey || !supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const { storyId, accessToken } = body;
  if (!storyId) return json({ error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&version=eq.2&select=id,email,child_name,access_token,payment_status,paid_at`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  // Access check
  const session = getSessionFromHeaders(req.headers);
  if (!(session && session.email === s.email) && !(accessToken && accessToken === s.access_token)) {
    return json({ error: 'Access denied' }, 403);
  }

  if (s.payment_status === 'paid' || s.paid_at) {
    return json({ error: 'Already paid', alreadyPaid: true }, 409);
  }

  // Returning-customer discount: applies if this email has a paid v2 story already.
  const paidLookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(s.email)}&version=eq.2&payment_status=eq.paid&select=id&limit=1`,
    { headers }
  );
  const isReturning = paidLookup.ok && (await paidLookup.json()).length > 0;
  const amount = isReturning ? PRICE_PENCE - RETURNING_DISCOUNT_PENCE : PRICE_PENCE;
  const productName = isReturning
    ? `Full story for ${s.child_name} (returning-customer £5 off)`
    : `Full story for ${s.child_name}`;

  const stripe = new Stripe(stripeKey);
  const sess = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: CURRENCY,
        product_data: { name: productName, description: `15-minute personalised audio story for ${s.child_name}` },
        unit_amount: amount
      },
      quantity: 1
    }],
    customer_email: s.email,
    metadata: { story_id: s.id, kind: 'paid_v2', returning: isReturning ? '1' : '0' },
    success_url: `${appUrl}/preview/${s.id}?t=${s.access_token}&paid=1`,
    cancel_url: `${appUrl}/preview/${s.id}?t=${s.access_token}&cancelled=1`,
    allow_promotion_codes: true
  });

  // Save session id to the story so webhook can correlate
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
    method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripe_session_id_v2: sess.id })
  });

  return json({ url: sess.url });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
