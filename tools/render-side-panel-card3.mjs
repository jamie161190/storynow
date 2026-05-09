#!/usr/bin/env node
// Render new Card 3 ("THE WORLD") for the v3 side-panel ads, then ffmpeg
// overlay onto each aspect-ratio video. Output goes alongside the input
// MP4s with a v4-prefixed filename.
//
// Why this exists: the original v3 ads used invented field labels
// (SETTING / FAVOURITE FILM / ANOTHER CHARACTER) that don't match the
// real /start questionnaire. A prospect arriving from the ad expecting
// to type a "Favourite Film" sees no such field. This patch replaces
// only Card 3, leaves the rest untouched, and stops at t=29.5s so the
// original closing card transition plays through unmodified.
//
// Usage:
//   node tools/render-side-panel-card3.mjs

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'side-panel-card3.html')).href;

// Per-format spec: where Card 3 sits in each video, exact pixel bbox.
// Measurements derived from sampling the original v3 frames at t=2.
const FORMATS = [
  {
    fmt: '916',
    src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-916-side-panel.mp4',
    out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v4-916-side-panel.mp4',
    cardW: 277, cardH: 420, cardX: 22, cardY: 950,
    overlayUntil: 29.5,
  },
  {
    fmt: '45',
    src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-45-side-panel.mp4',
    out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v4-45-side-panel.mp4',
    cardW: 277, cardH: 291, cardX: 22, cardY: 675,
    overlayUntil: 29.5,
  },
  {
    fmt: '11',
    src: '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-11-side-panel.mp4',
    out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v4-11-side-panel.mp4',
    cardW: 427, cardH: 238, cardX: 22, cardY: 520,
    overlayUntil: 29.5,
  },
];

const TMP = '/tmp/card3-overlays';
mkdirSync(TMP, { recursive: true });

console.log('Launching puppeteer...');
const browser = await puppeteer.launch({ headless: 'new' });

async function renderCard(fmt, w, h) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    const url = `${TEMPLATE}?fmt=${fmt}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
    const out = `${TMP}/card3-${fmt}.png`;
    // omitBackground keeps PNG alpha so the original card edges underneath
    // are fully replaced (the template draws its own card chrome).
    await page.screenshot({ path: out, type: 'png', omitBackground: true });
    return out;
  } finally {
    await page.close();
  }
}

for (const f of FORMATS) {
  if (!existsSync(f.src)) {
    console.warn(`  ⚠ Source not found, skipping: ${f.src}`);
    continue;
  }
  console.log(`\n▶ ${f.fmt}: rendering ${f.cardW}x${f.cardH} card...`);
  const png = await renderCard(f.fmt, f.cardW, f.cardH);
  console.log(`  card → ${png}`);

  // ffmpeg overlay. The card is rendered at 2x via deviceScaleFactor for
  // crispness, so we scale it back down to the bbox size during overlay.
  // enable='lt(t,N)' switches the overlay off after t=29.5 so the original
  // closing-card transition isn't covered.
  const filterGraph = `[1:v]scale=${f.cardW}:${f.cardH}[card];` +
                      `[0:v][card]overlay=${f.cardX}:${f.cardY}:enable='lt(t,${f.overlayUntil})'`;

  console.log(`  ffmpeg overlay → ${f.out}`);
  const cmd = [
    'ffmpeg', '-y',
    '-i', `"${f.src}"`,
    '-i', `"${png}"`,
    '-filter_complex', `"${filterGraph}"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-c:a', 'copy',
    `"${f.out}"`
  ].join(' ');
  try {
    execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`  ✓ done: ${f.out}`);
  } catch (e) {
    console.error(`  ✗ ffmpeg failed for ${f.fmt}:`, e.message);
  }
}

await browser.close();
console.log('\nAll done. v4 outputs are next to the v3 originals.');
