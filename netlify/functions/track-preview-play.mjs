// POST /api/track-preview-play { storyId, accessToken }
// Fires once per page session when the customer presses Play on the preview
// audio. Bumps preview_play_count, stamps first_played_at + last_played_at so
// the admin can see whether the preview has actually been engaged with.

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad json' }, 400); }
  const { storyId, accessToken } = body || {};
  if (!storyId) return json({ error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };

  // Validate access token before logging anything (so random IPs can't spam
  // the count for a story they don't have access to).
  let lookup;
  try {
    lookup = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=access_token,preview_first_played_at,preview_play_count&limit=1`,
      { headers, signal: AbortSignal.timeout(3000) }
    );
  } catch (e) { return json({ error: 'Lookup failed' }, 500); }
  if (!lookup.ok) return json({ error: 'Lookup failed' }, 500);
  const rows = await lookup.json();
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const story = rows[0];
  if (!accessToken || accessToken !== story.access_token) {
    return json({ error: 'Access denied' }, 403);
  }

  const nowIso = new Date().toISOString();
  const patch = {
    preview_play_count: (story.preview_play_count || 0) + 1,
    preview_last_played_at: nowIso,
  };
  if (!story.preview_first_played_at) {
    patch.preview_first_played_at = nowIso;
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    // Don't block the customer's playback if Supabase has a hiccup
    console.error('[track-preview-play] PATCH failed:', e.message);
  }

  return json({ ok: true });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
