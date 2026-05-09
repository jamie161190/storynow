#!/usr/bin/env node
// A/B stress-test suite. Generates 10 stories under each of two writer prompts
// (production + experimental), running every scenario through the real brief
// analyst first. Outputs a single MD file ready to hand to GPT/Gemini/Claude
// Chat for an external verdict.
//
// Usage:
//   node scripts/ab-test/generate-suite.mjs
//
// Output:
//   /tmp/ab-test/scenario-NN/{form-input.json, brief.json, A-production.txt,
//                             B-experimental.txt, metrics.json}
//   /Users/jamieharish/Projects/HearMyName/ab-test-suite-review.md
//
// Wall time: ~5 min (3 scenarios in parallel, brief sequential per scenario).
// Cost: ~$3-5 in Anthropic API calls.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

function loadEnv() {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(2); }

// ── Imports from the real pipeline ──────────────────────────────────────
const v2v1Mod = await import(join(REPO_ROOT, 'netlify/functions/lib/v2-to-v1.mjs'));
const promptModProd = await import(join(REPO_ROOT, 'netlify/functions/lib/story-prompts.mjs'));
const promptModExp = await import(join(__dirname, 'story-prompts.experimental.mjs'));
const middleMod = await import(join(REPO_ROOT, 'netlify/functions/lib/middle-layer-prompt.mjs'));
const briefMod = await import(join(REPO_ROOT, 'netlify/functions/lib/brief-analyst.mjs'));

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.85;
const MAX_TOKENS = 8000;

const log = (...args) => console.log('[SUITE]', ...args);

