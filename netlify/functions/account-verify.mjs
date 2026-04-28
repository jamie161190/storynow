// GET /api/account/verify?token=...&next=...
// Verifies the magic-link token, sets the session cookie, redirects to next (default /account).

import { sha256Hex, buildSessionCookie } from './lib/auth.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const next = url.searchParams.get('next') || '/account';
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!token) return redirect(`${appUrl}/login?error=missing`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return redirect(`${appUrl}/login?error=config`);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const tokenHash = sha256Hex(token);
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/account_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=email,expires_at`,
    { headers }
  );
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return redirect(`${appUrl}/login?error=invalid`);

  const sess = rows[0];
  if (new Date(sess.expires_at) < new Date()) return redirect(`${appUrl}/login?error=expired`);

  // Update last_used_at
  await fetch(`${supabaseUrl}/rest/v1/account_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ last_used_at: new Date().toISOString() })
  });

  // Set cookie + redirect
  const safeNext = next.startsWith('/') ? next : '/account';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${appUrl}${safeNext}`,
      'Set-Cookie': buildSessionCookie(sess.email)
    }
  });
};

function redirect(url) { return new Response(null, { status: 302, headers: { 'Location': url } }); }
