// Lightweight page view tracker: logs visits to Supabase for the metrics dashboard.
// Stores: timestamp, page, referrer, UTM params, device type. No PII.

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors() });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
  }

  try {
    const body = await req.json();
    const row = {
      page: (body.page || '/').slice(0, 200),
      referrer: (body.referrer || '').slice(0, 500),
      utm_source: (body.utm_source || '').slice(0, 100),
      utm_medium: (body.utm_medium || '').slice(0, 100),
      utm_campaign: (body.utm_campaign || '').slice(0, 100),
      device: (body.device || 'unknown').slice(0, 20),
      screen_name: (body.screen_name || '').slice(0, 50),
      created_at: new Date().toISOString()
    };

    await fetch(`${supabaseUrl}/rest/v1/page_views`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch (e) {
    // Non-blocking, never fail the user experience
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
};

function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export const config = { path: '/api/track-pageview' };
