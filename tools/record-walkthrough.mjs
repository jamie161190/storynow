#!/usr/bin/env node
// Record a walkthrough of heartheirname.com via Puppeteer's screencast API.
// Output: a WebM showing the form being filled in (then converted to mp4).
// Drives the live site but DOES NOT actually submit (stops before the
// final POST so we don't create a real stories row).
//
// Usage:
//   node tools/record-walkthrough.mjs --url https://heartheirname.com --name Maya --voice "Irish (lilting)"
//
// Output:
//   out/walkthroughs/walkthrough-{stamp}.mp4

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
const URL = args.url || 'https://heartheirname.com';
const NAME = args.name || 'Maya';
const VOICE_LABEL = args.voice || 'Irish (lilting)';
const EMAIL = args.email || 'sarah@example.co.uk';

// Capture at 720x1280 (matches Sora 2 output, under the homepage's 1040px desktop breakpoint
// so we get the mobile layout). Upscale to 1080x1920 in post.
const W = 720, H = 1280;
const FINAL_W = 1080, FINAL_H = 1920;
const stamp = Date.now();
const OUT_DIR = join(ROOT, 'out', 'walkthroughs');
mkdirSync(OUT_DIR, { recursive: true });
const webmPath = join(OUT_DIR, `walkthrough-${stamp}.webm`);
const mp4Path = join(OUT_DIR, `walkthrough-${stamp}.mp4`);

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function typeSlow(page, selector, text, charDelay = 110) {
  await page.click(selector);
  for (const ch of text) {
    await page.keyboard.type(ch);
    await wait(charDelay + Math.random() * 60);
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: ['--hide-scrollbars']
});
const page = await browser.newPage();

console.log(`Recording walkthrough → ${webmPath}`);
const recorder = await page.screencast({ path: webmPath });

try {
  // 1. Land on homepage, hold for ~1.5s
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(1500);

  // 2. Scroll down briefly to show the page content (optional)
  await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
  await wait(800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(600);

  // 3. Click hero CTA → /start
  await page.evaluate(() => {
    const el = document.querySelector('a[href="/start"]');
    if (el) el.click();
  });
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
  await wait(900);

  // 4. Step 1 — kind: click "Bedtime" (the first chip-card)
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.chip-card');
    if (cards[0]) cards[0].click();
  });
  await wait(700);
  await page.evaluate(() => {
    const btn = document.getElementById('continueBtn');
    if (btn && !btn.disabled) btn.click();
  });
  await wait(900);

  // 5. Step 2 — children: type the name letter-by-letter (the HERO moment)
  await page.evaluate(() => { const inp = document.querySelector('.child-card input.txt'); if (inp) inp.focus(); });
  await wait(400);
  for (const ch of NAME) {
    await page.keyboard.type(ch);
    await wait(180 + Math.random() * 120);
  }
  await wait(700);
  // Click age band "4-5"
  await page.evaluate(() => {
    const chips = document.querySelectorAll('.child-card .chip');
    // First row = ages, find "4-5"
    for (const c of chips) if (c.textContent.trim() === '4-5') { c.click(); return; }
  });
  await wait(500);
  // Click pronoun
  await page.evaluate(() => {
    const chips = document.querySelectorAll('.child-card .chip');
    for (const c of chips) if (c.textContent.includes('She')) { c.click(); return; }
  });
  await wait(700);
  // Continue
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(900);

  // 6. Speed-skip themes: click 2 themes + continue
  await page.evaluate(() => {
    const chips = document.querySelectorAll('.chip');
    let count = 0;
    for (const c of chips) { if (count >= 2) break; c.click(); count++; }
  });
  await wait(700);
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(800);

  // 7. Place: click first
  await page.evaluate(() => { const chips = document.querySelectorAll('.chip'); if (chips[0]) chips[0].click(); });
  await wait(600);
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(800);

  // 8. Casting (optional fields) → just continue
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(800);

  // 9. Quirk → just continue
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(800);

  // 10. Voice — pick the chosen voice
  await page.evaluate((label) => {
    const chips = document.querySelectorAll('.chip');
    for (const c of chips) if (c.textContent.includes(label)) { c.click(); return; }
  }, VOICE_LABEL);
  await wait(900);
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(800);

  // 11. Gift step → "For my own family" → continue
  await page.evaluate(() => { const cards = document.querySelectorAll('.chip-card'); if (cards[0]) cards[0].click(); });
  await wait(600);
  await page.evaluate(() => { const b = document.getElementById('continueBtn'); if (b && !b.disabled) b.click(); });
  await wait(900);

  // 12. Email step — type the email letter-by-letter (the second hero moment)
  await page.evaluate(() => { const inp = document.getElementById('emailInput'); if (inp) inp.focus(); });
  await wait(400);
  for (const ch of EMAIL) {
    await page.keyboard.type(ch);
    await wait(75 + Math.random() * 50);
  }
  await wait(1200);

  // STOP HERE — do NOT submit. We only show the form filled in.
  console.log('Walkthrough complete (stopped before submit).');

} catch (err) {
  console.error('Error during walkthrough:', err.message);
} finally {
  await wait(500);
  await recorder.stop();
  await browser.close();
}

// Convert webm → mp4 and upscale from iPhone capture to 1080x1920
console.log(`\nConverting webm → mp4 + upscale to ${FINAL_W}x${FINAL_H}…`);
ffmpeg(['-y', '-i', webmPath,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-an',
  '-vf', `scale=${FINAL_W}:${FINAL_H}:flags=lanczos`,
  mp4Path]);

console.log(`\n✓ Done → ${mp4Path}`);
console.log(`  Open: open ${mp4Path}`);
