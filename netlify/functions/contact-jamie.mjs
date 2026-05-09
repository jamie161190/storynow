// POST /api/contact-jamie { storyId, accessToken, message }
// Lets a customer on the preview page send a message directly to Jamie without
// leaving the page. Replaces the old mailto link which required a configured
// email client (broken on mobile webmail users).
//
// Validates storyId + accessToken so random visitors can't spam Jamie's inbox
// from this endpoint.

import { BRAND_FROM } from './lib/constants.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'jamie@heartheirname.com';
  if (!supabaseUrl || !supabaseKey || !resendKey) return json({ error: 'Service not configured' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad json' }, 400); }
  const { storyId, accessToken, message } = body || {};
  if (!storyId || !message) return json({ error: 'storyId and message required' }, 400);
  const trimmed = String(message).trim();
  if (trimmed.length < 3) return json({ error: 'Message too short' }, 400);
  if (trimmed.length > 4000) return json({ error: 'Message too long' }, 400);

  // Look up the story and validate access. Either the access_token must match,
  // OR (less strict but useful) the request includes a valid v2 storyId in
  // preview-able state. We require the token because it stops scraped IDs.
  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&version=eq.2&select=email,child_name,access_token,status,story_data`,
    { headers, signal: AbortSignal.timeout(5000) }
  );
  if (!lookup.ok) return json({ error: 'Lookup failed' }, 500);
  const rows = await lookup.json();
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const story = rows[0];
  if (!accessToken || accessToken !== story.access_token) {
    return json({ error: 'Access denied' }, 403);
  }

  const childName = story.child_name || 'their child';
  const customerEmail = story.email || '(no email on file)';
  const requesterName = story.story_data?.giftFrom
    || (story.story_data?.children?.[0]?.parentName)
    || '';

  const subject = `Customer message · ${childName} · before purchase`;
  const adminText = [
    `Customer is on the preview page and wants to talk before buying.`,
    ``,
    `From: ${customerEmail}${requesterName ? ` (${requesterName})` : ''}`,
    `Story: ${childName}`,
    `Story ID: ${storyId}`,
    `Status: ${story.status}`,
    ``,
    `Message:`,
    trimmed,
    ``,
    `Reply directly to this email — your reply goes back to ${customerEmail}.`,
  ].join('\n');

  const escHtml = (s) => String(s || '').replace(/[<>&"']/g, c => ({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'
  }[c]));

  const adminHtml = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1F1B2E">
      <p style="font-family:Georgia,serif;font-size:22px;margin:0 0 18px">Customer message · pre-purchase</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin-bottom:18px">
        <tr><td style="color:#5C5240;width:90px">From</td><td><strong>${escHtml(customerEmail)}</strong>${requesterName ? ` (${escHtml(requesterName)})` : ''}</td></tr>
        <tr><td style="color:#5C5240">Child</td><td>${escHtml(childName)}</td></tr>
        <tr><td style="color:#5C5240">Story ID</td><td><code style="font-size:12px">${escHtml(storyId)}</code></td></tr>
        <tr><td style="color:#5C5240">Status</td><td>${escHtml(story.status)}</td></tr>
      </table>
      <div style="background:#F0E8D7;border-left:3px solid #4B2E83;border-radius:8px;padding:14px 18px;font-size:14.5px;line-height:1.6;white-space:pre-wrap">${escHtml(trimmed)}</div>
      <p style="margin-top:24px;font-size:13px;color:#8A7E64">Reply directly to this email — your reply goes back to ${escHtml(customerEmail)}.</p>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: BRAND_FROM,
        to: [adminEmail],
        reply_to: customerEmail || 'jamie@heartheirname.com',
        subject,
        text: adminText,
        html: adminHtml,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const errBody = await r.text();
      console.error('[contact-jamie] Resend failed:', r.status, errBody);
      return json({ error: 'Send failed' }, 502);
    }
  } catch (e) {
    console.error('[contact-jamie] threw:', e.message);
    return json({ error: 'Send failed' }, 500);
  }

  // Also persist the message onto story_data.customer_messages so it surfaces
  // in the admin detail view inline. The email is the immediate signal; the
  // row-level array is the audit trail / inbox view. Append to the existing
  // array (don't overwrite) so multiple corrections from the same customer
  // accumulate. Best-effort: a Resend-success but a Supabase-fail still
  // returns ok to the customer.
  try {
    const existing = Array.isArray(story.story_data?.customer_messages)
      ? story.story_data.customer_messages
      : [];
    const newEntry = {
      at: new Date().toISOString(),
      body: trimmed,
      from: customerEmail,
      acknowledged_at: null
    };
    const merged = {
      ...(story.story_data || {}),
      customer_messages: [...existing, newEntry]
    };
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ story_data: merged }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('[contact-jamie] message-persist failed (non-fatal):', e.message);
  }

  return json({ ok: true });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
