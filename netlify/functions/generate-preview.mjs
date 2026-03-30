import Anthropic from '@anthropic-ai/sdk';

const WORD_COUNTS = { standard: 2200, long: 2200, epic: 2200 };

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

Ages 2 to 4: Very short sentences. Simple words. Repetition is magic ("And they walked, and they walked, and they walked"). Sound effects and onomatopoeia ("Splish splash! Whoooosh!"). Everything is safe and gentle. ABSOLUTELY NO danger, scary moments, villains, darkness, or anything threatening. No one gets lost, hurt, or scared. Everything resolves quickly and happily. Familiar things: colours, animals, home, family. The child should feel held by the story like a warm hug. Even the "problem" should be gentle (e.g. a lost teddy, not a lost child).

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

10. PACING
Every story is ~15 minutes (~2200 words). For adventure and learning stories, use a four act structure with SUBPLOTS and SURPRISES. For bedtime stories, follow the specific bedtime structure in the story type instructions instead.
- Act 1 (first 20%): Immediate hook. The child and friend are dropped into a situation that demands action.
- Act 2 (20% to 50%): The adventure deepens. Introduce a secondary character or subplot (a quirky helper, a rival, a mystery within the mystery). At least THREE distinct scenes with location or situation changes. Every 300 words, something new must happen: a new character speaks, the setting shifts, a discovery is made, or an obstacle appears.
- Act 3 (50% to 80%): The twist. What the child thought was the problem is not the real problem. The real challenge is bigger, more personal, more meaningful. The friend or pet has a standout moment here. Dialogue is at its peak. Include a moment of doubt or setback that the child must push through.
- Act 4 (final 20%): Resolution with emotional depth. The child succeeds but not through luck. A callback to an earlier detail pays off ("Remember when..."). For bedtime, wind down slowly. For adventures, end on a high with a hint that more adventures are possible.

CRITICAL FOR ALL STORIES LONGER THAN 5 MINUTES:
- Change the scene or setting at least once every 2 to 3 minutes of narration (~300 words). New room, new landscape, new situation. The ear craves fresh stimulus.
- At least 40% of the story should be dialogue, not narration. Kids zone out during long descriptive passages. Characters talking to each other is what holds attention.
- Plant something early that pays off later. A throwaway detail in act 1 becomes the key to solving the problem in act 3. This makes the child feel like the story was designed just for them (because it was).
- Vary sentence rhythm deliberately. Three short punchy sentences. Then one long flowing one that carries them forward. Then a one word sentence. Boom. This creates a natural audio rhythm that holds attention.
- Include at least one moment where a character says the child's name directly in dialogue ("Come on, Chase, we have got this!"). This snaps the child's attention back every time.

11. BEFORE YOU WRITE
Think carefully before you begin. Use your thinking time to plan the full story arc. This is the most important step. A planned story is 10x better than an improvised one. Decide:
- What is the opening hook? (First sentence must grab attention. Not just "It was a normal day." Something happens, something is discovered, something changes.)
- THE PERSONAL DETAIL MAP: Go through every single detail the parent gave you (name, friend, pet, interests, family, proud-of moment, teddy, extra details, setting) and decide WHERE in the story each one lands. Every detail must appear. No detail should be wasted or forgotten. If you cannot find a natural place for a detail, make a place for it.
- What is the callback? (Plant something in act 1 that pays off in act 3. This is what separates a good story from a magical one. The child will feel like the story was DESIGNED for them.)
- What is the twist? (For adventure/learning: what the child thought was the problem is not the real problem. For bedtime: what seemed like a mystery turns out to be something gentle and beautiful.)
- Where are the scene changes? (At least every 300 words for adventure/learning.)
- Where is the emotional peak? (The moment that makes the parent cry and the child feel seen.)
- How does the friend shine? (Three distinct moments minimum.)
- THE FINAL LINE: Plan your ending before you start. The last line of the story is the one they will remember. Make it beautiful.
- For learning stories: map out the difficulty curve. Plan which challenges go where, which ones the friend helps with, and where the breathing moments (humour, twists, celebrations) break up the learning. The themes and interests should BUILD THE WORLD, and the subject knowledge should be THE KEY that unlocks that world.
Then write. The story must feel inevitable, like every detail was placed with intention, because it was.

