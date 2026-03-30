// Temporary function to generate a new homepage sample MP3
// DELETE THIS FILE after downloading the generated audio
export default async (req) => {
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
  // Daniel - calm, deep, British male voice
  const voiceId = 'onwK4e9ZLuTAKqWW03F9';

  // ~130 words = roughly 40-45 seconds of audio
  const storyText = `Tonight's story is just for you, Chase. Are you ready? Then let's go.

Chase was lying in bed when something outside the window caught his eye. A star, brighter than all the others, getting closer, and closer, until it wasn't a star at all. It was a rocket. And painted on the side, in big silver letters, was his name. Chase.

A hatch swung open. "We've been waiting for you, Chase."

He climbed inside. The engines hummed. And then, whoooosh, up through the clouds, up past the birds, up past the planes, until the whole world was just a little blue marble far below.

Chase pressed his face against the window and smiled. He was going to space. And this was only the beginning.`;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: storyText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Disposition': 'attachment; filename="sample-story.mp3"' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