// ── 10 stress-test scenarios (v2 form-shape input) ──────────────────────
const SCENARIOS = [
  {
    id: '01-single-simple-bedtime',
    label: 'Single child, simple bedtime, no per-child fields',
    why: 'Baseline — does the simple case still feel intimate?',
    form: {
      storyKind: 'bedtime',
      children: [{ name: 'Oliver', age: '4-5', pronouns: 'He / him' }],
      bestFriend: 'Mira', others: 'Mum, Dad', hasPet: true, petKind: 'Cat', petName: 'Sock',
      toy: 'a small blue bunny called Pip', hasVillain: false, villainName: '',
      themes: ['Animals', 'Nature'], themesOther: '',
      place: 'Magic forest', placeReal: '',
      quirk: 'Loves leaves, picks one up every walk',
      voice: 'British (gentle)'
    }
  },
  {
    id: '02-single-sensitive',
    label: 'Single child, sensitive context (cancer survivor)',
    why: 'Tests sensitive_notes path — story must NOT name the sensitive thing',
    form: {
      storyKind: 'bedtime',
      children: [{ name: 'Oliver', age: '6-7', pronouns: 'He / him' }],
      bestFriend: 'Daddy', others: 'Mommy, Daddy, Nana, Pop',
      hasPet: true, petKind: 'Dog', petName: 'Nova',
      toy: 'a soft weighted wrap that goes around his neck',
      hasVillain: false, villainName: '',
      themes: ['Nature', 'Animals'], themesOther: '',
      place: 'Magic forest', placeReal: 'Grandma\'s back garden',
      quirk: 'Oliver is a cancer survivor and rocks on his wiggle seat when he is thinking. He communicates more in sounds than words.',
      voice: 'American (cosy)'
    }
  },
  {
    id: '03-single-large-family',
    label: 'Single child, large extended family (10+ named)',
    why: 'Tests large_cast guard — story must not become a roll-call',
    form: {
      storyKind: 'adventure',
      children: [{ name: 'Sachi', age: '6-7', pronouns: 'She / her' }],
      bestFriend: 'cousin Coco',
      others: 'Mom, Dad, Nonna, Poppa, Auntie Bin Bin, Auntie Lica, Auntie Kenna, Uncle Chris, Uncle Tom, cousin Coco, cousin Emme, baby brother Orlando',
      hasPet: false, petKind: '', petName: '',
      toy: 'a tiny wooden horse called Mr Trot',
      hasVillain: true, villainName: 'Captain Stinkbeard',
      themes: ['Pirates', 'Music'], themesOther: '',
      place: 'Pirate ship', placeReal: '',
      quirk: 'Sachi sings every instruction she gives. Dad goes golfing and plays hockey, Mom is Mrs Fix-It.',
      voice: 'Irish (lilting)'
    }
  },
  {
    id: '04-two-same-pronoun',
    label: 'Two girls, same age, same pronoun (rule 3a stress)',
    why: 'Tests pronoun clarity in multi-child scenes',
    form: {
      storyKind: 'adventure',
      children: [
        { name: 'Aria', age: '6-7', pronouns: 'She / her' },
        { name: 'Iris', age: '6-7', pronouns: 'She / her' }
      ],
      bestFriend: 'Mum',
      others: 'Mum, Dad',
      hasPet: true, petKind: 'Cat', petName: 'Marmalade',
      toy: 'a treasure map drawn in blue ink',
      hasVillain: false, villainName: '',
      themes: ['Mermaids', 'Nature'], themesOther: '',
      place: 'Under the sea', placeReal: '',
      quirk: 'Aria and Iris finish each other\'s sentences and have a secret handshake.',
      voice: 'Australian (bright)'
    }
  },
  {
    id: '05-two-with-perchild',
    label: 'Two siblings, full per-child fields (best friend + toy + quirk)',
    why: 'Tests per-child handling at full pressure',
    form: {
      storyKind: 'adventure',
      children: [
        { name: 'Chase', age: '4-5', pronouns: 'He / him', bestFriend: 'Mira', toy: 'a red toy truck called Rusty', quirk: 'calls spaghetti pasketti' },
        { name: 'Ethan', age: '2-3', pronouns: 'He / him', bestFriend: 'Sam', toy: 'a tiny blue blanket called Blue', quirk: 'a soft lisp on words with s' }
      ],
      bestFriend: '', others: 'Mum, Dad',
      hasPet: false, petKind: '', petName: '',
      toy: '', hasVillain: false, villainName: '',
      themes: ['Dinosaurs'], themesOther: '',
      place: 'Magic forest', placeReal: '',
      quirk: '',
      voice: 'British (gentle)'
    }
  },
  {
    id: '06-three-wide-age',
    label: 'Three siblings, wide age spread (3, 7, 10)',
    why: 'Tests age guidance for mixed ages — language to youngest, dialogue per age',
    form: {
      storyKind: 'bedtime',
      children: [
        { name: 'Hadlie', age: '2-3', pronouns: 'She / her' },
        { name: 'Caitlin', age: '6-7', pronouns: 'She / her' },
        { name: 'Aliya', age: '8+', pronouns: 'She / her' }
      ],
      bestFriend: '', others: 'Mum, Dad',
      hasPet: true, petKind: 'Dog', petName: 'Pepper',
      toy: 'each girl has her own — Hadlie has a teddy called Bear, Caitlin has a green frog called Lemon, Aliya has a silver locket from her grandma',
      hasVillain: false, villainName: '',
      themes: ['Unicorns', 'Nature'], themesOther: '',
      place: 'Bedroom', placeReal: 'Grandma\'s back garden',
      quirk: 'Hadlie copies everything Aliya does. Caitlin is the storyteller of the three.',
      voice: 'British (gentle)'
    }
  },
  {
    id: '07-three-shared-friend',
    label: 'Three siblings, ALL with the same per-child best friend (Mira)',
    why: 'Tests duplicate friend consolidation rule',
    form: {
      storyKind: 'adventure',
      children: [
        { name: 'Chase', age: '4-5', pronouns: 'He / him', bestFriend: 'Mira' },
        { name: 'Ethan', age: '4-5', pronouns: 'He / him', bestFriend: 'Mira' },
        { name: 'Darcy', age: '6-7', pronouns: 'She / her', bestFriend: 'Mira' }
      ],
      bestFriend: '', others: 'Mum, Dad',
      hasPet: true, petKind: 'Dog', petName: 'Loki',
      toy: 'a kite shaped like a dragon',
      hasVillain: false, villainName: '',
      themes: ['Cars', 'Superheroes'], themesOther: '',
      place: 'A castle', placeReal: '',
      quirk: 'all three are obsessed with a TV show called Bluey and quote it constantly',
      voice: 'Australian (bright)'
    }
  },
  {
    id: '08-three-shared-plus-perchild',
    label: 'Three siblings, shared friend (Mum) + different per-child friends',
    why: 'Tests shared+per-child coexistence rule',
    form: {
      storyKind: 'bedtime',
      children: [
        { name: 'Chase', age: '4-5', pronouns: 'He / him', bestFriend: 'Mira', toy: 'red toy truck' },
        { name: 'Ethan', age: '6-7', pronouns: 'He / him', bestFriend: 'Sam' },
        { name: 'Darcy', age: '8+', pronouns: 'She / her', bestFriend: 'Lottie', quirk: 'reads to her younger brothers every night' }
      ],
      bestFriend: 'Mum',
      others: 'Mum, Dad, Grandma',
      hasPet: false, petKind: '', petName: '',
      toy: 'a big shared blanket the three of them snuggle under',
      hasVillain: false, villainName: '',
      themes: ['Music', 'Nature'], themesOther: '',
      place: 'Bedroom', placeReal: '',
      quirk: '',
      voice: 'British (gentle)'
    }
  },
  {
    id: '09-four-full-perchild-adventure',
    label: 'Four kids, all per-child fields, adventure with villain (heaviest load)',
    why: 'Heaviest cognitive load — tests cast weight + pronoun + per-child + villain together',
    form: {
      storyKind: 'adventure',
      children: [
        { name: 'Joshua', age: '8+', pronouns: 'He / him', bestFriend: 'Tom', toy: 'a battered Switch console', quirk: 'always pretends to be unimpressed' },
        { name: 'Hailee', age: '6-7', pronouns: 'She / her', bestFriend: 'Maya', toy: 'a sketchbook full of dragons', quirk: 'will draw rather than speak when nervous' },
        { name: 'Scarlett', age: '4-5', pronouns: 'She / her', bestFriend: 'Pippa', toy: 'a tiny pink unicorn called Sparkle', quirk: 'asks "is it now?" before everything' },
        { name: 'Everett', age: '2-3', pronouns: 'They / them', bestFriend: '', toy: 'a cuddly otter', quirk: 'says "yum" instead of yes' }
      ],
      bestFriend: '', others: 'Mum, Dad',
      hasPet: true, petKind: 'Dog', petName: 'Biscuit',
      toy: '', hasVillain: true, villainName: 'Mrs Grumble',
      themes: ['Dragons', 'Castles'], themesOther: 'Minecraft',
      place: 'A castle', placeReal: '',
      quirk: '',
      voice: 'British (gentle)'
    }
  },
  {
    id: '10-three-mixed-pronoun-sensitive',
    label: 'Three siblings, mixed pronouns + autism context',
    why: 'Multi-stressor — sensitive context, mixed pronouns, ensemble',
    form: {
      storyKind: 'bedtime',
      children: [
        { name: 'Aurora', age: '8+', pronouns: 'She / her' },
        { name: 'Oliver', age: '6-7', pronouns: 'He / him' },
        { name: 'Elyse', age: '4-5', pronouns: 'They / them' }
      ],
      bestFriend: 'Mommy',
      others: 'Mommy, Daddy',
      hasPet: true, petKind: 'Dog', petName: 'Nova',
      toy: 'a blue cooling blanket with yellow moons and stars',
      hasVillain: false, villainName: '',
      themes: ['Nature'], themesOther: '',
      place: 'Bedroom', placeReal: 'their grandparents\' garden',
      quirk: 'Oliver and Aurora are on the Autism spectrum and are not very verbal, they stim and are sensory seekers. Elyse points and uses sounds rather than words.',
      voice: 'American (cosy)'
    }
  }
];