12. DIALOGUE IS KING
Children lose interest during long descriptive passages. Characters talking to each other is what holds attention. Make sure:
- Every character has a distinct voice. The friend sounds different from the child who sounds different from any adults.
- Characters call each other by name in dialogue regularly. Hearing their own name in a character's mouth snaps the child's attention back.
- Use short, punchy dialogue exchanges. Not long speeches. Back and forth, like real kids talk.
- Include at least one line the child will want to repeat. A catchphrase, a funny exclamation, a brave declaration.`;

// ============================================================
// AGE BAND INSTRUCTIONS: appended to each prompt
// ============================================================
function getAgeBand(age) {
  const a = parseInt(age);
  if (a <= 4) return `This child is very young (age ${a}). Use very simple vocabulary, short sentences, gentle repetition, sound effects, and keep everything safe, warm, and familiar. Think CBeebies bedtime hour. Sentences should rarely exceed 12 words. Use lots of "And then..." and repeated patterns. Name things the child knows: colours, animals, family, food, bath time, bedtime. For age 2 to 3, keep the TOTAL word count closer to 1200 words (shorter attention span). The story should feel like being read to by a loving parent.`;
  if (a <= 7) return `This child is ${a} years old. Use clear story structure with a beginning, middle, and end. Keep language accessible but not babyish. Dialogue and action keep them engaged. The world is kind and the child is brave. Use vocabulary that stretches them slightly (one or two words they might not know but can figure out from context). The friend should talk like a real kid their age. Include at least one moment that makes the child giggle or gasp.`;
  if (a <= 10) return `This child is ${a} years old. Write with real narrative tension, humour, and clever problem solving. Richer vocabulary is welcome. The friend should have their own personality and opinions. The child is the hero because they are smart, not lucky. Include wordplay, wit, and at least one genuinely funny moment. The characters can disagree, make mistakes, and learn. The story should feel like the best book they have ever read, not like something written for a younger kid.`;
  return `This child is ${a} years old. Write at a young adult level. Complex emotions, genuine depth, themes of identity and belonging. Respect their intelligence completely. The friendship should feel real and layered, with moments of tension and reconciliation. Do not shy away from ambiguity or nuance. The humour should be smart, not silly. The stakes should feel real. The ending can be hopeful without being neat. Write as if you are writing for someone who reads real novels.`;
}

// ============================================================
// SHARED CHARACTER BLOCK: builds the same info section for all prompts
// ============================================================
function characterBlock(d) {
  const genderLabel = (d.gender || '').toLowerCase();
  const pronounLine = genderLabel === 'boy' ? 'Use he/him/his pronouns for ' + d.childName + '.'
    : genderLabel === 'girl' ? 'Use she/her/hers pronouns for ' + d.childName + '.'
    : 'Use they/them/their pronouns for ' + d.childName + '.';

  // Split themes into primary and secondary if multiple
  let themesSection = '';
  if (d.interest) {
    const themes = d.interest.split(',').map(t => t.trim()).filter(Boolean);
    if (themes.length > 1) {
      themesSection = `PRIMARY THEME: ${themes[0]}
This theme shapes the entire world, setting, and central conflict. It is the heartbeat of the story.
SECONDARY THEMES: ${themes.slice(1).join(', ')}
Weave these in naturally as subplots, character traits, or setting details. They enrich the story but do not compete with the primary theme.`;
    } else {
      themesSection = `THEMES AND INTERESTS: ${d.interest}
The themes must drive the world and the plot, not just decorate it. If the child loves dinosaurs, the story lives and breathes dinosaurs.`;
    }
    if (d.themeDetail) {
      themesSection += `\nSPECIFIC DETAILS FROM THE PARENT: "${d.themeDetail}"
This is critical. The parent has told you exactly what their child loves within this theme. If they said "Manchester United", the story must feature Manchester United, not just generic football. If they said "Elsa", the story must feature Elsa or someone unmistakably like her. If they said "Spider-Man", Spider-Man must be in the story. Use the REAL names, teams, characters, and details they gave you. This is what makes the story feel like it was made for their child and no one else.`;
    }
  }

  let block = `THE MAIN CHARACTER:
- Name: ${d.childName} (${d.gender || 'child'})
- Age: ${d.age}
- ${pronounLine}
${d.proudOf ? `- Occasion: ${d.proudOf}
THIS IS IMPORTANT. The parent told you about this occasion because it matters to them. Weave it into the story as a source of pride, courage, or celebration. If it is a birthday, the adventure should feel like a birthday gift. If the child learned something new, that achievement should give them confidence at a key moment. If it is a milestone, the story should honour it. Do not just mention it once. Let it resonate.` : ''}

