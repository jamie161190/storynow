// Admin API: Protected endpoints for managing customers, stories, and attempts.
// All requests require the ADMIN_SECRET header to match process.env.ADMIN_SECRET.

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return json({ error: 'Admin not configured' }, 500);
  }

  // Check admin auth
  const authHeader = req.headers.get('x-admin-secret');
  if (authHeader !== adminSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Database not configured' }, 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // ── LIST CUSTOMERS: all unique emails with story count ──
    if (action === 'customers') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/stories?select=email,child_name,category,created_at,audio_url,id&order=created_at.desc`,
        { headers: sbHeaders(supabaseKey) }
      );
      const stories = await res.json();

      // Group by email
      const customers = {};
      for (const s of stories) {
        if (!customers[s.email]) {
          customers[s.email] = { email: s.email, stories: [], storyCount: 0 };
        }
        customers[s.email].stories.push(s);
        customers[s.email].storyCount++;
      }

      return json({ customers: Object.values(customers) });
    }

    // ── LIST ATTEMPTS: recent story generation attempts ──
    if (action === 'attempts') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/story_attempts?select=*&order=created_at.desc&limit=100`,
        { headers: sbHeaders(supabaseKey) }
      );
      const attempts = await res.json();
      return json({ attempts });
    }

    // ── GET CUSTOMER: full detail for one email ──
    if (action === 'customer') {
      const email = url.searchParams.get('email');
      if (!email) return json({ error: 'Email required' }, 400);

      const [storiesRes, attemptsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/stories?email=eq.${enc(email)}&order=created_at.desc`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/story_attempts?story_data->>childName=ilike.*${enc(email)}*&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        )
      ]);

      const stories = await storiesRes.json();
      const attempts = await attemptsRes.json();

      return json({ email, stories, attempts });
    }

    // ── SEARCH: find customers or attempts by email or child name ──
    if (action === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return json({ error: 'Search query required' }, 400);

      const [storiesRes, attemptsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/stories?or=(email.ilike.*${enc(q)}*,child_name.ilike.*${enc(q)}*)&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/story_attempts?or=(child_name.ilike.*${enc(q)}*,story_data->>childName.ilike.*${enc(q)}*)&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        )
      ]);

      const stories = await storiesRes.json();
      const attempts = await attemptsRes.json();

      return json({ stories: Array.isArray(stories) ? stories : [], attempts: Array.isArray(attempts) ? attempts : [] });
    }

    // ── ADMIN GENERATE: generate a story and add to customer account ──
    if (action === 'generate' && req.method === 'POST') {
      const body = await req.json();
      const { email, storyData, voiceId, previewStory } = body;

      if (!email || !storyData) {
        return json({ error: 'Email and storyData required' }, 400);
      }

      // Trigger the background worker
      const jobId = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

      // We call the background worker directly via internal URL
      const bgPayload = JSON.stringify({
        storyData,
        previewStory: previewStory || '',
        voiceId: voiceId || 'EXAVITQu4vr4xnSDxMaL',
        childName: storyData.childName,
        sessionId: 'admin_' + Date.now(),
        jobId,
        fromScratch: !previewStory,
        customerEmail: email
      });

      try {
        await fetch(new URL('/.netlify/functions/full-worker-background', req.url).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bgPayload
        });
      } catch (e) {
        // Background functions return 202 or may error on local, that's fine
      }

      return json({ success: true, jobId, message: 'Story generation started. It will be emailed to ' + email + ' when complete.' });
    }

    // ── DELETE STORY ──
    if (action === 'delete-story' && req.method === 'POST') {
      const { storyId } = await req.json();
      if (!storyId) return json({ error: 'Story ID required' }, 400);

      await fetch(
        `${supabaseUrl}/rest/v1/stories?id=eq.${enc(storyId)}`,
        {
          method: 'DELETE',
          headers: sbHeaders(supabaseKey)
        }
      );

      return json({ success: true });
    }

    // ── UPDATE STORY (e.g. change audio URL) ──
    if (action === 'update-story' && req.method === 'POST') {
      const { storyId, updates } = await req.json();
      if (!storyId || !updates) return json({ error: 'Story ID and updates required' }, 400);

      // Only allow safe fields to be updated
      const allowed = ['audio_url', 'child_name', 'category', 'email'];
      const safeUpdates = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      await fetch(
        `${supabaseUrl}/rest/v1/stories?id=eq.${enc(storyId)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(supabaseKey), 'Content-Type': 'application/json' },
          body: JSON.stringify(safeUpdates)
        }
      );

      return json({ success: true });
    }

    // ── ERROR LOGS ──
    if (action === 'errors') {
      const since = url.searchParams.get('since') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/error_logs?created_at=gte.${enc(since)}&order=created_at.desc&limit=100`,
        { headers: sbHeaders(supabaseKey) }
      );
      const errors = await res.json();
      return json({ errors: Array.isArray(errors) ? errors : [] });
    }

    // ── ERROR COUNT (for badge) ──
    if (action === 'error-count') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/error_logs?created_at=gte.${enc(since)}&select=id`,
        { headers: { ...sbHeaders(supabaseKey), 'Prefer': 'count=exact' } }
      );
      const count = parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
      return json({ count });
    }

    // ── RETRY QUEUE STATUS ──
    if (action === 'retry-queue') {
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/stories`, {
        method: 'POST',
        headers: { ...sbHeaders(supabaseKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'retry-queue/', limit: 50 })
      });
      const items = await listRes.json();
      const queue = [];

      for (const item of (items || [])) {
        if (item.name === '.emptyFolderPlaceholder') continue;
        try {
          const getRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/retry-queue/${item.name}`, {
            headers: sbHeaders(supabaseKey)
          });
          const data = await getRes.json();
          queue.push(data);
        } catch (e) { /* skip */ }
      }

      return json({ queue });
    }

    return json({ error: 'Unknown action: ' + action }, 400);

  } catch (err) {
    console.error('Admin API error:', err.message);
    return json({ error: err.message }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function sbHeaders(key) {
  return { 'Authorization': `Bearer ${key}`, 'apikey': key };
}

function enc(str) {
  return encodeURIComponent(str);
}

export const config = { path: '/api/admin' };
