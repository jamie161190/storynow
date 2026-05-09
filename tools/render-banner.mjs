#!/usr/bin/env node
// v7 build: slim top banner replaces the floating card from v6.
// Top banner shows brand line + cycling form info ('What kind?', 'The
// cousins', 'The world' fields) so the same information that was on
// the v6 card now flows through a v2-02b-style top strip instead.
// Footage is full-bleed below. Bottom CTA pill kept at the larger size.
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/v7-916-side-panel.mp4
//
// Usage:
//   node tools/render-banner.mjs
//   node tools/render-banner.mjs --fps 10

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'side-panel-banner.html')).href;

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
const FPS = parseInt(args.fps || '8', 10);
const MAIN_DURATION = 29.5;
const TOTAL_FRAMES = Math.round(FPS * MAIN_DURATION);

const HOME_ALONE_SRC = '/Users/jamieharish/Desktop/Meta Ads/Home Alone.MOV.subbed.mp4';
// "Side Panel.mp4" = the user's saved final from earlier (was v6/v7).
// We use it for audio (full 35s mix) + closing card portion (29.5s onwards).
const AUDIO_AND_CLOSING_SRC = '/Users/jamieharish/Desktop/Meta Ads/Generated/Side Panel.mp4';
const OUT = '/Users/jamieharish/Desktop/Meta Ads/Generated/v7-916-side-panel.mp4';

console.log(`Rendering v7-916 (banner-only) at ${FPS} fps for ${MAIN_DURATION}s = ${TOTAL_FRAMES} frames.`);

const browser = await puppeteer.launch({ headless: 'new' });

const tmp = '/tmp/v7-banner';
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const page = await browser.newPage();
try {
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(`${TEMPLATE}?t=0`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });

  process.stdout.write(`▶ rendering frames `);
  const start = Date.now();
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS;
    await page.evaluate((tt) => window.setTime(tt), t);
    const out = `${tmp}/frame_${String(i).padStart(4,'0')}.png`;
    await page.screenshot({ path: out, type: 'png', omitBackground: true });
    if (i % 30 === 0) process.stdout.write('.');
  }
  console.log(` done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
} finally {
  await page.close();
}

// Build main: Home Alone footage + overlay PNGs
const mainOut = `${tmp}/main.mp4`;
console.log(`  ffmpeg main → ${mainOut}`);
execSync([
  'ffmpeg', '-y',
  '-i', `"${HOME_ALONE_SRC}"`,
  '-framerate', String(FPS),
  '-i', `"${tmp}/frame_%04d.png"`,
  '-filter_complex', `"[0:v][1:v]overlay=0:0:eof_action=pass"`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-an',
  `"${mainOut}"`
].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });

// Closing card: trim from v3 starting at MAIN_DURATION
const closingOut = `${tmp}/closing.mp4`;
console.log(`  ffmpeg closing → ${closingOut}`);
execSync([
  'ffmpeg', '-y',
  '-ss', String(MAIN_DURATION),
  '-i', `"${AUDIO_AND_CLOSING_SRC}"`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-an',
  `"${closingOut}"`
].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });

// Concat
const concatList = `${tmp}/concat.txt`;
execSync(`echo "file '${mainOut}'\nfile '${closingOut}'" > "${concatList}"`);
const concatVideoOut = `${tmp}/concat_video.mp4`;
console.log(`  ffmpeg concat video → ${concatVideoOut}`);
execSync([
  'ffmpeg', '-y',
  '-f', 'concat', '-safe', '0',
  '-i', `"${concatList}"`,
  '-c', 'copy',
  `"${concatVideoOut}"`
].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });

// Final mux: video + v3 audio
console.log(`  ffmpeg final → ${OUT}`);
execSync([
  'ffmpeg', '-y',
  '-i', `"${concatVideoOut}"`,
  '-i', `"${AUDIO_AND_CLOSING_SRC}"`,
  '-map', '0:v:0',
  '-map', '1:a:0',
  '-c:v', 'copy',
  '-c:a', 'copy',
  '-shortest',
  `"${OUT}"`
].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });

await browser.close();
console.log(`\n✓ ${OUT}`);
