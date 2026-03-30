// ONE-TIME USE: Generate sample homepage narration audio
// DELETE THIS FILE after generating the sample audio

export default async (req) => {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing ElevenLabs key' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const VOICE_ID = 'N2lVS1w4EtoT3dr4eOWO'; // Callum - Scottish, warm, friendly

  const script = `Chase pressed his nose against the window ... and gasped. Stars. Hundreds and hundreds of stars, stretching out forever. ... Chase! Chase, look! Ellis tugged his arm and pointed straight down. Is that ... is that our park? ... Chase looked ... and there it was. Their park. Their swings. Their whole town, tiny and glowing far below. ... Chase smiled. Ellis, he whispered ... do you think they can see us from down there?`;

  try {
    console.log('Generating sample narration with Callum voice...');

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error('ElevenLabs error:', ttsRes.status, err);
      return new Response(JSON.stringify({ error: 'TTS failed', detail: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    console.log('Audio generated:', audioBuffer.byteLength, 'bytes');

    // Upload to Supabase storage
    if (supabaseUrl && supabaseKey) {
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/sample-story.mp3`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'audio/mpeg',
          'x-upsert': 'true'
        },
        body: audioBuffer
      });
      console.log('Supabase upload:', uploadRes.status);

      // Create a signed URL (10 year expiry)
      const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/stories/sample-story.mp3`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: 315360000 }) // 10 years
      });
      const signData = await signRes.json();
      console.log('Signed URL:', JSON.stringify(signData));

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/stories/sample-story.mp3`;
      const signedUrl = signData.signedURL ? `${supabaseUrl}${signData.signedURL}` : null;

      return new Response(JSON.stringify({
        success: true,
        bytes: audioBuffer.byteLength,
        publicUrl,
        signedUrl,
        supabaseUpload: uploadRes.status
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Fallback: return audio directly
    return new Response(audioBuffer, { headers: { 'Content-Type': 'audio/mpeg' } });

  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-sample' };