PEOPLE IN THE STORY:
- Best friend: ${d.friendName} (must have at least 3 meaningful moments: dialogue, an action, a connection)
${d.sidekickName ? `- Sidekick: ${d.sidekickName}
The sidekick is ${d.childName}'s loyal companion throughout the adventure. They could be a real person, a superhero partner, a magical creature, or an imaginary friend. Give the sidekick a distinct personality, catchphrases, and at least 2-3 moments where they help, encourage, or have fun with ${d.childName}. The sidekick should feel different from the best friend in tone and role.` : ''}
${d.familyMembers ? '- Family: ' + d.familyMembers + '\nIMPORTANT: Every family member listed above MUST appear in the story with dialogue or a meaningful action. Do not just name-drop them. Each person should have at least one moment where they speak, do something, or interact with ' + d.childName + ' in a way the child would remember. If a parent included themselves, they are telling you they want to be IN the story. Make that happen.' : ''}
${d.teacherName ? '- Teacher: ' + d.teacherName : ''}
${d.isGift && d.giftFrom && d.giftInStory ? `- Gift giver: ${d.giftFrom}
THIS STORY IS A GIFT from ${d.giftFrom} to ${d.childName}. ${d.giftFrom} MUST appear in the story as a real character with at least one warm, memorable moment. They could tuck ${d.childName} in, cheer them on, appear as a wise guide, or share a loving line of dialogue. The child hearing this story needs to feel that ${d.giftFrom} is right there with them.` : ''}

${themesSection}

SETTING: ${d.setting || 'Surprise me'}
${!d.setting || d.setting === 'Surprise me' ? 'Choose a setting that fits the themes and category perfectly. Be creative and unexpected.' : 'Set the story in or around this place. If the parent has given extra detail (e.g. "A castle (made of ice on a mountaintop)"), use ALL of that detail to make the setting specific and vivid. The setting is not just a backdrop. It is a character. Describe how it looks, smells, sounds, and feels.'}`;

  if (d.hasPet && d.petName) {
    block += `\n\nPET: ${d.petName}${d.petType ? ' (a ' + d.petType + ')' : ''}
The pet must do something memorable. Not "wagged his tail." Something the child would retell to their friends.
${d.petType ? `IMPORTANT: You know what ${d.petType}s are really like. Use that knowledge. How they move, the sounds they make, their quirks and personality traits. If it's a golden retriever, it's bounding and joyful and probably knocking things over. If it's a cat, it's aloof and then suddenly affectionate at the worst moment. If it's a hamster, it's tiny and quick and escapes from things. If it's a rabbit, it thumps its foot and does zoomies. Make ${d.petName} behave like a real ${d.petType} would, not like a generic pet. The child will know the difference.` : ''}`;
  }

  if (d.favTeddy) {
    block += `\n\nFAVOURITE TOY/TEDDY/COMFORT ITEM: ${d.favTeddy}
This item should appear in the story. Give it a role, a moment, a reason to matter. CRITICAL: Use ONLY the description the parent gave. If they said "yellow blanket," it is yellow. If they said "small white bunny," it is small and white. NEVER invent colours, sizes, or details the parent did not mention. If no colour or description was given, describe it without visual details (e.g. "the blanket" not "the soft blue blanket").`;
  }

  if (d.extraDetails) {
    block += `\n\nEXTRA DETAILS FROM THE PARENT (these are gold, weave them in naturally):
${d.extraDetails}`;
  }

  if (d.personalMessage) {
    block += `\n\nPERSONAL MESSAGE FROM THE PARENT (read aloud before the story starts):
"${d.personalMessage}"
You do NOT need to include this message in the story text. It will be read separately before the story begins. However, you should be AWARE of it because it sets the emotional tone. If the message says "Happy birthday," the story should feel celebratory. If it says "I am so proud of you," the story should make the child feel capable and valued. Let the message and the story feel like they belong together.`;
  }

  return block;
}

// ============================================================
// STRUCTURED USER PROMPTS
// ============================================================
const STORY_PROMPTS = {
  bedtime: (d) => `STORY TYPE: Bedtime
