// Comedy clip status polling endpoint
// Checks Supabase Storage for the background worker's result

export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return new Response(JSON.stringify({ ready: false, error: 'Invalid job ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Auth check
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.get('x-admin-secret');
  if (!adminSecret || authHeader !== adminSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ ready: false, error: 'Storage not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/comedy-jobs/${jobId}.json`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ ready: false }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const result = await res.json();

    // If it has a status field but no success/error, it's still processing
    if (result.status && !result.success && !result.error) {
      return new Response(JSON.stringify({ ready: false, status: result.status, sceneDescription: result.sceneDescription, storyText: result.storyText }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ ready: true, ...result }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ready: false }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

export const config = { path: '/api/comedy-status' };
