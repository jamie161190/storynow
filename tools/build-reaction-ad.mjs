#!/usr/bin/env node
// Reaction-cam UGC builder. Output: 1080×1920 split-screen vertical mp4.
//   Top half:    kid-reaction face (gpt-image-2 still + zoompan, or Sora 2 motion via --use-sora)
//   Bottom half: audio waveform of the story passage with the child's name highlighted
//   Hook caption: 0-2s bold all-caps overlay, then drops to a smaller "now playing" tag
//   End card:    3s brand offer card
//
// Usage:
//   node tools/build-reaction-ad.mjs --brief tools/briefs/reaction-maya-bedtime.json
//   node tools/build-reaction-ad.mjs --brief … --use-sora

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { generateImage } from './lib/openai-image.mjs';
import { generateTTS } from './lib/elevenlabs-tts.mjs';
import { generateVideo as generateSora } from './lib/sora-video.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
if (!args.brief) { console.error('--brief <path> required'); process.exit(1); }
const brief = JSON.parse(readFileSync(args.brief, 'utf8'));

const NAME = brief.name || 'reaction-ad';
const CHILD = brief.child_name || 'them';
const TMP = join(ROOT, 'out', 'tmp', NAME);
const FINAL_DIR = join(ROOT, 'out', 'videos', 'reaction');
mkdirSync(TMP, { recursive: true });
mkdirSync(FINAL_DIR, { recursive: true });

const W = 1080, H = 1920, HALF = 960; // each pane is 1080×960
const FPS = 25;

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}
function esc(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}

// ─────────────────────────────────────────────────────────────────
// 1. Kid still
// ─────────────────────────────────────────────────────────────────

const kidStill = join(TMP, 'kid.png');
if (!(args['reuse-stills'] && existsSync(kidStill))) {
  console.log(`  Generating kid reaction still via gpt-image-2…`);
  await generateImage({ prompt: brief.kid_image_prompt, size: '1024x1024', outPath: kidStill });
}

// ─────────────────────────────────────────────────────────────────
// 2. Voiceover of the story passage (with the name)
// ─────────────────────────────────────────────────────────────────

const voPath = join(TMP, 'voiceover.mp3');
console.log(`  Generating story passage voiceover via ElevenLabs (${brief.voice})…`);
await generateTTS({ text: brief.story_passage, voice: brief.voice || 'British (warm)', outPath: voPath });

