#!/usr/bin/env node
// Build a 15s gift-angle ad video end-to-end:
//   1. Generate N stills via gpt-image-2 (one per scene)
//   2. Animate each still — either ffmpeg zoompan (cheap, default) or Sora 2 image-to-video (--use-sora)
//   3. Generate voiceover via ElevenLabs
//   4. Compose: concatenate scenes → mix narration with music bed → burn captions → append end card → encode 1080x1920 mp4
//
// Usage:
//   node tools/build-gift-ad.mjs --brief tools/briefs/gift-christmas-2026.json
//   node tools/build-gift-ad.mjs --brief … --use-sora        (premium motion)
//   node tools/build-gift-ad.mjs --brief … --reuse-stills    (skip image gen, use last set)

import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { generateImage } from './lib/openai-image.mjs';
import { generateTTS } from './lib/elevenlabs-tts.mjs';
import { generateVideo as generateSora } from './lib/sora-video.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) opts[k] = true; else { opts[k] = v; i++; } }
  }
  return opts;
}

const args = parseArgs(process.argv);
if (!args.brief) { console.error('--brief <path> required'); process.exit(1); }
const brief = JSON.parse(readFileSync(args.brief, 'utf8'));

const BRIEF_NAME = brief.name || 'gift-ad';
const TMP = join(ROOT, 'out', 'tmp', BRIEF_NAME);
const FINAL_DIR = join(ROOT, 'out', 'videos', 'gift');
mkdirSync(TMP, { recursive: true });
mkdirSync(FINAL_DIR, { recursive: true });

const FINAL_W = 1080, FINAL_H = 1920;
const totalSceneDur = brief.scenes.reduce((sum, s) => sum + s.duration, 0);
const endCardDur = brief.end_card?.duration || 3;
const totalDur = totalSceneDur + endCardDur;

console.log(`\nBuilding "${BRIEF_NAME}" — ${brief.scenes.length} scenes, ${totalDur}s total\n`);

// ─────────────────────────────────────────────────────────────────
// 1. Stills
// ─────────────────────────────────────────────────────────────────

const stillPaths = [];
for (let i = 0; i < brief.scenes.length; i++) {
  const out = join(TMP, `scene-${i}.png`);
  if (args['reuse-stills'] && existsSync(out)) {
    console.log(`  [scene ${i + 1}] reusing ${out}`);
    stillPaths.push(out);
    continue;
  }
  console.log(`  [scene ${i + 1}] generating still via gpt-image-2…`);
  await generateImage({ prompt: brief.scenes[i].image_prompt, size: '1024x1536', outPath: out });
  console.log(`  [scene ${i + 1}] → ${out}`);
  stillPaths.push(out);
}

// ─────────────────────────────────────────────────────────────────
// 2. Animate each scene
// ─────────────────────────────────────────────────────────────────

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
}

function animateZoompan(stillPath, motion, durSec, outPath) {
  // Ken Burns via zoompan. fps 25 → frames = durSec*25.
  const fps = 25;
  const frames = Math.round(durSec * fps);
  let zExpr;
  switch (motion) {
    case 'kenburns-in':  zExpr = `zoompan=z='min(zoom+0.0009,1.25)':d=${frames}:s=${FINAL_W}x${FINAL_H}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
    case 'kenburns-out': zExpr = `zoompan=z='if(eq(on,1),1.25,max(zoom-0.0009,1.0))':d=${frames}:s=${FINAL_W}x${FINAL_H}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`; break;
    case 'kenburns-pan': zExpr = `zoompan=z='1.15':d=${frames}:s=${FINAL_W}x${FINAL_H}:fps=${fps}:x='iw/2-(iw/zoom/2)+(on-1)*0.3':y='ih/2-(ih/zoom/2)'`; break;
    default:             zExpr = `zoompan=z='min(zoom+0.0007,1.18)':d=${frames}:s=${FINAL_W}x${FINAL_H}:fps=${fps}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  }
  ffmpeg(['-y', '-loop', '1', '-i', stillPath, '-vf', `${zExpr},format=yuv420p`, '-t', String(durSec), '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', outPath]);
}

