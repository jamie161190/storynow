// POST /api/preview-request
// Receives the funnel submission, creates a v2 stories row, immediately fires
// the brief-worker (which auto-chains into preview-worker). Returns
// { storyId, accessToken } so the funnel can redirect the customer to
// /preview/{id}?t={token} where they wait in-browser.
// No email is sent at submit time. The customer reaches the preview via the
// in-browser redirect; if they want a link to come back to later, they can
// self-serve via the "Want to listen later?" form on the preview page,
// which fires email-preview-link.mjs with their typed-and-confirmed address.

import { newToken, sha256Hex } from './lib/auth.mjs';
import { formatNameList } from './lib/format-names.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  let payload;
  try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Email is optional at this stage. The customer hears the preview first; if
  // they want to buy, they enter their email on the preview page before
  // checkout, and we PATCH it onto the row then. If an email IS supplied, it
  // must be valid (so we don't store junk).
  const email = (payload.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  const children = Array.isArray(payload.children) ? payload.children : [];
  if (!children.length) return json({ error: 'No children submitted' }, 400);
  const childList = formatNameList(children.map(c => c.name)) || 'them';

  // Build verify token
  const verifyToken = newToken();
  const verifyTokenHash = sha256Hex(verifyToken);
  const accessToken = newToken();

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  // Mirror gift fields from story_data into dedicated columns so the admin
  // can render them without parsing JSONB on every row read. story_data
  // remains the source of truth for everything else.
  const isGift = !!payload.isGift;
  const giftRecipient = (isGift && payload.giftRecipientEmail) ? payload.giftRecipientEmail.trim().toLowerCase() : null;
  const giftFrom = (isGift && payload.giftFrom) ? payload.giftFrom.trim().slice(0, 200) : null;
  const giftMessage = (isGift && payload.giftMessage) ? payload.giftMessage.trim().slice(0, 2000) : null;
  const giftDeliveryNote = (isGift && payload.giftDeliveryNote) ? payload.giftDeliveryNote.trim().slice(0, 2000) : null;

  // Default delivery_mode to 'manual' so every new story flows through Jamie's
  // admin queue after payment instead of auto-firing the full worker. The
  // customer still sees the instant preview and can buy in the same session;
  // after they pay, the post-payment screen shows the "Jamie's making this
  // personally, ready within 24 hours" view, and Jamie ships from the admin
  // queue (where the pre-written story_text is already waiting as a draft).
  // To restore auto delivery for a single row, set story_data.delivery_mode
  // = 'auto' on that row before payment.
  const storyDataWithDefaults = { delivery_mode: 'manual', ...payload };

  // Insert at status='brief_running' so the brief-worker that we fire below
  // doesn't see the row in awaiting_verify and bail. We also mark verified_at
  // immediately because the customer is in-browser, not coming through email.
  // verify_token_hash is still stored for the backup recovery email path.
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
    method: 'POST',
    headers: { ...headersJson, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      email: email || null,
      child_name: childList,
      category: payload.storyKind || '',
      length: 'long',
      status: 'brief_running',
      version: 2,
      verify_token_hash: verifyTokenHash,
      verified_at: new Date().toISOString(),
      access_token: accessToken,
      payment_status: 'unpaid',
      story_data: storyDataWithDefaults,
      is_gift: isGift,
      gift_recipient_email: giftRecipient,
      gift_email: giftRecipient,            // duplicate column kept in sync
      gift_from: giftFrom,
      gift_message: giftMessage,
      gift_delivery_preference: giftDeliveryNote
    })
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error('[PREVIEW-REQUEST] Insert failed:', errText);
    return json({ error: 'Failed to create request' }, 500);
  }

  const inserted = await insertRes.json();
  const storyId = inserted[0]?.id;

  // Fire the brief-worker immediately. Timed dispatch so a hung trigger does
  // not block this request. On failure, mark status='brief_failed' so the
  // admin Issues tab catches the stuck row. The brief worker auto-chains
  // into the preview worker (see brief-worker-background.mjs).
  try {
    const dispatch = await fetch(`${appUrl}/.netlify/functions/brief-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId }),
      signal: AbortSignal.timeout(3000)
    });
    if (!dispatch.ok && dispatch.status >= 500) {
      throw new Error(`brief-worker dispatch returned ${dispatch.status}`);
    }
  } catch (e) {
    console.error('[PREVIEW-REQUEST] brief-worker dispatch failed:', e.message);
    try {
      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ status: 'brief_failed' }),
        signal: AbortSignal.timeout(3000)
      });
    } catch (e2) { console.error('[PREVIEW-REQUEST] failed to mark brief_failed:', e2.message); }
  }

  // No outbound email at submit time. The customer is redirected to the
  // preview page in-browser; the "Want to listen later?" form on that page
  // is the path to send themselves a link if they want one.

  // Increment weekly counter (for scarcity badge)
  try {
    const today = new Date();
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    monday.setUTCHours(0,0,0,0);
    const weekStart = monday.toISOString().slice(0,10);
    await fetch(`${supabaseUrl}/rest/v1/rpc/increment_weekly_count`, {
      method: 'POST', headers: headersJson,
      body: JSON.stringify({ p_week_start: weekStart })
    }).catch(() => {});
  } catch {}

  // Return both id and accessToken so the funnel can immediately redirect
  // the customer to /preview/{id}?t={token} for the in-browser wait + listen.
  return json({ ok: true, requestId: storyId, accessToken });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
