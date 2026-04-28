// POST /api/rerecord-request { storyId, accessToken, reasonTag, body }
// Creates a re-record request and emails Jamie.

import { getSessionFromHeaders } from './lib/auth.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { storyId, accessToken, reasonTag, body: msg } = await req.json().catch(() => ({}));
  if (!storyId) return json({ error: 'storyId required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'jamie@heartheirname.com';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const lookup = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,access_token`, { headers });
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  const session = getSessionFromHeaders(req.headers);
  if (!(session && session.email === s.email) && !(accessToken && accessToken === s.access_token)){
    return json({ error: 'Access denied' }, 403);
  }

  await fetch(`${supabaseUrl}/rest/v1/rerecord_requests`, {
    method: 'POST', headers: headersJson,
    body: JSON.stringify({ story_id: storyId, reason_tag: reasonTag || 'Other', body: msg || '' })
  });
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ rerecord_count: 1 })
  });

  if (resendKey){
    const html = `<p>Re-record request for <strong>${esc(s.child_name)}</strong> (story ${storyId})</p>
      <p>From: ${esc(s.email)}<br>Tag: ${esc(reasonTag || 'Other')}</p>
      <p style="white-space:pre-wrap">${esc(msg || '')}</p>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: BRAND_FROM, to: [adminEmail], reply_to: s.email,
        subject: `Re-record: ${s.child_name}`, html, text: `Re-record request for ${s.child_name}\nFrom: ${s.email}\nTag: ${reasonTag}\n\n${msg}`
      })
    }).catch(() => {});
  }

  return json({ ok: true });
};

function esc(s){ return String(s == null ? '' : s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