TONE: Warm, calming, soothing. This story exists to help a child fall asleep. Every creative decision you make should serve that goal. The story should wind down gradually. The first half can have gentle discovery or a small journey, but the second half must slow. The final quarter should feel drowsy. The last two sentences should be rhythmic and slow, almost like a lullaby in prose.

${characterBlock(d)}

SENSORY LANGUAGE: Use warmth, soft light, gentle sounds, cosiness. Stars, blankets, rain on windows, a cat purring, warm milk, the smell of toast, fairy lights in a treehouse, the hum of crickets outside. Make the listener FEEL sleepy through the words. Every paragraph after the midpoint should contain at least one sensory detail that evokes warmth, softness, or comfort.
${d.sidekickName ? `
SIDEKICK IN BEDTIME: ${d.sidekickName} is with ${d.childName} throughout this story. In a bedtime story, the sidekick plays a comforting role: they might walk alongside ${d.childName} on a gentle adventure, say something reassuring at a quiet moment, or be the one who tucks ${d.childName} in at the end. If the sidekick is a parent or family member, make the ending especially warm and intimate, as if the listener can feel that person right there with them.` : ''}

BEDTIME STRUCTURE (NOT the same as adventure):
This is NOT a 4-act adventure. Do NOT use twists, villains, or high tension. Instead use a JOURNEY HOME structure:
- Opening (first 20%): ${d.childName} discovers something gentle but intriguing. A glowing path, a whispered invitation, a door that wasn't there before. Curiosity, not urgency.
- Gentle adventure (20% to 50%): A slow, wondrous journey through beautiful, safe places. Every location is more magical and calming than the last. The friend is there, the sidekick is there, and the mood is wonder, not danger. Include one moment of gentle humour or warmth. The themes and interests shape the world they explore.
- Winding down (50% to 80%): The energy drops noticeably. Sentences get shorter. Dialogue becomes quieter, more reflective. Characters start yawning, sitting down, resting. Sounds become softer. Descriptions become slower and more rhythmic. The world dims like a sunset.
- Sleep (final 20%): ${d.childName} is home, or somewhere that feels like home. The final paragraphs should read like a lullaby. Short, rhythmic sentences. Repetition is welcome ("And the stars blinked. And the moon smiled. And ${d.childName} closed their eyes."). End with the child feeling safe, warm, surrounded by the people who love them. The very last line should feel like a blanket being pulled up.

CRITICAL BEDTIME RULES:
- NO danger, villains, scary moments, chase scenes, or high stakes. Not even mild ones. Nothing that raises a heartbeat.
- NO cliffhangers or sequel hooks. The story must CLOSE completely. The child should feel that everything is resolved and safe.
- Dialogue should be warm and quiet after the midpoint. Whispers, gentle questions, "Goodnight" exchanges.
- For ages 2 to 4: heavy repetition, simple sound patterns, and a very clear "going to bed" ending. Think: "And they walked, and they walked, and the stars followed them all the way home."

LENGTH: Approximately ${WORD_COUNTS[d.length] || 2200} words.

${getAgeBand(d.age)}

Write the story now. Start immediately, no preamble.`,

  journey: (d) => `STORY TYPE: Journey / Adventure
TONE: Exciting, gripping, but with emotional range. This story is designed to be listened to on a long car ride, flight, or train journey. The child cannot look at anything else, so the story IS their entire world for the next 15 minutes. It must hold them completely.

${characterBlock(d)}

STRUCTURE: 4 acts with 5 to 6 distinct scenes, at least 2 twists, and a subplot involving the best friend or a new character. Scene transitions should be sharp. Not "and then they rested." More like "The door swung open. And standing there, grinning, was someone ${d.childName} had never expected to see."

PACING: Not just fast. VARIED. This is the most important word for journey stories.
- Alternate between high energy action and quieter character moments. A chase scene, then a funny conversation between ${d.childName} and ${d.friendName}. A discovery, then a moment of doubt. Tension, then a joke that breaks it.
- The ear gets tired of constant excitement. Every 2 to 3 minutes of narration, shift the energy. High, low, high, higher, low, highest.
- Dialogue should make up at least 50% of the story. Two characters disagreeing, joking, planning, or arguing is far more engaging than narration describing what happened.

