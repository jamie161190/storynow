// GET /api/verify?token=...&id=...
// Looks up token hash on stories row, marks verified, sets session cookie, queues preview generation,
// redirects to /preview/[id].

import { sha256Hex, buildSessionCookie } from './lib/auth.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const id = url.searchParams.get('id');
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!token || !id) return redirect(`${appUrl}/?verify=missing`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return redirect(`${appUrl}/?verify=error`);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const tokenHash = sha256Hex(token);
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&verify_token_hash=eq.${encodeURIComponent(tokenHash)}&version=eq.2&select=id,email,verified_at,access_token,status`,
    { headers }
  );
  if (!lookupRes.ok) return redirect(`${appUrl}/?verify=error`);

  const rows = await lookupRes.json();
  if (!rows.length) return redirect(`${appUrl}/?verify=invalid`);

  const story = rows[0];

  if (!story.verified_at) {
    // First time: mark verified, queue preview job, clear token
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({
        verified_at: new Date().toISOString(),
        verify_token_hash: null,
        status: 'preview_queued'
      })
    });
    // Queue preview job
    await fetch(`${supabaseUrl}/rest/v1/job_queue`, {
      method: 'POST', headers: headersJson,
      body: JSON.stringify({ story_id: id, job_type: 'preview', status: 'queued' })
    }).catch(() => {});
    // Trigger the preview worker
    try {
      await fetch(`${appUrl}/.netlify/functions/preview-worker-background`, { method: 'POST' });
    } catch {}
  }

  // Set session cookie + redirect to preview-listen page
  const cookie = buildSessionCookie(story.email);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${appUrl}/preview/${id}?t=${story.access_token}`,
      'Set-Cookie': cookie
    }
  });
};

function redirect(url) { return new Response(null, { status: 302, headers: { 'Location': url } }); }
