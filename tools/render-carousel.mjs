#!/usr/bin/env node
// Render a 6-slide audio-first carousel for a given seed angle.
// Output: out/carousels/<seed>/slide-{1..6}.png at 1080×1350 (Meta carousel).
//
// Usage:
//   node tools/render-carousel.mjs                       # all 3 seeds
//   node tools/render-carousel.mjs --seed bedtime        # single seed
//   node tools/render-carousel.mjs --seed gift,adventure

import puppeteer from 'puppeteer';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = pathToFileURL(resolve(__dirname, 'templates', 'carousel-slide.html')).href;
const SEEDS_FILE = resolve(__dirname, 'data', 'carousel-seeds.json');
const OUT_BASE = resolve(__dirname, '..', 'out', 'carousels');

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) opts[k] = true; else { opts[k] = v; i++; } }
  }
  return opts;
}

const args = parseArgs(process.argv);
const seedsData = JSON.parse(readFileSync(SEEDS_FILE, 'utf8')).seeds;

const seeds = args.seed ? String(args.seed).split(',').map(s => s.trim()) : Object.keys(seedsData);

const browser = await puppeteer.launch({ headless: 'new' });

async function renderSlide(seedKey, seedData, slide, quoteIdx) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    const params = new URLSearchParams({
      slide: String(slide),
      seed: seedKey,
      name: seedData.name,
      titleHook: seedData.titleHook
    });
    if (slide >= 2 && slide <= 5){
      const q = seedData.quotes[quoteIdx];
      params.set('quoteIndex', String(quoteIdx));
      params.set('quoteTitle', q.title);
      params.set('quoteBody', q.body);
      params.set('quoteLabel', q.label);
    }
    const url = `${TEMPLATE}?${params.toString()}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
    const out = join(OUT_BASE, seedKey, `slide-${slide}.png`);
    await page.screenshot({ path: out, type: 'png' });
    process.stdout.write('.');
    return out;
  } catch (err) {
    process.stdout.write('x');
    console.error(`\n  ✗ ${seedKey}/slide-${slide}: ${err.message}`);
  } finally {
    await page.close();
  }
}

const start = Date.now();
let total = 0;

for (const seedKey of seeds){
  const seedData = seedsData[seedKey];
  if (!seedData){ console.warn(`Skipping unknown seed ${seedKey}`); continue; }
  mkdirSync(join(OUT_BASE, seedKey), { recursive: true });
  console.log(`\nRendering ${seedKey} (name=${seedData.name})…`);
  // Slide 1 (cover), 2-5 (4 quotes), 6 (offer)
  await renderSlide(seedKey, seedData, 1, 0);
  for (let i = 0; i < 4; i++) await renderSlide(seedKey, seedData, i + 2, i);
  await renderSlide(seedKey, seedData, 6, 0);
  total += 6;
}

console.log(`\n\nDone. ${total} slides in ${((Date.now() - start)/1000).toFixed(1)}s. Output → out/carousels/<seed>/slide-{1..6}.png`);
await browser.close();
