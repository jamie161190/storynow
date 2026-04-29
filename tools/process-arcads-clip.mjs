#!/usr/bin/env node
// Founder-style talking-head ad pipeline using Arcads.
//   1. Look up a hook script by id from tools/scripts/founder-hooks.json
//   2. Submit to Arcads (or load a pre-downloaded clip via --clip)
//   3. Append a 3s brand end card via ffmpeg
//
// Usage:
//   node tools/process-arcads-clip.mjs --hook founder-origin --actor arc_xxxx
//   node tools/process-arcads-clip.mjs --hook bedtime-the-look --clip path/to/raw.mp4
//   node tools/process-arcads-clip.mjs --list-hooks
//   ARCADS_API_KEY=… node tools/process-arcads-clip.mjs --list-actors

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { listActors, createVideo, waitForVideo, downloadVideo } from './lib/arcads-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);

const hooks = JSON.parse(readFileSync(resolve(__dirname, 'scripts', 'founder-hooks.json'), 'utf8')).hooks;

if (args['list-hooks']) {
  console.log('\nAvailable hook scripts:\n');
  for (const h of hooks) console.log(`  ${h.id.padEnd(28)} [${h.angle}, ~${h.duration_target}s]`);
  console.log('');
  process.exit(0);
}

if (args['list-actors']) {
  const actors = await listActors();
  console.log(JSON.stringify(actors, null, 2));
  process.exit(0);
}

if (!args.hook) { console.error('--hook <id> required (use --list-hooks to see options)'); process.exit(1); }
const hook = hooks.find(h => h.id === args.hook);
if (!hook) { console.error(`Unknown hook id: ${args.hook}`); process.exit(1); }

const W = 1080, H = 1920, FPS = 25;
const ENDCARD_DUR = 3;

const TMP = join(ROOT, 'out', 'tmp', `arcads-${hook.id}`);
const FINAL_DIR = join(ROOT, 'out', 'videos', 'founder');
mkdirSync(TMP, { recursive: true });
mkdirSync(FINAL_DIR, { recursive: true });

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}
function esc(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}

console.log(`\nHook: ${hook.id}  (${hook.angle}, ~${hook.duration_target}s)\nScript:\n  "${hook.script}"\n`);

// ─────────────────────────────────────────────────────────────────
// 1. Get raw Arcads clip (either from --clip or by submitting a job)
// ─────────────────────────────────────────────────────────────────

let rawClip;
if (args.clip) {
  rawClip = resolve(args.clip);
  if (!existsSync(rawClip)) { console.error(`Clip not found: ${rawClip}`); process.exit(1); }
  console.log(`Using local clip: ${rawClip}`);
} else {
  if (!args.actor) { console.error('--actor <arcads_actor_id> required (or pass --clip <path> to skip Arcads)'); process.exit(1); }
  console.log(`Submitting to Arcads (actor=${args.actor})…`);
  const submission = await createVideo({ actorId: args.actor, script: hook.script, aspectRatio: '9:16' });
  console.log(`Job ${submission.id} queued. Polling…`);
  const done = await waitForVideo(submission.id, {
    onProgress: v => process.stdout.write(`  status=${v.status}\r`)
  });
  console.log(`\nJob complete. Downloading…`);
  rawClip = join(TMP, 'arcads-raw.mp4');
  await downloadVideo(done.video_url || done.url, rawClip);
  console.log(`Downloaded → ${rawClip}`);
}

// Conform to 1080×1920
const conformed = join(TMP, 'conformed.mp4');
ffmpeg(['-y', '-i', rawClip,
  '-vf', `scale=${W}:${H}:force_original_aspect_ratio=cover,crop=${W}:${H},format=yuv420p`,
  '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k', conformed]);

// ─────────────────────────────────────────────────────────────────
// 2. End card
// ─────────────────────────────────────────────────────────────────

const endCardImg = join(TMP, 'endcard.png');
const endCardClip = join(TMP, 'endcard.mp4');
{
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#1F1B2E;color:#F4ECDB;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:80px;overflow:hidden}
.glow{position:fixed;inset:-30%;background:radial-gradient(circle at 50% 30%,rgba(122,85,201,.45),transparent 60%);pointer-events:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#E0B7A0;margin-bottom:32px;position:relative}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:88px;line-height:1.05;letter-spacing:-.01em;position:relative}
.sub{font-family:Inter,sans-serif;font-size:26px;color:rgba(244,236,219,.75);margin-top:32px;position:relative}
.cta{margin-top:60px;padding:28px 56px;background:#D87A3E;color:#fff;border-radius:999px;font-weight:600;font-size:24px;display:inline-flex;align-items:center;gap:10px;position:relative}
</style></head><body><div class="glow"></div>
<div class="eyebrow">HEARTHEIRNAME.COM</div>
<h1>Made by hand. Same day.</h1>
<div class="sub">Free 2-min preview · £24.99 · No card today</div>
<div class="cta">heartheirname.com →</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script>
</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  await page.screenshot({ path: endCardImg, type: 'png' });
  await browser.close();
}
ffmpeg(['-y', '-loop', '1', '-i', endCardImg, '-t', String(ENDCARD_DUR),
  '-r', String(FPS), '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-f', 'lavfi', '-t', String(ENDCARD_DUR), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', endCardClip]);

// ─────────────────────────────────────────────────────────────────
// 3. Concat + final mux
// ─────────────────────────────────────────────────────────────────

const concatTxt = join(TMP, 'concat.txt');
const { writeFileSync } = await import('node:fs');
writeFileSync(concatTxt, `file '${conformed}'\nfile '${endCardClip}'\n`);
const finalPath = join(FINAL_DIR, `${hook.id}-${Date.now()}.mp4`);
ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', finalPath]);

console.log(`\n✓ Done → ${finalPath}\n`);