// Probe duration of the voiceover so we size the reaction segment correctly
function probeDur(p){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',p],{encoding:'utf8'});return parseFloat(r.stdout.trim());}
const voDur = probeDur(voPath);
const reactionDur = Math.max(8, Math.min(20, Math.ceil(voDur))); // clamp 8-20s
const endCardDur = brief.end_card?.duration || 3;
const totalDur = reactionDur + endCardDur;
console.log(`  Voiceover ${voDur.toFixed(1)}s → reaction segment ${reactionDur}s, total ${totalDur}s.`);

// ─────────────────────────────────────────────────────────────────
// 3. Top pane (kid face): zoompan or Sora
// ─────────────────────────────────────────────────────────────────

const topPane = join(TMP, 'top-pane.mp4');
if (args['use-sora']) {
  console.log(`  Sora 2 image-to-video for top pane (${reactionDur}s)…`);
  const tmpVid = join(TMP, 'top-sora.mp4');
  await generateSora({
    imagePath: kidStill,
    prompt: 'subtle motion: child eyes widen slightly then smile, head tilts, hair shifts gently, photorealistic, very natural',
    seconds: Math.max(4, Math.min(10, Math.round(reactionDur))),
    size: '720x1280',
    outPath: tmpVid
  });
  // Loop/trim to reactionDur and crop to 1080×960
  ffmpeg(['-y', '-stream_loop', '-1', '-i', tmpVid, '-t', String(reactionDur),
    '-vf', `scale=${W}:${HALF}:force_original_aspect_ratio=cover,crop=${W}:${HALF},format=yuv420p`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', topPane]);
} else {
  console.log(`  Zoompan animating top pane…`);
  const frames = reactionDur * FPS;
  const zExpr = `zoompan=z='min(zoom+0.0006,1.18)':d=${frames}:s=${W}x${HALF}:fps=${FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  ffmpeg(['-y', '-loop', '1', '-i', kidStill, '-vf', `${zExpr},format=yuv420p`,
    '-t', String(reactionDur), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', topPane]);
}

// ─────────────────────────────────────────────────────────────────
// 4. Bottom pane: waveform on paper background
// ─────────────────────────────────────────────────────────────────

const wavePane = join(TMP, 'bottom-pane.mp4');
console.log(`  Rendering waveform pane (${reactionDur}s)…`);
// Generate a paper-coloured waveform on a transparent BG, then put it on a paper background
const waveOnly = join(TMP, 'wave-only.mp4');
ffmpeg(['-y', '-i', voPath,
  '-filter_complex', `[0:a]showwaves=s=${W}x${HALF}:mode=cline:colors=0xD87A3E|0x7A55C9:rate=${FPS}:scale=lin,format=yuva420p,colorkey=0x000000:0.1:0.0[v]`,
  '-map', '[v]', '-t', String(reactionDur), '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  waveOnly]);

// Build paper-coloured background
const paperBg = join(TMP, 'paper-bg.png');
{
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: HALF, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${HALF}px;background:#F4ECDB;background-image:radial-gradient(rgba(80,60,30,.08) 1px,transparent 1px),radial-gradient(rgba(80,60,30,.06) 1px,transparent 1px);background-size:3px 3px,7px 7px"></body></html>`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: paperBg, type: 'png' });
  await browser.close();
}

// Composite waveform onto paper bg
ffmpeg(['-y',
  '-loop', '1', '-i', paperBg,
  '-i', waveOnly,
  '-filter_complex', `[0:v][1:v]overlay=0:0:format=auto[out]`,
  '-map', '[out]', '-t', String(reactionDur), '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', wavePane]);

// ─────────────────────────────────────────────────────────────────
// 5. Stack top + bottom = split-screen reaction segment
// ─────────────────────────────────────────────────────────────────

const stacked = join(TMP, 'split-segment.mp4');
ffmpeg(['-y',
  '-i', topPane, '-i', wavePane,
  '-filter_complex', `[0:v][1:v]vstack=inputs=2[out]`,
  '-map', '[out]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', stacked]);

// ─────────────────────────────────────────────────────────────────
// 6. Caption overlays — hook (0-2s) and "now playing" badge (2-rest)
// ─────────────────────────────────────────────────────────────────

const hookPng = join(TMP, 'hook.png');
const playingPng = join(TMP, 'playing.png');
{
  const browser = await puppeteer.launch({ headless: 'new' });
  // Hook caption — bold, all-caps, takes the full screen vibe
  {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;padding:60px;overflow:hidden}
.hook{font-size:62px;font-weight:900;color:#fff;text-align:center;line-height:1.1;letter-spacing:-.005em;text-transform:uppercase;text-shadow:0 4px 24px rgba(0,0,0,.65),0 0 8px rgba(0,0,0,.85);max-width:920px}
</style></head><body><div class="hook">${esc(brief.hook_caption)}</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script></body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
    await page.screenshot({ path: hookPng, type: 'png', omitBackground: true });
    await page.close();
  }
  // "Listening to" badge — small, top-left, holds throughout
  {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:Inter,sans-serif;padding:60px;overflow:hidden}
.tag{display:inline-flex;align-items:center;gap:10px;padding:16px 24px;background:rgba(31,27,46,.85);color:#F4ECDB;border-radius:999px;font-size:22px;font-weight:600;backdrop-filter:blur(10px)}
.dot{width:10px;height:10px;border-radius:999px;background:#D87A3E;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.kicker{font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:rgba(244,236,219,.6);margin-right:6px}
</style></head><body><div class="tag"><span class="dot"></span><span class="kicker">Now playing</span><span>${esc(CHILD)}'s story</span></div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script></body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
    await page.screenshot({ path: playingPng, type: 'png', omitBackground: true });
    await page.close();
  }
  await browser.close();
}

// Overlay both onto the stacked split-screen
const reactionWithCaptions = join(TMP, 'reaction-captioned.mp4');
ffmpeg(['-y',
  '-i', stacked, '-i', hookPng, '-i', playingPng,
  '-filter_complex',
  `[0:v][1:v]overlay=enable='between(t,0.0,2.5)':x=0:y=0[v1];[v1][2:v]overlay=enable='gte(t,2.5)':x=0:y=0[out]`,
  '-map', '[out]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', reactionWithCaptions]);

// ─────────────────────────────────────────────────────────────────
// 7. End card
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
<div class="eyebrow">${esc(brief.end_card?.eyebrow || 'HEARTHEIRNAME.COM')}</div>
<h1>${esc(brief.end_card?.headline || 'A story that knows their name.')}</h1>
<div class="sub">${esc(brief.end_card?.subline || 'Free 2-min preview · £24.99')}</div>
<div class="cta">heartheirname.com →</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script>
</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  await page.screenshot({ path: endCardImg, type: 'png' });
  await browser.close();
}
ffmpeg(['-y', '-loop', '1', '-i', endCardImg, '-t', String(endCardDur),
  '-r', String(FPS), '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', endCardClip]);

// ─────────────────────────────────────────────────────────────────
// 8. Concat reaction + endcard, mix audio (VO + music bed)
// ─────────────────────────────────────────────────────────────────

const concatTxt = join(TMP, 'concat.txt');
const { writeFileSync } = await import('node:fs');
writeFileSync(concatTxt, `file '${reactionWithCaptions}'\nfile '${endCardClip}'\n`);
const silentMp4 = join(TMP, 'video-silent.mp4');
ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', silentMp4]);

// Mix VO + music. VO plays during reaction segment only; music holds through endcard.
const musicPath = resolve(ROOT, brief.music || 'public/music/bedtime-ambient.mp3');
const musicVol = brief.music_volume || 0.10;
const audioPath = join(TMP, 'audio.mp3');
ffmpeg(['-y',
  '-i', voPath,
  '-stream_loop', '-1', '-i', musicPath,
  '-filter_complex',
  `[0:a]apad=pad_dur=${endCardDur},atrim=duration=${totalDur},volume=1.0[v];[1:a]volume=${musicVol},atrim=duration=${totalDur}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
  '-map', '[mix]', '-t', String(totalDur), '-ac', '2', '-b:a', '160k', audioPath]);

// Final mux
const finalPath = join(FINAL_DIR, `${NAME}-${Date.now()}.mp4`);
ffmpeg(['-y',
  '-i', silentMp4,
  '-i', audioPath,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '160k',
  '-t', String(totalDur),
  '-movflags', '+faststart',
  finalPath
]);

console.log(`\n✓ Done → ${finalPath}`);
console.log(`  Total: ${totalDur}s | Mode: ${args['use-sora'] ? 'Sora 2' : 'zoompan'}\n`);
