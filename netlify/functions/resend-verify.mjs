// POST /api/resend-verify { email, requestId }
// Generates a fresh verify token and resends the verify email.

import { newToken, sha256Hex } from './lib/auth.mjs';
import { emailVerify } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { email, requestId } = await req.json().catch(() => ({}));
  if (!email || !requestId) return json({ error: 'email and requestId required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  if (!supabaseUrl || !supabaseKey || !resendKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(requestId)}&email=eq.${encodeURIComponent(email.toLowerCase())}&version=eq.2&select=id,verified_at,child_name,story_data`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ ok: true });
  const story = rows[0];
  if (story.verified_at) return json({ ok: true, alreadyVerified: true });

  const verifyToken = newToken();
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ verify_token_hash: sha256Hex(verifyToken) })
  });

  const verifyUrl = `${appUrl}/verify?token=${verifyToken}&id=${requestId}`;
  const sd = story.story_data || {};
  const tmpl = emailVerify({
    firstName: sd.giftFrom || (sd.children?.[0]?.parentName) || '',
    childList: story.child_name,
    verifyUrl
  });

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: BRAND_FROM,
      to: [email],
      reply_to: 'jamie@heartheirname.com',
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      headers: { 'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    })
  });

  return json({ ok: true });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
