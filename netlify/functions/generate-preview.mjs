import Anthropic from '@anthropic-ai/sdk';

const WORD_COUNTS = { standard: 750, long: 2200, epic: 2200 };

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

7. NEVER INVENT WHAT THE PARENT ALREADY DESCRIBED
If the parent told you something is yellow, it is yellow. If they said the pet is a golden retriever, it is a golden retriever, not a Labrador. If they described a toy, blanket, or object, use their exact description. NEVER add colours, sizes, breeds, or details the parent did not provide. When no description was given, keep it vague ("the blanket", "the teddy") rather than inventing details that could be wrong. A child who sees their blue blanket described as red will lose all trust in the story instantly.

8. NO GENERIC PHRASES
Never write anything that could apply to any child. No "they were so brave" without showing WHY. No "it was the best day ever" without earning it. Every sentence should feel like it could only exist in THIS child's story.

9. START IMMEDIATELY
No preamble. No "Once upon a time" unless it genuinely serves the story. Drop the listener straight into a moment. The first sentence should make a parent lean in.

10. PACING BY LENGTH
Short stories (~5 min, ~750 words): One clear arc. Setup, one complication, resolution. Tight and satisfying.

Medium stories (~10 min, ~1500 words): Three act structure with ESCALATION.
- Act 1 (first 25%): Drop straight into the world. Establish the child, the friend, the situation. End act 1 with a problem or discovery.
- Act 2 (middle 50%): The heart of the story. Must contain AT LEAST two distinct scenes in different locations or situations. Include a "wait, what?" twist at roughly the midpoint that changes what the child thought was happening. Dialogue should dominate this section, not narration. Shift emotions: funny then tense, exciting then tender.
- Act 3 (final 25%): The payoff. A callback to something from earlier in the story. The child solves the final challenge using something they learned along the way. For bedtime stories, this act slows down gradually into warmth and sleep.

Long stories (~15 min, ~2200 words): Four act structure with SUBPLOTS and SURPRISES.
- Act 1 (first 20%): Immediate hook. The child and friend are dropped into a situation that demands action.
- Act 2 (20% to 50%): The adventure deepens. Introduce a secondary character or subplot (a quirky helper, a rival, a mystery within the mystery). At least THREE distinct scenes with location or situation changes. Every 300 words, something new must happen: a new character speaks, the setting shifts, a discovery is made, or an obstacle appears.
- Act 3 (50% to 80%): The twist. What the child thought was the problem is not the real problem. The real challenge is bigger, more personal, more meaningful. The friend or pet has a standout moment here. Dialogue is at its peak. Include a moment of doubt or setback that the child must push through.
- Act 4 (final 20%): Resolution with emotional depth. The child succeeds but not through luck. A callback to an earlier detail pays off ("Remember when..."). For bedtime, wind down slowly. For adventures, end on a high with a hint that more adventures are possible.

CRITICAL FOR ALL STORIES LONGER THAN 5 MINUTES:
- Change the scene or setting at least once every 2 to 3 minutes of narration (~300 words). New room, new landscape, new situation. The ear craves fresh stimulus.
- At least 40% of the story should be dialogue, not narration. Kids zone out during long descriptive passages. Characters talking to each other is what holds attention.
- Plant something early that pays off later. A throwaway detail in act 1 becomes the key to solving the problem in act 3. This makes the child feel like the story was designed just for them (because it was).
- Vary sentence rhythm deliberately. Three short punchy sentences. Then one long flowing one that carries them forward. Then a one word sentence. Boom. This creates a natural audio rhythm that holds attention.
- Include at least one moment where a character says the child's name directly in dialogue ("Come on, Chase, we have got this!"). This snaps the child's attention back every time.`;

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
${d.familyMembers ? '- Family: ' + d.familyMembers + '\nIMPORTANT: Every family member listed above MUST appear in the story with dialogue or a meaningful action. Do not just name-drop them. Each person should have at least one moment where they speak, do something, or interact with ' + d.childName + ' in a way the child would remember. If a parent included themselves, they are telling you they want to be IN the story. Make that happen.' : ''}
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
    block += `\n\nFAVOURITE TOY/TEDDY/COMFORT ITEM: ${d.favTeddy}