ENGAGEMENT TECHNIQUES:
- THE TICKING CLOCK: Give the adventure a time pressure. They have to reach somewhere, solve something, or save something before it is too late. This creates forward momentum the child can feel.
- THE RUNNING GAG: Give ${d.friendName || 'the best friend'} a funny recurring habit, phrase, or reaction that appears 3 to 4 times throughout. Kids love repetition they can predict.
- THE IMPOSSIBLE CHOICE: At around the 60% mark, ${d.childName} faces a decision where both options have consequences. This is where the story gets personal and the child leans in.
- SENSORY WORLD BUILDING: Since the child is stuck in a car or plane, the story must paint vivid sensory pictures. Not "they entered a cave" but "The air turned cold. Water dripped somewhere in the dark. And then, from deep inside the cave, a sound. A low rumble. Like breathing."
- END WITH A DOOR OPEN: The final line should hint that there could be another adventure. Not a cliffhanger, but a promise. The child should turn to their parent and say "Can I get another one?"

EMOTIONAL CORE: Every great adventure story needs a heart. Somewhere in the middle, there should be a quiet moment between ${d.childName} and ${d.friendName}. A moment of honesty, doubt, encouragement, or laughter. This is what the child will remember even more than the action. It makes the adventure feel real.

THE ENDING: The adventure resolves with ${d.childName} doing something brave, clever, or kind. Not through luck or magic, but through something they did, said, or figured out. Then the final line should leave a door open: a wink, a mysterious clue, a whispered "see you next time." The child should look up and say "can I get another one?"

LENGTH: Approximately ${WORD_COUNTS[d.length] || 2200} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or intrigue.`,

  learning: (d) => `STORY TYPE: Learning Adventure
TONE: Exciting, immersive, and secretly educational. The child should be so caught up in the adventure that they do not realise they are learning. This is NOT a quiz with a story wrapper. It is a real adventure where knowledge happens to be the superpower.

${characterBlock(d)}

SUBJECT AREA: ${d.subject}
${d.learningGoal ? 'SPECIFIC LEARNING GOAL: The parent says their child is working on: "' + d.learningGoal + '". This is the most important instruction in this entire prompt.' : ''}
${d.interest ? '\nCRITICAL CONNECTION: The child\'s themes and interests (' + d.interest + ') must BUILD THE WORLD of this story. The subject (' + d.subject + ') must be THE KEY that unlocks that world. For example: if the child loves dinosaurs and is learning maths, the adventure takes place in a dinosaur world where maths is the magic that controls the dinosaurs. Never separate the interests from the learning. They must be fused.' : ''}

CONFIDENCE LEVEL: ${d.confidence === 'starting' ? 'JUST STARTING. The child is new to this. Keep challenges very simple. Celebrate small wins enthusiastically. Use lots of scaffolding (e.g. give multiple choice rather than open questions). Make them feel clever for getting easy things right. Build confidence above all else.' : d.confidence === 'nearly' ? 'NEARLY MASTERED. The child is close to owning this. Push them. Include tricky variations, edge cases, and combinations. The final challenge should genuinely stretch them. They should feel proud because it was hard and they still got it.' : 'PRACTISING. The child knows the basics but needs repetition. Mix easy wins with moderate challenges. Start simple to build momentum, then gradually raise difficulty. The child should feel the satisfaction of getting faster and more confident.'}

THE GOLDEN RULE OF LEARNING STORIES:
The learning must feel like a SUPERPOWER, not a test. ${d.childName} is not answering questions. ${d.childName} is using knowledge to save the day, unlock doors, defeat villains, crack codes, and rescue friends. The difference is everything. A child who feels tested switches off. A child who feels powerful leans in.

CRITICAL: INTERACTIVE AUDIO PAUSES
This story is read aloud by a narrator. At each learning moment, the narrator must PAUSE and invite the child to answer before revealing the answer. To create a pause that sounds natural when read aloud by a text to speech engine, write a short sentence like "Take a moment." or "Think about it." followed by a new paragraph. Do NOT use three dots or ellipsis for pauses as these sound unnatural when spoken aloud. Write the pauses like this:

For maths: "${d.childName} stared at the magic door. Seven times four. Can you work it out?

Take a moment.

That is right, twenty eight! The door burst open with a flash of golden light."

For spelling: "To unlock the chest, ${d.childName} needed to spell the word because. B. E. C. Can you finish it?

Go on, spell it out.

A, U, S, E! The lock clicked open."

For science: "The volcano was building pressure underground. What is the hot liquid rock called before it reaches the surface?

