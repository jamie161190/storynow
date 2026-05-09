#!/usr/bin/env node
// A/B test runner for the Tier 2 prompt changes.
//
// Usage:
//   node scripts/ab-test/run.mjs <storyId>
//
// What it does:
//   1. Fetches story_data + brief from Supabase for the given storyId
//      (the story must already have a generated brief; status >= brief_ready)
//   2. Calls Claude Sonnet TWICE with the same brief — once with the PRODUCTION
//      writer prompt, once with the EXPERIMENTAL writer prompt
//   3. Saves both story texts to /tmp/ab-test/<storyId>/ alongside the brief
//      and a small report.txt with timing + token counts
//
// What it does NOT do:
//   - Render audio. Use the existing pipeline for that, or run elevenlabs
//     manually on the saved text.
//   - Write back to Supabase. Read-only.
//
// Env vars required (read from Code/.env or shell):
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// Cheap .env loader (avoids adding dotenv as a dep). Only loads keys not
// already present in process.env so shell-set vars win.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const STORY_ID = process.argv[2];
if (!STORY_ID) {
  console.error('Usage: node scripts/ab-test/run.mjs <storyId>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in env'); process.exit(2); }
if (!ANTHROPIC_KEY) { console.error('Missing ANTHROPIC_API_KEY in env'); process.exit(2); }

const OUT_DIR = `/tmp/ab-test/${STORY_ID}`;
mkdirSync(OUT_DIR, { recursive: true });

const log = (...args) => console.log('[AB]', ...args);

// ── 1. Load story_data + brief from Supabase ─────────────────────────────
log('Fetching story', STORY_ID, 'from Supabase…');
const sRes = await fetch(
  `${SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(STORY_ID)}&select=id,child_name,category,story_data,status&limit=1`,
  { headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY } }
);
if (!sRes.ok) { console.error('Supabase fetch failed:', sRes.status, await sRes.text()); process.exit(3); }
const rows = await sRes.json();
if (!rows.length) { console.error('Story not found:', STORY_ID); process.exit(4); }
const story = rows[0];
const brief = story.story_data?.brief;
if (!brief) {
  console.error('Story has no brief yet (status =', story.status + '). Run the brief worker first.');
  process.exit(5);
}
log(`Loaded story for "${story.child_name}" (${story.category}). Status: ${story.status}`);
writeFileSync(join(OUT_DIR, 'brief.json'), JSON.stringify(brief, null, 2));

// ── 2. Import both writer prompts (production + experimental) ────────────
const prodMod = await import(join(REPO_ROOT, 'netlify/functions/lib/story-prompts.mjs'));
const expMod = await import(join(__dirname, 'story-prompts.experimental.mjs'));

log('Production prompt length:', prodMod.SYSTEM_PROMPT.length);
log('Experimental prompt length:', expMod.SYSTEM_PROMPT.length);

const wordCount = prodMod.getWordCount('long', { children: brief.children, age: brief.children?.[0]?.age });
log('Word count target:', wordCount);

const userPromptProd = prodMod.buildUserPrompt(brief, wordCount, story.category);
const userPromptExp = expMod.buildUserPrompt(brief, wordCount, story.category);

// ── 3. Call Claude Sonnet for both versions ──────────────────────────────
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;

async function callClaude(label, systemPrompt, userPrompt) {
  log(`Calling Claude (${label})…`);
  const start = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.85,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const text = data.content?.filter(c => c.type === 'text').map(c => c.text).join('').trim() || '';
  const elapsedMs = Date.now() - start;
  return {
    text,
    elapsedMs,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0
  };
}

// Run both calls in parallel — they're independent and this halves wall time.
const [prodResult, expResult] = await Promise.all([
  callClaude('production', prodMod.SYSTEM_PROMPT, userPromptProd),
  callClaude('experimental', expMod.SYSTEM_PROMPT, userPromptExp)
]);

// ── 4. Save outputs + report ─────────────────────────────────────────────
writeFileSync(join(OUT_DIR, 'A-production.txt'), prodResult.text);
writeFileSync(join(OUT_DIR, 'B-experimental.txt'), expResult.text);

const wordsOf = (s) => s.split(/\s+/).filter(Boolean).length;
const pausesOf = (s) => (s.match(/ \.\.\. /g) || []).length;
const namesOf = (s, name) => {
  if (!name) return 0;
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'g');
  return (s.match(re) || []).length;
};

const childNames = (brief.children || []).map(c => c.name).filter(Boolean);

const report = [
  `A/B test report — ${new Date().toISOString()}`,
  `Story: ${story.child_name} (${story.id})`,
  `Category: ${story.category}`,
  `Children: ${childNames.join(', ') || '(none in brief)'}`,
  `Word count target: ${wordCount}`,
  ``,
  `─── A: PRODUCTION ──────────────────────────`,
  `  Prompt length:    ${prodMod.SYSTEM_PROMPT.length} chars`,
  `  Generation time:  ${(prodResult.elapsedMs / 1000).toFixed(1)}s`,
  `  Input tokens:     ${prodResult.inputTokens}`,
  `  Output tokens:    ${prodResult.outputTokens}`,
  `  Story words:      ${wordsOf(prodResult.text)}`,
  `  Pauses (...):     ${pausesOf(prodResult.text)}`,
  ...childNames.map(n => `  Name "${n}":  ${namesOf(prodResult.text, n)} mentions`),
  ``,
  `─── B: EXPERIMENTAL ───────────────────────`,
  `  Prompt length:    ${expMod.SYSTEM_PROMPT.length} chars`,
  `  Generation time:  ${(expResult.elapsedMs / 1000).toFixed(1)}s`,
  `  Input tokens:     ${expResult.inputTokens}`,
  `  Output tokens:    ${expResult.outputTokens}`,
  `  Story words:      ${wordsOf(expResult.text)}`,
  `  Pauses (...):     ${pausesOf(expResult.text)}`,
  ...childNames.map(n => `  Name "${n}":  ${namesOf(expResult.text, n)} mentions`),
  ``,
  `Diff (A→B):`,
  `  Words:  ${(() => { const d = wordsOf(expResult.text) - wordsOf(prodResult.text); return (d >= 0 ? '+' : '') + d; })()}`,
  `  Pauses: ${(() => { const d = pausesOf(expResult.text) - pausesOf(prodResult.text); return (d >= 0 ? '+' : '') + d; })()}`,
  ``,
  `Files saved to: ${OUT_DIR}/`,
  `  brief.json          — the brief both versions were given`,
  `  A-production.txt    — output from current production prompt`,
  `  B-experimental.txt  — output from Tier 2 experimental prompt`,
  `  report.txt          — this file`,
  ``,
  `Next: read both stories. Pick the one you'd rather have go to a real`,
  `customer. If B wins consistently across 2-3 stories, ship its changes`,
  `to production. If A wins or it's a wash, the Tier 2 changes don't earn`,
  `their way in.`,
].join('\n');

writeFileSync(join(OUT_DIR, 'report.txt'), report);
console.log('\n' + report);
