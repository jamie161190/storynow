// TEMPORARY — delete after generating the landing page sample
export default async (req) => {
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = 'XB0fDUnXU5powFXDhCwa'; // Charlotte — soft British aunt

  const storyText = `Once upon a time, in a cosy little house at the end of Maple Lane, there lived a boy called Chase. Chase loved two things more than anything in the whole wide world: adventures, and his best friend Woody.

Every night, just as the stars began to peek through his curtains, Chase would climb into bed, pull his blanket up to his chin, and whisper, "Woody, are you ready?"

And Woody — who was the bravest, fluffiest teddy bear you ever did see — would seem to smile, just a little.

Tonight was special. Because tonight, the moonlight made a silver path across Chase's bedroom floor, leading all the way to his wardrobe door. And if you listened very carefully, you could hear something magical. A tiny, tinkling sound, like bells made of starlight.

"Do you hear that, Woody?" Chase whispered.

And together, they tiptoed to the wardrobe, opened the door, and stepped into the most wonderful adventure of all.`;

  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: storyText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.6, similarity_boost: 0.78 },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    const audio = await resp.arrayBuffer();
    return new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Disposition': 'attachment; filename="sample-story.mp3"' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const config = { path: '/api/generate-sample' };
