#!/usr/bin/env node
// Self-contained rebuild of the side-panel ads.
//
// Why this exists: the original v4-v7 render tools composited their overlay
// onto an intermediate "v3-*-side-panel.mp4" base that also supplied the
// audio mix and the closing brand card. Those v3 files were never committed
// and have been lost, so the old tools can't run. This tool rebuilds the
// whole ad from the pieces that DO still exist:
//
//   - tools/templates/side-panel-cycler.html  (overlay, copy already fixed)
//   - Home Alone.MOV.subbed.mp4               (clean subbed footage + audio)
//   - tools/templates/closing-card.html       (fresh closing brand card)
//   - public/music/bedtime-ambient.mp3        (closing-card music bed)
//
// Pipeline per format:
//   1. Render the side-panel overlay as a transparent PNG sequence.
//   2. Composite it onto the (cropped) Home Alone footage -> main video.
//   3. Take the main audio straight from the Home Alone clip.
//   4. Render the closing card as a PNG sequence -> closing video, with a
//      short fade of bedtime-ambient under it.
//   5. Concat main + closing -> final mp4.
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/rebuild-{fmt}-side-panel.mp4
//
// Usage:
//   node tools/render-side-panel-rebuild.mjs
//   node tools/render-side-panel-rebuild.mjs --fmt 916
//   node tools/render-side-panel-rebuild.mjs --fps 10

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OVERLAY_TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'side-panel-cycler.html')).href;
const CLOSING_TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'closing-card.html')).href;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) out[k] = true;
      else { out[k] = v; i++; }
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const FPS = parseInt(args.fps || '8', 10);
const MAIN_DURATION = 30.0;   // full subbed clip is 30.1s
const CLOSING_DURATION = 3.5;
const MAIN_FRAMES = Math.round(FPS * MAIN_DURATION);
const CLOSING_FRAMES = Math.round(FPS * CLOSING_DURATION);

const HOME_ALONE_SRC = '/Users/jamieharish/Desktop/Meta Ads/Home Alone.MOV.subbed.mp4';
const MUSIC_SRC = resolve(ROOT, 'public', 'music', 'bedtime-ambient.mp3');
const OUT_DIR = '/Users/jamieharish/Desktop/Meta Ads/Generated';

const FORMATS = [
  { fmt: '916', w: 1080, h: 1920 },
  { fmt: '45',  w: 1080, h: 1350 },
  { fmt: '11',  w: 1080, h: 1080 },
];

const TARGETS = args.fmt ? FORMATS.filter(f => f.fmt === String(args.fmt)) : FORMATS;

if (!existsSync(HOME_ALONE_SRC)) {
  console.error(`Home Alone source not found: ${HOME_ALONE_SRC}`);
  process.exit(1);
}
if (!existsSync(MUSIC_SRC)) {
  console.error(`Music bed not found: ${MUSIC_SRC}`);
  process.exit(1);
}

const ff = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });

console.log(`Rebuilding ${TARGETS.length} format(s) at ${FPS} fps. Main ${MAIN_DURATION}s + closing ${CLOSING_DURATION}s.`);

const browser = await puppeteer.launch({ headless: 'new' });

async function renderSequence(templateUrl, spec, frames, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: spec.w, height: spec.h, deviceScaleFactor: 1 });
    await page.goto(`${templateUrl}?fmt=${spec.fmt}&t=0`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await page.evaluate((tt) => window.setTime(tt), t);
      await page.screenshot({
        path: `${dir}/frame_${String(i).padStart(4, '0')}.png`,
        type: 'png',
        omitBackground: true,
      });
      if (i % 30 === 0) process.stdout.write('.');
    }
  } finally {
    await page.close();
  }
}

async function renderFormat(spec) {
  const tmp = `/tmp/sp-rebuild/${spec.fmt}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const out = `${OUT_DIR}/rebuild-${spec.fmt}-side-panel.mp4`;

  // 9:16 = no crop. 4:5 / 1:1 = crop from the top so the burned-in subtitle
  // band (around y=180-400) is always preserved.
  const cropFilter = spec.h === 1920 ? 'null' : `crop=${spec.w}:${spec.h}:0:0`;

  // 1) Overlay PNG sequence
  process.stdout.write(`> ${spec.fmt} overlay frames `);
  const overlayDir = `${tmp}/overlay`;
  await renderSequence(OVERLAY_TEMPLATE, spec, MAIN_FRAMES, overlayDir);
  console.log(' done');

  // 2) Main video: Home Alone footage (cropped) + overlay
  const mainVideo = `${tmp}/main_video.mp4`;
  ff([
    'ffmpeg', '-y',
    '-t', String(MAIN_DURATION), '-i', `"${HOME_ALONE_SRC}"`,
    '-framerate', String(FPS), '-i', `"${overlayDir}/frame_%04d.png"`,
    '-filter_complex', `"[0:v]${cropFilter}[base];[base][1:v]overlay=0:0:eof_action=pass"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-an', `"${mainVideo}"`,
  ].join(' '));

  // 3) Main audio: straight from the Home Alone clip
  const mainAudio = `${tmp}/main_audio.m4a`;
  ff([
    'ffmpeg', '-y',
    '-t', String(MAIN_DURATION), '-i', `"${HOME_ALONE_SRC}"`,
    '-vn', '-c:a', 'aac', '-b:a', '192k', `"${mainAudio}"`,
  ].join(' '));

  const main = `${tmp}/main.mp4`;
  ff([
    'ffmpeg', '-y', '-i', `"${mainVideo}"`, '-i', `"${mainAudio}"`,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-shortest',
    `"${main}"`,
  ].join(' '));

  // 4) Closing card video + music bed
  process.stdout.write(`> ${spec.fmt} closing frames `);
  const closingDir = `${tmp}/closing`;
  await renderSequence(CLOSING_TEMPLATE, spec, CLOSING_FRAMES, closingDir);
  console.log(' done');

  const closingVideo = `${tmp}/closing_video.mp4`;
  ff([
    'ffmpeg', '-y',
    '-framerate', String(FPS), '-i', `"${closingDir}/frame_%04d.png"`,
    '-vf', `"scale=${spec.w}:${spec.h},format=yuv420p"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-t', String(CLOSING_DURATION), '-an', `"${closingVideo}"`,
  ].join(' '));

  const closingAudio = `${tmp}/closing_audio.m4a`;
  ff([
    'ffmpeg', '-y', '-i', `"${MUSIC_SRC}"`,
    '-t', String(CLOSING_DURATION),
    '-af', `"afade=t=in:st=0:d=0.4,afade=t=out:st=${(CLOSING_DURATION - 0.7).toFixed(2)}:d=0.7,volume=0.7"`,
    '-c:a', 'aac', '-b:a', '192k', `"${closingAudio}"`,
  ].join(' '));

  const closing = `${tmp}/closing.mp4`;
  ff([
    'ffmpeg', '-y', '-i', `"${closingVideo}"`, '-i', `"${closingAudio}"`,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-shortest',
    `"${closing}"`,
  ].join(' '));

  // 5) Concat main + closing (re-encode through the concat filter so the
  // two segments line up cleanly regardless of small encode differences).
  ff([
    'ffmpeg', '-y',
    '-i', `"${main}"`, '-i', `"${closing}"`,
    '-filter_complex',
    `"[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]"`,
    '-map', '"[v]"', '-map', '"[a]"',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    `"${out}"`,
  ].join(' '));

  console.log(`  done ${out}`);
}

for (const spec of TARGETS) {
  await renderFormat(spec);
}

await browser.close();
console.log('\nAll formats rebuilt.');
