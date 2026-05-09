#!/usr/bin/env node
// v6 build: single floating card near the top, cycles through 4 states.
// Bottom of frame shows the Home Alone footage in full width (where the
// original v3 had a left rail). Top wordmark + bottom CTA pill kept.
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/v6-{fmt}-side-panel.mp4
//
// Strategy:
//   1. We use Home Alone.MOV (1080x1920 source) as the underlying footage
//      because the v3 video has the rail baked in. Cropping the v3's right
//      pane up to full width would lose half the picture.
//   2. We render the card-cycler overlay PNG sequence at 8 fps (8 * 26 = 208
//      frames per format).
//   3. Composite Home Alone.MOV (cropped per format) + overlay → 26.4s "main".
//   4. Append the v3 closing card (cut from v3 starting at t=29.5) to give us
//      the same closing brand frame the user already trusts.
//
// Usage:
//   node tools/render-card-cycler.mjs
//   node tools/render-card-cycler.mjs --fmt 916
//   node tools/render-card-cycler.mjs --fps 10

import puppeteer from 'puppeteer';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'side-panel-cycler.html')).href;

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
// Use the subbed Home Alone source (has burned-in subtitles + modesty boxes
// + the mid-ad CTA chip from the original ad build). The raw Content/Home
// Alone.MOV is missing all of those overlays.
const MAIN_DURATION = 29.5;          // trim subbed source so the v3 closing card can take over
const TOTAL_FRAMES = Math.round(FPS * MAIN_DURATION);

const HOME_ALONE_SRC = '/Users/jamieharish/Desktop/Meta Ads/Home Alone.MOV.subbed.mp4';
const V3_BASE_FOR_AUDIO_AND_CLOSING = '/Users/jamieharish/Desktop/Meta Ads/Generated/v3-916-side-panel.mp4';

const FORMATS = [
  { fmt: '916', w: 1080, h: 1920, out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v6-916-side-panel.mp4' },
  { fmt: '45',  w: 1080, h: 1350, out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v6-45-side-panel.mp4'  },
  { fmt: '11',  w: 1080, h: 1080, out: '/Users/jamieharish/Desktop/Meta Ads/Generated/v6-11-side-panel.mp4'  },
];

const TARGETS = args.fmt
  ? FORMATS.filter(f => f.fmt === String(args.fmt))
  : FORMATS;

console.log(`Rendering ${TARGETS.length} format(s) at ${FPS} fps for ${MAIN_DURATION}s = ${TOTAL_FRAMES} frames each.`);

const browser = await puppeteer.launch({ headless: 'new' });

async function renderFormat(spec) {
  const tmp = `/tmp/v6-cycler/${spec.fmt}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // 1) Render PNG sequence
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

  // 2) Build the main video: Home Alone footage + overlay PNGs.
  // Source is 1080x1920 with burned-in subtitles around y=180-400.
  // Centred crop would remove the top, killing subtitles. Crop from the
  // bottom only so the subtitle area is always preserved.
  // 9:16: no crop. 4:5: crop bottom 570. 1:1: crop bottom 840.
  const cropFilter = spec.h === 1920
    ? 'null'
    : `crop=${spec.w}:${spec.h}:0:0`;

  const mainOut = `${tmp}/main.mp4`;
  console.log(`  ffmpeg main → ${mainOut}`);
  const mainCmd = [
    'ffmpeg', '-y',
    '-i', `"${HOME_ALONE_SRC}"`,
    '-framerate', String(FPS),
    '-i', `"${tmp}/frame_%04d.png"`,
    '-filter_complex', `"[0:v]${cropFilter}[base];[base][1:v]overlay=0:0:eof_action=pass"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-an',
    `"${mainOut}"`
  ].join(' ');
  execSync(mainCmd, { stdio: ['ignore', 'ignore', 'pipe'] });

  // 3) Cut the v3's closing card portion (t=29.5 to end of v3).
  // The subbed source above ends at MAIN_DURATION (29.5s) which is right when
  // the v3 closing card transition begins, so they line up cleanly.
  const v3Match = `/Users/jamieharish/Desktop/Meta Ads/Generated/v3-${spec.fmt}-side-panel.mp4`;
  const closingOut = `${tmp}/closing.mp4`;
  console.log(`  ffmpeg closing → ${closingOut}`);
  const closingCmd = [
    'ffmpeg', '-y',
    '-ss', String(MAIN_DURATION),
    '-i', `"${v3Match}"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-an',
    `"${closingOut}"`
  ].join(' ');
  execSync(closingCmd, { stdio: ['ignore', 'ignore', 'pipe'] });

  // 4) Concat main + closing (video) and mux audio from v3 (which has the
  // full mix: narration + closing card music)
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

  // Final mux: take video from concat, audio from v3
  console.log(`  ffmpeg final mux → ${spec.out}`);
  execSync([
    'ffmpeg', '-y',
    '-i', `"${concatVideoOut}"`,
    '-i', `"${v3Match}"`,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-shortest',
    `"${spec.out}"`
  ].join(' '), { stdio: ['ignore', 'ignore', 'pipe'] });

  console.log(`  ✓ ${spec.out}`);
}

for (const spec of TARGETS) {
  if (!existsSync(HOME_ALONE_SRC)) {
    console.error(`Home Alone source not found: ${HOME_ALONE_SRC}`);
    process.exit(1);
  }
  await renderFormat(spec);
}

await browser.close();
console.log('\nAll done.');
