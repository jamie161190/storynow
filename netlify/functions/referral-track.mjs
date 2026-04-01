// Referral tracking: increments visit count when someone lands with a ref code

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
    const refCode = (body.ref || '').trim().toLowerCase();
    if (!refCode) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
    }

    // Increment visits via RPC or read-then-update
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/referrals?ref_code=eq.${encodeURIComponent(refCode)}&select=id,visits`,
      { headers: sbHeaders(supabaseKey) }
    );
    if (lookupRes.ok) {
      const rows = await lookupRes.json();
      if (rows.length > 0) {
        const r = rows[0];
        await fetch(
          `${supabaseUrl}/rest/v1/referrals?id=eq.${r.id}`,
          {
            method: 'PATCH',
            headers: { ...sbHeaders(supabaseKey), 'Content-Type': 'application/json' },
            body: JSON.stringify({ visits: (r.visits || 0) + 1 })
          }
        );
      }
    }
  } catch (e) {
    // Non-blocking
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors() });
};

function sbHeaders(key) {
  return { 'Authorization': `Bearer ${key}`, 'apikey': key };
}

function cors() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export const config = { path: '/api/referral-track' };
