#!/usr/bin/env node
// Run: node generate-sample.js
// Requires: brew install ffmpeg (if not already installed)
// Generates the homepage sample story audio with background music

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ELEVENLABS_KEY = '8deae6fba15696db876cfa1f3b824318140ece878b0d02c6717358895dbe148e';
const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel - calm, deep, British

// ~80 words. Comedy beats baked into the sentence structure.
// Short fragments = TTS pauses. Single-word lines = punch.
// Questions = natural pitch change. Contrast = drama.
const SCRIPT = `Chase was not supposed to be awake. But the ground was shaking.

He looked out the window. A T-Rex. In the garden. Eating Daddy's roses.

"Ellis," he whispered. "Whatever you do, don't move."

Ellis immediately moved.

The dinosaur looked up. It had a rose hanging out of its mouth. It looked completely ridiculous.

"Are you Chase?" it said.

"Maybe," said Chase, pulling Mr Flopsy a little closer.

"Your Daddy stole my eggs. Every single one. I need them back."

Chase looked at Ellis. "Yeah. That does sound like him."`;

async function main() {
  console.log('Generating narration with ElevenLabs (Daniel voice, multilingual v2)...');

  // Using eleven_multilingual_v2 for maximum expression and tone variation.
  // Low stability (0.30) = more dramatic range between whispers, rumbles,
  // and cheeky dialogue. Higher similarity (0.80) keeps the voice consistent.
  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.30,
        similarity_boost: 0.80,
        style: 0.45,
        use_speaker_boost: true
      }
    })
  });

  if (!ttsRes.ok) {
    console.error('ElevenLabs error:', ttsRes.status, await ttsRes.text());
    process.exit(1);
  }

  const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
  const narrationPath = path.join(__dirname, 'public', 'sample-narration.mp3');
  fs.writeFileSync(narrationPath, audioBuffer);
  console.log(`Narration saved (${(audioBuffer.length / 1024).toFixed(0)} KB)`);

  // Check for ffmpeg
  try {
    execSync('which ffmpeg', { stdio: 'ignore' });
  } catch {
    console.log('\nffmpeg not found. Install it with: brew install ffmpeg');
    console.log('Then run this script again to mix with background music.');
    console.log('Or rename public/sample-narration.mp3 to public/sample-story.mp3 for narration only.');
    return;
  }

  // Mix narration with adventure background music
  const musicPath = path.join(__dirname, 'public', 'music', 'adventure-ambient.mp3');
  const outputPath = path.join(__dirname, 'public', 'sample-story.mp3');

  // Get narration duration
  const durationOut = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${narrationPath}"`).toString().trim();
  const duration = parseFloat(durationOut);
  console.log(`Mixing with background music (narration: ${duration.toFixed(1)}s)...`);

  // 1s music intro, narration at 0.75, music at 0.02, fade out at end
  const totalDuration = duration + 2.5;

  execSync(`ffmpeg -y \
    -i "${narrationPath}" \
    -i "${musicPath}" \
    -filter_complex "\
      [0:a]adelay=1000|1000,volume=0.75[narr];\
      [1:a]atrim=0:${totalDuration},volume=0.02,afade=t=out:st=${totalDuration - 2}:d=2[music];\
      [music][narr]amix=inputs=2:duration=longest:dropout_transition=2[out]\
    " \
    -map "[out]" \
    -ac 1 -ar 44100 -b:a 128k \
    "${outputPath}"`, { stdio: 'inherit' });

  // Clean up
  fs.unlinkSync(narrationPath);

  const finalSize = fs.statSync(outputPath).size;
  console.log(`\nDone! sample-story.mp3 updated (${(finalSize / 1024).toFixed(0)} KB)`);
  console.log('Commit and push to go live.');
}

main().catch(err => { console.error(err); process.exit(1); });
