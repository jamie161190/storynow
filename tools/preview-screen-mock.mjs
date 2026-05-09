#!/usr/bin/env node
// Render screenshots of (a) the preview-ready email and (b) the /preview/[id]
// listen page, both with mock Maya data — for showing the customer experience
// without touching production rows.

import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'out', 'screens');
mkdirSync(OUT, { recursive: true });

const W = 540, H = 1170;
const W_DESKTOP = 720, H_DESKTOP = 1280;

const browser = await puppeteer.launch({ headless: 'new' });

// ─────────────────────────────────────────────────────────────────
// 1. Email template render — what lands in the inbox
// ─────────────────────────────────────────────────────────────────
{
  // Import the template module dynamically
  const mod = await import('../netlify/functions/lib/email-templates-v2.mjs');
  const tmpl = mod.emailPreviewReady({
    firstName: 'Sarah',
    childList: 'Maya',
    previewTitle: "Maya's Story",
    previewUrl: 'https://heartheirname.com/preview/abc-123?t=demo'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1100, deviceScaleFactor: 2 });
  await page.setContent(tmpl.html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  const out = join(OUT, '01-email-preview-ready.png');
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(`✓ Email render → ${out}`);
}

// ─────────────────────────────────────────────────────────────────
// 2. /preview/[id] page render in two states (waiting + ready)
// ─────────────────────────────────────────────────────────────────

// Hit the LIVE /preview/[id] page with request interception that returns
// mock JSON for /api/preview-meta. This way we render the real production
// page exactly as a customer would see it, without touching DB rows.
async function renderPreview(state, outName) {
  const page = await browser.newPage();
  await page.setViewport({ width: W_DESKTOP, height: H_DESKTOP, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/preview-meta')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state)
      });
    } else {
      req.continue();
    }
  });
  await page.goto('https://heartheirname.com/preview/abc-123?t=demo', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const out = join(OUT, outName);
  await page.screenshot({ path: out, fullPage: false });
  await page.close();
  console.log(`✓ Preview page (${state.preview ? 'ready' : 'waiting'}) → ${out}`);
}

// Waiting state — verified, preview being generated
await renderPreview({
  id: 'abc-123',
  childName: 'Maya',
  status: 'preview_queued',
  verified: true,
  preview: null,
  paid: false,
  full: null,
  storyData: { voice: 'Irish (lilting)', storyKind: 'bedtime', isGift: false, giftFrom: '' }
}, '02-preview-waiting.png');

// Ready state — preview generated, listen + buy
await renderPreview({
  id: 'abc-123',
  childName: 'Maya',
  status: 'preview_ready',
  verified: true,
  preview: {
    url: 'https://heartheirname.com/audio/samples/oliver.mp3',
    readyAt: new Date().toISOString(),
    title: "Maya and the Map Inside the Drawer"
  },
  paid: false,
  full: null,
  storyData: { voice: 'Irish (lilting)', storyKind: 'bedtime', isGift: false, giftFrom: '' }
}, '03-preview-ready.png');

await browser.close();
console.log(`\nAll screens saved → out/screens/`);
