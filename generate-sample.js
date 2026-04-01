#!/usr/bin/env node
// Run: node generate-sample.js
// Requires: brew install ffmpeg (if not already installed)
// Generates the homepage sample story audio with background music
// Uses ElevenLabs v3 with audio tags for expressive narration

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ELEVENLABS_KEY = '8deae6fba15696db876cfa1f3b824318140ece878b0d02c6717358895dbe148e';
const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'; // Daniel - calm, deep, British

// ~78 words. Space theme. Daddy as the villain. 30 seconds.
// Audio tags tell v3 HOW to perform each moment.
const SCRIPT = `Chase couldn't sleep. Something outside the window was glowing.

He looked out. [gasps] A spaceship. In the garden. Right on top of Daddy's flowers.

[whispers] "Ellis," he whispered. "You need to see this."

A hatch opened. A small green alien poked its head out. "Are you Chase?"

Chase pulled Mr Flopsy closer. "Who's asking?"

"Someone has stolen every star from the sky. And the someone, is your Daddy."

Chase looked at Ellis. [laughs softly] "Sounds about right. Let's go."`;

async function main() {
  console.log('Generating narration with ElevenLabs v3 (Daniel voice, audio tags)...');

  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: SCRIPT,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.50,
        similarity_boost: 0.75,
        style: 0
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
