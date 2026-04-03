const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const ADMIN_CODE = 'StoryToldAdmin2026';

const headers = {
  'Authorization': `Bearer ${supabaseKey}`,
  'apikey': supabaseKey,
  'Content-Type': 'application/json'
};

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors({});
  if (req.method !== 'GET') return cors({ error: 'GET only' }, 405);

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (code !== ADMIN_CODE) return cors({ error: 'Unauthorized' }, 401);

  try {
    // Fetch all creators
    const creatorsRes = await fetch(
      `${supabaseUrl}/rest/v1/content_creators?select=id,name,child_names,referral_code,created_at&order=created_at.desc`,
      { headers }
    );
    const creators = await creatorsRes.json();

    // Fetch all takes
    const takesRes = await fetch(
      `${supabaseUrl}/rest/v1/content_takes?select=*&order=taken_at.desc`,
      { headers }
    );
    const takes = await takesRes.json();

    // Fetch referral stats for all creator referral codes
    const refCodes = (creators || []).map(c => c.referral_code).filter(Boolean);
    let referrals = [];
    if (refCodes.length) {
      const refRes = await fetch(
        `${supabaseUrl}/rest/v1/referrals?ref_code=in.(${refCodes.map(c => `"${c}"`).join(',')})&select=ref_code,referrer_name,visits,conversions,revenue`,
        { headers }
      );
      referrals = await refRes.json();
    }

    return cors({ success: true, creators: creators || [], takes: takes || [], referrals: referrals || [] });
  } catch (e) {
    console.error('admin-creators error:', e);
    return cors({ error: 'Server error' }, 500);
  }
};

export const config = { path: '/api/admin-creators' };
