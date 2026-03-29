// Saves a purchased story to Supabase (metadata + audio file)

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email, storyData, fullStoryText, audioBase64, voiceId, stripeSessionId } = await req.json();

    if (!email || !storyData || !audioBase64) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Netlify.env.get('SUPABASE_URL');
    const supabaseKey = Netlify.env.get('SUPABASE_SECRET_KEY');

    // 1. Upload audio to Supabase Storage
    const fileName = `${Date.now()}-${storyData.childName.replace(/\s+/g, '-').toLowerCase()}.mp3`;
    const audioBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true'
      },
      body: audioBuffer
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Storage upload error:', err);
      // Continue anyway, we still want to save the metadata
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;

    // 2. Save story metadata to database
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
        audio_url: audioUrl,
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