const sceneClips = [];
for (let i = 0; i < brief.scenes.length; i++) {
  const s = brief.scenes[i];
  const out = join(TMP, `scene-${i}.mp4`);
  if (args['use-sora']) {
    console.log(`  [scene ${i + 1}] Sora 2 image-to-video, ${s.duration}s…`);
    const motionPrompt = s.sora_prompt || `slow ${s.motion || 'kenburns-in'} camera move, very subtle, photorealistic, 4 seconds`;
    const tmpVideo = join(TMP, `scene-${i}-sora.mp4`);
    await generateSora({ imagePath: stillPaths[i], prompt: motionPrompt, seconds: Math.max(4, Math.round(s.duration)), size: '720x1280', outPath: tmpVideo });
    // Re-encode + rescale to 1080x1920
    ffmpeg(['-y', '-i', tmpVideo, '-vf', `scale=${FINAL_W}:${FINAL_H}:force_original_aspect_ratio=cover,crop=${FINAL_W}:${FINAL_H},format=yuv420p`, '-t', String(s.duration), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', out]);
  } else {
    console.log(`  [scene ${i + 1}] animating with zoompan (${s.motion || 'kenburns-in'}, ${s.duration}s)`);
    animateZoompan(stillPaths[i], s.motion || 'kenburns-in', s.duration, out);
  }
  sceneClips.push(out);
}

// ─────────────────────────────────────────────────────────────────
// 3. Voiceover
// ─────────────────────────────────────────────────────────────────

const voPath = join(TMP, 'voiceover.mp3');
console.log('  Generating voiceover via ElevenLabs…');
await generateTTS({ text: brief.voiceover, voice: brief.voice || 'British (warm)', outPath: voPath });

// ─────────────────────────────────────────────────────────────────
// 4. End card (rendered via Puppeteer to a 3s mp4)
// ─────────────────────────────────────────────────────────────────

const endCardImg = join(TMP, 'endcard.png');
const endCardClip = join(TMP, 'endcard.mp4');
{
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: FINAL_W, height: FINAL_H, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,500&family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${FINAL_W}px;height:${FINAL_H}px;background:#1F1B2E;color:#F4ECDB;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:80px;overflow:hidden}
.glow{position:fixed;inset:-30%;background:radial-gradient(circle at 50% 30%,rgba(122,85,201,.45),transparent 60%);pointer-events:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#E0B7A0;margin-bottom:32px;position:relative}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:96px;line-height:1.05;letter-spacing:-.01em;position:relative}
.sub{font-family:Inter,sans-serif;font-size:28px;color:rgba(244,236,219,.75);margin-top:32px;position:relative}
.cta{margin-top:60px;padding:28px 56px;background:#D87A3E;color:#fff;border-radius:999px;font-weight:600;font-size:24px;display:inline-flex;align-items:center;gap:10px;position:relative}
</style></head><body><div class="glow"></div>
<div class="eyebrow">${esc(brief.end_card?.eyebrow || 'HEARTHEIRNAME.COM')}</div>
<h1>${esc(brief.end_card?.headline || 'A story made just for them.')}</h1>
<div class="sub">${esc(brief.end_card?.subline || '£24.99 · Free 2-min preview')}</div>
<div class="cta">heartheirname.com →</div>
<script>document.fonts.ready.then(()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{document.body.dataset.ready='true';});});});</script>
</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  await page.screenshot({ path: endCardImg, type: 'png' });
  await browser.close();
}
ffmpeg(['-y', '-loop', '1', '-i', endCardImg, '-t', String(endCardDur), '-r', '25', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', endCardClip]);

function esc(s){ return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

// ─────────────────────────────────────────────────────────────────
// 5. Concat scenes + endcard, layer voiceover + music + captions
// ─────────────────────────────────────────────────────────────────

// 5a. Concatenate clips into one silent video
const concatFile = join(TMP, 'concat.txt');
writeFileSync(concatFile, [...sceneClips, endCardClip].map(p => `file '${p}'`).join('\n'));
const silentMp4 = join(TMP, 'video-silent.mp4');
ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', silentMp4]);

// 5b. Build audio track: VO at full + music ducked
const audioPath = join(TMP, 'audio.mp3');
const musicPath = resolve(ROOT, brief.music || 'public/music/bedtime-ambient.mp3');
const musicVol = brief.music_volume || 0.18;
ffmpeg(['-y',
  '-i', voPath,
  '-stream_loop', '-1', '-i', musicPath,
  '-filter_complex', `[0:a]volume=1.0[v];[1:a]volume=${musicVol}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
  '-map', '[mix]', '-t', String(totalDur), '-ac', '2', '-b:a', '160k', audioPath
]);

// 5c. Build an ASS subtitle file with explicit styling (libass-friendly,
// no filter-parser escaping headaches).
const srtPath = join(TMP, 'captions.ass');
function fmtAss(t){ const h=Math.floor(t/3600); const m=Math.floor((t%3600)/60); const s=t%60; return `${h}:${pad(m)}:${pad(Math.floor(s))}.${pad(Math.floor((s%1)*100),2)}`; }
function pad(n, len=2){ return String(n).padStart(len, '0'); }
let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${FINAL_W}
PlayResY: ${FINAL_H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Helvetica Neue,42,&H00ECDBF4,&H00ECDBF4,&H001F1B2E,&H80000000,1,0,0,0,100,100,0,0,3,4,0,2,80,80,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
let cur = 0;
brief.scenes.forEach((s) => {
  const start = cur, end = cur + s.duration;
  cur = end;
  if (!s.caption) return;
  ass += `Dialogue: 0,${fmtAss(start)},${fmtAss(end)},Default,,0,0,0,,${s.caption}\n`;
});
writeFileSync(srtPath, ass);

// 5d. Render caption overlays as transparent PNGs via Puppeteer (the local
// ffmpeg build doesn't ship with libass so we can't use the subtitles filter).
const captionPngs = [];
{
  const browser = await puppeteer.launch({ headless: 'new' });
  for (let i = 0; i < brief.scenes.length; i++) {
    const s = brief.scenes[i];
    if (!s.caption) { captionPngs.push(null); continue; }
    const page = await browser.newPage();
    await page.setViewport({ width: FINAL_W, height: FINAL_H, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${FINAL_W}px;height:${FINAL_H}px;background:transparent;font-family:Inter,sans-serif;display:flex;align-items:flex-end;justify-content:center;padding:200px 80px;overflow:hidden}
.cap{font-size:42px;font-weight:700;color:#F4ECDB;line-height:1.25;text-align:center;text-shadow:0 2px 18px rgba(31,27,46,0.85),0 0 4px rgba(31,27,46,0.95);max-width:920px;letter-spacing:-.005em}
</style></head><body><div class="cap">${esc(s.caption)}</div>
<script>document.fonts.ready.then(()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{document.body.dataset.ready='true';});});});</script>
</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
    const out = join(TMP, `caption-${i}.png`);
    await page.screenshot({ path: out, type: 'png', omitBackground: true });
    captionPngs.push(out);
    await page.close();
  }
  await browser.close();
}

// 5e. Overlay each caption PNG onto its scene's time range
const captionedMp4 = join(TMP, 'video-captions.mp4');
{
  const overlays = [];
  let runStart = 0;
  brief.scenes.forEach((s, i) => {
    const start = runStart, end = runStart + s.duration;
    runStart = end;
    if (captionPngs[i]) overlays.push({ png: captionPngs[i], start, end });
  });

  if (overlays.length === 0) {
    ffmpeg(['-y', '-i', silentMp4, '-c:v', 'copy', '-an', captionedMp4]);
  } else {
    const args = ['-y', '-i', silentMp4];
    overlays.forEach(o => args.push('-i', o.png));
    let fc = '';
    overlays.forEach((o, i) => {
      const prev = i === 0 ? '0:v' : `v${i}`;
      const out = `v${i + 1}`;
      fc += `[${prev}][${i + 1}:v]overlay=enable='between(t,${o.start},${o.end})':x=0:y=0[${out}];`;
    });
    fc = fc.replace(/;$/, '');
    args.push('-filter_complex', fc, '-map', `[v${overlays.length}]`,
              '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-an', captionedMp4);
    ffmpeg(args);
  }
}

// 5f. Mux final audio
const finalPath = join(FINAL_DIR, `${BRIEF_NAME}-${Date.now()}.mp4`);
ffmpeg(['-y',
  '-i', captionedMp4,
  '-i', audioPath,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '160k',
  '-t', String(totalDur),
  '-movflags', '+faststart',
  finalPath
]);

console.log(`\n✓ Done → ${finalPath}`);
console.log(`  Total duration: ${totalDur}s | Scenes: ${brief.scenes.length} | Mode: ${args['use-sora'] ? 'Sora 2' : 'zoompan'}\n`);
