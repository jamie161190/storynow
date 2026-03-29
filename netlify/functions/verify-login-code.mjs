// Verifies a 6-digit login code and returns stories if valid

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email, code } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    // Check the code
    const codeRes = await fetch(
      `${supabaseUrl}/rest/v1/login_codes?email=eq.${encodeURIComponent(email)}&code=eq.${code}&select=*&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const codes = await codeRes.json();

    if (!codes.length) {
      return new Response(JSON.stringify({ error: 'Invalid code. Please try again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Check expiry
    const record = codes[0];
    if (new Date(record.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Code has expired. Please request a new one.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Delete the used code
    await fetch(
      `${supabaseUrl}/rest/v1/login_codes?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    // Fetch their stories
    const storiesRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const stories = await storiesRes.json();

    return new Response(JSON.stringify({
      success: true,
      stories: stories.map(s => ({
        id: s.id,
        childName: s.child_name,
        category: s.category,
        length: s.length,
        audioUrl: s.audio_url,
        createdAt: s.created_at,
        isGift: s.is_gift
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Verify code error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/verify-login-code' };
