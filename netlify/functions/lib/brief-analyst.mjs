// Brief analyst: takes raw storyData, calls Claude with the middle-layer
// prompt, returns the parsed JSON brief that the story writer consumes.

import { buildBriefPrompt } from './middle-layer-prompt.mjs';

const MODEL = 'claude-sonnet-4-6';
const TEMPERATURE = 0.3;
// Spec suggested 2000; bumped to 4000 after a large-cast brief was truncated.
const MAX_TOKENS = 4000;

// Retry on 429/529/5xx with exponential backoff. Matches pattern used by
// story-text-background / full-worker-background.
export async function analyzeBrief(storyData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const prompt = buildBriefPrompt(storyData);
  const apiBody = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [{ role: 'user', content: prompt }]
  });

  let apiResponse;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: apiBody
      });
    } catch (networkErr) {
      console.log('[BRIEF-ANALYST] Network error attempt ' + (attempt + 1) + ': ' + networkErr.message);
      if (attempt < 4) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
      throw networkErr;
    }
    if (apiResponse.ok) break;
    const shouldRetry = apiResponse.status === 429 || apiResponse.status === 529 || apiResponse.status >= 500;
    if (attempt < 4 && shouldRetry) {
      const waitMs = apiResponse.status === 429 ? 8000 : 4000 * (attempt + 1);
      console.log('[BRIEF-ANALYST] Anthropic ' + apiResponse.status + ', retry in ' + waitMs + 'ms');
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    break;
  }

  if (!apiResponse || !apiResponse.ok) {
    const status = apiResponse ? apiResponse.status : 'no-response';
    const errBody = apiResponse ? await apiResponse.text() : '';
    throw new Error(`Brief analyst API error ${status}: ${errBody.slice(0, 300)}`);
  }

  const result = await apiResponse.json();
  let rawText = '';
  for (const block of result.content) { if (block.type === 'text') rawText += block.text; }
  rawText = rawText.trim();

  // Claude sometimes wraps JSON in fences even when told not to — strip them.
  const fenceMatch = rawText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) rawText = fenceMatch[1].trim();

  try {
    const brief = JSON.parse(rawText);
    return brief;
  } catch (parseErr) {
    console.error('[BRIEF-ANALYST] JSON parse failed. Raw response:', rawText.slice(0, 2000));
    throw new Error('Brief analyst returned invalid JSON: ' + parseErr.message);
  }
}
