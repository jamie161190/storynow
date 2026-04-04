// Studio Story Status: Polls for story generation results from Supabase storage.

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return json({ error: 'Studio not configured' }, 500);

  const authHeader = req.headers.get('x-admin-secret');
  if (authHeader !== adminSecret) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return json({ error: 'jobId required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Storage not configured' }, 500);

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/studio-jobs/${jobId}.json`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (res.status === 404 || res.status === 400) {
      // Job not ready yet
      return json({ status: 'generating' });
    }

    if (!res.ok) {
      return json({ status: 'generating' });
    }

    const result = await res.json();
    return json(result);
  } catch (e) {
    return json({ status: 'generating' });
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export const config = { path: '/api/studio-story-status' };
