// Saves a purchased story metadata to Supabase

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email, storyData, fullStoryText, audioUrl, voiceId, stripeSessionId } = await req.json();

    if (!email || !storyData) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: email,
        child_name: storyData.childName,
        category: storyData.category,
        length: storyData.length,
        story_text: fullStoryText,
        voice_id: voiceId,
        audio_url: audioUrl || null,
        stripe_session_id: stripeSessionId || null,
        is_gift: storyData.isGift || false,
        gift_email: storyData.giftEmail || null,
        gift_from: storyData.giftFrom || null,
        gift_message: storyData.giftMessage || null,
        story_data: storyData
      })
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('Database insert error:', err);
      return new Response(JSON.stringify({ error: 'Failed to save story' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const [saved] = await insertRes.json();

    return new Response(JSON.stringify({
      success: true,
      storyId: saved.id,
      audioUrl: audioUrl
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Save story error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/save-story' };
