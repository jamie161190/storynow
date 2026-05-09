// GET /api/verify?token=...&id=...
// Looks up token hash on stories row, marks verified, queues the BRIEF analyst (middle layer),
// sets session cookie, redirects to /thanks. The brief lands in the dashboard for Jamie to review;
// preview generation happens manually from there.

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
  const selectCols = 'id,email,child_name,verified_at,access_token,status';
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&verify_token_hash=eq.${encodeURIComponent(tokenHash)}&version=eq.2&select=${selectCols}`,
    { headers }
  );
  if (!lookupRes.ok) return redirect(`${appUrl}/?verify=error`);

  let rows = await lookupRes.json();

  // Fallback for legitimate duplicate clicks (refresh, back button, iOS Mail
  // re-tap): the first click cleared verify_token_hash to null, so the lookup
  // by hash returns 0 rows. If the row exists by id AND is already verified,
  // treat the click as idempotent and redirect to /thanks. Otherwise the
  // token is genuinely invalid.
  let alreadyVerified = false;
  if (!rows.length) {
    const fallbackRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&version=eq.2&verified_at=not.is.null&select=${selectCols}`,
      { headers }
    );
    if (fallbackRes.ok) {
      rows = await fallbackRes.json();
      if (rows.length) alreadyVerified = true;
    }
  }
  if (!rows.length) return redirect(`${appUrl}/?verify=invalid`);

  const story = rows[0];
  const params = new URLSearchParams();
  if (story.child_name) params.set('child', story.child_name);
  // id is passed so the thanks-page client pixel can use the same deterministic
  // event_id (`verify_<storyId>`) as the server CAPI call below — Meta dedups.
  params.set('id', story.id);
  const childParam = `?${params.toString()}`;

  // Duplicate-click path: skip DB writes, skip cookie (we never proved the
  // clicker is the email owner), just return them to the friendly thanks page.
  if (alreadyVerified) {
    return redirect(`${appUrl}/thanks${childParam}`);
  }

  if (!story.verified_at) {
    // First time: mark verified, clear token, kick off the brief analyst.
    // No job_queue row: the brief is a single fast Claude call and the
    // job_queue.job_type CHECK constraint doesn't include 'brief'.
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({
        verified_at: new Date().toISOString(),
        verify_token_hash: null,
        status: 'brief_running'
      })
    });
    // Trigger the brief worker (runs the middle-layer analyst, then stops).
    // Timed dispatch — if the trigger itself hangs we still want the user to
    // land on /thanks. On failure, mark status='brief_failed' so admin sees
    // the stuck row instead of it silently sitting in 'brief_running' forever.
    try {
      const dispatch = await fetch(`${appUrl}/.netlify/functions/brief-worker-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: id }),
        signal: AbortSignal.timeout(3000)
      });
      if (!dispatch.ok && dispatch.status >= 500) {
        throw new Error(`brief-worker dispatch returned ${dispatch.status}`);
      }
    } catch (e) {
      console.error('[verify] brief-worker dispatch failed:', e.message);
      try {
        await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: headersJson,
          body: JSON.stringify({ status: 'brief_failed' }),
          signal: AbortSignal.timeout(3000)
        });
      } catch (e2) { console.error('[verify] failed to mark brief_failed:', e2.message); }
    }

    // NOTE: We deliberately do NOT fire a CompleteRegistration CAPI event here.
    // The primary CompleteRegistration fires at form submission (browser + CAPI
    // pair from start.html → /api/track-lead) with the same event_id Meta uses
    // for dedup. Adding a verify-time fire would be redundant and was producing
    // dedup misses in Events Manager because verify.mjs has no access to fbp/fbc
    // cookies — Meta's matching algorithm prefers events whose user_data agrees,
    // and the verify-time fire's user_data is a strict subset of the submit-time
    // pair. One submission = one event. Done.
  }

  // First-click path: set session cookie (proves email ownership for /account),
  // then redirect to the thanks page.
  const cookie = buildSessionCookie(story.email);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${appUrl}/thanks${childParam}`,
      'Set-Cookie': cookie
    }
  });
};

function redirect(url) { return new Response(null, { status: 302, headers: { 'Location': url } }); }