// ── Helpers ─────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt, label) {
  const start = Date.now();
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  // Retry up to 5 times on 429 / 529 / 5xx with exponential backoff
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body
    });
    if (res.ok) break;
    const shouldRetry = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!shouldRetry || attempt === 4) {
      const errText = await res.text();
      throw new Error(`[${label}] Claude ${res.status}: ${errText.slice(0, 400)}`);
    }
    const waitMs = res.status === 429 ? 30_000 : 4_000 * (attempt + 1);
    log(`  [${label}] ${res.status}, retrying in ${waitMs/1000}s (attempt ${attempt + 1}/5)…`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  const data = await res.json();
  const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('').trim() || '';
  return {
    text,
    elapsedMs: Date.now() - start,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0
  };
}

const wordsOf = (s) => s.split(/\s+/).filter(Boolean).length;
const pausesOf = (s) => (s.match(/ \.\.\. /g) || []).length;
const tagsOf = (s) => (s.match(/\[[a-z][a-z\s]*\]/g) || []).length;
const namesOf = (s, name) => {
  if (!name) return 0;
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'g');
  return (s.match(re) || []).length;
};

async function processScenario(scenario) {
  const outDir = `/tmp/ab-test/${scenario.id}`;
  mkdirSync(outDir, { recursive: true });
  log(`▶ ${scenario.id}`);

  // Save form input
  const formPath = join(outDir, 'form-input.json');
  if (!existsSync(formPath)) writeFileSync(formPath, JSON.stringify(scenario.form, null, 2));

  // Step 1: brief analyst (resume from disk if already saved)
  const v1Data = v2v1Mod.v2ToV1(scenario.form);
  const sanitised = promptModProd.sanitiseStoryData(v1Data);
  const briefPath = join(outDir, 'brief.json');
  let brief;
  if (existsSync(briefPath)) {
    brief = JSON.parse(readFileSync(briefPath, 'utf8'));
    log(`  brief loaded from disk (cached)`);
  } else {
    brief = await briefMod.analyzeBrief(sanitised);
    writeFileSync(briefPath, JSON.stringify(brief, null, 2));
    log(`  brief OK: confidence=${brief.confidence}, flags=${(brief.flags || []).join(',') || 'none'}`);
  }

  // Step 2: both writer prompts on the same brief (resume from disk if saved)
  const wordCount = promptModProd.getWordCount('long', sanitised);
  const category = brief.story_shape?.category || (scenario.form.storyKind === 'adventure' ? 'journey' : 'bedtime');
  const userPromptProd = promptModProd.buildUserPrompt(brief, wordCount, category);
  const userPromptExp = promptModExp.buildUserPrompt(brief, wordCount, category);

  const aPath = join(outDir, 'A-production.txt');
  const bPath = join(outDir, 'B-experimental.txt');
  const metricsPath = join(outDir, 'metrics.json');

  let prodResult, expResult;
  if (existsSync(aPath) && existsSync(bPath) && existsSync(metricsPath)) {
    log(`  A + B + metrics loaded from disk (cached)`);
    const cachedMetrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
    prodResult = { text: readFileSync(aPath, 'utf8'), elapsedMs: cachedMetrics.A.genTimeMs, inputTokens: cachedMetrics.A.inputTokens, outputTokens: cachedMetrics.A.outputTokens };
    expResult = { text: readFileSync(bPath, 'utf8'), elapsedMs: cachedMetrics.B.genTimeMs, inputTokens: cachedMetrics.B.inputTokens, outputTokens: cachedMetrics.B.outputTokens };
  } else {
    // Two writer calls, in parallel (about 16k input tokens combined — safe under 30k/min)
    [prodResult, expResult] = await Promise.all([
      callClaude(promptModProd.SYSTEM_PROMPT, userPromptProd, `${scenario.id} A`),
      callClaude(promptModExp.SYSTEM_PROMPT, userPromptExp, `${scenario.id} B`)
    ]);
    writeFileSync(aPath, prodResult.text);
    writeFileSync(bPath, expResult.text);
  }

  const childNames = (brief.children || []).map(c => c.name).filter(Boolean);
  const metrics = {
    wordCountTarget: wordCount,
    A: {
      words: wordsOf(prodResult.text),
      pauses: pausesOf(prodResult.text),
      audioTags: tagsOf(prodResult.text),
      nameMentions: Object.fromEntries(childNames.map(n => [n, namesOf(prodResult.text, n)])),
      genTimeMs: prodResult.elapsedMs,
      inputTokens: prodResult.inputTokens,
      outputTokens: prodResult.outputTokens
    },
    B: {
      words: wordsOf(expResult.text),
      pauses: pausesOf(expResult.text),
      audioTags: tagsOf(expResult.text),
      nameMentions: Object.fromEntries(childNames.map(n => [n, namesOf(expResult.text, n)])),
      genTimeMs: expResult.elapsedMs,
      inputTokens: expResult.inputTokens,
      outputTokens: expResult.outputTokens
    }
  };
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

  log(`  ✓ ${scenario.id} done. A=${metrics.A.words}w/${metrics.A.pauses}p, B=${metrics.B.words}w/${metrics.B.pauses}p`);
  return { scenario, brief, A: prodResult.text, B: expResult.text, metrics };
}

