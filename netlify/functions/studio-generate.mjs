// Studio Content Generator: Claude-powered marketing content + quick story snippets.
// Handles: ping (auth check), generate (content AI), snippet (quick audio snippet).

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return json({ error: 'Studio not configured' }, 500);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  // Auth check
  const authHeader = req.headers.get('x-admin-secret');
  if (authHeader !== adminSecret) {
    // Brute-force protection
    const clientIP = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (supabaseUrl && supabaseKey) {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const rlCheck = await fetch(
          `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent('studio_fail_' + clientIP)}&created_at=gte.${oneHourAgo}&select=id`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        if (rlCheck.ok) {
          const failures = await rlCheck.json();
          if (failures.length >= 5) return json({ error: 'Too many failed attempts. Locked for 1 hour.' }, 429);
        }
        await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'studio_fail_' + clientIP, created_at: new Date().toISOString() })
        });
      } catch (e) { /* best effort */ }
    }
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const { action } = body;

  // ── Ping (auth check) ──
  if (action === 'ping') {
    return json({ ok: true });
  }

  // ── Content AI Generation ──
  if (action === 'generate') {
    return handleContentGeneration(body);
  }

  // ── Quick Snippet (text + TTS) ──
  if (action === 'snippet') {
    return handleSnippetGeneration(body);
  }

  // ── Generate Music via ElevenLabs Sound Effects API ──
  if (action === 'generate-music') {
    return handleMusicGeneration(body);
  }

  return json({ error: 'Unknown action' }, 400);
};

// ── Content AI: Claude generates marketing content ──
async function handleContentGeneration({ goal, platform, contentType, audience, angle, tone, customContext }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'AI not configured' }, 500);

  const systemPrompt = buildContentSystemPrompt();
  const userPrompt = buildContentUserPrompt({ goal, platform, contentType, audience, angle, tone, customContext });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[STUDIO] Claude error:', response.status, errText);
      return json({ error: 'Content generation failed. Try again.' }, 500);
    }

    const result = await response.json();
    let content = '';
    for (const block of result.content) {
      if (block.type === 'text') content += block.text;
    }

    return json({ content });
  } catch (e) {
    console.error('[STUDIO] Content generation error:', e.message);
    return json({ error: 'Generation failed: ' + e.message }, 500);
  }
}

// ── Your Story: Clean up user's rough story + TTS ──
async function handleSnippetGeneration({ childName, storyInput, about, duration, voiceId }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !elevenLabsKey) return json({ error: 'APIs not configured' }, 500);

  // If user provided their own story, clean it up. Otherwise fall back to old generation mode.
  const hasUserStory = storyInput && storyInput.trim().length > 10;

  let snippetPrompt;
  if (hasUserStory) {
    snippetPrompt = `You are the Storytold audio story editor. A user has written a rough story in their own words. Your job is to clean it up into a beautifully narrated story, keeping EXACTLY the same story, same beats, same moments, same characters, same dialogue — just polished for audio narration.

The child's name is ${childName || 'the child'}.

Here is the user's rough story:
"""
${storyInput}
"""

RULES:
- Keep the EXACT same story the user told. Do not add new plot points, remove scenes, or change what happens.
- Keep all the same characters and dialogue moments.
- Polish the language: fix grammar, improve flow, add vivid details where natural.
- Format for audio narration using Storytold formatting rules:
  - Use ... for breath pauses at suspense, wonder, scene transitions, emotional reveals
  - Add a pause every 30-40 words
  - Use ... ... for longer scene-change pauses
  - Use audio tags sparingly (2-4 max): [whispers], [laughs softly], [gasps], [excitedly], [sighs]
  - Vary sentence length: short punchy beats, then flowing, then one-word. Boom.
  - Make dialogue feel alive with varied attribution (said, called out, whispered, laughed)
  - NO em dashes, parentheses, or asterisks
- Use ${childName}'s name naturally throughout
- Do not include any titles, headings, or metadata. Just the polished story text.
- The tone should be warm, magical, and narrated — like a professional storyteller reading aloud.
- Match the length and energy of what the user wrote. If they wrote a short moment, keep it short. If they wrote a long story, keep it long.`;
  } else {
    // Legacy fallback: generate a snippet from scratch
    const targetWords = Math.round((duration || 10) * 2.5);
    snippetPrompt = `Write a short, emotionally powerful story snippet for a child named ${childName || 'the child'}.
${about ? `About them: ${about}` : ''}

This must be EXACTLY ${targetWords} words (give or take 5 words). It will be read aloud by a narrator as audio for a marketing ad.

Requirements:
- Use ${childName}'s name at least twice
- Make it feel magical, personal, and emotionally moving
- It should sound like the opening or climax of a personalised bedtime story
- Write for audio narration (use pauses with ... for dramatic effect)
- Do not include any titles, headings, or metadata. Just the story text.
- The listener should think "I need this for my child" after hearing it

Example tone: "${childName} didn't know it yet... but tonight's story was different. Tonight, the hero had their name... their best friend... and a secret only they could unlock."`;
  }

  try {
    // Step 1: Generate snippet text with Claude
    const textResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: hasUserStory ? 4096 : 500,
        messages: [{ role: 'user', content: snippetPrompt }]
      })
    });

    if (!textResponse.ok) {
      return json({ error: 'Text generation failed' }, 500);
    }

    const textResult = await textResponse.json();
    let storyText = '';
    for (const block of textResult.content) {
      if (block.type === 'text') storyText += block.text;
    }

    // Step 2: Generate TTS audio with ElevenLabs
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: storyText,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
      })
    });

    if (!ttsResponse.ok) {
      // Return text even if TTS fails
      return json({ storyText, error: 'Voice generation failed, but text is available.' });
    }

    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');

    return json({
      success: true,
      storyText,
      audio: audioBase64,
      childName,
      duration
    });
  } catch (e) {
    console.error('[STUDIO] Snippet error:', e.message);
    return json({ error: 'Snippet generation failed: ' + e.message }, 500);
  }
}

