// Story Worker Background Function
// Uses direct fetch() calls to Anthropic API and ElevenLabs API.
// ZERO external dependencies - no SDK imports, no bundling issues.

const SYSTEM_PROMPT = `You are the world's greatest children's storyteller. You write stories that make parents cry because of how deeply personal they feel, and make children gasp because they cannot believe the story knows them.

YOUR RULES:

1. EVERY DETAIL IS SACRED
The parent has told you things about their child. Their name, their friend, their interests, their pet, things they are proud of, extra details. You must treat every single one as a gift. Do not mention a detail once and move on. Weave it into the fabric of the story. If the child loves dinosaurs, dinosaurs are the world. If they carry a stuffed rabbit called Mr Flopsy, Mr Flopsy is a character with a role. If they just learned to ride a bike, that achievement gives them courage at the story's turning point.

2. THE CHILD'S NAME IS MUSIC
Use their name at least 8 times in a standard length story, more in longer ones. Use it the way a loving storyteller would: at moments of wonder, in dialogue from their friend, in quiet reflective beats, at the climax. Never use it twice in the same sentence. Never use it so much it feels forced.

3. THE BEST FRIEND IS REAL
The best friend must have personality. They speak, they act, they react. Give them at least 3 distinct moments: a line of dialogue, an action that matters to the plot, and a moment of connection with the child. The friend is not a prop.

4. THE PET IS MEMORABLE
If there is a pet, it must do something the child would retell. Not just "Buddy wagged his tail." More like "Buddy grabbed the map in his teeth and ran, and Chase had no choice but to chase him right into the heart of the adventure." One memorable pet moment is worth ten generic mentions.

5. AGE IS EVERYTHING
You must write differently for every age. This is non-negotiable:

Ages 2 to 4: Very short sentences. Simple words. Repetition is magic. Sound effects and onomatopoeia. Everything is safe and gentle. ABSOLUTELY NO danger, scary moments, villains, darkness, or anything threatening.

Ages 5 to 7: Clear beginning, middle, end. The child is brave but the world is kind. Simple moral woven in naturally, never stated. Dialogue brings characters alive.

Ages 8 to 10: Real narrative tension. The child is clever and capable. Humour works brilliantly. The friend has their own personality and opinions.

Ages 11 to 14: Young adult tone. Complex emotions alongside the adventure. Themes of identity, belonging, growing up.

6. WRITTEN FOR THE EAR, NOT THE EYE
This story will be read aloud by a text to speech narrator. Write for how it sounds, not how it looks.

PACING AND PAUSES (critical for audio):
- Use three dots ( ... ) to create a breath pause. Place them at moments of suspense, wonder, scene transitions, and before emotional reveals.
- Aim for at least one pause ( ... ) every 100 to 150 words.
- After a big emotional moment or scene change, use a double pause: "... ... "
- Vary sentence length. Short punchy beats. Then a longer, flowing sentence that carries the listener forward before landing softly.
- Avoid parentheses, asterisks, em dashes, or any visual formatting.
- No chapter titles or headings unless specifically requested.

7. NEVER INVENT WHAT THE PARENT ALREADY DESCRIBED
If the parent told you something is yellow, it is yellow. NEVER add colours, sizes, breeds, or details the parent did not provide.

8. NO GENERIC PHRASES
Never write anything that could apply to any child.

9. START IMMEDIATELY
No preamble. Drop the listener straight into a moment.

10. PACING
Every story is ~15 minutes (~2200 words). Use a four act structure with SUBPLOTS and SURPRISES.

11. BEFORE YOU WRITE
Think carefully before you begin. Plan the full story arc.

12. DIALOGUE IS KING
Children lose interest during long descriptive passages. Characters talking to each other is what holds attention.`;

function getAgeBand(age) {
  const a = parseInt(age);
  if (a <= 4) return `This child is very young (age ${a}). Use very simple vocabulary, short sentences, gentle repetition, sound effects, and keep everything safe, warm, and familiar.`;
  if (a <= 7) return `This child is ${a} years old. Use clear story structure with a beginning, middle, and end. Keep language accessible but not babyish.`;
  if (a <= 10) return `This child is ${a} years old. Write with real narrative tension, humour, and clever problem solving.`;
  return `This child is ${a} years old. Write at a young adult level. Complex emotions, genuine depth, themes of identity and belonging.`;
}

