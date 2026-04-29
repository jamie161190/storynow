#!/usr/bin/env node
// Take a raw Sora 2 clip + a brief, produce a finished 1080x1920 ad:
//   - Scale Sora video to 1080x1920 (cover crop)
//   - Replace Sora's audio with ElevenLabs narration + ducked music bed
//   - Overlay hook caption (0-2.5s) and "Now playing" pill (2.5s+)
//   - Append 3s brand end card
//
// Usage:
//   node tools/finalize-sora-ad.mjs --video /tmp/sora-reaction.mp4 --brief tools/briefs/reaction-maya-bedtime.json --out reaction
//   node tools/finalize-sora-ad.mjs --video /tmp/sora-gift.mp4     --brief tools/briefs/gift-christmas-2026.json    --out gift

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { generateTTS } from './lib/elevenlabs-tts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
if (!args.video || !args.brief || !args.out) { console.error('--video <path> --brief <path> --out <slug> required'); process.exit(1); }

const sora = resolve(args.video);
const brief = JSON.parse(readFileSync(args.brief, 'utf8'));
const outSlug = args.out;
const NAME = `${outSlug}-${brief.name || 'ad'}`;

const W = 1080, H = 1920, FPS = 25;
const HOOK_END = 2.5;

const TMP = join(ROOT, 'out', 'tmp', `final-${outSlug}`);
const FINAL_DIR = join(ROOT, 'out', 'videos', 'final');
mkdirSync(TMP, { recursive: true });
mkdirSync(FINAL_DIR, { recursive: true });

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}
function ffprobeDur(p){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',p],{encoding:'utf8'});return parseFloat(r.stdout.trim());}
function esc(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}

const soraDur = ffprobeDur(sora);
const endCardDur = brief.end_card?.duration || 3;
const totalDur = soraDur + endCardDur;
console.log(`\nFinalising ${outSlug}: sora=${soraDur.toFixed(1)}s + endcard=${endCardDur}s = ${totalDur.toFixed(1)}s\n`);

// 1. Scale + conform Sora clip to 1080x1920.
// Sora 2 outputs 720x1280 (already 9:16) so a straight scale works. If a future
// Sora variant returns a different aspect we add a crop=ow=W,oh=H to centre-crop.
const conformed = join(TMP, 'conformed.mp4');
ffmpeg(['-y', '-i', sora,
  '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-r', String(FPS), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', conformed]);

// 2. Render hook caption + now-playing pill
const hookText = brief.hook_caption || (outSlug === 'gift' ? 'I got her something she\'ll actually remember' : 'I made my 5-year-old a story with her name in it');
const childName = brief.child_name || 'their';
const hookPng = join(TMP, 'hook.png');
const playingPng = join(TMP, 'playing.png');

const browser = await puppeteer.launch({ headless: 'new' });
async function renderPng(html, viewport, out, omitBg = true) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.w, height: viewport.h, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  await page.screenshot({ path: out, type: 'png', omitBackground: omitBg });
  await page.close();
}

// Hook caption — full bleed, large, dark scrim behind text for legibility
await renderPng(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Inter,sans-serif;display:flex;align-items:flex-end;justify-content:center;padding:240px 60px;overflow:hidden}
.hook{font-size:64px;font-weight:900;color:#fff;text-align:center;line-height:1.05;letter-spacing:-.005em;text-transform:uppercase;text-shadow:0 4px 24px rgba(0,0,0,.7),0 0 12px rgba(0,0,0,.85);max-width:960px;background:rgba(0,0,0,0.0);padding:0}
</style></head><body><div class="hook">${esc(hookText)}</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script></body></html>`, {w:W,h:H}, hookPng, true);

// Now-playing pill — top-left, small
await renderPng(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Inter,sans-serif;padding:60px;overflow:hidden}
.tag{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;background:rgba(31,27,46,.85);color:#F4ECDB;border-radius:999px;font-size:20px;font-weight:600}
.dot{width:9px;height:9px;border-radius:999px;background:#D87A3E}
.kicker{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(244,236,219,.6)}
</style></head><body><div class="tag"><span class="dot"></span><span class="kicker">Now playing</span><span>${esc(childName)}'s story</span></div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script></body></html>`, {w:W,h:H}, playingPng, true);

// 3. Brand end card
const endCardImg = join(TMP, 'endcard.png');
await renderPng(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#1F1B2E;color:#F4ECDB;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:80px;overflow:hidden}
.glow{position:fixed;inset:-30%;background:radial-gradient(circle at 50% 30%,rgba(122,85,201,.45),transparent 60%);pointer-events:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#E0B7A0;margin-bottom:32px;position:relative}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:84px;line-height:1.05;letter-spacing:-.01em;position:relative}
.sub{font-family:Inter,sans-serif;font-size:26px;color:rgba(244,236,219,.75);margin-top:32px;position:relative}
.cta{margin-top:60px;padding:28px 56px;background:#D87A3E;color:#fff;border-radius:999px;font-weight:600;font-size:24px;display:inline-flex;align-items:center;gap:10px;position:relative}
</style></head><body><div class="glow"></div>
<div class="eyebrow">${esc(brief.end_card?.eyebrow || 'HEARTHEIRNAME.COM')}</div>
<h1>${esc(brief.end_card?.headline || 'A story made just for them.')}</h1>
<div class="sub">${esc(brief.end_card?.subline || '£24.99 · Free 2-min preview')}</div>
<div class="cta">heartheirname.com →</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script>
</body></html>`, {w:W,h:H}, endCardImg, false);

await browser.close();

const endCardClip = join(TMP, 'endcard.mp4');
ffmpeg(['-y', '-loop', '1', '-i', endCardImg, '-t', String(endCardDur),
  '-r', String(FPS), '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', endCardClip]);

// 4. Overlay hook + pill on the conformed sora clip
const captioned = join(TMP, 'captioned.mp4');
ffmpeg(['-y', '-i', conformed, '-i', hookPng, '-i', playingPng,
  '-filter_complex',
  `[0:v][1:v]overlay=enable='between(t,0.0,${HOOK_END})':x=0:y=0[v1];[v1][2:v]overlay=enable='gte(t,${HOOK_END})':x=0:y=0[out]`,
  '-map', '[out]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', captioned]);

// 5. Voiceover
const voPath = join(TMP, 'voiceover.mp3');
const voText = brief.voiceover || brief.story_passage;
console.log(`Generating voiceover (${brief.voice || 'British (warm)'})…`);
await generateTTS({ text: voText, voice: brief.voice || 'British (warm)', outPath: voPath });

// 6. Concat captioned + endcard
const concatTxt = join(TMP, 'concat.txt');
writeFileSync(concatTxt, `file '${captioned}'\nfile '${endCardClip}'\n`);
const silentMp4 = join(TMP, 'video-silent.mp4');
ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', silentMp4]);

// 7. Mix audio: VO + ducked music
const musicPath = resolve(ROOT, brief.music || 'public/music/bedtime-ambient.mp3');
const musicVol = brief.music_volume || 0.15;
const audioPath = join(TMP, 'audio.mp3');
ffmpeg(['-y',
  '-i', voPath,
  '-stream_loop', '-1', '-i', musicPath,
  '-filter_complex', `[0:a]apad=pad_dur=${endCardDur},atrim=duration=${totalDur},volume=1.0[v];[1:a]volume=${musicVol},atrim=duration=${totalDur}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
  '-map', '[mix]', '-t', String(totalDur), '-ac', '2', '-b:a', '160k', audioPath]);

// 8. Final mux
const finalPath = join(FINAL_DIR, `${NAME}-${Date.now()}.mp4`);
ffmpeg(['-y', '-i', silentMp4, '-i', audioPath,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-t', String(totalDur), '-movflags', '+faststart', finalPath]);

console.log(`\n✓ Done → ${finalPath}\n`);
