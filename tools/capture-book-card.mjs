#!/usr/bin/env node
// Capture the homepage hero "book card" as standalone ad videos.
//
// The HearTheirName-Ad / -Feed / -Story / -Square ads are screen-captures
// of the book card in public/index.html (the cover that cycles through
// names + bundle details). There was no committed tool that produced them,
// so this rebuilds the capture from the current, corrected homepage.
//
// It serves public/ locally, loads index.html, isolates the .book-cover so
// it fills the frame, lets the card cycle on its own timers, and screencasts
// ~30s per format.
//
// Output: /Users/jamieharish/Desktop/Meta Ads/Generated/book-card-{fmt}.mp4
//
// Usage:
//   node tools/capture-book-card.mjs
//   node tools/capture-book-card.mjs --fmt 916
//   node tools/capture-book-card.mjs --seconds 30

import puppeteer from 'puppeteer';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const OUT_DIR = '/Users/jamieharish/Desktop/Meta Ads/Generated';

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
const SECONDS = parseInt(args.seconds || '30', 10);

// The book card's content is fixed-px, sized for a ~540px-wide card. So we
// capture at half resolution (where the text looks right) and upscale 2x to
// the final 1080-wide deliverable, same approach as record-walkthrough.mjs.
const FORMATS = [
  { fmt: '916', cw: 540, ch: 960, w: 1080, h: 1920 },  // Story / Ad
  { fmt: '45',  cw: 540, ch: 675, w: 1080, h: 1350 },  // Feed
  // The card content is taller than a square at the 540 scale, so the square
  // is captured wider (content sits smaller relative to the frame) then
  // upscaled less.
  { fmt: '11',  cw: 760, ch: 760, w: 1080, h: 1080 },  // Square
];
const TARGETS = args.fmt ? FORMATS.filter(f => f.fmt === String(args.fmt)) : FORMATS;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

// Tiny static server for public/ so index.html's absolute asset paths resolve.
const server = http.createServer(async (req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/') u = '/index.html';
  const file = join(PUBLIC, u);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URL = `http://localhost:${PORT}/index.html`;
console.log(`Serving public/ on :${PORT}`);

const wait = ms => new Promise(r => setTimeout(r, ms));
const ff = cmd => execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });

// Runs in the page: strip the homepage down to just the book cover, fixed
// full-frame, content vertically centred. The card's own cycling timers
// keep running because the #bookName etc. nodes stay in the DOM.
function isolateBookCard() {
  const cover = document.querySelector('.book-cover');
  const content = document.querySelector('.book-content');
  if (!cover || !content) throw new Error('book card not found');
  document.documentElement.style.background = '#1F1B2E';
  document.body.replaceChildren(cover);
  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:#1F1B2E';
  cover.style.cssText =
    'position:fixed;inset:0;border-radius:0;overflow:hidden;' +
    'background:linear-gradient(160deg,#3D2E5A 0%,#1F1B2E 60%,#0F0B20 100%)';
  content.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'justify-content:center;gap:16px;color:#F4ECDB;' +
    'padding:7% 9%;box-sizing:border-box;max-width:none';
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
});

for (const spec of TARGETS) {
  const page = await browser.newPage();
  await page.setViewport({ width: spec.cw, height: spec.ch, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(isolateBookCard);
  await wait(600); // settle

  const webm = `/tmp/book-card-${spec.fmt}.webm`;
  const out = `${OUT_DIR}/book-card-${spec.fmt}.mp4`;
  process.stdout.write(`> ${spec.fmt} (${spec.cw}x${spec.ch} -> ${spec.w}x${spec.h}) recording ${SECONDS}s `);
  const recorder = await page.screencast({ path: webm });
  for (let s = 0; s < SECONDS; s++) { await wait(1000); if (s % 5 === 0) process.stdout.write('.'); }
  await recorder.stop();
  await page.close();

  // webm -> mp4, upscaled 2x to the final deliverable size, yuv420p for Meta.
  ff([
    'ffmpeg', '-y', '-i', `"${webm}"`,
    '-vf', `"scale=${spec.w}:${spec.h}:flags=lanczos,format=yuv420p"`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an',
    `"${out}"`,
  ].join(' '));
  console.log(` done ${out}`);
}

await browser.close();
server.close();
console.log('\nAll formats captured.');