Think about it.

Magma! ${d.childName} remembered."

For languages: "The friendly dragon spoke French. Bonjour! it said. That means hello! Can you say it? Bonjour!"

THE PATTERN FOR EVERY CHALLENGE:
1. Present the question naturally inside the story
2. The narrator asks "Can you work it out?" or "What do you think?" or similar
3. Write a short bridging sentence on its own line like "Take a moment." or "Think about it." or "Go on, have a guess." This creates a natural spoken pause.
4. Then reveal the answer with celebration and excitement
5. The story continues because the child "got it right"

The child listening at home shouts the answer during the pause. The narrator then confirms it. The child feels like the story is talking directly to them.

VARY THE PROMPT PHRASES. Do not use "Can you work it out?" every time. Rotate between: "What do you think?", "Do you know?", "Quick, what is it?", "Can you help?", "Shout it out!", "What comes next?", "${d.friendName || 'Their friend'} looked at ${d.childName}. Do you know this one?"

YOU MUST:
1. Include at least 8 to 10 interactive pause moments
2. Build difficulty gradually (start easy, get harder)
3. The challenges must be genuinely age-appropriate for a ${d.age} year old
4. Have the friend or pet help with one of the easier challenges
5. End with the child mastering something hard, feeling proud and capable
6. NEVER break the adventure. No "let us practice" or teacher explaining. The learning IS the adventure.

PACING FOR LEARNING STORIES:
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
There should be an antagonist or major obstacle that can ONLY be defeated through the child's knowledge. Not a scary villain, but a compelling one. A trickster who thinks ${d.childName} cannot solve the puzzles. A locked kingdom that has been waiting for someone smart enough. A machine that is broken and only the right answers can fix it. This gives the challenges STAKES beyond "answer the question."

LENGTH: Approximately ${WORD_COUNTS[d.length] || 2200} words.

${getAgeBand(d.age)}

Write the story now. Start immediately with action or discovery.`,

  custom: (d) => `STORY TYPE: Custom / Parent Defined
TONE: Warm, personalised, emotionally intelligent. The parent has described a specific situation they want this story to address.

${characterBlock(d)}

THE SCENARIO THE PARENT DESCRIBED:
"${d.customScenario}"

YOUR JOB: Write a story that helps ${d.childName} feel prepared, brave, calm, or excited about this situation. Do not lecture. Do not moralise. Let the story do the emotional work. The child should finish the story feeling empowered and positive. The scenario should be woven into a narrative, not addressed head on like a therapy session.

HOW TO STRUCTURE THIS:
- Use the same 4 act structure as any other story. Act 1: hook them. Act 2: deepen the adventure. Act 3: the twist, the real emotional challenge. Act 4: resolution with growth.
- At least 40% dialogue. Characters talking to each other holds the child's attention far better than narration.
- Change scenes at least every 300 words. The ear needs fresh stimulus.
- Plant a detail early that pays off later. This makes the child feel the story was designed for them.
- ${d.friendName} must have at least 3 distinct moments and should help ${d.childName} through the emotional core of the story.
- The scenario should be addressed through METAPHOR and ADVENTURE, not directly. If the child is nervous about the dentist, the story might involve a brave explorer who has to enter a mysterious cave where a friendly giant checks everyone's teeth. The child should see themselves in the character without feeling like they are being lectured.

LENGTH: Approximately ${WORD_COUNTS[d.length] || 2200} words.

${getAgeBand(d.age)}

