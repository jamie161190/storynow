// Background worker: takes a story_id, runs the middle-layer brief analyst,
// persists the brief into stories.story_data.brief, sets status=brief_ready.
// Triggered by /api/verify after email verification (with story_id in body),
// or by /api/admin-queue?action=regenerate-brief.
//
// Bypasses job_queue: the brief is one fast Claude call per story, so the
// extra observability isn't worth the schema migration to add 'brief' to
// the job_queue_job_type_check constraint.

import { analyzeBrief } from './lib/brief-analyst.mjs';
import { sanitiseStoryData } from './lib/story-prompts.mjs';
import { v2ToV1 } from './lib/v2-to-v1.mjs';

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !supabaseKey || !anthropicKey) {
    console.error('[BRIEF-WORKER] Missing env vars');
    return resp({ ok: false, error: 'env' }, 500);
  }

  let storyId;
  try {
    const body = await req.json();
    storyId = body?.storyId || body?.story_id;
  } catch {}
  if (!storyId) {
    const url = new URL(req.url);
    storyId = url.searchParams.get('storyId') || url.searchParams.get('story_id');
  }
  if (!storyId) return resp({ ok: false, error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  console.log('[BRIEF-WORKER] Story', storyId);

  const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,story_data,status`, { headers });
  if (!sRes.ok) {
    console.error('[BRIEF-WORKER] Lookup failed:', sRes.status);
    return resp({ ok: false, error: 'lookup failed' }, 500);
  }
  const sRows = await sRes.json();
  if (!sRows.length) {
    console.error('[BRIEF-WORKER] Story not found:', storyId);
    return resp({ ok: false, error: 'story not found' }, 404);
  }

  const rawData = sRows[0].story_data || {};
  const storyData = sanitiseStoryData(v2ToV1(rawData));

  let brief;
  try {
    console.log('[BRIEF-WORKER] Running analyst...');
    brief = await analyzeBrief(storyData);
  } catch (err) {
    console.error('[BRIEF-WORKER] Analyst failed:', err.message);
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ status: 'brief_failed' })
    }).catch(() => {});
    return resp({ ok: false, error: 'analyst failed' }, 500);
  }

  // Merge brief into existing story_data so the dashboard's existing
  // story_data renderer surfaces it without a schema change.
  const mergedStoryData = { ...rawData, brief, brief_generated_at: new Date().toISOString() };

  const patchRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({
      story_data: mergedStoryData,
      status: 'brief_ready'
    })
  });

  if (!patchRes.ok) {
    console.error('[BRIEF-WORKER] Patch failed:', patchRes.status, await patchRes.text());
    return resp({ ok: false, error: 'patch failed' }, 500);
  }

  console.log('[BRIEF-WORKER] Done: confidence:', brief?.confidence, 'flags:', JSON.stringify(brief?.flags || []));

  // Auto-chain into preview-worker so the customer in-browser at
  // /preview/{id}?t=... sees status flip from brief_running to preview_running
  // without any human intervention. Timed dispatch so a hung trigger never
  // leaves a brief_ready row dangling. On failure, mark preview_failed for
  // the admin Issues tab.
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';
  try {
    const dispatch = await fetch(`${appUrl}/.netlify/functions/preview-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId }),
      signal: AbortSignal.timeout(3000)
    });
    if (!dispatch.ok && dispatch.status >= 500) {
      throw new Error(`preview-worker dispatch returned ${dispatch.status}`);
    }
    console.log('[BRIEF-WORKER] Chained into preview-worker.');
  } catch (e) {
    console.error('[BRIEF-WORKER] Failed to chain preview-worker:', e.message);
    try {
      await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
        method: 'PATCH', headers: headersJson,
        body: JSON.stringify({ status: 'preview_failed' }),
        signal: AbortSignal.timeout(3000)
      });
    } catch {}
  }

  return resp({ ok: true, brief_confidence: brief?.confidence, brief_flags: brief?.flags || [] });
};

function resp(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }

export const config = { type: 'experimental-background' };

