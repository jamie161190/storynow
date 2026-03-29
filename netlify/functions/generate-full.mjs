export default async (req) => {
  try {
    const { fullStory, voiceId } = await req.json();
    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, { method: 'POST', headers: { 'xi-api-key': Netlify.env.get('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fullStory, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
    if (!ttsResponse.ok) throw new Error('Audio generation failed');
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    return new Response(JSON.stringify({ success: true, fullAudio: audioBase64 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
export const config = { path: '/api/generate-full' };
