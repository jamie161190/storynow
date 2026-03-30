export default async (req) => {
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
  const voiceId = 'onwK4e9ZLuTAKqWW03F9';
  const storyText = `Chase, you once asked why you couldn't be in a story. So someone who loves you very much built you one.

Chase was lying in bed when a rocket appeared outside his window. And painted on the side, in big silver letters, was his name.`;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: storyText, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    if (!res.ok) { const err = await res.text(); return new Response(JSON.stringify({ error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
    const audio = await res.arrayBuffer();
    return new Response(audio, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Disposition': 'attachment; filename="sample-story.mp3"' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
