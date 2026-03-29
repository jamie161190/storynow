import Anthropic from '@anthropic-ai/sdk';

const WORD_COUNTS = { short: 300, standard: 600, epic: 1200 };

const STORY_PROMPTS = {
  bedtime: (d) => `Write a beautiful, deeply personal bedtime story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.proudOf ? `Something they are really proud of recently: ${d.proudOf}. Weave this in naturally as a moment of triumph.` : ''} ${d.hasPet ? `They have a beloved pet called ${d.petName} who plays a small sweet role in the story.` : ''} Use ${d.childName}'s name throughout the story naturally, at least 8 times. The story must be warm, safe, soothing, and end with ${d.childName} drifting off to sleep feeling completely safe and deeply loved. Write approximately ${WORD_COUNTS[d.length] || 600} words. Do not include chapter titles or headings. Start the story immediately with no preamble.`,

  journey: (d) => `Write a gripping, exciting adventure story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend ${d.friendName} is right by their side through every twist and turn. They love ${d.interest}. ${d.proudOf ? `Recently they ${d.proudOf}, which gives them the confidence to face this adventure.` : ''} ${d.hasPet ? `Their loyal pet ${d.petName} saves the day at a critical moment in the story.` : ''} Structure as ${d.length === 'epic' ? '5 short chapters' : d.length === 'standard' ? '3 short chapters' : '2 short chapters'}, each ending on an exciting cliffhanger that makes them desperate to hear what happens next. Perfect for reading aloud on a long journey. Write approximately ${WORD_COUNTS[d.length] || 600} words. Start the story immediately.`,

  learning: (d) => `Write an exciting, educational adventure story for a ${d.age} year old ${d.gender} named ${d.childName}. Their trusty sidekick is ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `Their pet ${d.petName} has a special ability that helps solve one of the challenges.` : ''} ${d.childName} is a superhero whose incredible power is ${d.subject}. A villain threatens the world and can only be defeated by solving ${d.subject} challenges that are genuinely educational and age-appropriate for a ${d.age} year old. Make the learning feel natural and exciting, not like a lesson. Write approximately ${WORD_COUNTS[d.length] || 600} words. Start the story immediately.`
};

export default async (req) => {
  try {
    const { storyData, voiceId } = await req.json();
    const promptFn = STORY_PROMPTS[storyData.category];
    if (!promptFn) return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const anthropic = new Anthropic({ apiKey: Netlify.env.get('ANTHROPIC_API_KEY') });
    const maxTokens = storyData.length === 'epic' ? 3000 : storyData.length === 'standard' ? 1500 : 800;

    const storyResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: promptFn(storyData) }]
    });

    const fullStory = storyResponse.content[0].text;
    const messageIntro = storyData.personalMessage ? `${storyData.personalMessage} ... ` : '';
    const fullStoryWithMessage = messageIntro + fullStory;
    const previewText = fullStoryWithMessage.split(' ').slice(0, 40).join(' ') + '...';
    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': Netlify.env.get('ELEVENLABS_API_KEY'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) throw new Error('ElevenLabs error: ' + await ttsResponse.text());
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');

    return new Response(JSON.stringify({
      success: true,
      previewAudio: audioBase64,
      fullStory: fullStoryWithMessage,
      storyData
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-preview' };
