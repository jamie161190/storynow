#!/usr/bin/env node
// Render static book-cover ad creatives via Puppeteer.
// One PNG per (name × tone × ratio). Default: full sweep = names × 3 tones × 3 ratios.
//
// Usage:
//   node tools/render-book-statics.mjs                              # full sweep
//   node tools/render-book-statics.mjs --names Oliver,Maya,Arlo     # subset
//   node tools/render-book-statics.mjs --tones statement            # one tone
//   node tools/render-book-statics.mjs --ratios 1080x1350           # one ratio
//   node tools/render-book-statics.mjs --concurrency 4              # parallel pages

import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'book-cover.html')).href;
const NAMES_FILE = resolve(__dirname, 'data', 'names.json');
const OUT_BASE = resolve(__dirname, '..', 'out', 'statics');

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) opts[k] = true;
      else { opts[k] = v; i++; }
    }
  }
  return opts;
}

const args = parseArgs(process.argv);
const data = JSON.parse(readFileSync(NAMES_FILE, 'utf8'));
const allRatios = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1080x1920': [1080, 1920] };

const names = args.names ? String(args.names).split(',').map(s => s.trim()).filter(Boolean) : data.names;
const tones = args.tones ? String(args.tones).split(',').map(s => s.trim()) : data.tones;
const ratios = args.ratios ? String(args.ratios).split(',').map(s => s.trim()) : data.ratios;
const concurrency = parseInt(args.concurrency || '3', 10);

const titleHooks = ['and the Fox Who Was Waiting', 'and the Map Inside the Drawer', 'and the Night the Stars Came Down', 'and the Lighthouse', 'and the Map of the Sea'];
const titleHookFor = (name) => titleHooks[name.charCodeAt(0) % titleHooks.length];

// Build job list
const jobs = [];
for (const ratio of ratios) {
  if (!allRatios[ratio]) { console.warn(`Skipping unknown ratio ${ratio}`); continue; }
  const [w, h] = allRatios[ratio];
  mkdirSync(join(OUT_BASE, ratio), { recursive: true });
  for (const name of names) {
    for (const tone of tones) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const out = join(OUT_BASE, ratio, `${slug}-${tone}.png`);
      jobs.push({ name, tone, ratio, w, h, out });
    }
  }
}

console.log(`${jobs.length} renders queued (names=${names.length} × tones=${tones.length} × ratios=${ratios.length}). Concurrency=${concurrency}`);

const browser = await puppeteer.launch({ headless: 'new' });

async function render(job) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: job.w, height: job.h, deviceScaleFactor: 1 });
    const url = `${TEMPLATE}?name=${encodeURIComponent(job.name)}&tone=${encodeURIComponent(job.tone)}&ratio=${encodeURIComponent(job.ratio)}&titleHook=${encodeURIComponent(titleHookFor(job.name))}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait for fonts + ready flag
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    await page.screenshot({ path: job.out, type: 'png', omitBackground: false });
    process.stdout.write('.');
  } catch (err) {
    process.stdout.write('x');
    console.error(`\n  ✗ ${job.out}: ${err.message}`);
  } finally {
    await page.close();
  }
}

// Worker pool
const queue = [...jobs];
const workers = [];
for (let i = 0; i < concurrency; i++) {
  workers.push((async () => {
    while (queue.length) {
      const j = queue.shift();
      if (j) await render(j);
    }
  })());
}
const start = Date.now();
await Promise.all(workers);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n\nDone. ${jobs.length} renders in ${elapsed}s. Output → out/statics/<ratio>/<slug>-<tone>.png`);

await browser.close();
