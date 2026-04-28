// POST /api/account/logout — clears the session cookie.
import { clearSessionCookie } from './lib/auth.mjs';

export default async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() }
  });
};
