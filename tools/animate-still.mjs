#!/usr/bin/env node
// Animate an approved still via Sora 2 image-to-video. Single shot, no iteration.
// Cost: ~£3 (sora-2 8s at 720x1280) or ~£5 (sora-2-pro 8s).
//
// Usage:
//   node tools/animate-still.mjs --still out/iterations/reaction/still-XXXX.png \
//     --motion "Eyes widen with quiet delight at second 4. Otherwise still. Closed mouth throughout. No speech."
//   node tools/animate-still.mjs --still ... --seconds 6 --pro
//   node tools/animate-still.mjs --still ... --out /tmp/foo.mp4

import { mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVideo } from './lib/sora-video.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
if (!args.still) { console.error('--still <path-to-png> required'); process.exit(1); }
if (!args.motion) { console.error('--motion <prompt> required'); process.exit(1); }

const still = resolve(args.still);
const seconds = parseInt(args.seconds || '8', 10);
const pro = !!args.pro;
const model = pro ? 'sora-2-pro' : 'sora-2';
const size = args.size || '720x1280';
const slot = basename(dirname(still));

const OUT_DIR = join(ROOT, 'out', 'animations', slot);
mkdirSync(OUT_DIR, { recursive: true });
const stamp = Date.now();
const outPath = args.out ? resolve(args.out) : join(OUT_DIR, `${basename(still, '.png')}-anim-${stamp}.mp4`);

const cost = (pro ? 0.6 : 0.3) * seconds;
console.log(`\nAnimating: ${still}\n  → ${outPath}\n  Model: ${model} | Seconds: ${seconds} | Size: ${size}\n  Estimated cost: ~£${cost.toFixed(2)}\n  Motion prompt: "${args.motion}"\n`);

await generateVideo({ imagePath: still, prompt: args.motion, seconds, size, model, outPath });
console.log(`\n✓ Done → ${outPath}\n`);
