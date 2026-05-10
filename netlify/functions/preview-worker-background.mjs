// Background worker: takes a story_id, generates the FULL story text (~2200
// words) via Claude using the persisted brief, slices the first ~290 words
// at a natural paragraph break + appends a teaser, runs ElevenLabs TTS on
// that prefix, uploads the MP3 to Supabase, and sets status=preview_ready.
// Triggered by /api/admin-queue?action=generate-preview.
//
// Architecture (single-Claude, two-pass audio):
//   1. Claude generates the full ~2200-word story → saved as story_text.
//   2. Slice the prefix (~290 words) at the first paragraph break that
//      crosses the target. Append the teaser line. Render this prefix +
//      teaser through TTS as the preview MP3.
//   3. After payment, the full-worker does NOT call Claude again. It loads
//      story_text from the row and renders the WHOLE thing through TTS.
//      Same words the customer heard in preview, single source of truth.
//
// Does NOT email the customer. The "Send preview" admin action handles that.
// Requires story_data.brief to exist (status should be brief_ready or
// preview_ready when retriggering).

import { sanitiseStoryData, SYSTEM_PROMPT, buildUserPrompt, getOldestAge, getWordCount } from './lib/story-prompts.mjs';
import { callClaude } from './lib/audio-pipeline.mjs';
import { v2ToV1 } from './lib/v2-to-v1.mjs';

// 5 voices in the funnel mapped to ElevenLabs voice IDs.
// "British (warm)" was previously mapped to Grace (oWAxZDx7w5VEj9dCyTzz) which
// is actually American — option removed from the funnel rather than mislabelled.
const VOICE_MAP = {
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh', // Dorothy, british female, warm/encouraging
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal', // Eric, irish male
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz', // Ethan, american male
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO', // Callum, scottish male
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'  // James, australian male
};
const DEFAULT_VOICE = 'ThT5KcBeYPX3keUQqHPh'; // Dorothy, british female

const PREVIEW_WORD_COUNT_MIN = 250;
const PREVIEW_WORD_COUNT_TARGET = 290;
const PREVIEW_WORD_COUNT_MAX = 330;
const PREVIEW_TEASER = "\n\n... To hear what happens next, the full 15-minute story is one tap away.";
const CLIFFHANGER_JUDGE_THRESHOLD = 1.5; // out of 2.0; below = retry/flag