// ── Run scenarios SEQUENTIALLY (rate limit: 30k input tokens/min) ───────
// Per-scenario cost: ~7k input (brief) + ~14k input (2 writers in parallel) = ~21k
// Spaced out one per ~75s, comfortably under the per-minute budget.
log(`Starting suite — ${SCENARIOS.length} scenarios, sequential to respect rate limits…`);
const results = [];
for (let i = 0; i < SCENARIOS.length; i++) {
  const scenario = SCENARIOS[i];
  // Skip cooldown if we're loading from cache (no API calls)
  const isCached = existsSync(`/tmp/ab-test/${scenario.id}/metrics.json`);
  if (i > 0 && !isCached) {
    const cooldownMs = 15_000;
    log(`  cooldown ${cooldownMs/1000}s before next scenario…`);
    await new Promise(r => setTimeout(r, cooldownMs));
  }
  const result = await processScenario(scenario);
  results.push(result);
  log(`  Progress: ${results.length}/${SCENARIOS.length}`);
}

// ── Build the final MD ──────────────────────────────────────────────────
log('Building final MD…');

const fence = (lang, content) => '```' + lang + '\n' + content + '\n```';

const mdParts = [];

mdParts.push(`# HearTheirName Pipeline — Full A/B Stress Suite

This document is a complete brief for an external AI (GPT, Gemini, Claude Chat) to evaluate a recent prompt change for a paid personalised children's audio story product. It contains:

1. Background (what the product does, who buys it)
2. The two writer prompts being compared (A: current production, B: experimental Tier 2 variant)
3. The middle-layer brief analyst prompt (used by both — held constant)
4. Ten scenarios run end-to-end through both prompt versions, with the form input, the brief produced, and BOTH story outputs

The ask is at the bottom. **Read everything before responding.** This is a long document because there is no shortcut to evaluating story quality without reading the stories.

---

## 1. Background

**Product**: HearTheirName. A paid (£24.99) personalised audio story for children. The customer fills in a form (their child's name, age, pronouns, optional best friend / comfort item / quirk; family details; themes; setting). The system produces a ~15-minute story narrated by ElevenLabs TTS in a chosen voice. Mostly bedtime usage. Often listened to dozens of times. The promise: "made by hand", deeply personal, the moment when a child hears their own name in a story and goes still.

**Pipeline**:
1. Form → JSONB
2. Brief analyst (Claude Sonnet, "middle layer") → structured brief JSON
3. Writer (Claude Sonnet) → ~2200-word story text
4. ElevenLabs TTS → mp3

**The question being tested**: We've got two writer prompts. Version A is current production, hardened over time against failure modes (name counts, pause counts, audio-tag counts, lots of DO NOTs). Version B is an experimental Tier 2 variant where:
- Pause / name / audio-tag counts are softened from "do this many" to "principle + floor"
- A new PRINCIPLES OF INTIMACY section opens the prompt before any field reference, naming what the product is reaching for (recognition, anticipation, quiet, garden-not-parade)
- Otherwise identical to A

The middle layer is identical for both runs.

We want your verdict: which prompt produces better stories? Where does each win? Should B ship?

---

## 2. The two writer prompts

### A — Production (current)

`);