function characterBlock(d) {
  const genderLabel = (d.gender || '').toLowerCase();
  const pronounLine = genderLabel === 'boy' ? 'Use he/him/his pronouns for ' + d.childName + '.'
    : genderLabel === 'girl' ? 'Use she/her/hers pronouns for ' + d.childName + '.'
    : 'Use they/them/their pronouns for ' + d.childName + '.';

  let themesSection = '';
  if (d.interest) {
    const themes = d.interest.split(',').map(t => t.trim()).filter(Boolean);
    if (themes.length > 1) {
      themesSection = `PRIMARY THEME: ${themes[0]}\nSECONDARY THEMES: ${themes.slice(1).join(', ')}`;
    } else {
      themesSection = `THEMES AND INTERESTS: ${d.interest}`;
    }
    if (d.themeDetail) {
      themesSection += `\nSPECIFIC DETAILS FROM THE PARENT: "${d.themeDetail}"`;
    }
  }

  let block = `THE MAIN CHARACTER:\n- Name: ${d.childName} (${d.gender || 'child'})\n- Age: ${d.age}\n- ${pronounLine}`;
  if (d.proudOf) block += `\n- Occasion: ${d.proudOf}`;
  block += `\n\nPEOPLE IN THE STORY:\n- Best friend: ${d.friendName}`;
  if (d.sidekickName) block += `\n- Sidekick: ${d.sidekickName}`;
  if (d.familyMembers) block += `\n- Family: ${d.familyMembers}`;
  if (d.teacherName) block += `\n- Teacher: ${d.teacherName}`;
  if (d.isGift && d.giftFrom && d.giftInStory) block += `\n- Gift giver: ${d.giftFrom} (MUST appear as a character)`;
  block += `\n\n${themesSection}\n\nSETTING: ${d.setting || 'Surprise me'}`;

  if (d.hasPet && d.petName) {
    block += `\n\nPET: ${d.petName}${d.petType ? ' (a ' + d.petType + ')' : ''}`;
  }
  if (d.favTeddy) {
    block += `\n\nFAVOURITE TOY/TEDDY: ${d.favTeddy}`;
  }
  if (d.extraDetails) {
    block += `\n\nEXTRA DETAILS: ${d.extraDetails}`;
  }
  if (d.personalMessage) {
    block += `\n\nPERSONAL MESSAGE (read separately, be aware of its tone): "${d.personalMessage}"`;
  }
  return block;
}

const WORD_COUNTS = { standard: 2200, long: 2200, epic: 2200 };

const STORY_PROMPTS = {
  bedtime: (d) => `STORY TYPE: Bedtime\nTONE: Warm, calming, soothing.\n\n${characterBlock(d)}\n\nBEDTIME STRUCTURE: Journey home, winding down, sleep.\n\nLENGTH: ~${WORD_COUNTS[d.length] || 2200} words.\n\n${getAgeBand(d.age)}\n\nWrite the story now.`,
  journey: (d) => `STORY TYPE: Journey / Adventure\nTONE: Exciting, gripping, with emotional range.\n\n${characterBlock(d)}\n\nSTRUCTURE: 4 acts, 5-6 scenes, at least 2 twists.\n\nLENGTH: ~${WORD_COUNTS[d.length] || 2200} words.\n\n${getAgeBand(d.age)}\n\nWrite the story now.`,
  learning: (d) => `STORY TYPE: Learning Adventure\nTONE: Exciting, immersive, secretly educational.\nSUBJECT: ${d.subject}\n${d.learningGoal ? 'LEARNING GOAL: ' + d.learningGoal : ''}\n${d.confidence ? 'CONFIDENCE: ' + d.confidence : ''}\n\n${characterBlock(d)}\n\nInclude 8-10 interactive pause moments. Build difficulty gradually.\n\nLENGTH: ~${WORD_COUNTS[d.length] || 2200} words.\n\n${getAgeBand(d.age)}\n\nWrite the story now.`,
};

function buildPreviewPrompt(storyData) {
  const promptFn = STORY_PROMPTS[storyData.category];
  if (!promptFn) throw new Error('Invalid category: ' + storyData.category);
  const fullPrompt = promptFn(storyData);

  return fullPrompt + `

IMPORTANT OVERRIDE: This is a PREVIEW ONLY. Write ONLY the opening of the story, approximately 60 to 80 words. The parent is listening to decide whether to buy. You have 30 seconds to make them cry, gasp, or smile so wide they cannot say no.

THE FORMULA THAT SELLS:
1. FIRST SENTENCE: The child's name in a moment of wonder or emotion, not walking or waking up. Something is already happening TO them or BECAUSE of them.
2. SECOND SENTENCE: Their best friend reacts, speaks, or does something that proves this story KNOWS this child's world. Use the friend's name in dialogue or action.
3. NEXT 2 TO 3 SENTENCES: Stack personal details fast. The pet does something memorable. The interest or theme becomes the world around them. A family member is referenced naturally. Every sentence should make the parent think "how does it know all this?"
4. FINAL SENTENCE: Stop mid-action at an impossible, wonderful, or terrifying moment. The listener MUST need to know what happens next.

RULES:
- The child's name appears at least 3 times
- Include one natural pause ( ... ) for the narrator
- NO generic openings (no "once upon a time", no waking up, no "it was a [adjective] day")
- NO resolution, NO wrapping up, NO moral lessons
- The preview must feel like the story already knows and loves this child

Write ONLY the opening now. Absolutely no more than 80 words.`;
}

