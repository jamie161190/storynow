export default async (req) => {
  const url = new URL(req.url);
  const voiceId = url.searchParams.get('id');

  if (!voiceId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing voice ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    const data = await res.json();

    if (!data.preview_url) {
      return new Response(JSON.stringify({ success: false, error: 'No preview available' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      preview_url: data.preview_url,
      name: data.name
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400' // Cache for 24h
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/voice-preview' };