mdParts.push(fence('text', promptModProd.SYSTEM_PROMPT));

mdParts.push(`
### B — Experimental (Tier 2 variant)

Differences vs A:
- **Pause rule** (CRITICAL: REQUIRED FOR ELEVENLABS section): replaced "Aim for at least one pause every 100 to 150 words. COUNT YOUR PAUSES." with a principle: "Pauses are how the story breathes... If you find yourself at the floor, your prose is probably racing past something." Floor lowered to 1/150 words.
- **Name rule** (rule 3): replaced "at least 8 times across the story... at least 6 times for each child" with "The child's name is a beat the listener returns to. If you cannot find a moment for the name in a stretch, that stretch may be missing the child." Same floor as backstop.
- **Audio tag rule**: dropped the "no more than 8 to 12 per full story" floor; kept the 12 hard cap.
- **NEW: PRINCIPLES OF INTIMACY** section added before HOW TO READ THE BRIEF, with 6 named principles (specificity is the love; recognition over performance; anticipation over presence; garden not parade; quiet as beat; trust the brief).

Full text:

`);

mdParts.push(fence('text', promptModExp.SYSTEM_PROMPT));

mdParts.push(`
---

## 3. The middle-layer brief analyst (identical for both runs)

`);

mdParts.push(fence('text', middleMod.MIDDLE_LAYER_PROMPT));

