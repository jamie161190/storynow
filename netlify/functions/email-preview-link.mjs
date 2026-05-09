// POST /api/email-preview-link { storyId, accessToken, email }
// Self-serve "listen later" flow. Customer is on the preview page, can't
// listen right now, gives us their email and we send them the preview link
// via Resend. Side benefits: saves the email to the row pre-payment (so
// the eventual story-ready email has somewhere to land) and primes the
// customer's inbox by triggering a first email from us at a high-intent
// moment (their click on it improves deliverability of future emails).
//
// Access is gated by accessToken match — same pattern as preview-meta and
// contact-jamie. Random visitors can't trigger emails using a guessed id.

import { BRAND_FROM } from './lib/constants.mjs';
import { emailPreviewReady } from './lib/email-templates-v2.mjs';
import { normalizeNameList } from './lib/format-names.mjs';

// Inlined to match the convention used by preview-request, stripe-webhook-paid
// and full-worker-v2-background. The constant isn't centralised in lib yet.
const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!supabaseUrl || !supabaseKey || !resendKey) return json({ error: 'Service not configured' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad json' }, 400); }
  const { storyId, accessToken, email } = body || {};
  if (!storyId || !accessToken || !email) return json({ error: 'storyId, accessToken and email required' }, 400);

  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return json({ error: 'Invalid email' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&version=eq.2&select=id,email,child_name,access_token,preview_url,preview_text,story_data,status&limit=1`,
    { headers, signal: AbortSignal.timeout(5000) }
  );
  if (!lookup.ok) return json({ error: 'Lookup failed' }, 500);
  const rows = await lookup.json();
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const story = rows[0];

  if (accessToken !== story.access_token) return json({ error: 'Access denied' }, 403);
  if (!story.preview_url) return json({ error: 'Preview not ready yet' }, 409);

  // Save the email onto the row so the post-purchase delivery email has a
  // known-good address. Don't overwrite an existing different email — that
  // would be confusing (customer A might submit, customer B might be the
  // person who clicks listen-later from a forwarded link). If the row
  // already has an email, just send to that and skip the patch.
  const headersJson = { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (!story.email) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH',
        headers: headersJson,
        body: JSON.stringify({ email: cleanEmail }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) { console.error('[email-preview-link] email patch failed:', e.message); }
  }

  const childList = normalizeNameList(story.child_name) || 'their child';
  const requesterName = story.story_data?.giftFrom
    || (story.story_data?.children?.[0]?.parentName)
    || '';
  const previewUrl = `${appUrl}/preview/${storyId}?t=${accessToken}`;
  const tmpl = emailPreviewReady({
    firstName: requesterName,
    childList,
    previewTitle: '',
    previewUrl,
    jamieNote: ''
  });

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: BRAND_FROM,
        to: [cleanEmail],
        reply_to: 'jamie@heartheirname.com',
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        headers: RESEND_LIST_UNSUB
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const errBody = await r.text();
      console.error('[email-preview-link] Resend failed:', r.status, errBody);
      return json({ error: 'Send failed' }, 502);
    }
  } catch (e) {
    console.error('[email-preview-link] threw:', e.message);
    return json({ error: 'Send failed' }, 500);
  }

  return json({ ok: true });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
