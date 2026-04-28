// POST /api/account/login { email }
// Sends a magic-link to the email so they can sign in.

import { newToken, sha256Hex } from './lib/auth.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

const SUBJECT = 'Your HearTheirName sign-in link';

function emailHtml({ url }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4ECDB;font-family:'Cormorant Garamond',Georgia,serif;color:#1F1B2E">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;font-size:16px;line-height:1.65">
  <p>Hi,</p>
  <p>Tap the button below to sign in to your HearTheirName account. The link is good for 30 minutes.</p>
  <p style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:14px 26px;background:#1F1B2E;color:#F4ECDB;border-radius:10px;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-weight:600">Sign in to my account</a>
  </p>
  <p style="font-size:13px;color:#5C5240">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#4B2E83">${url}</span></p>
  <p style="margin-top:30px;font-style:italic;color:#4B2E83">Jamie</p>
</div></body></html>`;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const next = body.next || '/account';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!supabaseUrl || !supabaseKey || !resendKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  // Only allow sign-in for emails that have v2 stories (otherwise nothing to show)
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&version=eq.2&select=id&limit=1`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length){
    // Don't leak info — pretend we sent regardless.
    return json({ ok: true });
  }

  // Create magic-link token. Stored as a row in account_sessions but with very short expiry first.
  const token = newToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await fetch(`${supabaseUrl}/rest/v1/account_sessions`, {
    method: 'POST', headers: headersJson,
    body: JSON.stringify({ token_hash: tokenHash, email, expires_at: expiresAt })
  });

  const verifyUrl = `${appUrl}/api/account/verify?token=${token}&next=${encodeURIComponent(next)}`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: BRAND_FROM,
      to: [email],
      reply_to: 'jamie@heartheirname.com',
      subject: SUBJECT,
      html: emailHtml({ url: verifyUrl }),
      text: `Sign in to HearTheirName: ${verifyUrl}\n\n(The link is good for 30 minutes.)`,
      headers: { 'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    })
  });

  return json({ ok: true });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
