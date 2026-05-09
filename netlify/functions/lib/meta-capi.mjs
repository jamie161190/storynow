// Shared Meta Conversions API helper.
//
// Fires server-side events to Meta with the same event_id used by the browser
// pixel — Meta deduplicates so we count once but improve attribution (browser
// events can be blocked by iOS/ad-blockers; server events come from us).
//
// Usage:
//   import { sendMetaEvent } from './lib/meta-capi.mjs';
//   await sendMetaEvent({
//     eventName: 'Lead',
//     eventId: 'lead_<storyId>',           // matches client-side fbq event_id
//     email: 'user@example.com',           // hashed before sending
//     fbp: 'fb.1.…', fbc: 'fb.1.…',        // captured from cookies on form submit
//     userAgent: req.headers.get('user-agent'),
//     sourceUrl: 'https://heartheirname.com/start',
//     value: 24.99, currency: 'GBP',       // optional, used by Purchase / InitiateCheckout
//   });
//
// Returns { ok, status, body } — never throws (we don't want pixel errors to
// break the user-facing flow).

import { createHash } from 'node:crypto';

const PIXEL_ID = process.env.META_PIXEL_ID || '1656775315345896';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

const sha256 = (s) => createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');

export async function sendMetaEvent({
  eventName,
  eventId,
  email,
  fbp,
  fbc,
  userAgent,
  sourceUrl = 'https://heartheirname.com',
  value,
  currency,
  customData = {},
  testEventCode, // optional: pass META_TEST_EVENT_CODE to send to test events tab
}) {
  if (!ACCESS_TOKEN) {
    console.warn(`[META-CAPI] Skipped ${eventName}: META_CAPI_TOKEN not set`);
    return { ok: false, status: 0, body: { error: 'no token' } };
  }
  if (!eventName || !eventId) {
    console.error('[META-CAPI] Missing eventName or eventId');
    return { ok: false, status: 0, body: { error: 'missing required fields' } };
  }

  const userData = {};
  if (email) userData.em = [sha256(email)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (userAgent) userData.client_user_agent = userAgent;

  const eventPayload = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    event_source_url: sourceUrl,
    action_source: 'website',
    user_data: userData,
    custom_data: {
      ...customData,
      ...(value !== undefined ? { value: Number(value).toFixed(2) } : {}),
      ...(currency ? { currency: currency.toUpperCase() } : {}),
    },
  };

  const payload = { data: [eventPayload] };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      console.error(`[META-CAPI] ${eventName} failed:`, JSON.stringify(body));
      return { ok: false, status: res.status, body };
    }
    console.log(`[META-CAPI] ${eventName} sent (event_id=${eventId})`);
    return { ok: true, status: res.status, body };
  } catch (err) {
    console.error(`[META-CAPI] ${eventName} threw:`, err.message);
    return { ok: false, status: 0, body: { error: err.message } };
  }
}
