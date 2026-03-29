// Fetches a single story by ID for shared/public listening

export default async (req) => {
  try {
    const url = new URL(req.url);
    const storyId = url.searchParams.get('id');

    if (!storyId) {
      return new Response(JSON.stringify({ error: 'Missing story ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,child_name,category,length,audio_url,created_at`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      console.error('Shared story fetch error:', await res.text());
      return new Response(JSON.stringify({ error: 'Failed to fetch story' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const stories = await res.json();

    if (!stories.length) {
      return new Response(JSON.stringify({ error: 'Story not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const s = stories[0];

    return new Response(JSON.stringify({
      success: true,
      story: {
        id: s.id,
        childName: s.child_name,
        category: s.category,
        length: s.length,
        audioUrl: s.audio_url,
        createdAt: s.created_at
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Shared story error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/shared-story' };
