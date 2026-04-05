// Comedy Clip Background Worker
// Runs as a Netlify background function (15 min timeout).
// 1. Claude Vision analyses the frame
// 2. Claude generates comedy narration script
// 3. ElevenLabs TTS narrates it
// 4. Result saved to Supabase Storage for polling

export default async (req) => {
  try {
    const body = await req.json();
    const { jobId, frame, childName, style, voiceId, extraContext, duration } = body;

    if (!jobId || !frame) {
      return { statusCode: 400 };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!apiKey || !elevenLabsKey || !supabaseUrl || !supabaseKey) {
      await saveResult(supabaseUrl, supabaseKey, jobId, { error: 'APIs not configured' });
      return { statusCode: 200 };
    }

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

    // Update status: analysing
    await saveResult(supabaseUrl, supabaseKey, jobId, { status: 'analysing' });

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
            { type: 'text', text: 'Look at this image of a child. Describe EXACTLY what you see happening in one short paragraph. Be specific about their expression, posture, what they are doing, what is around them. This description will be used to write comedy narration, so notice the funny, mundane, or silly details.' }
          ]
        }]
      })
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      console.error('[COMEDY] Vision error:', visionRes.status, errText);
      await saveResult(supabaseUrl, supabaseKey, jobId, { error: 'Could not analyse the image. Try again.' });
      return { statusCode: 200 };
    }

    const visionData = await visionRes.json();
    let sceneDescription = '';
    for (const block of visionData.content) {
      if (block.type === 'text') sceneDescription += block.text;
    }

    // Update status: writing
    await saveResult(supabaseUrl, supabaseKey, jobId, { status: 'writing', sceneDescription });

    // Step 2: Generate comedy narration
    const narrationPrompt = `${chosenStyle}

WHAT IS ACTUALLY HAPPENING IN THE CLIP:
${sceneDescription}

The child's name is ${name}.${extraContext ? `\nExtra context from the parent: ${extraContext}` : ''}

${duration ? `Write a narration that is EXACTLY ${Math.round(duration * 2.5)} words (give or take 5 words). This must match a ${duration}-second video clip, so the word count is critical. At ~2.5 words per second, ${Math.round(duration * 2.5)} words = ${duration} seconds of audio.` : 'Write a narration for this clip. Make it as long or short as it naturally needs to be. Let the comedy breathe.'} This will be read aloud by a text-to-speech voice narrator over the clip.

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

    if (!textRes.ok) {
      await saveResult(supabaseUrl, supabaseKey, jobId, { error: 'Script generation failed' });
      return { statusCode: 200 };
    }

    const textData = await textRes.json();
    let narrationText = '';
    for (const block of textData.content) {
      if (block.type === 'text') narrationText += block.text;
    }

    // Update status: narrating
    await saveResult(supabaseUrl, supabaseKey, jobId, { status: 'narrating', sceneDescription, storyText: narrationText });

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
      // Save without audio - script is still valuable
      await saveResult(supabaseUrl, supabaseKey, jobId, {
        success: true,
        storyText: narrationText,
        sceneDescription,
        childName: name,
        style,
        error: 'Voice generation failed but script is ready.'
      });
      return { statusCode: 200 };
    }

    const audioBase64 = Buffer.from(await ttsRes.arrayBuffer()).toString('base64');

    // Save final result
    await saveResult(supabaseUrl, supabaseKey, jobId, {
      success: true,
      storyText: narrationText,
      sceneDescription,
      audio: audioBase64,
      childName: name,
      style
    });

    return { statusCode: 200 };

  } catch (e) {
    console.error('[COMEDY] Background worker error:', e.message);
    try {
      const body = await req.json().catch(() => ({}));
      if (body.jobId) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY;
        if (supabaseUrl && supabaseKey) {
          await saveResult(supabaseUrl, supabaseKey, body.jobId, { error: 'Generation failed: ' + e.message });
        }
      }
    } catch (_) {}
    return { statusCode: 200 };
  }
};

async function saveResult(supabaseUrl, supabaseKey, jobId, data) {
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/comedy-jobs/${jobId}.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error('[COMEDY] Failed to save result:', e.message);
  }
}