// Preprocess story text so ElevenLabs TTS creates natural pauses
function prepareTTSText(text) {
  text = text.replace(/\.\s*\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\.\.\.\s*\.\.\./g, '.\n\n');
  text = text.replace(/\s*\.\.\.\s*/g, '. ');
  text = text.replace(/\.\s*\.\s+/g, '. ');
  text = text.replace(/\s{3,}/g, ' ');
  return text.trim();
}

// Helper to save result to Supabase
async function saveResult(supabaseUrl, supabaseKey, jobId, data) {
  await fetch(`${supabaseUrl}/storage/v1/object/stories/preview-jobs/${jobId}.json`, {
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

// ============================================================
// BACKGROUND FUNCTION HANDLER
// ============================================================
export const handler = async (event) => {
  let jobId;
  try {
    const { storyData, voiceId, jobId: jid } = JSON.parse(event.body);
    jobId = jid;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    console.log('[BG] Starting preview generation for job:', jobId, 'category:', storyData.category);

    // ── Generate preview opening with Anthropic (direct fetch, no SDK) ──
    const startTime = Date.now();
    let previewStory;
    try {
      console.log('[BG] Calling Anthropic API via fetch...');
      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          temperature: 1,
          thinking: {
            type: 'enabled',
            budget_tokens: 1024
          },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildPreviewPrompt(storyData) }]
        })
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        throw new Error('Anthropic API ' + apiResponse.status + ': ' + errBody);
      }

      const apiResult = await apiResponse.json();
      // Extract text from content blocks (skip thinking blocks)
      previewStory = '';
      for (const block of apiResult.content) {
        if (block.type === 'text') {
          previewStory += block.text;
        }
      }
      console.log('[BG] Preview generated in', Date.now() - startTime, 'ms, words:', previewStory.split(' ').length);
    } catch (apiErr) {
      console.error('[BG] Anthropic API error after', Date.now() - startTime, 'ms:', apiErr.message);
      if (jobId && supabaseUrl && supabaseKey) {
        try { await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'Story generation failed: ' + apiErr.message }); } catch (e) { /* best effort */ }
      }
      return { statusCode: 200 };
    }

    // ── Build message intro ──
    let messageIntro = '';
    if (storyData.isGift && storyData.giftFrom) {
      const giftMsg = storyData.giftMessage || storyData.personalMessage;
      messageIntro = `This story was made just for you, ${storyData.childName}, with love from ${storyData.giftFrom}. ... `;
      if (giftMsg) {
        messageIntro += `${giftMsg} ... `;
      }
      messageIntro += `And now, your story begins. ... `;
    } else if (storyData.personalMessage) {
      messageIntro = `Before we begin, there is a special message for ${storyData.childName}. ... ${storyData.personalMessage} ... And now, on with the story. ... `;
    }

    const previewText = messageIntro + previewStory + ' ... ... To hear what happens next, unlock the full story.';
    const ttsText = prepareTTSText(previewText);

    // ── Generate TTS ──
    const useVoiceId = (voiceId && /^[a-zA-Z0-9]+$/.test(voiceId)) ? voiceId : 'EXAVITQu4vr4xnSDxMaL';
    console.log('[BG] Generating TTS with voice:', useVoiceId);

    const ttsStart = Date.now();
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: ttsText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.80, style: 0.40, use_speaker_boost: true }
      })
    });

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error('[BG] ElevenLabs error after', Date.now() - ttsStart, 'ms:', ttsResponse.status, errText);
      if (jobId && supabaseUrl && supabaseKey) {
        try { await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: 'Voice generation failed. Please try again.' }); } catch (e) { /* best effort */ }
      }
      return { statusCode: 200 };
    }
    console.log('[BG] TTS generated in', Date.now() - ttsStart, 'ms');
    const audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    console.log('[BG] Total time:', Date.now() - startTime, 'ms, audio size:', Math.round(audioBase64.length / 1024), 'KB');

    // ── Save preview result (opening text + audio) ──
    const result = { success: true, previewAudio: audioBase64, previewStory, storyData };
    if (jobId && supabaseUrl && supabaseKey) {
      try {
        await saveResult(supabaseUrl, supabaseKey, jobId, result);
        console.log('[BG] Saved complete result for job:', jobId);
      } catch (saveErr) {
        console.error('[BG] Failed to save complete result:', saveErr.message);
      }
    }

    return { statusCode: 200 };
  } catch (err) {
    console.error('[BG] Background worker error:', err.message, err.stack);
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (jobId && supabaseUrl && supabaseKey) {
      try { await saveResult(supabaseUrl, supabaseKey, jobId, { success: false, error: err.message }); } catch (e) { /* best effort */ }
    }
    return { statusCode: 200 };
  }
};