This item should appear in the story. Give it a role, a moment, a reason to matter. CRITICAL: Use ONLY the description the parent gave. If they said "yellow blanket," it is yellow. If they said "small white bunny," it is small and white. NEVER invent colours, sizes, or details the parent did not mention. If no colour or description was given, describe it without visual details (e.g. "the blanket" not "the soft blue blanket").`;
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

${d.length !== 'standard' ? 'LONGER BEDTIME PACING: For medium and long bedtime stories, the first half can be a gentle journey or discovery with soft excitement. But the energy must drop steadily from the midpoint onwards. The final third should feel like sinking into a warm bath. Sentences get shorter. The world gets quieter. Sounds become softer. By the last few paragraphs, the child should already be drifting.' : ''}

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately, no preamble.`,

  journey: (d) => `STORY TYPE: Journey / Adventure
TONE: Exciting, gripping, but with emotional range. This story is designed to be listened to on a long car ride, flight, or train journey. The child cannot look at anything else, so the story IS their entire world for the next ${d.length === 'standard' ? '5' : '15'} minutes. It must hold them completely.

${characterBlock(d)}

STRUCTURE: ${d.length === 'standard' ? '1 clear arc with a complication and resolution' : '4 acts with 5 to 6 distinct scenes, at least 2 twists, and a subplot involving the best friend or a new character'}. Scene transitions should be sharp. Not "and then they rested." More like "The door swung open. And standing there, grinning, was someone ${d.childName} had never expected to see."

PACING: Not just fast. VARIED. This is the most important word for journey stories.
- Alternate between high energy action and quieter character moments. A chase scene, then a funny conversation between ${d.childName} and ${d.friendName}. A discovery, then a moment of doubt. Tension, then a joke that breaks it.
- The ear gets tired of constant excitement. Every 2 to 3 minutes of narration, shift the energy. High, low, high, higher, low, highest.
- Dialogue should make up at least 50% of the story. Two characters disagreeing, joking, planning, or arguing is far more engaging than narration describing what happened.
${d.length !== 'standard' ? `
ENGAGEMENT TECHNIQUES FOR LONGER JOURNEYS:
- THE TICKING CLOCK: Give the adventure a time pressure. They have to reach somewhere, solve something, or save something before it is too late. This creates forward momentum the child can feel.
- THE RUNNING GAG: Give ${d.friendName} a funny recurring habit, phrase, or reaction that appears 3 to 4 times throughout. Kids love repetition they can predict.
- THE IMPOSSIBLE CHOICE: At around the 60% mark, ${d.childName} faces a decision where both options have consequences. This is where the story gets personal and the child leans in.
- SENSORY WORLD BUILDING: Since the child is stuck in a car or plane, the story must paint vivid sensory pictures. Not "they entered a cave" but "The air turned cold. Water dripped somewhere in the dark. And then, from deep inside the cave, a sound. A low rumble. Like breathing."
- END WITH A DOOR OPEN: The final line should hint that there could be another adventure. Not a cliffhanger, but a promise. The child should turn to their parent and say "Can I get another one?"` : ''}

LENGTH: Approximately ${WORD_COUNTS[d.length] || 600} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or intrigue.`,

  learning: (d) => `STORY TYPE: Learning Adventure
TONE: Exciting, immersive, and secretly educational. The child should be so caught up in the adventure that they do not realise they are learning. This is NOT a quiz with a story wrapper. It is a real adventure where knowledge happens to be the superpower.

${characterBlock(d)}

SUBJECT AREA: ${d.subject}
${d.learningGoal ? 'SPECIFIC LEARNING GOAL: The parent says their child is working on: "' + d.learningGoal + '". This is the most important instruction in this entire prompt.' : ''}

CONFIDENCE LEVEL: ${d.confidence === 'starting' ? 'JUST STARTING. The child is new to this. Keep challenges very simple. Celebrate small wins enthusiastically. Use lots of scaffolding (e.g. give multiple choice rather than open questions). Make them feel clever for getting easy things right. Build confidence above all else.' : d.confidence === 'nearly' ? 'NEARLY MASTERED. The child is close to owning this. Push them. Include tricky variations, edge cases, and combinations. The final challenge should genuinely stretch them. They should feel proud because it was hard and they still got it.' : 'PRACTISING. The child knows the basics but needs repetition. Mix easy wins with moderate challenges. Start simple to build momentum, then gradually raise difficulty. The child should feel the satisfaction of getting faster and more confident.'}

THE GOLDEN RULE OF LEARNING STORIES:
The learning must feel like a SUPERPOWER, not a test. ${d.childName} is not answering questions. ${d.childName} is using knowledge to save the day, unlock doors, defeat villains, crack codes, and rescue friends. The difference is everything. A child who feels tested switches off. A child who feels powerful leans in.

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

VARY THE PROMPT PHRASES. Do not use "Can you work it out?" every time. Rotate between: "What do you think?", "Do you know?", "Quick, what is it?", "Can you help?", "Shout it out!", "What comes next?", "${d.friendName} looked at ${d.childName}. Do you know this one?"

YOU MUST:
1. Include at least ${d.length === 'standard' ? '4 to 5' : '8 to 10'} interactive pause moments
2. Build difficulty gradually (start easy, get harder)
3. The challenges must be genuinely age-appropriate for a ${d.age} year old
4. Have the friend or pet help with one of the easier challenges
5. End with the child mastering something hard, feeling proud and capable
6. NEVER break the adventure. No "let us practice" or teacher explaining. The learning IS the adventure.
${d.length !== 'standard' ? `
PACING FOR LONGER LEARNING STORIES:
The biggest risk with a longer learning story is it feeling like a relentless quiz. You MUST break up the challenges with story moments that have nothing to do with learning. For every 2 to 3 challenges, include one of these breathing moments:

