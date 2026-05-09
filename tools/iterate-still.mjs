#!/usr/bin/env node
// Cheap still iteration via gpt-image-2 (~£0.04 per take).
// Generate, save, show path. Iterate prompt as many times as needed before
// committing to an expensive Sora 2 video animation.
//
// Usage:
//   node tools/iterate-still.mjs --slot reaction --prompt "Vertical photograph of..."
//   node tools/iterate-still.mjs --slot reaction --prompt-file /tmp/p.txt
//   node tools/iterate-still.mjs --slot reaction --size 1024x1536 --quality high

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage } from './lib/openai-image.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
if (!args.slot) { console.error('--slot <name> required'); process.exit(1); }

let prompt;
if (args['prompt-file']) prompt = readFileSync(args['prompt-file'], 'utf8').trim();
else if (args.prompt) prompt = args.prompt;
else { console.error('--prompt or --prompt-file required'); process.exit(1); }

const size = args.size || '1024x1536';
const quality = args.quality || 'high';

const OUT = join(ROOT, 'out', 'iterations', args.slot);
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const outPath = join(OUT, `still-${stamp}.png`);

console.log(`\nIterating ${args.slot} (${size}, quality=${quality})…\nPrompt:\n  "${prompt.slice(0, 200)}${prompt.length > 200 ? '…' : ''}"\n`);
const buf = await generateImage({ prompt, size, quality, outPath });
console.log(`✓ Saved → ${outPath}  (${(buf.length/1024).toFixed(0)} KB)`);
console.log(`  Cost: ~£0.04`);
console.log(`\nReview the image, then either:`);
console.log(`  • iterate again:    node tools/iterate-still.mjs --slot ${args.slot} --prompt "..."`);
console.log(`  • lock + animate:   node tools/animate-still.mjs --still ${outPath} --motion "..."`);
