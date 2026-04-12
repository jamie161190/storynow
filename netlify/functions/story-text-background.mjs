// Background function: generates story text via Claude on submission.
// Uses Lambda handler format (required for background functions).
// Matches the proven Claude call pattern from full-worker-background.

import { SYSTEM_PROMPT, buildCompleteStoryPrompt, buildRegeneratePrompt } from './lib/story-prompts.mjs';

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

    const sd = story.story_data || {};
    const hasFeedback = story.feedback && story.feedback.trim();
    console.log('[STORY-TEXT-BG]', hasFeedback ? 'Regenerating with notes' : 'Generating new text', 'for', storyId, sd.childName);

    const fullPrompt = hasFeedback ? buildRegeneratePrompt(sd, story.feedback) : buildCompleteStoryPrompt(sd);
    const apiBody = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      temperature: 1,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fullPrompt }]
    });

    // Retry logic matching full-worker-background
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

    if (!apiResponse.ok) {
      const errBody = await apiResponse.text();
      console.error('[STORY-TEXT-BG] Claude API error:', apiResponse.status, errBody.slice(0, 300));
      return { statusCode: 500 };
    }

    const genResult = await apiResponse.json();
    let storyText = '';
    for (const block of genResult.content) { if (block.type === 'text') storyText += block.text; }

    if (!storyText || storyText.split(/\s+/).length < 100) {
      console.error('[STORY-TEXT-BG] Claude returned insufficient text:', storyText ? storyText.split(/\s+/).length + ' words' : 'empty');
      console.error('[STORY-TEXT-BG] Response blocks:', JSON.stringify(genResult.content.map(b => ({ type: b.type, length: (b.text || '').length }))));
      return { statusCode: 500 };
    }

    let messageIntro = '';
    if (sd.personalMessage) {
      messageIntro = 'Before we begin, there is a special message for ' + sd.childName + '. ... ' + sd.personalMessage + ' ... And now, on with the story. ... ';
    }
    const fullText = messageIntro + storyText + ' ... ... A Hear Their Name original ... made with love.';

    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ story_text: fullText, status: 'pending' })
    });

    const wordCount = fullText.split(/\s+/).length;
    console.log('[STORY-TEXT-BG] Text complete:', wordCount, 'words for', sd.childName, '(' + storyId + ')');

    // Auto-chain: trigger TTS generation immediately
    const voiceId = story.voice_id || 'N2lVS1w4EtoT3dr4eOWO';
    console.log('[STORY-TEXT-BG] Chaining to TTS for', storyId, 'voice:', voiceId);
    fetch('https://heartheirname.com/.netlify/functions/full-worker-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'tts-only',
        storyData: sd,
        voiceId: voiceId,
        jobId: storyId,
        storyText: fullText,
        childName: sd.childName
      })
    }).catch(e => console.error('[STORY-TEXT-BG] TTS chain failed:', e.message));

    return { statusCode: 200 };

  } catch (err) {
    console.error('[STORY-TEXT-BG] Error:', err.message);
    return { statusCode: 500 };
  }
};
