// GET /api/account/me — returns the signed-in user's stories (v2 only).

import { getSessionFromHeaders, clearSessionCookie } from './lib/auth.mjs';

export default async (req) => {
  const session = getSessionFromHeaders(req.headers);
  if (!session) return json({ error: 'Not signed in' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(session.email)}&version=eq.2&order=created_at.desc&select=id,child_name,status,preview_url,audio_url,created_at,access_token,payment_status,paid_at,refunded_at,delivered_at,story_data`,
    { headers }
  );
  if (!lookup.ok) return json({ error: 'Lookup failed' }, 500);
  const rows = await lookup.json();

  const stories = rows.map(r => ({
    id: r.id,
    childName: r.child_name,
    status: r.status,
    paid: r.payment_status === 'paid' && !r.refunded_at,
    refunded: !!r.refunded_at,
    previewReady: !!r.preview_url,
    delivered: !!r.audio_url,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
    accessToken: r.access_token,
    voice: r.story_data?.voice || ''
  }));

  return json({ email: session.email, stories });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
