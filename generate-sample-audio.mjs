#!/usr/bin/env node
// ONE-TIME SCRIPT: Generate the homepage sample narration
// Run: node generate-sample-audio.mjs
// Then delete this file

const VOICE_ID = 'N2lVS1w4EtoT3dr4eOWO'; // Callum - Scottish, warm, friendly
const API_KEY = process.env.ELEVENLABS_API_KEY || '8deae6fba15696db876cfa1f3b824318140ece878b0d02c6717358895dbe148e';

const script = `Chase pressed his nose against the window ... and gasped. Stars. Hundreds and hundreds of stars, stretching out forever. ... Chase! Chase, look! Ellis tugged his arm and pointed straight down. Is that ... is that our park? ... Chase looked ... and there it was. Their park. Their swings. Their whole town, tiny and glowing far below. ... Chase smiled. Ellis, he whispered ... do you think they can see us from down there?`;

async function main() {
  console.log('Generating narration with Callum voice...');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!res.ok) {
    console.error('Error:', res.status, await res.text());
    process.exit(1);
  }

  const fs = await import('fs');
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('./public/sample-story.mp3', buf);
  console.log(`Done! Saved to public/sample-story.mp3 (${(buf.length / 1024).toFixed(0)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
