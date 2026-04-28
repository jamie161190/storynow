// Lightweight HMAC auth helpers for v2 paid-redesign.
// Uses AUTH_SECRET (32+ random chars) from env to sign session cookies and magic-link tokens.
import { createHmac, randomBytes, createHash } from 'node:crypto';

const COOKIE_NAME = 'htn_session';
const SESSION_TTL_DAYS = 30;

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET not configured');
  return s;
}

export function sha256Hex(str) {
  return createHash('sha256').update(str).digest('hex');
}

export function newToken() {
  return randomBytes(24).toString('base64url');
}

export function hmac(value) {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

// Session cookie: base64url(email:exp_unix).hmac
// Stored ALSO in account_sessions table by token_hash for explicit logout.
export function buildSession(email, days = SESSION_TTL_DAYS) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const payload = Buffer.from(`${email}:${exp}`, 'utf8').toString('base64url');
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function parseSession(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  if (sig !== expected) return null;
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const [email, exp] = decoded.split(':');
    if (!email || !exp) return null;
    if (parseInt(exp, 10) * 1000 < Date.now()) return null;
    return { email: email.toLowerCase(), exp: parseInt(exp, 10) };
  } catch { return null; }
}

export function getSessionFromHeaders(headers) {
  const cookie = headers.get ? headers.get('cookie') : (headers.cookie || '');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return parseSession(decodeURIComponent(match[1]));
}

export function buildSessionCookie(email) {
  const token = buildSession(email);
  const maxAge = SESSION_TTL_DAYS * 86400;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;
