// One-time utility to generate the landing page audio sample
// Call: /api/generate-sample
// Delete this function after use

export default async (req) => {
  try {
    const sampleText = `Hey Chase, this is a story just for you, from Daddy. One night, just as the stars began to appear outside Chase's bedroom window, something extraordinary happened. His favourite rocket, the little red one on his shelf, began to glow. "Chase," it whispered. "Are you ready?" Chase sat up in bed. "Ready for what?" "For space, of course." And before Chase could even grab his blanket, the room filled with light, and suddenly, he wasn't in his bedroom anymore. He was floating. Stars everywhere. And right beside him, grinning from ear to ear, was his best friend Ellis. "Told you it was real," Ellis laughed.`;

    const voiceId = 'XB0fDUnXU5powFXDhCwa'; // Charlotte - British auntie

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: sampleText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      return new Response(JSON.stringify({ success: false, error: err }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="sample-story.mp3"'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-sample' };
