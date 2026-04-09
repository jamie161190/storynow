// Upload a recorded voice message to Supabase Storage
// Called from the frontend when a user records a personal message

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio');
    const voiceId = formData.get('voiceId');

    if (!audioFile || !voiceId) {
      return new Response(JSON.stringify({ error: 'Missing audio or voiceId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validate voiceId format
    if (!/^voice_[a-zA-Z0-9_-]+$/.test(voiceId)) {
      return new Response(JSON.stringify({ error: 'Invalid voiceId' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // Upload to Supabase Storage
    const audioBuffer = await audioFile.arrayBuffer();
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/voice-messages/${voiceId}.webm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'audio/webm',
        'x-upsert': 'true'
      },
      body: audioBuffer
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Voice upload failed:', err);
      return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/stories/voice-messages/${voiceId}.webm`;
    console.log('Voice message uploaded:', voiceId, publicUrl);

    return new Response(JSON.stringify({ success: true, url: publicUrl }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Voice upload error:', e.message);
    return new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/upload-voice-message' };
