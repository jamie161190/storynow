#!/usr/bin/env node
// Build animated v5 side-panel ads. Renders the full plum chrome + animated
// left rail as a PNG sequence with a transparent right-pane window, then
// composites onto each original v3 video so the Home Alone footage shows
// through unchanged. The original closing-card transition (from t=29.5)
// is left untouched.
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/v5-{fmt}-side-panel.mp4
//
// Usage:
//   node tools/render-side-panel-animated.mjs
//   node tools/render-side-panel-animated.mjs --fmt 916
//   node tools/render-side-panel-animated.mjs --fps 8

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'side-panel-animated.html')).href;

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
const DURATION = 29.0; // seconds of animated content; original closing card kicks in at t=29.5
const TOTAL_FRAMES = Math.round(FPS * DURATION);

const FORMATS = [
  { fmt: '916', w: 1080, h: 1920, src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-916-side-panel.mp4', out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v5-916-side-panel.mp4' },
  { fmt: '45',  w: 1080, h: 1350, src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-45-side-panel.mp4',  out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v5-45-side-panel.mp4'  },
  { fmt: '11',  w: 1080, h: 1080, src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-11-side-panel.mp4',  out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v5-11-side-panel.mp4'  },
];

const TARGETS = args.fmt
  ? FORMATS.filter(f => f.fmt === String(args.fmt))
  : FORMATS;

console.log(`Rendering ${TARGETS.length} format(s) at ${FPS} fps for ${DURATION}s = ${TOTAL_FRAMES} frames each.`);

const browser = await puppeteer.launch({ headless: 'new' });

async function renderFormat(spec) {
  const tmp = `/tmp/v5-anim/${spec.fmt}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: spec.w, height: spec.h, deviceScaleFactor: 1 });
    await page.goto(`${TEMPLATE}?fmt=${spec.fmt}&t=0`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });

    process.stdout.write(`▶ ${spec.fmt} (${spec.w}x${spec.h}): rendering frames `);
    const start = Date.now();
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const t = i / FPS;
      await page.evaluate((tt) => window.setTime(tt), t);
      const out = `${tmp}/frame_${String(i).padStart(4,'0')}.png`;
      await page.screenshot({ path: out, type: 'png', omitBackground: true });
      if (i % 30 === 0) process.stdout.write('.');
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(` done (${elapsed}s)`);
  } finally {
    await page.close();
  }

  // ffmpeg composite. The PNG sequence is the overlay, original video is the
  // base. enable='lt(t,29.5)' means the overlay drops out before the original
  // closing-card transition starts.
  console.log(`  ffmpeg composite → ${spec.out}`);
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${spec.src}"`,
    '-framerate', String(FPS),
    '-i', `"${tmp}/frame_%04d.png"`,
    '-filter_complex', `"[0:v][1:v]overlay=0:0:enable='lt(t,29.5)':eof_action=pass"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
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
  if (!existsSync(spec.src)) {
    console.warn(`  ⚠ Source not found, skipping: ${spec.src}`);
    continue;
  }
  await renderFormat(spec);
}

await browser.close();
console.log('\nAll done.');
