export default async (req) => {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    const data = await res.json();

    // Return voice details we care about
    const voices = data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      description: v.description,
      preview_url: v.preview_url,
      settings: v.settings
    }));

    return new Response(JSON.stringify({ success: true, count: voices.length, voices }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/list-voices' };
