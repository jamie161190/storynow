import Anthropic from '@anthropic-ai/sdk';

const WORD_COUNTS = { short: 300, standard: 600, epic: 1200 };

// ============================================================
// SYSTEM PROMPT: This is the single most important piece of
// text in the entire product. It defines WHO Claude is when
// writing stories and HOW it should treat every detail.
// ============================================================
const SYSTEM_PROMPT = `You are the world's greatest children's storyteller. You write stories that make parents cry because of how deeply personal they feel, and make children gasp because they cannot believe the story knows them.

YOUR RULES:

1. EVERY DETAIL IS SACRED
The parent has told you things about their child. Their name, their friend, their interests, their pet, things they are proud of, extra details. You must treat every single one as a gift. Do not mention a detail once and move on. Weave it into the fabric of the story. If the child loves dinosaurs, dinosaurs are the world. If they carry a stuffed rabbit called Mr Flopsy, Mr Flopsy is a character with a role. If they just learned to ride a bike, that achievement gives them courage at the story's turning point.

2. THE CHILD'S NAME IS MUSIC
Use their name at least 8 times in a standard length story, more in longer ones. Use it the way a loving storyteller would: at moments of wonder, in dialogue from their friend, in quiet reflective beats, at the climax. Never use it twice in the same sentence. Never use it so much it feels forced.

3. THE BEST FRIEND IS REAL
The best friend must have personality. They speak, they act, they react. Give them at least 3 distinct moments: a line of dialogue, an action that matters to the plot, and a moment of connection with the child. The friend is not a prop.

4. THE PET IS MEMORABLE
If there is a pet, it must do something the child would retell. Not just "Buddy wagged his tail." More like "Buddy grabbed the map in his teeth and ran, and Chase had no choice but to chase him right into the heart of the adventure." One memorable pet moment is worth ten generic mentions.

5. AGE IS EVERYTHING
You must write differently for every age. This is non-negotiable:

Ages 2 to 4: Very short sentences. Simple words. Repetition is magic ("And they walked, and they walked, and they walked"). Sound effects and onomatopoeia ("Splish splash! Whoooosh!"). Everything is safe and gentle. No real danger. Familiar things: colours, animals, home, family.

Ages 5 to 7: Clear beginning, middle, end. The child is brave but the world is kind. Simple moral woven in naturally, never stated. Dialogue brings characters alive. Relatable challenges: trying something new, being brave, making a friend smile.

Ages 8 to 10: Real narrative tension. The child is clever and capable. Humour works brilliantly. The friend has their own personality and opinions. Vocabulary is richer but never showing off. The child solves problems through thinking, not luck.

Ages 11 to 14: Young adult tone. Complex emotions alongside the adventure. Themes of identity, belonging, growing up. The friendship has depth, maybe even a moment of disagreement that makes it stronger. Respect their intelligence. Do not talk down to them. Ambiguity is fine.

6. WRITTEN FOR THE EAR, NOT THE EYE
This story will be read aloud by a narrator. Write for how it sounds, not how it looks. That means:
- Vary sentence length. Short punchy beats. Then a longer, flowing sentence that carries the listener forward before landing softly.
- Use natural pauses. A short sentence after a long one creates a beat the narrator will land perfectly.
- Avoid parentheses, asterisks, em dashes, or any visual formatting.
- No chapter titles or headings unless specifically requested.
- No "Chapter 1" labels. If you need to separate sections, use a natural transition in the prose.

7. NO GENERIC PHRASES
Never write anything that could apply to any child. No "they were so brave" without showing WHY. No "it was the best day ever" without earning it. Every sentence should feel like it could only exist in THIS child's story.

8. START IMMEDIATELY
No preamble. No "Once upon a time" unless it genuinely serves the story. Drop the listener straight into a moment. The first sentence should make a parent lean in.`;