// ── System Prompt for Content AI ──
function buildContentSystemPrompt() {
  return `You are the marketing brain behind Storytold (storytold.ai), a personalised children's story product. You create marketing content that sells the feeling, never the technology.

PRODUCT KNOWLEDGE:
- Storytold creates personalised audio stories for children aged 2-14
- Parents fill in their child's details (name, age, best friend, interests, pet, personal message)
- A professional narrator voice reads a unique story that uses the child's name 8+ times
- The child's best friend has a role, their pet does something memorable, their interests drive the plot
- A personal message from the parent is read aloud at the start ("Chase, this is from Daddy...")
- Free 30-second preview before payment. The preview IS the sales tool.
- Price: 19.99 GBP. One payment. No subscription. Theirs forever.
- 24 narrator voices across 3 categories: Bedtime, Journey/Adventure, Learning
- Not perfect? Free rewrite guarantee.
- The word "AI" must NEVER appear in customer-facing content. This is about magic, not technology.

BRAND VOICE:
- Warm, simple, emotional without being sentimental
- Speak like a parent who built this for their own child
- Never use corporate language, jargon, or em dashes
- Use "we" for the product, "you/your child/their" for the customer
- Playful and colourful tone. Think CBeebies meets premium children's brand.

KEY SELLING POINTS:
- "A story that knows their name" (tagline)
- Preview before payment eliminates trust problem
- Personal message read aloud is the most powerful feature
- "Even the family dog has a role"
- "You can make yourself the villain"
- Perfect gift: birthdays, Christmas, christenings, just because

COMPETITORS:
Childbook.ai, StoryBee, ReadKidz are all DIY tools where parents build stories themselves. Storytold is done-for-you. Fill in the form, hear the story. Different buying experience entirely.

CRITICAL RULES:
- Never mention AI, machine learning, or algorithms
- Never use em dashes or en dashes
- Sell the feeling: the moment a child hears their name, the parent's tears, the gift that actually means something
- The preview moment is the most powerful marketing tool. A parent pressing play and hearing their child's name for the first time is worth more than any ad.
- User generated reaction videos of parents pressing play are worth more than any ad budget`;
}

