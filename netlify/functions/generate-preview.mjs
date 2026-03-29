import Anthropic from '@anthropic-ai/sdk';
const STORY_PROMPTS = {
  bedtime: (d) => `Write a calming, warm bedtime story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} Gentle, soothing, end with ${d.childName} drifting off to sleep. Around 600 words. No chapter titles.`,
  journey: (d) => `Write an exciting episodic adventure story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} Three short chapters with cliffhangers. Around 600 words.`,
  learning: (d) => `Write an exciting educational story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} ${d.childName} is a superhero who solves ${d.subject} problems. Around 600 words.`
};
export default async (req) => {
  try {
    const { storyData, voiceId } = await req.json();
    const promptFn = STORY_PROMPTS[storyData.category];
    if (!promptFn) return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const anthropic = new Anthropic({ apiKey: Netlify.env.get('ANTHROPIC_API_KEY') });
    const storyResponse = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: promptFn(storyData) }] });
    const fullStory = storyResponse.content[0].text;
    const messageIntro = storyData.personalMessage ? `${storyData.personalMessage} ... ` : '';
    const fullStoryWithMessage = messageIntro + fullStory;
    const previewText = fullStoryWithMessage.split(' ').slice(0, 40).join(' ') + '...';
    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, { method: 'POST', headers: { 'xi-api-key': Netlify.env.get('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: previewText, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
    if (!ttsResponse.ok) throw new Error('ElevenLabs error: ' + await ttsResponse.text());
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    return new Response(JSON.stringify({ success: true, previewAudio: audioBase64, fullStory: fullStoryWithMessage, storyData }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
export const config = { path: '/api/generate-preview' };
