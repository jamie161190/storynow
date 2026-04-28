// POST /api/preview-request
// Receives the funnel submission, creates a v2 stories row, queues an email-verify magic link.
// On verification (separate /api/verify endpoint), preview generation is queued.

import { newToken, sha256Hex } from './lib/auth.mjs';
import { emailVerify } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  let payload;
  try { payload = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const email = (payload.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);

  const children = Array.isArray(payload.children) ? payload.children : [];
  if (!children.length) return json({ error: 'No children submitted' }, 400);
  const childList = children.map(c => c.name).filter(Boolean).join(' & ') || 'them';
  const firstChildName = children[0]?.name || '';
  const firstName = (payload.giftFrom || '').trim() || (children[0]?.parentName || '');

  // Build verify token
  const verifyToken = newToken();
  const verifyTokenHash = sha256Hex(verifyToken);
  const accessToken = newToken();

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
    method: 'POST',
    headers: { ...headersJson, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      email,
      child_name: childList,
      category: payload.storyKind || '',
      length: 'long',
      status: 'awaiting_verify',
      version: 2,
      verify_token_hash: verifyTokenHash,
      access_token: accessToken,
      payment_status: 'unpaid',
      story_data: payload
    })
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error('[PREVIEW-REQUEST] Insert failed:', errText);
    return json({ error: 'Failed to create request' }, 500);
  }

  const inserted = await insertRes.json();
  const storyId = inserted[0]?.id;

  // Send verify email
  if (resendKey) {
    const verifyUrl = `${appUrl}/verify?token=${verifyToken}&id=${storyId}`;
    const tmpl = emailVerify({ firstName, childList, verifyUrl });
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: BRAND_FROM,
          to: [email],
          reply_to: 'jamie@heartheirname.com',
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
          headers: RESEND_LIST_UNSUB
        })
      });
      if (!r.ok) console.error('[PREVIEW-REQUEST] Verify email failed:', await r.text());
    } catch (e) {
      console.error('[PREVIEW-REQUEST] Verify email exception:', e.message);
    }
  }

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

  return json({ ok: true, requestId: storyId });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
