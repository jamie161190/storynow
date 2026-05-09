#!/usr/bin/env node
// Build a ~5s "buy moment" mp4: phone with inbox → email opened with £24.99
// CTA → tap-and-paid confirmation. All rendered via Puppeteer's screencast.
//
// Usage:
//   node tools/build-buy-moment.mjs --child Maya --out out/animations/buy-moment-maya.mp4

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
const CHILD = args.child || 'Maya';
const PRICE = args.price || '£24.99';
const OUT = resolve(args.out || `out/animations/buy-moment-${CHILD.toLowerCase()}.mp4`);
mkdirSync(dirname(OUT), { recursive: true });

const W = 1080, H = 1920;
const FPS = 30;

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}

const html = `<!doctype html><html><head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{--paper:#F4ECDB;--ink:#1F1B2E;--plum:#4B2E83;--terra:#D87A3E;--rose:#E0B7A0;--muted:#5C5240;--line:rgba(31,27,46,.12)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:var(--ink);overflow:hidden;font-family:Inter,sans-serif}
.stage{position:relative;width:100%;height:100%}
.scene{position:absolute;inset:0;opacity:0}
.scene.show{opacity:1;transition:opacity .35s ease}

/* shared phone frame */
.phone{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:760px;height:1500px;background:#1A1428;border-radius:78px;box-shadow:0 60px 120px -30px rgba(0,0,0,.7),0 0 0 8px #000;padding:18px}
.phone-screen{position:relative;width:100%;height:100%;background:#fff;border-radius:60px;overflow:hidden}
.notch{position:absolute;left:50%;top:14px;transform:translateX(-50%);width:200px;height:30px;background:#000;border-radius:20px;z-index:10}

/* scene 1: inbox */
.inbox{padding:80px 24px 40px}
.inbox .top{display:flex;justify-content:space-between;align-items:center;padding:0 16px 24px;color:#666;font-size:14px}
.inbox .heading{font-size:30px;font-weight:700;color:#111;padding:0 16px 18px}
.email{display:flex;gap:14px;padding:18px 18px;border-radius:16px;background:rgba(216,122,62,.08);border:1.5px solid rgba(216,122,62,.4);margin:0 8px;animation:emailPulse 1.6s ease-in-out infinite}
@keyframes emailPulse{0%,100%{box-shadow:0 0 0 0 rgba(216,122,62,.4)}50%{box-shadow:0 0 0 16px rgba(216,122,62,0)}}
.email .av{width:52px;height:52px;border-radius:999px;background:var(--plum);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:24px;flex-shrink:0}
.email .body{flex:1;min-width:0}
.email .row{display:flex;justify-content:space-between;font-size:18px;color:#111;font-weight:600;align-items:baseline}
.email .time{font-size:14px;color:#999;font-weight:400}
.email .subj{font-size:18px;color:#222;margin-top:4px;font-weight:600}
.email .preview{font-size:15px;color:#666;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.email .unread{position:absolute;left:24px;top:50%;width:10px;height:10px;background:var(--terra);border-radius:999px;transform:translateY(-50%)}
.inbox .other{padding:18px 24px;color:#bbb;font-size:14px}

/* scene 2: opened email */
.opened{padding:80px 24px 24px;height:100%;display:flex;flex-direction:column}
.opened .header{padding:0 8px 18px;border-bottom:1px solid #eee;margin-bottom:18px}
.opened .from{display:flex;align-items:center;gap:12px;font-size:15px;color:#666}
.opened .from .av{width:36px;height:36px;border-radius:999px;background:var(--plum);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:18px}
.opened .from b{color:#111;font-weight:600}
.opened .subject{font-size:24px;font-weight:700;color:#111;margin-top:14px;line-height:1.25}
.opened .body{flex:1;padding:0 8px;font-size:18px;line-height:1.55;color:#333;font-family:'Cormorant Garamond',serif;font-weight:400}
.opened .body p{margin:18px 0}
.opened .player{display:flex;align-items:center;gap:14px;padding:18px;background:var(--paper);border-radius:14px;margin:24px 0}
.opened .player .play{width:48px;height:48px;border-radius:999px;background:var(--terra);color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.opened .player .label{font-family:Inter,sans-serif;font-size:15px;color:var(--ink);font-weight:600}
.opened .player .label .mono{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:2px}
.opened .cta{display:flex;flex-direction:column;align-items:stretch;padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:18px;margin-top:18px}
.opened .cta .price-line{text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px;color:var(--plum);margin-bottom:10px}
.opened .cta .btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:24px 28px;background:var(--terra);color:#fff;border-radius:14px;font-family:Inter,sans-serif;font-weight:700;font-size:24px;text-align:center}
.tap-circle{position:absolute;left:50%;top:1180px;width:140px;height:140px;background:rgba(255,255,255,.45);border-radius:999px;transform:translate(-50%,-50%) scale(0);pointer-events:none;mix-blend-mode:overlay}
.tap{animation:tapPress .9s ease forwards}
@keyframes tapPress{0%{transform:translate(-50%,-50%) scale(.5);opacity:.9}60%{transform:translate(-50%,-50%) scale(2.2);opacity:.4}100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}

/* scene 3: paid */
.scene-paid{background:var(--paper)}
.paid{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--ink);text-align:center;padding:60px;background:var(--paper)}
.paid .check{width:160px;height:160px;border-radius:999px;background:#22c55e;color:#fff;display:inline-flex;align-items:center;justify-content:center;margin-bottom:32px;animation:checkPop .55s cubic-bezier(.22,1,.36,1) forwards}
@keyframes checkPop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
.paid .check svg{width:80px;height:80px}
.paid .h{font-family:'Cormorant Garamond',serif;font-size:80px;font-weight:600;color:#111;line-height:1.05;letter-spacing:-.01em}
.paid .h em{color:var(--plum);font-style:italic}
.paid .sub{font-family:Inter,sans-serif;font-size:24px;color:#666;margin-top:18px;max-width:600px}
.paid .ref{font-family:'JetBrains Mono',monospace;font-size:14px;color:#999;margin-top:24px;letter-spacing:.08em}

/* hand cursor that taps */
.cursor{position:absolute;width:96px;height:96px;background:rgba(0,0,0,.55);border:5px solid #fff;border-radius:999px;left:540px;top:1180px;transform:translate(-50%,-50%);box-shadow:0 0 0 8px rgba(255,255,255,.25),0 8px 28px rgba(0,0,0,.4);transition:transform .25s ease, opacity .25s;z-index:30}
.cursor.tap-active{transform:translate(-50%,-50%) scale(.78)}
.cursor.fade{opacity:0}
</style>
</head><body>
<div class="stage">
  <div class="scene scene-inbox">
    <div class="phone"><div class="notch"></div><div class="phone-screen">
      <div class="inbox">
        <div class="top"><span>9:41</span><span>📶 100%</span></div>
        <div class="heading">Inbox</div>
        <div class="email" style="position:relative">
          <span class="unread"></span>
          <div class="av">J</div>
          <div class="body">
            <div class="row"><span>Jamie · HearTheirName</span><span class="time">just now</span></div>
            <div class="subj">${CHILD}'s preview is ready 🌙</div>
            <div class="preview">Two minutes, made by hand. Press play with her…</div>
          </div>
        </div>
        <div class="other">Mum · 8:30am</div>
        <div class="other">Stripe · Yesterday</div>
        <div class="other">Marketing newsletter · 2d</div>
      </div>
    </div></div>
  </div>

  <div class="scene scene-opened">
    <div class="phone"><div class="notch"></div><div class="phone-screen">
      <div class="opened">
        <div class="header">
          <div class="from"><span class="av">J</span><span>From <b>Jamie · HearTheirName</b></span></div>
          <div class="subject">${CHILD}'s preview is ready 🌙</div>
        </div>
        <div class="body">
          <p>Hi,</p>
          <p>I sat with what you sent me last night. ${CHILD} sounds like a wonder. Here's the first two minutes of her story.</p>
          <div class="player">
            <div class="play">▶</div>
            <div class="label"><span class="mono">FREE · 2-MIN PREVIEW</span>${CHILD}'s Story</div>
          </div>
          <p>If that gave you the feeling I hoped, the full <strong>15-minute</strong> version is one tap away.</p>
          <div class="cta">
            <div class="price-line">The full 15-minute story for ${PRICE}</div>
            <div class="btn">🔒 Buy the full 15-min story · ${PRICE}</div>
          </div>
        </div>
      </div>
    </div></div>
    <div class="cursor" id="cursor"></div>
    <div class="tap-circle" id="tapCircle"></div>
  </div>

  <div class="scene scene-paid">
    <div class="paid">
      <div class="check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="h"><em>${PRICE}</em><br>Paid.</div>
      <div class="sub">${CHILD}'s full <strong>15-minute</strong> story is being made.<br>It'll be in your inbox by tomorrow 7pm.</div>
      <div class="ref">REF · HTN-MAYA-A4F2</div>
    </div>
  </div>
</div>

<script>
const inbox = document.querySelector('.scene-inbox');
const opened = document.querySelector('.scene-opened');
const paid = document.querySelector('.scene-paid');
const cursor = document.getElementById('cursor');
const tapCircle = document.getElementById('tapCircle');

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Scene 1: inbox (1.5s)
  inbox.classList.add('show');
  await wait(1700);
  inbox.classList.remove('show');
  await wait(300);

  // Scene 2: opened email (2.0s with cursor tap)
  opened.classList.add('show');
  await wait(900);
  cursor.classList.add('tap-active');
  tapCircle.classList.add('tap');
  await wait(900);
  cursor.classList.add('fade');
  await wait(200);
  opened.classList.remove('show');
  await wait(250);

  // Scene 3: paid (2.0s hold)
  paid.classList.add('show');
  await wait(2200);

  document.body.dataset.done = 'true';
})();
</script>
</body></html>`;

const browser = await puppeteer.launch({ headless: 'new', args: [`--window-size=${W},${H}`] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

// Use temp webm path then convert to mp4
const tmpWebm = OUT.replace(/\.mp4$/, '.webm');
const recorder = await page.screencast({ path: tmpWebm });
await page.setContent(html, { waitUntil: 'networkidle0' });
// Wait for the JS to finish (data-done flag)
await page.waitForSelector('body[data-done="true"]', { timeout: 20000 });
await new Promise(r => setTimeout(r, 200));
await recorder.stop();
await browser.close();

ffmpeg(['-y', '-i', tmpWebm, '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
        '-r', String(FPS), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', OUT]);

console.log(`✓ Done → ${OUT}`);
