// POST /api/checkout-paid { storyId, accessToken }
// Creates a Stripe Checkout Session for £24.99 (or applies returning-customer £5 discount).
// Returns { url } for redirect.

import Stripe from 'stripe';
import { getSessionFromHeaders } from './lib/auth.mjs';
import { sendMetaEvent } from './lib/meta-capi.mjs';
import { normalizeNameList } from './lib/format-names.mjs';
import { priceForCountry, countryFromRequest } from './lib/pricing.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!stripeKey || !supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const { storyId, accessToken, fbp, fbc, checkoutEventId, email: emailFromBody } = body;
  if (!storyId) return json({ error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&version=eq.2&select=id,email,child_name,access_token,payment_status,paid_at`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  // Access check (token-only, since email-based session won't exist when the
  // row hasn't yet captured an email).
  const session = getSessionFromHeaders(req.headers);
  if (!(session && session.email === s.email) && !(accessToken && accessToken === s.access_token)) {
    return json({ error: 'Access denied' }, 403);
  }

  if (s.payment_status === 'paid' || s.paid_at) {
    return json({ error: 'Already paid', alreadyPaid: true }, 409);
  }

  // Customer entered email on the preview page (April flow). Save it to the
  // row so Stripe + downstream emails have a real address. Validate first so
  // we don't store junk if the field was bypassed.
  const cleanEmailFromBody = (emailFromBody || '').trim().toLowerCase();
  if (cleanEmailFromBody && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmailFromBody) && cleanEmailFromBody !== s.email) {
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ email: cleanEmailFromBody })
    });
    s.email = cleanEmailFromBody;
  }

  // Returning-customer discount: applies if this email has a paid v2 story already.
  // If we don't yet have an email on the row, skip the lookup (Stripe will collect
  // it during checkout and the webhook will patch it onto the row afterwards).
  let isReturning = false;
  if (s.email) {
    const paidLookup = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(s.email)}&version=eq.2&payment_status=eq.paid&select=id&limit=1`,
      { headers }
    );
    isReturning = paidLookup.ok && (await paidLookup.json()).length > 0;
  }
  // Currency + amount are derived server-side from the visitor's geo header.
  // Never trust a client-supplied currency hint — that would let someone in
  // a $45.99 country pay £24.99 by spoofing the header.
  const country = countryFromRequest(req);
  const pricing = priceForCountry(country);
  const amount = isReturning ? pricing.returningAmountMinor : pricing.amountMinor;
  const childList = normalizeNameList(s.child_name);
  const productName = isReturning
    ? `Full story for ${childList} (returning-customer ${pricing.returningDiscountDisplay} off)`
    : `Full story for ${childList}`;

  const stripe = new Stripe(stripeKey);
  const checkoutPayload = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: pricing.currency.toLowerCase(),
        product_data: { name: productName, description: `15-minute personalised audio story for ${childList}` },
        unit_amount: amount
      },
      quantity: 1
    }],
    metadata: {
      story_id: s.id,
      kind: 'paid_v2',
      returning: isReturning ? '1' : '0',
      country,
      currency: pricing.currency,
      // Meta CAPI matching params — the webhook will use these to match the
      // Purchase event back to the user's browser session for attribution.
      fbp: fbp || '',
      fbc: fbc || '',
      user_agent: req.headers.get('user-agent') || ''
    },
    // Embedded checkout: the buyer never leaves our page. Stripe mounts the
    // payment form inside the processing overlay so the brand vibe carries
    // through to payment. After success Stripe redirects to return_url with
    // {CHECKOUT_SESSION_ID} substituted; the order-confirmed page fires the
    // Meta Purchase pixel using that id so it dedupes with the server-side
    // CAPI event (`purchase_<session.id>`).
    ui_mode: 'embedded',
    return_url: `${appUrl}/order-confirmed/${s.id}?t=${s.access_token}&paid=1&cs={CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true
  };
  // Pre-fill email when we already have it (gift senders, returning users via
  // login). Otherwise let Stripe collect it during checkout — the webhook will
  // patch it onto the row from session.customer_details.email.
  if (s.email) checkoutPayload.customer_email = s.email;
  const sess = await stripe.checkout.sessions.create(checkoutPayload);

  // ── Meta Pixel: InitiateCheckout (server-side mirror) ──
  // Browser fired the same eventId from preview.html. Fire-and-forget — never
  // block the redirect to Stripe on this.
  if (checkoutEventId) {
    sendMetaEvent({
      eventName: 'InitiateCheckout',
      eventId: checkoutEventId,
      email: s.email,
      fbp,
      fbc,
      userAgent: req.headers.get('user-agent') || '',
      sourceUrl: `${appUrl}/preview/${s.id}`,
      value: amount / 100,
      currency: pricing.currency,
      customData: {
        content_name: 'Full story',
        content_type: 'product',
        content_ids: ['storytold_personalised_story']
      }
    }).catch(() => {});
  }

  // Save session id to the story so webhook can correlate
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
    method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripe_session_id_v2: sess.id })
  });

  return json({
    clientSecret: sess.client_secret,
    sessionId: sess.id,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