mdParts.push(`
---

## 4. The 10 scenarios

Each scenario shows: a description of what's being stressed, the form input the parent submitted, the brief Claude produced from it (using the middle-layer prompt above), and the two stories produced from that brief — A using the production writer, B using the experimental writer. Same brief, same model, same temperature (${TEMPERATURE}), same word count target.

Metrics shown for each: word count, pauses, audio tags, name mentions per child. These are surface signals. The actual judgment is in the prose.

`);

for (const r of results) {
  mdParts.push(`---

### Scenario ${r.scenario.id}

**${r.scenario.label}**

Why this stresses the system: ${r.scenario.why}

#### Form input

`);
  mdParts.push(fence('json', JSON.stringify(r.scenario.form, null, 2)));

  mdParts.push(`
#### Brief produced (by current production middle-layer prompt)

`);
  mdParts.push(fence('json', JSON.stringify(r.brief, null, 2)));

  mdParts.push(`
#### Metrics

| Metric | A (Production) | B (Experimental) | Diff |
|---|---|---|---|
| Words (target ${r.metrics.wordCountTarget}) | ${r.metrics.A.words} | ${r.metrics.B.words} | ${(() => { const d = r.metrics.B.words - r.metrics.A.words; return (d >= 0 ? '+' : '') + d; })()} |
| Pauses (\` ... \`) | ${r.metrics.A.pauses} | ${r.metrics.B.pauses} | ${(() => { const d = r.metrics.B.pauses - r.metrics.A.pauses; return (d >= 0 ? '+' : '') + d; })()} |
| Audio tags (\`[...]\`) | ${r.metrics.A.audioTags} | ${r.metrics.B.audioTags} | ${(() => { const d = r.metrics.B.audioTags - r.metrics.A.audioTags; return (d >= 0 ? '+' : '') + d; })()} |
${Object.entries(r.metrics.A.nameMentions).map(([n, a]) => {
  const b = r.metrics.B.nameMentions[n] || 0;
  return `| Name "${n}" | ${a} | ${b} | ${(b - a >= 0 ? '+' : '') + (b - a)} |`;
}).join('\n')}

#### A — Production output

`);
  mdParts.push(fence('text', r.A));

  mdParts.push(`
#### B — Experimental output

`);
  mdParts.push(fence('text', r.B));
}

mdParts.push(`
---

## 5. What we want from you

Read every story. Yes, all twenty. There is no shortcut. The point of this document is for you to compare actual outputs, not theoretical descriptions of prompts.

For each scenario, answer:

1. **Which version (A or B) would you rather ship to a real paying customer?** Be decisive. If it's a tie, say "tie" and explain why.
2. **What specifically made the better one better?** A specific moment, a sentence, a pacing choice.
3. **Where did the worse one fail?** Be specific.

Then, across all 10:

4. **Pattern recognition**: where does A consistently win? Where does B consistently win? Where is it a wash?
5. **Failure modes that show up in BOTH versions**: the prompts share most rules. What do you see going wrong in BOTH A and B that suggests a problem with the underlying prompt structure, not just one variant?
6. **Overall verdict**: should B ship to production? Yes / no / partially (which parts)?
7. **Anything missing from BOTH prompts** that you would add — independent of the A vs B question — to lift story quality?

Be specific. Quote sentences from the actual outputs. Don't write meta commentary about prompt engineering — write craft commentary about the stories that were produced.

`);

const finalMd = mdParts.join('\n');
const outPath = '/Users/jamieharish/Projects/HearMyName/ab-test-suite-review.md';
writeFileSync(outPath, finalMd);

log(`✅ Suite complete.`);
log(`MD: ${outPath} (${(finalMd.length / 1024).toFixed(0)} KB, ${finalMd.split('\n').length} lines)`);
log(`Per-scenario outputs: /tmp/ab-test/scenario-NN/`);
