// POST /api/lock-in
// G+ flow: customer has read the 300-word opening, optionally edited it,
// picked a narrator voice and music option. This endpoint persists all that
// to the story row, rebuilds story_text as (editedOpening + continuation),
// then creates a Stripe Embedded Checkout session and returns the
// clientSecret so the customer can pay in-page.
//
// Body: { storyId, accessToken, editedOpening, voiceId, musicId, email,
//         fbp, fbc, checkoutEventId }
//   editedOpening: string, ~100-600 words (validate to keep abuse out)
//   voiceId: one of the known narrator voice ids
//   musicId: one of 'bedtime', 'adventure', 'none'
//
// Returns: { clientSecret, sessionId, publishableKey } same shape as the
// existing /api/checkout-paid endpoint, so the frontend Stripe mount code
// works unchanged.

import Stripe from 'stripe';
import { getSessionFromHeaders } from './lib/auth.mjs';
import { sendMetaEvent } from './lib/meta-capi.mjs';
import { normalizeNameList } from './lib/format-names.mjs';
import { priceForCountry, countryFromRequest } from './lib/pricing.mjs';

const VALID_VOICES = new Set([
  'British (gentle)', 'Irish (lilting)', 'American (cosy)',
  'Scottish (kind)', 'Australian (bright)'
]);
const VALID_MUSIC = new Set(['bedtime', 'adventure', 'none']);

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!stripeKey || !supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const body = await req.json().catch(() => ({}));
  const {
    storyId, accessToken, editedOpening, voiceId, musicId,
    fbp, fbc, checkoutEventId, email: emailFromBody
  } = body;
  if (!storyId) return json({ error: 'storyId required' }, 400);

  // Validate inputs early so we can return clean errors before touching DB/Stripe.
  const opening = (editedOpening || '').trim();
  if (!opening) return json({ error: 'editedOpening required' }, 400);
  const openingWordCount = opening.split(/\s+/).filter(Boolean).length;
  if (openingWordCount < 80 || openingWordCount > 600) {
    return json({ error: 'opening must be 80-600 words', words: openingWordCount }, 400);
  }
  if (!voiceId || !VALID_VOICES.has(voiceId)) {
    return json({ error: 'invalid voice', valid: [...VALID_VOICES] }, 400);
  }
  const music = (musicId || 'none').toString();
  if (!VALID_MUSIC.has(music)) {
    return json({ error: 'invalid music', valid: [...VALID_MUSIC] }, 400);
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&version=eq.2&select=id,email,child_name,access_token,payment_status,paid_at,story_data,story_text`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  // Access check — token-only is fine because the story row hasn't necessarily
  // captured an email yet (Stripe will collect it during checkout).
  const session = getSessionFromHeaders(req.headers);
  if (!(session && session.email === s.email) && !(accessToken && accessToken === s.access_token)) {
    return json({ error: 'Access denied' }, 403);
  }

  if (s.payment_status === 'paid' || s.paid_at) {
    return json({ error: 'Already paid', alreadyPaid: true }, 409);
  }

  // Persist email from the body if the form captured one and we don't have it.
  const cleanEmailFromBody = (emailFromBody || '').trim().toLowerCase();
  if (cleanEmailFromBody && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmailFromBody) && cleanEmailFromBody !== s.email) {
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ email: cleanEmailFromBody })
    });
    s.email = cleanEmailFromBody;
  }

  // Rebuild story_text from edited opening + the original continuation. If the
  // continuation field is missing (shouldn't happen on new rows, but be safe),
  // fall back to overwriting story_text with the edited opening only and trust
  // the post-payment worker to handle that edge case.
  const sd = s.story_data || {};
  const continuation = (sd.continuation || '').trim();
  const newStoryText = continuation
    ? opening + '\n\n' + continuation
    : opening;

  const updatedStoryData = {
    ...sd,
    voice: voiceId,
    music_id: music,
    opening,             // store the edited version so admin can see what the customer locked in
    locked_in_at: new Date().toISOString()
  };

  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({
      story_text: newStoryText,
      story_data: updatedStoryData,
      status: 'locked_in'
    })
  });

  // Stripe Embedded Checkout — same shape as the existing /api/checkout-paid
  // endpoint, so the frontend mount code is unchanged.
  let isReturning = false;
  if (s.email) {
    const paidLookup = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(s.email)}&version=eq.2&payment_status=eq.paid&select=id&limit=1`,
      { headers }
    );
    isReturning = paidLookup.ok && (await paidLookup.json()).length > 0;
  }
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
      voice: voiceId,
      music: music,
      fbp: fbp || '',
      fbc: fbc || '',
      user_agent: req.headers.get('user-agent') || ''
    },
    ui_mode: 'embedded',
    return_url: `${appUrl}/order-confirmed/${s.id}?t=${s.access_token}&paid=1&cs={CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true
  };
  if (s.email) checkoutPayload.customer_email = s.email;
  const sess = await stripe.checkout.sessions.create(checkoutPayload);

  if (checkoutEventId) {
    sendMetaEvent({
      eventName: 'InitiateCheckout',
      eventId: checkoutEventId,
      email: s.email,
      fbp, fbc,
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

  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(s.id)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ stripe_session_id_v2: sess.id })
  });

  return json({
    clientSecret: sess.client_secret,
    sessionId: sess.id,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
