// Queue worker (background function).
// Input: { jobType: 'text' | 'audio' }
// Loops claiming queued jobs of that type, runs them via the existing
// background functions, polls for completion. Designed to be the ONLY
// worker running per jobType so jobs process serially (respects rate limits).
//
// When queue empty or about to hit 15-min timeout, exits. A new trigger
// (from admin action or scheduled safety net) will start a fresh worker.

const MAX_RUNTIME_MS = 12 * 60 * 1000;          // stop accepting new jobs after 12 min
const JOB_TIMEOUT_MS = 10 * 60 * 1000;          // wait up to 10 min per job
const POLL_INTERVAL_MS = 5000;
const INTER_JOB_WAIT_MS = 45000;                // cushion between Claude jobs to avoid 429

export const handler = async (event) => {
  const startedAt = Date.now();
  let jobType;
  let supabaseUrl, supabaseKey, headers, headersJson;
  try {
    const parsed = JSON.parse(event.body || '{}');
    jobType = parsed.jobType;
    if (!['text', 'audio', 'regenerate'].includes(jobType)) {
      console.error('[QUEUE-WORKER] Invalid jobType:', jobType);
      return { statusCode: 400 };
    }

    supabaseUrl = process.env.SUPABASE_URL;
    supabaseKey = process.env.SUPABASE_SECRET_KEY;
    headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
    headersJson = { ...headers, 'Content-Type': 'application/json' };

    console.log('[QUEUE-WORKER] Start', jobType);

    while (Date.now() - startedAt < MAX_RUNTIME_MS) {
      // Atomically claim the next queued job of this type (via RPC)
      const claimRes = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_next_job`, {
        method: 'POST',
        headers: headersJson,
        body: JSON.stringify({ p_job_type: jobType })
      });
      if (!claimRes.ok) {
        console.error('[QUEUE-WORKER] Claim failed:', claimRes.status, await claimRes.text());
        break;
      }
      const job = await claimRes.json();
      if (!job || !job.id) {
        console.log('[QUEUE-WORKER] Queue empty, exiting.');
        break;
      }

      console.log('[QUEUE-WORKER] Claimed job', job.id, 'for story', job.story_id);

      try {
        await runJob(job, supabaseUrl, headers, headersJson);
        await markJob(job.id, 'done', null, supabaseUrl, headersJson);
        console.log('[QUEUE-WORKER] Job done', job.id);
      } catch (err) {
        console.error('[QUEUE-WORKER] Job failed', job.id, err.message);
        await markJob(job.id, 'failed', err.message, supabaseUrl, headersJson);
      }

      // Cushion between Claude-heavy jobs to avoid rate limiting
      if (jobType === 'text' || jobType === 'regenerate') {
        if (Date.now() - startedAt < MAX_RUNTIME_MS) {
          console.log('[QUEUE-WORKER] Cooling down', INTER_JOB_WAIT_MS, 'ms');
          await sleep(INTER_JOB_WAIT_MS);
        }
      }
    }

    // If we exited because of time but queue might still have work, self-retrigger.
    // Don't release the slot — pass it to the successor. The successor will
    // eventually release it (or pass it on again).
    let passedSlot = false;
    if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
      const remainingRes = await fetch(
        `${supabaseUrl}/rest/v1/job_queue?status=eq.queued&job_type=eq.${jobType}&select=id&limit=1`,
        { headers }
      );
      const remaining = remainingRes.ok ? await remainingRes.json() : [];
      if (remaining.length) {
        console.log('[QUEUE-WORKER] Timeout approaching, triggering successor for', jobType);
        // Refresh slot timestamp so the successor's 15-min staleness check doesn't fire.
        await fetch(`${supabaseUrl}/rest/v1/worker_slots?job_type=eq.${jobType}`, {
          method: 'PATCH', headers: headersJson,
          body: JSON.stringify({ spawned_at: new Date().toISOString() })
        });
        await triggerSelf(jobType);
        passedSlot = true;
      }
    }

    // Release the slot unless we handed it off to a successor.
    if (!passedSlot) {
      await releaseSlot(jobType, supabaseUrl, headersJson);
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error('[QUEUE-WORKER] Fatal', err.message);
    // Best effort: release the slot even on fatal errors so the system can recover.
    if (jobType && supabaseUrl && headersJson) {
      await releaseSlot(jobType, supabaseUrl, headersJson).catch(() => {});
    }
    return { statusCode: 500 };
  }
};

async function releaseSlot(jobType, supabaseUrl, headersJson) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/release_worker_slot`, {
      method: 'POST',
      headers: headersJson,
      body: JSON.stringify({ p_job_type: jobType })
    });
    console.log('[QUEUE-WORKER] Released slot for', jobType);
  } catch (e) {
    console.error('[QUEUE-WORKER] Failed to release slot:', e.message);
  }
}

async function runJob(job, supabaseUrl, headers, headersJson) {
  const storyId = job.story_id;
  if (!storyId) throw new Error('Job has no story_id');

  // For regenerate, we clear story_text and set feedback BEFORE triggering the bg function,
  // so the bg function picks up the feedback path.
  if (job.job_type === 'regenerate') {
    const payload = job.payload || {};
    const feedback = (payload.feedback || '').trim();
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ story_text: null, feedback })
    });
  }

  // Capture baseline + data needed for audio payload
  const beforeRes = await fetch(
    `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=story_text,audio_url,voice_id,story_data,child_name&limit=1`,
    { headers }
  );
  if (!beforeRes.ok) throw new Error('Failed to fetch story before run');
  const beforeArr = await beforeRes.json();
  if (!beforeArr.length) throw new Error('Story not found');
  const before = beforeArr[0];

  // Fire the appropriate background function
  const selfBase = process.env.URL || 'https://heartheirname.com';
  const targetUrl = (job.job_type === 'audio')
    ? `${selfBase}/.netlify/functions/full-worker-background`
    : `${selfBase}/.netlify/functions/story-text-background`;
  const body = (job.job_type === 'audio')
    ? {
        mode: 'tts-only',
        storyData: before.story_data,
        voiceId: before.voice_id,
        jobId: storyId,
        storyText: before.story_text,
        childName: before.child_name
      }
    : { storyId };

  const triggerRes = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!triggerRes.ok && triggerRes.status !== 202) {
    throw new Error(`Trigger returned ${triggerRes.status}`);
  }

  // Poll for completion
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=story_text,audio_url&limit=1`,
      { headers }
    );
    if (!pollRes.ok) continue;
    const pollArr = await pollRes.json();
    if (!pollArr.length) continue;
    const now = pollArr[0];

    if (job.job_type === 'audio') {
      if (now.audio_url && now.audio_url !== before.audio_url) return;
    } else {
      // text or regenerate: story_text populated (non-null, more than stub length)
      if (now.story_text && (now.story_text.length || 0) > 200) return;
    }
  }
  throw new Error('Timed out waiting for job completion');
}

async function markJob(jobId, status, error, supabaseUrl, headersJson) {
  const patch = { status, finished_at: new Date().toISOString() };
  if (error) patch.error = String(error).slice(0, 500);
  await fetch(`${supabaseUrl}/rest/v1/job_queue?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH', headers: headersJson, body: JSON.stringify(patch)
  });
}

async function triggerSelf(jobType) {
  const base = process.env.URL || 'https://heartheirname.com';
  try {
    await fetch(`${base}/.netlify/functions/queue-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobType })
    });
  } catch (e) {
    console.error('[QUEUE-WORKER] Self-retrigger failed:', e.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
