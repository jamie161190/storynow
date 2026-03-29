---
name: storytold-stories
description: "Story prompt engineering, quality control, and content strategy for Storytold's AI-generated children's stories. Use this skill whenever improving story prompts, adding new story categories, adjusting age tailoring, making stories more personalised, adding interactive elements, creating longer story formats (30min, 1hr), debugging story quality issues, or discussing what makes a great personalised children's story. Also trigger when the user says stories feel generic, wants better personalisation, wants to add new subjects to the learning category, or wants to improve how stories handle the personal message, pet inclusion, or proud-of moments."
---

# Storytold: Story Quality and Prompt Engineering

This skill focuses on making Storytold's AI-generated stories genuinely magical. The difference between a story that feels like a template with a name swapped in and a story that makes a parent gasp when they hear their child's details woven naturally into the plot is entirely down to prompt engineering.

## Core Principles

### Personalisation Must Feel Natural
The child's name should appear at least 8 times in a standard story, but never forced. It should flow the way a real storyteller would use a child's name: at moments of triumph ("Chase couldn't believe it"), in dialogue ("Come on, Chase!"), in quiet moments ("Chase smiled to himself").

Their interest should drive the plot, not decorate it. If a child loves space, the story does not mention space once and move on. Space IS the world. The setting, the challenge, the resolution all connect to it.

### The Personal Message Is Sacred
When a parent writes "Chase, this is from Daddy. I know maths feels hard sometimes but I believe in you," that message is prepended to the story text and read aloud first by the narrator. It must feel like a natural lead-in to the story, not a jarring interruption. The narrator reads it warmly, then pauses, then the story begins.

### The Friend and Pet Are Characters, Not Mentions
The best friend should have at least 3 meaningful moments in the story: a line of dialogue, an action that matters, and a moment of connection with the child. The pet (if included) should do something memorable, not just exist.

### The Proud-Of Moment Is a Celebration
When a parent says their child recently "scored a goal" or "learned to ride a bike," the story should weave this in as a source of confidence. The child draws on this achievement at a critical moment: "Chase remembered the feeling of scoring that goal. If he could do that, he could do anything."

## Age Tailoring

This is one of the most important and currently weakest aspects of the product. A story for a 3 year old and a story for a 12 year old should feel completely different.

### Ages 2 to 4
- Very simple vocabulary, short sentences
- Repetition is good ("And they walked, and they walked, and they walked...")
- Familiar concepts: colours, animals, family, home
- No real danger or tension, everything is safe
- Characters are friendly, problems are small
- Sound effects and onomatopoeia work beautifully when read aloud ("Splish splash! Whoooosh!")

### Ages 5 to 7
- More complex plots with a clear beginning, middle, end
- Simple moral lessons woven in naturally
- Mild excitement is fine, but the child always feels in control
- Relatable challenges: making friends, being brave, trying something new
- Dialogue between characters brings the story alive

### Ages 8 to 10
- Real narrative arcs with genuine tension
- Sophisticated vocabulary (but not showing off)
- The child is a capable, clever hero who solves problems through thinking
- Friendship dynamics are richer, the best friend has their own personality
- Subplots are possible in longer stories
- Humour works well at this age

### Ages 11 to 14
- Young adult tone, complex emotions
- The child faces an internal challenge alongside the external adventure
- Themes of identity, belonging, growing up
- The friend relationship has depth and sometimes disagreement
- The story respects their intelligence, no talking down
- Can handle ambiguity, not everything needs a neat resolution

## Category-Specific Guidelines

### Bedtime Stories
The entire arc should wind down. The first half can have gentle excitement (a discovery, a journey, a meeting) but the second half must slow. The final quarter should be drowsy.

**Sensory language is everything for bedtime:**
- Warm blankets, soft light, gentle breezes
- Stars appearing one by one
- The sound of rain on a window
- A cat purring, a dog settling at the foot of the bed

**The ending formula:** The child character is in bed (or a bed-like safe place), feeling warm, loved, and sleepy. The last two sentences should be rhythmic and slow, almost like a lullaby in prose. End with the child's eyes closing.

**What to avoid in bedtime:** Cliffhangers, unresolved tension, loud sounds, anything scary, bright/energetic imagery in the second half.

