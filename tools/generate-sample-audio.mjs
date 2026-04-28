#!/usr/bin/env node
// Generate 3 sample-story MP3s for the homepage sample player.
// Uses ElevenLabs eleven_v3 with 3 different voices.
// Output: public/audio/samples/{name}.mp3

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'audio', 'samples');
mkdirSync(OUT, { recursive: true });

const SAMPLES = [
  {
    slot: 'oliver',
    voiceId: 'oWAxZDx7w5VEj9dCyTzz', // British (warm) — Grace
    text: `It was a quiet evening at the end of Sycamore Lane, and Oliver was tucked beneath a blanket the colour of moonlight. The kind of blanket that knows how to keep a small boy warm without anyone asking it to.

"Tonight," whispered the wind through the window, "there is a story for Oliver, and only for Oliver."

Oliver sat up and listened, hardly daring to breathe.

From the floorboards came the smallest sound. Tap. Tap. Tap. And there, in the silver light pooling beneath the curtain, stood a small fox with a kind face and a coat the colour of fallen leaves.

"Hello, Oliver," said the fox. "I've been waiting for you."

Oliver tilted his head. "Waiting for me?"

"All evening," said the fox. "Possibly longer. Foxes don't keep very good time."

Oliver smiled. He was not afraid, which he thought was strange, because he had been afraid of the wardrobe only an hour ago, and that had nothing in it but coats. The fox seemed considerably less worrying than the coats.

"Why have you been waiting?" Oliver asked.

The fox sat down with the careful grace of someone who has practised sitting down beautifully. "Because tonight," it said, "the moon is exactly the right shape, and there is a story unfolding in the woods, and you, Oliver, are the only one who knows how it ends."

Oliver thought about this. He didn't remember knowing how any story ended.

"You don't know that you know yet," said the fox, as if reading his mind. "But you will. Come on."

And he held out one small paw.`
  },
  {
    slot: 'maya',
    voiceId: 'cjVigY5qzO86Huf0OWal', // Irish (lilting) — Eric
    text: `Maya found the drawer on a Tuesday afternoon — the kind of Tuesday afternoon when something new is bound to happen and you can almost hear it coming.

The drawer belonged to her grandmother's writing desk, and it had been there for as long as anyone could remember. Maya had walked past it a hundred times. But today, for reasons she couldn't quite explain, she stopped.

She tugged the little brass handle. The drawer opened with a soft, polite sound, the way old drawers do when they've been waiting.

Inside, beneath a tangle of string and old buttons and a single dried lavender stem, was a map drawn in careful blue ink — and at the very top of the map, in handwriting Maya had never seen before, was one word.

Maya.

Her cousin Leo crowded in to look. "That's your name," he whispered. "Maya, that's your actual name."

"I know it's my name, Leo."

"But it's on the map."

"I can see that, Leo."

The map, as if hearing them at last, gave the smallest shiver — the kind of shiver maps give when they have been folded for a very long time and are ready, finally, to be followed.

A path was drawn from the corner of the page, winding through pencilled trees and over a tiny inked river, all the way to a spot near the centre marked only with a single, tiny star.

Maya smiled. "Well then," she said. "We'd better go, hadn't we?"`
  },
  {
    slot: 'arlo',
    voiceId: 'N2lVS1w4EtoT3dr4eOWO', // Scottish (kind) — Callum
    text: `It was the quietest night Arlo had ever known.

Outside the window, the trees stood still as paintings, and the moon hung in the sky as if someone had pinned it there and forgotten to come back.

Arlo was four, which is exactly old enough to know when a night is unusually quiet, and exactly young enough to do something about it.

He climbed onto the windowsill in his bare feet — quietly, because his mum had said quiet was very important after eight o'clock — and he pressed his nose against the cool glass.

That was when the smallest star — the smallest of all of them, the one tucked away in the corner of the sky as if it were shy — leaned forward. And tumbled. Gently. Into Arlo's garden.

It landed on the grass with a sound like a tiny silver bell, and it stayed there, glowing softly, looking just a little embarrassed.

Arlo opened the window and leaned out as far as he was allowed.

"Excuse me," said the star, in a voice like a soft bell ringing very far away. "I've come a very long way, Arlo, and I'd like to listen to your story."

Arlo thought about this. He had a lot of stories. Some of them were about dinosaurs. Some of them were about his dog, Pickle. One of them was about a sandwich.

"You can," he said carefully. "But only if you stay until I fall asleep."

And so the little star did, just that.`
  }
];

async function generate(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Each sample maps to a category for the background-music mix (see public/music/).
const KIND = {
  oliver: 'bedtime',
  maya:   'adventure',
  arlo:   'bedtime'
};

import { execFileSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';

function mix(narrationPath, musicPath, outPath) {
  // Use ffmpeg to overlay narration on a looped ambient bed at low volume.
  execFileSync('ffmpeg', [
    '-y',
    '-i', narrationPath,
    '-stream_loop', '-1',
    '-i', musicPath,
    '-filter_complex',
    '[0:a]volume=1.0[v];[1:a]volume=0.18[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[mix]',
    '-map', '[mix]',
    '-ac', '2',
    '-b:a', '128k',
    outPath
  ], { stdio: 'inherit' });
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY required');
    process.exit(1);
  }

  for (const s of SAMPLES) {
    console.log(`Generating ${s.slot} (voice ${s.voiceId})…`);
    const buf = await generate(s.text, s.voiceId);
    const rawPath = join(OUT, `${s.slot}-raw.mp3`);
    const finalPath = join(OUT, `${s.slot}.mp3`);
    writeFileSync(rawPath, buf);
    console.log(`  → ${rawPath} (${(buf.length / 1024 | 0)} KB)`);

    // Mix with ambient music
    const kind = KIND[s.slot] || 'bedtime';
    const musicPath = join(__dirname, '..', 'public', 'music', `${kind}-ambient.mp3`);
    console.log(`  Mixing with ${kind}-ambient…`);
    mix(rawPath, musicPath, finalPath);
    unlinkSync(rawPath);
    console.log(`  → ${finalPath}`);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