- A FUNNY MOMENT: ${d.friendName} does something silly, the pet causes chaos, something unexpected happens that makes the child laugh. Humour resets attention.
- A STORY TWIST: Something changes. A new character appears. The setting shifts. What they thought was happening turns out to be something else. The child re-engages because the story surprised them.
- AN EMOTIONAL BEAT: A quiet moment between ${d.childName} and ${d.friendName}. A moment of doubt followed by encouragement. A callback to something personal the parent shared. This is what separates a great story from a flashcard app.
- A CELEBRATION: After a hard challenge, do not rush to the next one. Let ${d.childName} feel the win. The crowd cheers. The door explodes with light. ${d.friendName} high fives them. The pet goes wild. Make the child feel like a hero.

DIFFICULTY CURVE FOR MEDIUM AND LONG:
- First 30%: Easy wins. Build confidence. The child thinks "I can do this!"
- Middle 40%: Getting harder. Some challenges need a second think. ${d.friendName} helps with one. The stakes are rising.
- Final 30%: The hardest challenges, but the child is ready. The final challenge should combine two things they have learned earlier in the story. When they get it right, it should feel like the most triumphant moment in the story.

THE VILLAIN OR OBSTACLE:
For medium and long stories, there should be an antagonist or major obstacle that can ONLY be defeated through the child's knowledge. Not a scary villain, but a compelling one. A trickster who thinks ${d.childName} cannot solve the puzzles. A locked kingdom that has been waiting for someone smart enough. A machine that is broken and only the right answers can fix it. This gives the challenges STAKES beyond "answer the question."` : ''}

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
  // Guard: check env vars immediately
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set');
    return new Response(JSON.stringify({ error: 'Story service not configured (missing AI key)' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY not set');
    return new Response(JSON.stringify({ error: 'Voice service not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { storyData, voiceId } = await req.json();
    const promptFn = STORY_PROMPTS[storyData.category];
    if (!promptFn) return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const tokenMap = { standard: 1800, long: 5500, epic: 5500 };
    const maxTokens = tokenMap[storyData.length] || 1800;

    const startTime = Date.now();
    console.log('Generating story:', { category: storyData.category, length: storyData.length, childName: storyData.childName });

    let storyResponse;
    try {
      // Use Haiku for speed: stories generate 3-5x faster with similar quality
      storyResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: promptFn(storyData) }]
      });
      console.log('Story generated in', Date.now() - startTime, 'ms');
    } catch(apiErr) {
      console.error('Anthropic API error after', Date.now() - startTime, 'ms:', apiErr.message);
      throw new Error('Story generation failed: ' + apiErr.message);
    }

    const fullStory = storyResponse.content[0].text;
    const messageIntro = storyData.personalMessage
      ? `${storyData.personalMessage} ...... ...... `
      : '';
    const fullStoryWithMessage = messageIntro + fullStory;
    const previewText = fullStoryWithMessage.split(' ').slice(0, 60).join(' ') + '...';
    // Validate voice ID: must be alphanumeric, fallback to Sarah if invalid
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    console.log('Using voice ID:', useVoiceId);

    const ttsStart = Date.now();
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error('ElevenLabs error after', Date.now() - ttsStart, 'ms:', ttsResponse.status, errText);
      throw new Error('Voice generation failed (voice: ' + useVoiceId + '): ' + errText);
    }
    console.log('TTS generated in', Date.now() - ttsStart, 'ms');
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    console.log('Total time:', Date.now() - startTime, 'ms, response size:', Math.round(audioBase64.length / 1024), 'KB');

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

export const config = { path: '/api/generate-preview', method: 'POST' };