Write the story now. Start immediately.`
};

export default async (req) => {
  // ── Rate limiting: max 5 previews per IP per hour ──
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const rateLimitKey = `preview_${clientIP}`;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      // Check recent requests from this IP
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const rlCheck = await fetch(
        `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rateLimitKey)}&created_at=gte.${oneHourAgo}&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );
      if (rlCheck.ok) {
        const recent = await rlCheck.json();
        if (recent.length >= 20) {
          console.log('Rate limited:', clientIP, recent.length, 'requests in last hour');
          return new Response(JSON.stringify({ error: 'You have reached the preview limit. Please try again later.' }), {
            status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }
          });
        }
      }
      // Record this request
      await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: rateLimitKey, created_at: new Date().toISOString() })
      });
    } catch (rlErr) {
      console.error('Rate limit check failed (allowing request):', rlErr.message);
    }
  }

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
    const { storyData, voiceId, jobId } = await req.json();

    // Validate jobId to prevent path traversal
    if (jobId && !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input size limits
    if (storyData?.extraDetails && storyData.extraDetails.length > 1000) {
      return new Response(JSON.stringify({ error: 'Extra details too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (storyData?.customScenario && storyData.customScenario.length > 2000) {
      return new Response(JSON.stringify({ error: 'Custom scenario too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (storyData?.personalMessage && storyData.personalMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Personal message too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (storyData?.giftMessage && storyData.giftMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Gift message too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (storyData?.themeDetail && storyData.themeDetail.length > 500) {
      return new Response(JSON.stringify({ error: 'Theme detail too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (storyData?.sidekickName && storyData.sidekickName.length > 200) {
      return new Response(JSON.stringify({ error: 'Sidekick name too long' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const promptFn = STORY_PROMPTS[storyData.category];
    if (!promptFn) return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const tokenMap = { standard: 1800, long: 5000, epic: 5000 };
    const maxTokens = tokenMap[storyData.length] || 1800;

    const startTime = Date.now();
    console.log('Generating story:', { category: storyData.category, length: storyData.length, childName: storyData.childName });

    // Use Sonnet 4 with extended thinking for highest quality stories.
    // The direct HTTP response may 504 on Netlify, but the result is saved
    // to Supabase and the frontend polls for it automatically.
    let fullStory;
    try {
      const stream = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        temperature: 1,
        thinking: {
          type: 'enabled',
          budget_tokens: 4000
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: promptFn(storyData) }],
        stream: true
      });

      let storyText = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            storyText += event.delta.text;
          }
        }
      }
      fullStory = storyText;
      console.log('Story generated in', Date.now() - startTime, 'ms');
    } catch(apiErr) {
      console.error('Anthropic API error after', Date.now() - startTime, 'ms:', apiErr.message);
      throw new Error('Story generation failed: ' + apiErr.message);
    }
    // Frame the intro: gift stories get a warm gift intro, otherwise use personal message
    let messageIntro = '';
    if (storyData.isGift && storyData.giftFrom) {
      const giftMsg = storyData.giftMessage || storyData.personalMessage;
      messageIntro = `This story was made just for you, ${storyData.childName}, with love from ${storyData.giftFrom}. ... `;
      if (giftMsg) {
        messageIntro += `${giftMsg} ... `;
      }
      messageIntro += `And now, your story begins. ... `;
    } else if (storyData.personalMessage) {
      messageIntro = `Before we begin, there is a special message for ${storyData.childName}. ... ${storyData.personalMessage} ... And now, on with the story. ... `;
    }
    const fullStoryWithMessage = messageIntro + fullStory;
    // Build preview: intro (if any) + ~75 words of actual story
    // This ensures the listener always hears real story content, not just the intro
    const storyWords = fullStory.split(' ');
    let storyPreview = storyWords.slice(0, 75).join(' ');
    // Try to end at the last complete sentence
    const lastSentenceEnd = storyPreview.search(/[.!?][^.!?]*$/);
    if (lastSentenceEnd > 40) {
      storyPreview = storyPreview.substring(0, lastSentenceEnd + 1);
    }
    const previewText = messageIntro + storyPreview + ' ... To hear what happens next, unlock the full story.';

    // STAGE 1: Save story text to Supabase IMMEDIATELY so polling can find it
    // even if the function gets killed during TTS generation
    if (jobId && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      try {
        const partialResult = { success: true, fullStory: fullStoryWithMessage, storyData, status: 'generating_audio' };
        await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
            'apikey': process.env.SUPABASE_SECRET_KEY,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: JSON.stringify(partialResult)
        });
        console.log('Saved partial result (story text) for job:', jobId);
      } catch (saveErr) {
        console.error('Failed to save partial result:', saveErr.message);
      }
    }

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

    const result = { success: true, previewAudio: audioBase64, fullStory: fullStoryWithMessage, storyData };

    // STAGE 2: Update Supabase with the complete result (story + audio)
    if (jobId && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      try {
        await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
            'apikey': process.env.SUPABASE_SECRET_KEY,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: JSON.stringify(result)
        });
        console.log('Saved complete result for job:', jobId);
      } catch (saveErr) {
        console.error('Failed to save complete result:', saveErr.message);
      }
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Generate preview error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Story generation failed. Please try again.', debug: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/generate-preview', method: 'POST' };
