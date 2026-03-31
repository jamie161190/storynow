// Retrieves pending story data saved before Stripe redirect
// Used as a fallback when sessionStorage is wiped (common on mobile browsers)

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { sessionId } = await req.json();

    if (!sessionId || typeof sessionId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing session ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validate session ID format (Stripe session IDs start with cs_)
    if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
      return new Response(JSON.stringify({ error: 'Invalid session ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Fetch the pending story JSON from Supabase Storage
    const fileName = `pending/${sessionId}.json`;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Pending story not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const pendingData = await res.json();

    return new Response(JSON.stringify({
      success: true,
      storyData: pendingData.storyData,
      previewStoryText: pendingData.previewStoryText || pendingData.fullStoryText,
      selectedVoiceId: pendingData.selectedVoiceId
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Get pending story error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/get-pending-story' };
