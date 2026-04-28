// GET /api/preview-meta?id=...&t=...
// Returns the metadata needed by /preview/[id] page (status, preview_url, child_name, etc).
// Access controlled via either session cookie OR access_token query.

import { getSessionFromHeaders } from './lib/auth.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const t = url.searchParams.get('t');
  if (!id) return json({ error: 'id required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&version=eq.2&select=id,email,child_name,status,preview_url,preview_text,preview_ready_at,verified_at,access_token,payment_status,paid_at,audio_url,story_data,jamie_note`,
    { headers }
  );
  if (!lookup.ok) return json({ error: 'Lookup failed' }, 500);
  const rows = await lookup.json();
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  // Access check
  const session = getSessionFromHeaders(req.headers);
  const sessionMatch = session && session.email === s.email;
  const tokenMatch = t && s.access_token && t === s.access_token;
  if (!sessionMatch && !tokenMatch) return json({ error: 'Access denied' }, 403);

  return json({
    id: s.id,
    childName: s.child_name,
    status: s.status,
    verified: !!s.verified_at,
    preview: s.preview_url ? {
      url: s.preview_url,
      readyAt: s.preview_ready_at,
      title: s.story_data?.title || ''
    } : null,
    paid: s.payment_status === 'paid' || !!s.paid_at,
    full: s.audio_url ? { url: s.audio_url, jamieNote: s.jamie_note } : null,
    storyData: {
      voice: s.story_data?.voice || '',
      storyKind: s.story_data?.storyKind || '',
      isGift: !!s.story_data?.isGift,
      giftFrom: s.story_data?.giftFrom || ''
    }
  });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
