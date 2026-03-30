// Retrieves all stories for a given email address (requires auth token)

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email, token } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    // Validate the auth token
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/auth_tokens?email=eq.${encodeURIComponent(email)}&token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const tokens = await tokenRes.json();
    if (!tokens.length) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session. Please log in again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Check token expiry (24 hours)
    const tokenRecord = tokens[0];
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Session expired. Please log in again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      console.error('Get stories error:', await res.text());
      return new Response(JSON.stringify({ error: 'Failed to fetch stories' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const stories = await res.json();

    return new Response(JSON.stringify({
      success: true,
      stories: stories.map(s => ({
        id: s.id,
        childName: s.child_name,
        category: s.category,
        length: s.length,
        audioUrl: s.audio_url,
        createdAt: s.created_at,
        isGift: s.is_gift,
        giftEmail: s.gift_email,
        giftFrom: s.gift_from,
        giftSent: s.gift_sent
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Get stories error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch stories' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/get-stories' };