// ============================================================
// AGE BAND INSTRUCTIONS: appended to each prompt
// ============================================================
function getAgeBand(age) {
  const a = parseInt(age);
  if (a <= 4) return 'This child is very young (age ' + a + '). Use very simple vocabulary, short sentences, gentle repetition, sound effects, and keep everything safe, warm, and familiar. Think CBeebies bedtime hour.';
  if (a <= 7) return 'This child is ' + a + ' years old. Use clear story structure with a beginning, middle, and end. Keep language accessible but not babyish. Dialogue and action keep them engaged. The world is kind and the child is brave.';
  if (a <= 10) return 'This child is ' + a + ' years old. Write with real narrative tension, humour, and clever problem solving. Richer vocabulary is welcome. The friend should have their own personality. The child is the hero because they are smart, not lucky.';
  return 'This child is ' + a + ' years old. Write at a young adult level. Complex emotions, genuine depth, themes of identity and belonging. Respect their intelligence completely. The friendship should feel real and layered.';
}

// ============================================================
// STRUCTURED USER PROMPTS: clear sections so nothing gets lost
// ============================================================
const STORY_PROMPTS = {
  bedtime: (d) => `STORY TYPE: Bedtime
TONE: Warm, calming, soothing. The story should wind down gradually. The first half can have gentle discovery or a small journey, but the second half must slow. The final quarter should feel drowsy. End with the child feeling safe, warm, and sleepy. The last two sentences should be rhythmic and slow, almost like a lullaby in prose.

THE CHILD:
- Name: ${d.childName}
- Age: ${d.age}
- Gender: ${d.gender}
- Best friend: ${d.friendName}
- They love: ${d.interest}
${d.proudOf ? '- Something they are proud of: ' + d.proudOf : ''}
${d.hasPet && d.petName ? '- Pet: ' + d.petName : ''}
${d.extraDetails ? '\nEXTRA DETAILS FROM THE PARENT (weave these in naturally, they are gold):\n' + d.extraDetails : ''}

SENSORY LANGUAGE: Use warmth, soft light, gentle sounds, cosiness. Stars, blankets, rain on windows, a cat purring. Make the listener feel sleepy.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately, no preamble.`,

  journey: (d) => `STORY TYPE: Journey / Adventure
TONE: Exciting, fast paced, gripping. This story is designed to be listened to on a long car ride, flight, or train journey. The child must be hooked from the first sentence.

THE CHILD:
- Name: ${d.childName}
- Age: ${d.age}
- Gender: ${d.gender}
- Best friend: ${d.friendName}
- They love: ${d.interest}
${d.proudOf ? '- Something they are proud of: ' + d.proudOf + ' (use this as a source of courage at a critical moment)' : ''}
${d.hasPet && d.petName ? '- Pet: ' + d.petName + ' (the pet should save the day at a critical moment)' : ''}
${d.extraDetails ? '\nEXTRA DETAILS FROM THE PARENT (weave these in naturally, they are gold):\n' + d.extraDetails : ''}

STRUCTURE: ${d.length === 'epic' ? '5 short chapters with 4 cliffhangers' : d.length === 'standard' ? '3 short chapters with 2 cliffhangers' : '2 short chapters with 1 cliffhanger'}. Each chapter ends at a moment of maximum tension. Not "and then they rested." More like "The door swung open. And standing there, grinning, was someone ${d.childName} had never expected to see."

PACING: Quick. Dialogue heavy. Short action beats. Minimal description, just enough to set the scene. Think movie, not novel.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or intrigue.`,

  learning: (d) => `STORY TYPE: Learning Adventure
TONE: Exciting, immersive, and secretly educational. The child should be so caught up in the adventure that they do not realise they are learning. They are the hero, and their knowledge is their power.

THE CHILD:
- Name: ${d.childName}
- Age: ${d.age}
- Gender: ${d.gender}
- Best friend / sidekick: ${d.friendName}
- They love: ${d.interest}
${d.hasPet && d.petName ? '- Pet: ' + d.petName + ' (the pet has a special ability that helps solve one challenge)' : ''}
${d.extraDetails ? '\nEXTRA DETAILS FROM THE PARENT (weave these in naturally, they are gold):\n' + d.extraDetails : ''}

SUBJECT AREA: ${d.subject}
${d.learningGoal ? 'SPECIFIC LEARNING GOAL: The parent says their child is working on: "' + d.learningGoal + '". This is the most important instruction in this entire prompt. The story MUST contain real, concrete practice of this specific skill built directly into the plot.' : ''}

THIS IS HOW LEARNING STORIES MUST WORK:

The learning is not decoration. It is the engine of the story. Every obstacle, every locked door, every puzzle the hero faces requires the child to use the specific skill the parent described.

Examples of how to do this brilliantly:
- "7 times table" = A series of magic doors. The first needs 7x3 to open. The second needs 7x6. The third needs 7x8. ${d.childName} works each one out inside the story, thinking aloud, sometimes getting it wrong first, then figuring it out. By the end they have practiced at least 5 different 7-times calculations.
- "Dividing by 2 and 3" = Treasure that must be split equally between characters. 12 gems between 3 friends. 18 coins between 2 teams. The story makes the division feel like a real decision with stakes.
- "Letter sounds ch and sh" = A magic spell that only works when you say the right sound. "Was it 'ship' or 'chip'? ${d.childName} knew the difference." Words with ch and sh sounds appear throughout as power words.
- "Telling the time" = A time travel adventure where knowing what the clock says determines where you land. "The big hand pointed to 6 and the little hand pointed to 3. That meant..."
- "What volcanoes are" = An expedition into a volcano where real science explains what they are seeing. Magma, pressure, eruption, tectonic plates, all explained through wonder and discovery not textbook language.
- "Counting in 10s" = Stepping stones that only appear in 10s. "10, 20, 30... ${d.childName} called out each number and another stone appeared."

YOU MUST:
1. Include at least ${d.length === 'epic' ? '6 to 8' : d.length === 'standard' ? '4 to 5' : '2 to 3'} distinct practice moments where the specific skill is used inside the plot
2. Make the practice feel like heroism, not homework
3. Show the child character thinking through the problem, not just magically knowing the answer
4. Build difficulty gradually (start easy, get harder, end with a satisfying challenge)
5. Have the friend or pet help with one of the easier challenges so the child feels supported
6. End with the child mastering something they found hard, making them feel capable and proud

YOU MUST NOT:
- Make it feel like a worksheet wrapped in a story
- Have a teacher character explain things
- Use the phrase "let's practice" or anything that breaks the adventure
- Make the child character perfect at the skill from the start (they should grow)

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or discovery.`,

  custom: (d) => `STORY TYPE: Custom / Parent Defined
TONE: Warm, personalised, emotionally intelligent. The parent has described a specific situation they want this story to address.

THE CHILD:
- Name: ${d.childName}
- Age: ${d.age}
- Gender: ${d.gender}
- Best friend: ${d.friendName}
- They love: ${d.interest}
${d.proudOf ? '- Something they are proud of: ' + d.proudOf : ''}
${d.hasPet && d.petName ? '- Pet: ' + d.petName : ''}
${d.extraDetails ? '\nEXTRA DETAILS FROM THE PARENT (weave these in naturally, they are gold):\n' + d.extraDetails : ''}

THE SCENARIO THE PARENT DESCRIBED:
"${d.customScenario}"

YOUR JOB: Write a story that helps ${d.childName} feel prepared, brave, calm, or excited about this situation. Do not lecture. Do not moralise. Let the story do the emotional work. The child should finish the story feeling empowered and positive. The scenario should be woven into a narrative, not addressed head on like a therapy session.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately.`
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
      system: SYSTEM_PROMPT,
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
