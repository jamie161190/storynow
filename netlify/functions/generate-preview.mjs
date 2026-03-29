import Anthropic from '@anthropic-ai/sdk';

const WORD_COUNTS = { standard: 750, long: 2200, epic: 4500 };

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
// SHARED CHARACTER BLOCK: builds the same info section for all prompts
// ============================================================
function characterBlock(d) {
  const gender = `(${d.gender})`;
  let block = `THE MAIN CHARACTER:
- Name: ${d.childName} ${gender}
- Age: ${d.age}
${d.proudOf ? '- Something they are proud of: ' + d.proudOf : ''}

PEOPLE IN THE STORY:
- Best friend: ${d.friendName} (must have at least 3 meaningful moments: dialogue, an action, a connection)
${d.familyMembers ? '- Family: ' + d.familyMembers + ' (give at least one family member a real moment in the story, not just a mention)' : ''}
${d.teacherName ? '- Teacher: ' + d.teacherName : ''}

THEMES AND INTERESTS: ${d.interest}
The themes must drive the world and the plot, not just decorate it. If the child loves dinosaurs, the story lives and breathes dinosaurs.

SETTING: ${d.setting || 'Surprise me'}
${d.setting === 'Surprise me' ? 'Choose a setting that fits the themes and category perfectly.' : 'Set the story in or around this place.'}`;

  if (d.hasPet && d.petName) {
    block += `\n\nPET: ${d.petName}${d.petType ? ' (a ' + d.petType + ')' : ''}
The pet must do something memorable. Not "wagged his tail." Something the child would retell to their friends.`;
  }

  if (d.favTeddy) {
    block += `\n\nFAVOURITE TOY/TEDDY: ${d.favTeddy}
This toy should appear as a character or a special object in the story. Give it a role, a moment, a reason to matter.`;
  }

  if (d.extraDetails) {
    block += `\n\nEXTRA DETAILS FROM THE PARENT (these are gold, weave them in naturally):
${d.extraDetails}`;
  }

  return block;
}

// ============================================================
// STRUCTURED USER PROMPTS
// ============================================================
const STORY_PROMPTS = {
  bedtime: (d) => `STORY TYPE: Bedtime
TONE: Warm, calming, soothing. The story should wind down gradually. The first half can have gentle discovery or a small journey, but the second half must slow. The final quarter should feel drowsy. End with the child feeling safe, warm, and sleepy. The last two sentences should be rhythmic and slow, almost like a lullaby in prose.

${characterBlock(d)}

SENSORY LANGUAGE: Use warmth, soft light, gentle sounds, cosiness. Stars, blankets, rain on windows, a cat purring. Make the listener feel sleepy.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately, no preamble.`,

  journey: (d) => `STORY TYPE: Journey / Adventure
TONE: Exciting, fast paced, gripping. This story is designed to be listened to on a long car ride, flight, or train journey. The child must be hooked from the first sentence.

${characterBlock(d)}

STRUCTURE: ${d.length === 'epic' ? '8 to 10 chapters with rich cliffhangers and subplots' : d.length === 'long' ? '5 to 6 chapters with strong cliffhangers' : '3 short chapters with 2 cliffhangers'}. Each chapter ends at a moment of maximum tension. Not "and then they rested." More like "The door swung open. And standing there, grinning, was someone ${d.childName} had never expected to see."

PACING: Quick. Dialogue heavy. Short action beats. Minimal description, just enough to set the scene. Think movie, not novel.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or intrigue.`,

  learning: (d) => `STORY TYPE: Learning Adventure
TONE: Exciting, immersive, and secretly educational. The child should be so caught up in the adventure that they do not realise they are learning.

${characterBlock(d)}

SUBJECT AREA: ${d.subject}
${d.learningGoal ? 'SPECIFIC LEARNING GOAL: The parent says their child is working on: "' + d.learningGoal + '". This is the most important instruction in this entire prompt.' : ''}

THIS IS HOW LEARNING STORIES WORK:

The learning is the engine of the story. Every obstacle, every locked door, every puzzle requires the child to use the specific skill.

CRITICAL: INTERACTIVE AUDIO PAUSES
This story is read aloud by a narrator. At each learning moment, the narrator must PAUSE and invite the child to answer before revealing the answer. Write these pauses directly into the text like this:

For maths: "${d.childName} stared at the magic door. Seven times four. Can you work it out? ... That is right, twenty eight! The door burst open with a flash of golden light."

For spelling: "To unlock the chest, ${d.childName} needed to spell the word 'because.' B, E, C... can you finish it? ... A, U, S, E! The lock clicked open."

For alphabet: "The next stepping stone had a letter. It comes after G. What letter is it? ... H! The stone lit up and ${d.childName} leaped across."

For phonics: "The magic word started with a 'ch' sound. Was it a chair? A ship? Or a cherry? ... Cherry! ${d.childName} shouted it and the spell exploded with colour."

For reading: "The sign on the door said C... A... T. Can you read it? ... Cat! And behind the door was the biggest, fluffiest cat ${d.childName} had ever seen."

For science: "The volcano was building pressure underground. What is the hot liquid rock called before it reaches the surface? ... Magma! ${d.childName} remembered."

For languages: "The friendly dragon spoke French. 'Bonjour!' it said. That means... hello! Can you say it? Bonjour!"

THE PATTERN FOR EVERY CHALLENGE:
1. Present the question naturally inside the story
2. The narrator asks "Can you work it out?" or "What do you think?" or similar
3. Write three dots "..." to create a natural pause (the narrator will pause here)
4. Then reveal the answer with celebration and excitement
5. The story continues because the child "got it right"

The child listening at home shouts the answer during the pause. The narrator then confirms it. The child feels like the story is talking directly to them.

YOU MUST:
1. Include at least ${d.length === 'epic' ? '12 to 15' : d.length === 'long' ? '7 to 9' : '4 to 5'} interactive pause moments
2. Build difficulty gradually (start easy, get harder)
3. The challenges must be genuinely age-appropriate for a ${d.age} year old
4. Have the friend or pet help with one of the easier challenges
5. End with the child mastering something hard, feeling proud and capable
6. NEVER break the adventure. No "let us practice" or teacher explaining. The learning IS the adventure.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or discovery.`,

  custom: (d) => `STORY TYPE: Custom / Parent Defined
TONE: Warm, personalised, emotionally intelligent. The parent has described a specific situation they want this story to address.

${characterBlock(d)}

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

    const anthropic = new Anthropic({ apiKey: typeof Netlify !== 'undefined' ? Netlify.env.get('ANTHROPIC_API_KEY') : process.env.ANTHROPIC_API_KEY });
    const tokenMap = { standard: 1800, long: 5000, epic: 8000 };
    const maxTokens = tokenMap[storyData.length] || 1800;

    const storyResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: promptFn(storyData) }]
    });

    const fullStory = storyResponse.content[0].text;
    const messageIntro = storyData.personalMessage ? `${storyData.personalMessage} ... ` : '';
    const fullStoryWithMessage = messageIntro + fullStory;
    const previewText = fullStoryWithMessage.split(' ').slice(0, 60).join(' ') + '...';
    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': typeof Netlify !== 'undefined' ? Netlify.env.get('ELEVENLABS_API_KEY') : process.env.ELEVENLABS_API_KEY,
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
