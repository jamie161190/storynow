// Returns total number of stories created.
// Cached for 5 minutes to avoid hammering Supabase on every page load.

let cachedCount = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors() });
  }

  // Return cached value if fresh
  if (cachedCount !== null && Date.now() - cacheTime < CACHE_TTL) {
    return new Response(JSON.stringify({ count: cachedCount }), {
      status: 200, headers: cors()
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ count: 0 }), {
      status: 200, headers: cors()
    });
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?select=id&audio_url=not.is.null`,
      {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Prefer': 'count=exact'
        }
      }
    );

    const range = res.headers.get('content-range');
    // Format: "0-24/127" or "*/127"
    const total = range ? parseInt(range.split('/')[1], 10) : 0;

    cachedCount = total;
    cacheTime = Date.now();

    return new Response(JSON.stringify({ count: total }), {
      status: 200, headers: cors()
    });
  } catch (e) {
    return new Response(JSON.stringify({ count: cachedCount || 0 }), {
      status: 200, headers: cors()
    });
  }
};

function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300'
  };
}

export const config = { path: '/api/story-count' };
