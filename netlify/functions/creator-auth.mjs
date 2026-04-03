import { createHash } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

const headers = {
  'Authorization': `Bearer ${supabaseKey}`,
  'apikey': supabaseKey,
  'Content-Type': 'application/json'
};

function hashPassword(pw) {
  return createHash('sha256').update(pw).digest('hex');
}

function generateReferralCode(name) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `ST-${initials}-${rand}`;
}

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
  if (req.method !== 'POST') return cors({ error: 'POST only' }, 405);

  try {
    const { action, name, childNames, password } = await req.json();

    if (action === 'signup') {
      if (!name || !childNames || !childNames.length) {
        return cors({ error: 'Name and child names required' }, 400);
      }

      // Check if creator already exists
      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/content_creators?name=eq.${encodeURIComponent(name)}&select=*`,
        { headers }
      );
      const existing = await checkRes.json();

      if (existing && existing.length > 0) {
        // Return existing creator (treat as re-login)
        return cors({ success: true, creator: existing[0], existing: true });
      }

      // Create new creator
      const refCode = generateReferralCode(name);
      const pwHash = password ? hashPassword(password) : null;

      const createRes = await fetch(`${supabaseUrl}/rest/v1/content_creators`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          name,
          child_names: childNames,
          password_hash: pwHash,
          referral_code: refCode
        })
      });
      const creator = await createRes.json();

      // Also create entry in referrals table for the existing referral tracking system
      await fetch(`${supabaseUrl}/rest/v1/referrals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref_code: refCode,
          referrer_name: name,
          visits: 0,
          conversions: 0,
          revenue: 0,
          referred_emails: []
        })
      });

      return cors({ success: true, creator: Array.isArray(creator) ? creator[0] : creator, existing: false });
    }

    if (action === 'login') {
      if (!name || !password) return cors({ error: 'Name and password required' }, 400);

      const checkRes = await fetch(
        `${supabaseUrl}/rest/v1/content_creators?name=eq.${encodeURIComponent(name)}&select=*`,
        { headers }
      );
      const creators = await checkRes.json();

      if (!creators || !creators.length) return cors({ error: 'Creator not found' }, 404);

      const creator = creators[0];
      if (creator.password_hash !== hashPassword(password)) {
        return cors({ error: 'Wrong password' }, 401);
      }

      return cors({ success: true, creator });
    }

    return cors({ error: 'Invalid action' }, 400);
  } catch (e) {
    console.error('creator-auth error:', e);
    return cors({ error: 'Server error' }, 500);
  }
};

export const config = { path: '/api/creator-auth' };
