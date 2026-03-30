export default async (req) => {
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return new Response(JSON.stringify({ ready: false, error: 'Missing jobId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate jobId format to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return new Response(JSON.stringify({ ready: false, error: 'Invalid job ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ ready: false, error: 'Storage not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (!res.ok) {
      // Not ready yet
      return new Response(JSON.stringify({ ready: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await res.json();
    return new Response(JSON.stringify({ ready: true, ...result }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ready: false }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/check-preview' };
