// Studio Snippet Background Worker: Generates polished story text + TTS audio.
// Triggered by studio-generate.mjs, saves result to Supabase storage for polling.

export default async (req) => {
  let jobId;
  try {
    const { jobId: jid, childName, storyInput, about, duration, durationMins, voiceId } = await req.json();
    jobId = jid;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!apiKey || !elevenLabsKey || !supabaseUrl || !supabaseKey) {
      console.error('[SNIPPET-BG] Missing env vars');
      await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'APIs not configured' });
      return new Response('ok');
    }

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
- TARGET LENGTH: Approximately ${Math.round((durationMins || 0.5) * 150)} words (~${durationMins || 0.5} minutes of narration at ~150 words per minute). Expand or condense the user's story to hit this target while keeping all the same beats and moments.`;
    } else {
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

    // Step 1: Generate text with Claude
    console.log('[SNIPPET-BG] Generating text for:', childName, 'duration:', durationMins);
    const textResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: Math.max(4096, Math.round((durationMins || 0.5) * 150 * 2)),
        messages: [{ role: 'user', content: snippetPrompt }]
      })
    });

    if (!textResponse.ok) {
      const errBody = await textResponse.text();
      console.error('[SNIPPET-BG] Claude error:', textResponse.status, errBody);
      await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'Story generation failed' });
      return new Response('ok');
    }

    const textResult = await textResponse.json();
    let storyText = '';
    for (const block of textResult.content) {
      if (block.type === 'text') storyText += block.text;
    }
    console.log('[SNIPPET-BG] Text generated, words:', storyText.split(' ').length);

    // Step 2: Generate TTS with ElevenLabs
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

    let audioBase64 = null;
    if (ttsResponse.ok) {
      audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
      console.log('[SNIPPET-BG] TTS generated, audio size:', audioBase64.length);
    } else {
      console.error('[SNIPPET-BG] TTS failed:', ttsResponse.status);
    }

    // Step 3: Save result
    await saveResult(supabaseUrl, supabaseKey, jobId, {
      success: true,
      storyText,
      audio: audioBase64,
      childName,
      duration: durationMins
    });

    console.log('[SNIPPET-BG] Done:', jobId);
  } catch (e) {
    console.error('[SNIPPET-BG] Error:', e.message);
    if (jobId) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY;
        if (supabaseUrl && supabaseKey) {
          await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'Generation failed: ' + e.message });
        }
      } catch (_) {}
    }
  }

  return new Response('ok');
};

async function saveResult(supabaseUrl, supabaseKey, jobId, data) {
  await fetch(`${supabaseUrl}/storage/v1/object/stories/studio-jobs/${jobId}.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
      'x-upsert': 'true'
    },
    body: JSON.stringify(data)
  });
}
