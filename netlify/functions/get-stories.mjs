// Retrieves all stories for a given email address

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Netlify.env.get('SUPABASE_URL');
    const supabaseKey = Netlify.env.get('SUPABASE_SECRET_KEY');

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
      const err = await res.text();
      console.error('Get stories error:', err);
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
        isGift: s.is_gift
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Get stories error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/get-stories' };
