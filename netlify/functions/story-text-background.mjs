// Background function: generates story text via Claude.
// Called fire-and-forget from request-story.mjs on submission.
// Background functions can run up to 15 minutes on Netlify.

import { SYSTEM_PROMPT, buildCompleteStoryPrompt } from './lib/story-prompts.mjs';

export default async (req) => {
  try {
    const { storyId } = await req.json();
    if (!storyId) {
      console.error('[STORY-TEXT-BG] Missing storyId');
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('[STORY-TEXT-BG] Missing env vars');
      return;
    }

    const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
    const headersJson = { ...headers, 'Content-Type': 'application/json' };

    // Fetch the story
    const storyRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=*&limit=1`,
      { headers }
    );
    if (!storyRes.ok) { console.error('[STORY-TEXT-BG] Failed to fetch story'); return; }
    const stories = await storyRes.json();
    if (!stories.length) { console.error('[STORY-TEXT-BG] Story not found:', storyId); return; }
    const story = stories[0];

    // Skip if text already exists
    if (story.story_text) {
      console.log('[STORY-TEXT-BG] Story already has text, skipping:', storyId);
      return;
    }

    const sd = story.story_data || {};
    console.log(`[STORY-TEXT-BG] Generating text for ${storyId} (${sd.childName})...`);

    const fullPrompt = buildCompleteStoryPrompt(sd);
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        temperature: 1,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: fullPrompt }]
      })
    });

    if (!genRes.ok) {
      console.error('[STORY-TEXT-BG] Claude API error:', genRes.status);
      return;
    }

    const genResult = await genRes.json();
    let storyText = '';
    for (const block of genResult.content) { if (block.type === 'text') storyText += block.text; }

    // Add message intro and outro
    let messageIntro = '';
    if (sd.personalMessage) {
      messageIntro = 'Before we begin, there is a special message for ' + sd.childName + '. ... ' + sd.personalMessage + ' ... And now, on with the story. ... ';
    }
    const fullText = messageIntro + storyText + ' ... ... A Hear Their Name original ... made with love.';

    // Save to database
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ story_text: fullText })
    });

    const wordCount = fullText.split(/\s+/).length;
    console.log(`[STORY-TEXT-BG] Complete: ${wordCount} words for ${sd.childName} (${storyId})`);

  } catch (err) {
    console.error('[STORY-TEXT-BG] Error:', err.message);
  }
};

export const config = { path: '/.netlify/functions/story-text-background' };