### Journey Stories
These are designed to be listened to on long car rides, flights, and train journeys. The structure matters enormously because you need to keep a child engaged when they are bored and restless.

**Chapter structure:**
- Short: 2 chapters with 1 cliffhanger
- Standard: 3 chapters with 2 cliffhangers
- Epic: 5 chapters with 4 cliffhangers

**Cliffhanger technique:** End each chapter at a moment of maximum tension. Not "and then they went to bed." More like "The door swung open. And standing there, grinning, was someone Chase had never expected to see." The child physically cannot stop listening.

**Pacing:** Quick. Dialogue heavy. Action beats are short and punchy. Description is minimal, just enough to set the scene. Think of it like a movie: show, don't tell.

### Learning Stories
The hardest category to get right because the educational content must feel exciting, not like homework.

**The superhero framework:** The child has a superpower tied to their subject. For maths, they can calculate at superhuman speed. For science, they can manipulate elements. For geography, they can teleport by naming the right country. The power is cool, not nerdy.

**The villain framework:** The villain threatens something the child cares about. The only way to stop them is by solving subject-specific challenges. Each challenge should be genuinely educational and age-appropriate.

**Subject-specific guidance:**
- **Maths:** Word problems disguised as adventure decisions. "The bridge can hold 450kg. Chase weighs 35kg, Ellis weighs 32kg, and Buddy the dog weighs 12kg. Can they all cross at once?"
- **Science:** Experiments as plot devices. "To escape the cave, they needed to create a chemical reaction that would produce enough gas to push the boulder."
- **Geography:** Travel as the mechanic. "To reach the next clue, Chase had to figure out which country sits between France and Spain."
- **History:** Time travel or historical settings. "They had landed in Ancient Egypt, and the only way home was to help build something the Pharaoh would accept."
- **Reading/Phonics (young children):** Letter and sound puzzles. "The magic door would only open if Chase could think of three words that rhyme with 'light'."

## Story Length Strategy

### Current Lengths
- **Short (~300 words, ~2 min):** For toddlers or tired parents. One simple arc.
- **Standard (~600 words, ~5 min):** The default. Full arc with personalisation.
- **Epic (~1,200 words, ~10 min):** Multiple chapters, deeper characters.

### Planned Premium Lengths
- **Extended (~4,000 words, ~30 min):** For long car journeys. Must be generated in chunks (Claude's output limit). Needs 6 to 8 chapters with strong cliffhangers. Multiple subplots. The friend and pet have their own arcs.
- **Marathon (~8,000 words, ~1 hr):** Replaces an audiobook. Requires chunked generation with careful continuity management. Full novel structure: setup, rising action, midpoint twist, crisis, climax, resolution. Must maintain consistent character voices and plot threads across chunks.

### Chunked Generation Strategy (for 30min and 1hr)
Generate a story outline first, then generate each chapter individually while passing the outline and previous chapter summaries as context. This ensures continuity without hitting token limits.

```
Step 1: Generate outline (characters, plot points, chapter summaries)
Step 2: Generate Chapter 1 using outline
Step 3: Generate Chapter 2 using outline + Chapter 1 summary
Step 4: Continue until complete
Step 5: Concatenate all chapters for TTS
```

## Interactive Elements (Planned)

Future stories could include decision points where the child chooses what happens next ("Does Chase go through the red door or the blue door?"). This transforms a passive listening experience into an interactive one.

Implementation approach: Generate branching story segments. At decision points, pause the audio and present buttons. The chosen path generates the next segment. This multiplies replay value enormously.

## Quality Checklist

Before any story prompt goes live, verify:
- [ ] Child's name appears naturally 8+ times (standard length)
- [ ] Best friend has 3+ meaningful moments
- [ ] Pet (if included) does something memorable
- [ ] Interest drives the plot, not just decorates it
- [ ] Proud-of moment (if provided) appears as a source of confidence
- [ ] Language matches the age group
- [ ] Category guidelines are followed (bedtime winds down, journey has cliffhangers, learning is educational)
- [ ] Personal message (if provided) flows naturally into the story opening
- [ ] No generic phrases that could apply to any child
- [ ] The story would make a parent smile when they hear it
