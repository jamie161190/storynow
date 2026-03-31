// Saves a story generation attempt (preview) so admin can see what customers tried to create.
// Non-blocking, fire-and-forget from the client side.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { storyData, voiceId, previewStory } = await req.json();
    if (!storyData || !storyData.childName) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    await fetch(`${supabaseUrl}/rest/v1/story_attempts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        child_name: storyData.childName,
        category: storyData.category,
        story_data: storyData,
        voice_id: voiceId || null,
        preview_story: previewStory || null,
        status: 'preview_generated'
      })
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Save attempt error:', e.message);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/save-attempt' };