// Find the best place to cut the preview. Prefers PARAGRAPH breaks within the
// 250-330 window (closest to 290 wins) because paragraph breaks give TTS a
// proper breath. Falls back to sentence break if no paragraph fits. Falls back
// to hard cut at the target word count as last resort.
function sliceForPreview(text) {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Try paragraph cuts within window, find the one whose total wordcount is
  // closest to target.
  let best = null;
  let cumulative = 0;
  let parts = [];
  for (const p of paragraphs) {
    parts.push(p);
    cumulative += p.split(/\s+/).filter(Boolean).length;
    if (cumulative >= PREVIEW_WORD_COUNT_MIN && cumulative <= PREVIEW_WORD_COUNT_MAX) {
      const distance = Math.abs(cumulative - PREVIEW_WORD_COUNT_TARGET);
      if (!best || distance < best.distance) {
        best = { prefix: parts.join('\n\n'), wordsInPrefix: cumulative, distance, kind: 'paragraph' };
      }
    }
    if (cumulative > PREVIEW_WORD_COUNT_MAX) break;
  }
  if (best) return { prefix: best.prefix, wordsInPrefix: best.wordsInPrefix, kind: best.kind };

  // No paragraph fit — fall back to sentence boundary closest to target.
  // Walk word by word, mark sentence boundaries (".", "!", "?" followed by space/quote).
  const words = text.split(/\s+/).filter(Boolean);
  let bestSentence = null;
  for (let i = PREVIEW_WORD_COUNT_MIN; i <= Math.min(PREVIEW_WORD_COUNT_MAX, words.length); i++) {
    const w = words[i - 1];
    if (/[.!?]["'”)\]]?$/.test(w)) {
      const distance = Math.abs(i - PREVIEW_WORD_COUNT_TARGET);
      if (!bestSentence || distance < bestSentence.distance) {
        bestSentence = { prefix: words.slice(0, i).join(' '), wordsInPrefix: i, distance, kind: 'sentence' };
      }
    }
  }
  if (bestSentence) return { prefix: bestSentence.prefix, wordsInPrefix: bestSentence.wordsInPrefix, kind: bestSentence.kind };

  // Last resort: hard cut at target.
  const hard = words.slice(0, PREVIEW_WORD_COUNT_TARGET).join(' ');
  return { prefix: hard, wordsInPrefix: PREVIEW_WORD_COUNT_TARGET, kind: 'hard_cut' };
}

// LLM-judge: read the preview prefix and score the cliffhanger 0-2 against the
// rubric below. Returns { score, last_sentence, reasoning }. If anything fails
// (network, parse), returns null and we treat it as soft-pass to avoid blocking
// delivery on infra issues.
async function judgeCliffhanger(previewPrefix, anthropicKey) {
  const judgeSystem = `You are a brutal direct-response strategist evaluating the FINAL 30-50 words of a children's audio story preview. The preview is the entire conversion mechanism — it has to make a tired parent decide "I have to hear what happens next" and pay £24.99 for the full story. A preview that ends on a soft beat lets the parent walk away.

Score the LAST PARAGRAPH or LAST 2-3 SENTENCES (whatever is shortest of those) on this rubric:

- 2.0 = ends mid-action / mid-reveal — listener cannot stop. A specific unresolved image or moment lands and the preview cuts before resolution.
- 1.5-1.9 = ends at a turning point but resolution feels optional. The reader could walk away if pressed.
- 1.0-1.4 = ends at a satisfying-ish beat. Mild urgency, weak hook.
- 0.5-0.9 = ends at a soft natural pause. Story feels structurally complete here.
- 0.0-0.4 = ends at a closure beat. No urgency. The parent feels they've heard enough.

Cliffhanger archetypes that score high: threshold (door, gate, edge); naming (a voice saying the child's name from somewhere unexpected); object_that_shouldnt_be (impossible item in familiar place); glimpse (something gone before they could be sure); choice (two paths, neither chosen); voice_that_knows (character speaks knowledge they shouldn't have).

Output ONLY valid JSON, no preamble: {"score": <number 0-2>, "last_sentence": "<the actual closing sentence verbatim>", "reasoning": "<one sentence>"}`;

  const judgeUser = `Here is the full preview text. Score the cliffhanger at the end:

${previewPrefix}`;

  try {
    const result = await callClaude({
      apiKey: anthropicKey,
      system: judgeSystem,
      user: judgeUser,
      maxTokens: 400,
      temperature: 0
    });
    if (!result) return null;
    // Strip markdown fences if Claude wraps the JSON
    const cleaned = result.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.score !== 'number') return null;
    return parsed;
  } catch (err) {
    console.warn('[PREVIEW-WORKER] Judge failed, soft-passing:', err.message);
    return null;
  }
}

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;

  if (!supabaseUrl || !supabaseKey || !anthropicKey || !elevenKey) {
    console.error('[PREVIEW-WORKER] Missing env vars');
    return resp({ ok: false, error: 'env' }, 500);
  }

  let storyId;
  try {
    const body = await req.json();
    storyId = body?.storyId || body?.story_id;
  } catch {}
  if (!storyId) {
    const url = new URL(req.url);
    storyId = url.searchParams.get('storyId') || url.searchParams.get('story_id');
  }
  if (!storyId) return resp({ ok: false, error: 'storyId required' }, 400);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  console.log('[PREVIEW-WORKER] Story', storyId);

  const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,story_data,status`, { headers });
  if (!sRes.ok) {
    console.error('[PREVIEW-WORKER] Lookup failed:', sRes.status);
    return resp({ ok: false, error: 'lookup failed' }, 500);
  }
  const sRows = await sRes.json();
  if (!sRows.length) return resp({ ok: false, error: 'story not found' }, 404);

  const story = sRows[0];
  const rawData = story.story_data || {};
  const brief = rawData.brief;
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
    console.error('[PREVIEW-WORKER] No brief on story_data');
    await markFailed(supabaseUrl, headersJson, storyId, 'No brief available; run brief analyst first');
    return resp({ ok: false, error: 'no brief' }, 400);
  }

  const storyData = sanitiseStoryData(v2ToV1(rawData));

  // Generate the FULL ~2200-word story (not just the preview) so the preview
  // is literally the first 2 min of the same story the customer will get.
  // Single Claude call: same source of truth for both audio passes.
  const fullWordCount = getWordCount('long', storyData);
  const category = storyData.category || 'bedtime';
  console.log('[PREVIEW-WORKER] Generating FULL story text (' + fullWordCount + ' words target)…');

  // Generate full story. Up to 2 attempts: if the first preview's cliffhanger
  // judge scores below CLIFFHANGER_JUDGE_THRESHOLD, regenerate with extra
  // emphasis on the cliffhanger requirement. Second failure → soft-block flag.
  let storyText;
  let previewPrefix;
  let wordsInPrefix;
  let sliceKind;
  let judgeResult = null;
  let cliffhangerFlag = null; // string set to a reason if we soft-block

  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryNote = attempt === 2
      ? '\n\nIMPORTANT — RETRY: the previous attempt landed the preview cut on a SOFT BEAT and lost the cliffhanger. The first ~290 words MUST end on the unresolved beat described in `preview_cliffhanger.beat`. Plant the setup, land the beat, close the paragraph on it. The next paragraph can begin Act 1\'s continuation. Do not let the cut fall on a satisfying or complete moment.'
      : '';
    try {
      const userPrompt = buildUserPrompt(brief, fullWordCount, category) + retryNote;
      storyText = await callClaude({
        apiKey: anthropicKey,
        system: SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: 16000,
        temperature: 1
      });
      if (!storyText) throw new Error('Empty story text');
    } catch (err) {
      console.error(`[PREVIEW-WORKER] Text generation failed (attempt ${attempt}):`, err.message);
      if (attempt === 2) {
        await markFailed(supabaseUrl, headersJson, storyId, err.message?.slice(0, 500));
        return resp({ ok: false, error: 'text generation failed' }, 500);
      }
      continue;
    }

    // Slice. Then judge the cliffhanger.
    const sliced = sliceForPreview(storyText);
    previewPrefix = sliced.prefix;
    wordsInPrefix = sliced.wordsInPrefix;
    sliceKind = sliced.kind;
    console.log(`[PREVIEW-WORKER] attempt ${attempt}: ${wordsInPrefix} words, cut=${sliceKind}`);

    judgeResult = await judgeCliffhanger(previewPrefix, anthropicKey);
    if (judgeResult) {
      console.log(`[PREVIEW-WORKER] Judge score: ${judgeResult.score} — "${judgeResult.last_sentence}" — ${judgeResult.reasoning}`);
    } else {
      console.log('[PREVIEW-WORKER] Judge unavailable; soft-passing');
    }

    if (!judgeResult || judgeResult.score >= CLIFFHANGER_JUDGE_THRESHOLD) {
      // Judge passed (or unavailable). Ship.
      cliffhangerFlag = null;
      break;
    }

    if (attempt === 2) {
      // Both attempts failed the judge. Soft-block: deliver anyway (SLA matters)
      // but flag for human review in admin.
      cliffhangerFlag = `cliffhanger judge failed twice — final score ${judgeResult.score}, last sentence: "${judgeResult.last_sentence}"`;
      console.warn('[PREVIEW-WORKER] Soft-block:', cliffhangerFlag);
    }
  }

  const fullStoryWordCount = storyText.split(/\s+/).filter(Boolean).length;
  const previewText = previewPrefix + PREVIEW_TEASER;
  console.log('[PREVIEW-WORKER] Preview prefix: ' + wordsInPrefix + ' words, full story: ' + fullStoryWordCount + ' words');

  // Direct-purchase flow: customers no longer hear a preview before paying, so
  // we skip the ElevenLabs TTS step here. Story text is persisted so full-worker
  // can render the audio after payment without re-calling Claude. preview_text
  // is still saved for admin visibility.
  const updatedData = {
    ...rawData,
    cliffhanger_judge: judgeResult ? {
      score: judgeResult.score,
      last_sentence: judgeResult.last_sentence,
      reasoning: judgeResult.reasoning,
      flagged: !!cliffhangerFlag,
      flag_reason: cliffhangerFlag,
      slice_kind: sliceKind,
      checked_at: new Date().toISOString()
    } : { skipped: true, checked_at: new Date().toISOString() }
  };
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({
      preview_text: previewText,         // prefix + teaser (admin reference only)
      story_text: storyText,             // full ~2200-word story, for full-worker
      story_data: updatedData,           // includes cliffhanger_judge result
      preview_ready_at: new Date().toISOString(),
      status: 'preview_ready'
    })
  });

  console.log('[PREVIEW-WORKER] Done. Story text persisted (' + storyText.length + ' chars). Preview TTS skipped (direct-purchase flow).');
  return resp({ ok: true });
};

async function markFailed(supabaseUrl, headersJson, storyId, error) {
  await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ status: 'preview_failed' })
  }).catch(() => {});
  console.error('[PREVIEW-WORKER] Marked failed:', error);
}

// trimToWordCount + prepareTTSText helpers no longer live in this file.
// Slicing now happens at paragraph boundaries via sliceAtParagraphBreak above.
// TTS text prep + chunked TTS live in lib/tts-text.mjs and lib/audio-pipeline.mjs.

function resp(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }

export const config = { type: 'experimental-background' };
