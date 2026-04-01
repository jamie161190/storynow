// Public referral stats: returns visit/conversion stats for a given ref code.
// No sensitive data (no referred emails). The ref code acts as auth.

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors() });
  }

  const url = new URL(req.url);
  const refCode = (url.searchParams.get('code') || '').trim().toLowerCase();

  if (!refCode) {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400, headers: cors() });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500, headers: cors() });
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/referrals?ref_code=eq.${encodeURIComponent(refCode)}&select=referrer_name,ref_code,visits,conversions,revenue,created_at`,
      { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
    );

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Could not fetch stats' }), { status: 500, headers: cors() });
    }

    const rows = await res.json();
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Referral code not found' }), { status: 404, headers: cors() });
    }

    const r = rows[0];
    return new Response(JSON.stringify({
      name: r.referrer_name,
      code: r.ref_code,
      visits: r.visits || 0,
      conversions: r.conversions || 0,
      revenue: r.revenue || 0,
      conversionRate: r.visits > 0 ? ((r.conversions / r.visits) * 100).toFixed(1) : '0.0',
      since: r.created_at
    }), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: cors() });
  }
};

function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export const config = { path: '/api/referral-stats' };
