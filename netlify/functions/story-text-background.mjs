// Background function: runs the two-stage pipeline for a story.
// Stage 1: middle layer (brief analyst) turns raw storyData into a JSON brief.
// Stage 2: story writer consumes the brief and produces the story text.
//
// Uses Lambda handler format (required for Netlify background functions).

import { SYSTEM_PROMPT, buildUserPrompt, sanitiseStoryData, getWordCount } from './lib/story-prompts.mjs';
import { analyzeBrief } from './lib/brief-analyst.mjs';

export const handler = async (event) => {
  try {
    const { storyId } = JSON.parse(event.body || '{}');
    if (!storyId) {
      console.error('[STORY-TEXT-BG] Missing storyId');
      return { statusCode: 400 };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('[STORY-TEXT-BG] Missing env vars');
      return { statusCode: 500 };
    }

    const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
    const headersJson = { ...headers, 'Content-Type': 'application/json' };

    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=*&limit=1`,
      { headers }
    );
    if (!storyRes.ok) { console.error('[STORY-TEXT-BG] Failed to fetch story'); return { statusCode: 500 }; }
    const stories = await storyRes.json();
    if (!stories.length) { console.error('[STORY-TEXT-BG] Story not found:', storyId); return { statusCode: 404 }; }
    const story = stories[0];

    if (story.story_text && story.story_text.split(/\s+/).length > 100) {
      console.log('[STORY-TEXT-BG] Story already has text, skipping:', storyId);
      return { statusCode: 200 };
    }

    const sd = sanitiseStoryData(story.story_data || {});
    const hasFeedback = story.feedback && story.feedback.trim();
    const category = sd.category || 'bedtime';
    const wordCount = getWordCount(sd.length, sd); // uses oldest child for multi-child

    console.log('[STORY-TEXT-BG]', hasFeedback ? 'Regenerating with notes' : 'Generating new text',
                'for', storyId, sd.childName, '(age', sd.age, ',', category + ')');

    // ───── Stage 1: brief analyst ─────
    console.log('[STORY-TEXT-BG] Calling brief analyst...');
    let brief;
    try {
      brief = await analyzeBrief(sd);
    } catch (err) {
      console.error('[STORY-TEXT-BG] Brief analyst failed:', err.message);
      return { statusCode: 500 };
    }
    console.log('[STORY-TEXT-BG] Brief confidence:', brief.confidence, 'flags:', JSON.stringify(brief.flags || []));
    if (brief.confidence === 'low') {
      console.warn('[STORY-TEXT-BG] LOW CONFIDENCE BRIEF for', storyId, '— proceeding but review recommended.');
    }
    console.log('[STORY-TEXT-BG] Full brief:', JSON.stringify(brief, null, 2));

    // Save brief to DB (for debugging; never shown in admin UI)
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ brief })
    });

    // ───── Stage 2: story writer ─────
    const userPrompt = buildUserPrompt(brief, wordCount, category, {
      adminFeedback: hasFeedback ? story.feedback.trim() : null
    });

    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    console.log('[STORY-TEXT-BG] Calling writer...');
    let apiResponse;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: apiBody
        });
      } catch (networkErr) {
        console.log('[STORY-TEXT-BG] Network error attempt ' + (attempt + 1) + ': ' + networkErr.message);
        if (attempt < 4) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
        throw networkErr;
      }
      if (apiResponse.ok) break;
      const shouldRetry = apiResponse.status === 429 || apiResponse.status === 529 || apiResponse.status >= 500;
      if (attempt < 4 && shouldRetry) {
        const waitMs = apiResponse.status === 429 ? 8000 : 4000 * (attempt + 1);
        console.log('[STORY-TEXT-BG] Anthropic ' + apiResponse.status + ', retry in ' + waitMs + 'ms');
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
    }

    if (!apiResponse || !apiResponse.ok) {
      const status = apiResponse ? apiResponse.status : 'no-response';
      const errBody = apiResponse ? await apiResponse.text() : '';
      console.error('[STORY-TEXT-BG] Writer API error:', status, errBody.slice(0, 300));
      return { statusCode: 500 };
    }

    const genResult = await apiResponse.json();
    let storyText = '';
    for (const block of genResult.content) { if (block.type === 'text') storyText += block.text; }
    storyText = storyText.trim();

    if (!storyText || storyText.split(/\s+/).length < 100) {
      console.error('[STORY-TEXT-BG] Writer returned insufficient text:', storyText ? storyText.split(/\s+/).length + ' words' : 'empty');
      return { statusCode: 500 };
    }

    // Post-processing: optional personal message intro + Hear Their Name signature suffix.
    let messageIntro = '';
    if (sd.personalMessage) {
      messageIntro = 'Before we begin, there is a special message for ' + sd.childName + '. ... ' + sd.personalMessage + ' ... And now, on with the story. ... ';
    }
    const fullText = messageIntro + storyText + ' ... ... A Hear Their Name original ... made with love.';

    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ story_text: fullText, status: 'pending' })
    });

    const wordCountDone = fullText.split(/\s+/).length;
    console.log('[STORY-TEXT-BG] Complete:', wordCountDone, 'words for', sd.childName, '(' + storyId + ')');
    return { statusCode: 200 };

  } catch (err) {
    console.error('[STORY-TEXT-BG] Error:', err.message);
    return { statusCode: 500 };
  }
};
