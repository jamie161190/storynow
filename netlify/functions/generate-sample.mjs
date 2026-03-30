export default async (req) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

    // Daniel voice (British male): onwK4e9ZLuTAKqWW03F9
    const voiceId = 'onwK4e9ZLuTAKqWW03F9';

    // Emotional 15-second sample with a clear pause between the personal intro and the story
    const script = `Chase, you once asked why you couldn't be in a story. So someone who loves you very much built you one. ...... ...... Chase was lying in bed when a rocket appeared outside his window. And painted on the side, in big silver letters, was his name.`;

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.55, similarity_boost: 0.8 }
      })
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      throw new Error('ElevenLabs error: ' + errText);
    }

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="sample-story.mp3"'
      }
    });

  } catch (err) {
    console.error('Generate sample error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-sample' };
