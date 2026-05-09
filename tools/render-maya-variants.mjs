#!/usr/bin/env node
// Three positional variants of the Maya 8s ad. Same plum + terra brand
// chrome, same single form-card content, same subtitles. The variation is
// where the card and subtitle sit on the frame:
//   v1: card above her head, subtitle bottom
//   v2: card below her body, subtitle top
//   v3: card below + subtitle below (stacked, mirrors existing ad)
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/maya-v{1,2,3}-916.mp4
//
// Source: out/approved/03-source-clips/01-bedtime-maya-sora-animated-8s.mp4
// (720x1280, 8.3s, has audio). Upscaled to 1080x1920 with lanczos before
// the overlay composite so Meta serves it as a proper Reels-quality asset.
//
// Usage:
//   node tools/render-maya-variants.mjs
//   node tools/render-maya-variants.mjs --variant 2
//   node tools/render-maya-variants.mjs --fps 12

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'maya-variant.html')).href;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i+1];
      if (v === undefined || v.startsWith('--')) out[k] = true;
      else { out[k] = v; i++; }
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const FPS = parseInt(args.fps || '10', 10);
const DURATION = 8.3;
const TOTAL_FRAMES = Math.round(FPS * DURATION);

const SOURCE = '/Users/jamieharish/Projects/HearMyName/Code/out/approved/03-source-clips/01-bedtime-maya-sora-animated-8s.mp4';
const OUT_DIR = '/Users/jamieharish/Desktop/Meta Ads/Generated';

const VARIANTS = [
  { id: '1', label: 'card-above', out: `${OUT_DIR}/maya-v1-916.mp4` },
  { id: '2', label: 'card-below-subtitle-top', out: `${OUT_DIR}/maya-v2-916.mp4` },
  { id: '3', label: 'card-below-subtitle-below', out: `${OUT_DIR}/maya-v3-916.mp4` },
];

const TARGETS = args.variant
  ? VARIANTS.filter(v => v.id === String(args.variant))
  : VARIANTS;

if (!existsSync(SOURCE)) {
  console.error(`Source not found: ${SOURCE}`);
  process.exit(1);
}

console.log(`Rendering ${TARGETS.length} variant(s) @ ${FPS} fps for ${DURATION}s = ${TOTAL_FRAMES} frames each.`);

const browser = await puppeteer.launch({ headless: 'new' });

async function renderVariant(spec) {
  const tmp = `/tmp/maya-${spec.id}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto(`${TEMPLATE}?variant=${spec.id}&t=0`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });

    process.stdout.write(`▶ v${spec.id} (${spec.label}): `);
    const start = Date.now();
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const t = i / FPS;
      await page.evaluate((tt) => window.setTime(tt), t);
      const out = `${tmp}/frame_${String(i).padStart(4,'0')}.png`;
      await page.screenshot({ path: out, type: 'png', omitBackground: true });
    }
    console.log(`frames done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } finally {
    await page.close();
  }

  // Composite: scale source to 1080x1920 with lanczos, overlay PNG sequence,
  // keep source audio.
  console.log(`  ffmpeg → ${spec.out}`);
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${SOURCE}"`,
    '-framerate', String(FPS),
    '-i', `"${tmp}/frame_%04d.png"`,
    '-filter_complex', `"[0:v]scale=1080:1920:flags=lanczos[base];[base][1:v]overlay=0:0:eof_action=pass"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-map', '0:a:0',
    `"${spec.out}"`
  ].join(' ');
  try {
    execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`  ✓ ${spec.out}`);
  } catch (e) {
    console.error(`  ✗ ffmpeg failed:`, e.message);
    throw e;
  }
}

for (const spec of TARGETS) {
  await renderVariant(spec);
}

await browser.close();
console.log('\nAll done.');
