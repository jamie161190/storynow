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

  // ── Comedy Clip: Vision + Absurd Narration + TTS ──
  if (action === 'comedy-clip') {
    return handleComedyClip(body);
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

// ── Quick Snippet: Short text + instant TTS ──
async function handleSnippetGeneration({ childName, about, duration, voiceId }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !elevenLabsKey) return json({ error: 'APIs not configured' }, 500);

  // Calculate approximate word count for the duration
  // Average narration speed: ~150 words per minute = 2.5 words per second
  const targetWords = Math.round((duration || 10) * 2.5);

  const snippetPrompt = `Write a short, emotionally powerful story snippet for a child named ${childName || 'the child'}.
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
        max_tokens: 500,
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

// ── Comedy Clip: Analyse image + write absurd narration + TTS ──
async function handleComedyClip({ frame, childName, style, duration, voiceId, extraContext }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !elevenLabsKey) return json({ error: 'APIs not configured' }, 500);

  if (!frame) return json({ error: 'No image/frame provided' }, 400);

  const name = childName || 'the child';

  const styleGuides = {
    epic: `You are the most dramatic narrator in cinematic history. Think Lord of the Rings meets a toddler eating spaghetti. Everything this child does is THE most important event in human history. Use dramatic pauses (...), build tension, deliver punchlines through sheer seriousness. The gap between what is actually happening and how seriously you narrate it IS the comedy.`,
    documentary: `You are David Attenborough narrating a nature documentary about children. Observe this small human specimen with scientific fascination and gentle wonder. Use hushed, reverent tones. Describe their mundane actions as if documenting a rare species in its natural habitat. "And here... we observe the juvenile homo sapiens attempting what scientists call... a backward roll."`,
    breaking: `You are a breathless breaking news anchor reporting LIVE on what this child is doing. This is URGENT. The nation needs to know. Cut between dramatic updates. "BREAKING: Sources confirm ${name} has, I repeat HAS, put BOTH shoes on the wrong feet. We go live to the scene." Use news anchor cadence and urgency for something completely trivial.`,
    fairytale: `You are a bedtime storyteller who has gone completely off-script. Start like a beautiful fairy tale but the "quest" is whatever mundane thing the child is actually doing. "In a land far, far away... well, the living room... a brave warrior named ${name} faced their greatest challenge yet..." Make it whimsical, silly, and heartwarming at the same time.`,
    sports: `You are an unhinged sports commentator losing your mind over whatever this child is doing. Full-throttle energy. "AND ${name.toUpperCase()} TAKES THE SPOON... THE CROWD IS ON THEIR FEET... CAN THEY DO IT?! CAN THEY GET THE YOGHURT TO THEIR MOUTH?!" React to everything like it is the World Cup final.`,
    horror: `You are narrating a horror movie trailer... but about the most innocent thing a child is doing. Build dread and suspense around something completely harmless. "They thought bedtime would be peaceful... they were wrong." Use long pauses, ominous tone, dark atmosphere... for something like a child refusing to wear socks. The contrast is everything.`,
    heist: `You are narrating an Ocean's Eleven style heist movie. This child is the mastermind pulling off the job of the century. Whatever they are doing is actually phase 3 of a carefully orchestrated plan. "Step one: distract the parents. Step two: secure the biscuit tin. ${name} had been planning this for weeks." Cool, slick, confident narration.`,
    romance: `You are narrating an epic love story... between a child and whatever object or food they are interacting with. Full romantic drama. Longing glances. Tender moments. "From the moment ${name} laid eyes on that last chocolate biscuit... they knew. They just knew." Use every romance trope for something absurd.`
  };

  const chosenStyle = styleGuides[style] || styleGuides.epic;

  const visionPrompt = `Look at this image of a child. Describe EXACTLY what you see happening in one short paragraph. Be specific about their expression, posture, what they are doing, what is around them. This description will be used to write comedy narration, so notice the funny, mundane, or silly details.`;

  try {
    // Step 1: Vision analysis
    const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } },
            { type: 'text', text: visionPrompt }
          ]
        }]
      })
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      console.error('[COMEDY] Vision error:', visionRes.status, errText);
      return json({ error: 'Could not analyse the image. Try again.' }, 500);
    }

    const visionData = await visionRes.json();
    let sceneDescription = '';
    for (const block of visionData.content) {
      if (block.type === 'text') sceneDescription += block.text;
    }

    // Step 2: Generate comedy narration (using same audio formatting as real Storytold stories)
    const narrationPrompt = `${chosenStyle}

WHAT IS ACTUALLY HAPPENING IN THE CLIP:
${sceneDescription}

The child's name is ${name}.${extraContext ? `\nExtra context from the parent: ${extraContext}` : ''}

Write a narration for this clip. Make it as long or short as it naturally needs to be. Let the comedy breathe. This will be read aloud by a text-to-speech voice narrator over the clip.

AUDIO FORMATTING RULES (CRITICAL - this is read aloud by TTS):
- Use three dots ( ... ) to create breath pauses. Place them at moments of suspense, reveals, and before punchlines. Aim for one pause every 30-40 words minimum. Example: "And there, standing in the middle of the kitchen ... was ${name}."
- Use double pauses ( ... ... ) for big dramatic moments or scene shifts.
- Use these audio tags SPARINGLY at key moments (2-4 max for a short clip):
  [whispers] before secrets or hushed dramatic reveals. Example: "[whispers] No one saw it coming."
  [laughs softly] during genuinely funny observations. Example: "And then it happened. [laughs softly]"
  [gasps] before big reveals or fake shock. Example: "[gasps] The yoghurt. It was everywhere."
  [excitedly] before high energy moments. Example: "[excitedly] This was it. The moment of truth."
  [sighs] for mock relief or fake contentment.
- Place audio tags at the START of the sentence they apply to.
- NEVER use more than one audio tag per paragraph.
- Vary sentence length deliberately. Short punchy beats. Then a longer flowing sentence that carries the listener forward. Then a one word sentence. Boom. This creates natural audio rhythm.
- No parentheses, asterisks, em dashes, or any visual formatting. Only plain text with ... pauses and [audio tags].
- Vary dialogue attribution if any characters speak. Not just "said". Use: whispered, called, shouted, murmured, exclaimed, declared.

COMEDY RULES:
- Use ${name}'s name at least twice, naturally woven in
- The comedy comes from the CONTRAST between what is actually happening and how you narrate it
- Do NOT describe what you see literally. Transform it through your narration style.
- Must be laugh-out-loud funny for any parent watching
- Write ONLY the narration text. No titles, labels, or metadata.
- End with something that would make a parent smile or laugh
- Never break character. Commit fully to the style.
- The final line should land with a pause before it. Make it the best line.`;

    const textRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: narrationPrompt }]
      })
    });

    if (!textRes.ok) return json({ error: 'Script generation failed' }, 500);

    const textData = await textRes.json();
    let narrationText = '';
    for (const block of textData.content) {
      if (block.type === 'text') narrationText += block.text;
    }

    // Step 3: TTS with selected voice
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: narrationText,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
      })
    });

    if (!ttsRes.ok) {
      return json({ success: true, storyText: narrationText, sceneDescription, childName: name, style, duration, error: 'Voice generation failed but script is ready.' });
    }

    const audioBase64 = Buffer.from(await ttsRes.arrayBuffer()).toString('base64');

    return json({
      success: true,
      storyText: narrationText,
      sceneDescription,
      audio: audioBase64,
      childName: name,
      style,
      duration
    });

  } catch (e) {
    console.error('[COMEDY] Error:', e.message);
    return json({ error: 'Comedy clip generation failed: ' + e.message }, 500);
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