// ── Build user prompt based on selections ──
function buildContentUserPrompt({ goal, platform, contentType, audience, angle, tone, customContext }) {
  let prompt = `Create ${contentType} content for Storytold.\n\n`;
  prompt += `GOAL: ${goal === 'viral' ? 'Viral content opportunity - create something people NEED to share' : 'Direct conversion - drive purchases'}\n`;
  prompt += `PLATFORM: ${platform}\n`;
  prompt += `AUDIENCE: ${audience}\n`;
  prompt += `ANGLE: ${angle}\n`;
  prompt += `TONE: ${tone}\n`;

  if (customContext) {
    prompt += `\nADDITIONAL CONTEXT: ${customContext}\n`;
  }

  // Platform-specific formatting rules
  const platformRules = {
    meta: '\nMETA/FACEBOOK FORMAT RULES:\n- Primary text: max 125 characters for best visibility\n- Headline: max 40 characters\n- Description: max 30 characters\n- Include clear CTA\n- Create 3 variations\n',
    tiktok: '\nTIKTOK FORMAT RULES:\n- Super casual, conversational tone\n- Use "POV:", "Wait for it...", "This is your sign to..." style hooks\n- Hashtag suggestions at the end\n- Create 3 variations\n',
    google: '\nGOOGLE ADS FORMAT RULES:\n- Headline 1: max 30 characters\n- Headline 2: max 30 characters\n- Headline 3: max 30 characters\n- Description 1: max 90 characters\n- Description 2: max 90 characters\n- Create 3 variations\n',
    youtube: '\nYOUTUBE FORMAT RULES:\n- Title: attention-grabbing, max 60 characters\n- Description: first 2 lines visible before "Show more"\n- Tags: 10-15 relevant tags\n- Create 3 variations\n',
    general: '\nFORMAT: Create versatile content that can be adapted for any platform.\n'
  };

  prompt += platformRules[platform] || platformRules.general;

  // Content type specific instructions
  const typeInstructions = {
    adcopy: '\nDELIVER: For each variation, provide:\n## Variation 1\nHeadline:\nPrimary Text:\nDescription:\nCTA:\n(Repeat for each variation)',
    hooks: '\nDELIVER: 10 scroll-stopping hook lines. Each one should make a parent stop scrolling instantly. Number them 1-10. Mix emotional, curiosity, and urgency hooks.',
    videoscript: '\nDELIVER: A detailed video script with:\n## Scene-by-Scene Breakdown\nFor each scene: Duration, Visual description, Voiceover/text overlay, Music/sound notes\n\nInclude total runtime estimate. Target 15-30 seconds unless specified otherwise.',
    captions: '\nDELIVER: 3 social media captions with:\n- The post copy (with line breaks for readability)\n- Hashtag set (15 hashtags)\n- Best time to post suggestion',
    brief: '\nDELIVER: A complete marketing brief with:\n## Target Audience\n## Key Messages\n## Creative Direction\n## Content Calendar (1 week)\n## KPIs & Success Metrics\n## Budget Allocation Suggestion'
  };

  prompt += typeInstructions[contentType] || '';

  // Angle-specific context
  if (angle === 'memorial') {
    prompt += '\n\nMEMORIAL ANGLE RULES (HANDLE WITH EXTREME CARE):\n- NEVER use: dead, died, passed, gone, deceased, loss, grief, mourning\n- ALWAYS use: "keep their voice alive", "some voices should never be forgotten"\n- The ad never explains. It makes you feel it. The viewer fills in the meaning.\n- This angle can go viral organically with one real family willing to share their story.';
  }

  return prompt;
}

// ── Music Generation via ElevenLabs Sound Effects API ──
async function handleMusicGeneration({ description, duration, autoSuggest, context }) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) return json({ error: 'ElevenLabs not configured' }, 500);

  let musicDesc = description;

  // If autoSuggest, use Claude to create the ideal music description
  if (autoSuggest && context) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const suggestRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 200,
            messages: [{ role: 'user', content: `You are a music director for Storytold, a personalised children's story brand. Based on this context, write a short 1-2 sentence description of the ideal background music for this content. Be specific about instruments, tempo, mood, and style. The description will be sent to an AI music generator.

Context: ${context}

Return ONLY the music description, nothing else.` }]
          })
        });
        if (suggestRes.ok) {
          const suggestData = await suggestRes.json();
          for (const block of suggestData.content) {
            if (block.type === 'text') musicDesc = block.text;
          }
        }
      } catch (e) { /* fall back to user description */ }
    }
  }

  if (!musicDesc) return json({ error: 'Music description required' }, 400);

  try {
    const sfxRes = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: musicDesc,
        duration_seconds: Math.min(Math.max(duration || 15, 0.5), 30),
        prompt_influence: 0.5
      })
    });

    if (!sfxRes.ok) {
      const errText = await sfxRes.text();
      console.error('[STUDIO] ElevenLabs SFX error:', sfxRes.status, errText);
      return json({ error: 'Music generation failed. ElevenLabs returned ' + sfxRes.status }, 500);
    }

    const audioBase64 = Buffer.from(await sfxRes.arrayBuffer()).toString('base64');
    return json({
      success: true,
      audio: audioBase64,
      description: musicDesc,
      duration: duration || 15
    });
  } catch (e) {
    console.error('[STUDIO] Music generation error:', e.message);
    return json({ error: 'Music generation failed: ' + e.message }, 500);
  }
}

// ── Helpers ──
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export const config = { path: '/api/studio-generate' };
