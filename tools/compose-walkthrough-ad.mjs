#!/usr/bin/env node
// Compose a final walkthrough+reaction ad:
//   1. Speed up the walkthrough video by N×
//   2. Concatenate: walkthrough → reaction (Sora) → end card
//   3. Layer voiceover + ducked music
//   4. Burn hook caption + spoken captions
//   5. Output 1080x1920 mp4
//
// Usage:
//   node tools/compose-walkthrough-ad.mjs \
//     --walkthrough out/walkthroughs/walkthrough-XXXX.mp4 \
//     --reaction    out/animations/reaction-listening/still-XXXX-anim-XXXX.mp4 \
//     --brief       tools/briefs/reaction-maya-bedtime.json \
//     --speed 2.9 \
//     --out walkthrough-maya

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { generateTTS, generateTTSWithTimestamps, alignmentToPhrases } from './lib/elevenlabs-tts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv){const o={};for(let i=2;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const k=a.slice(2);const v=argv[i+1];if(v===undefined||v.startsWith('--'))o[k]=true;else{o[k]=v;i++;}}}return o;}
const args = parseArgs(process.argv);
if (!args.walkthrough || !args.reaction || !args.brief || !args.out) {
  console.error('Required: --walkthrough <mp4> --reaction <mp4> --brief <json> --out <slug>');
  console.error('Optional: --child-reaction <mp4>  (appends after the parent reaction)');
  process.exit(1);
}
const walkthrough = resolve(args.walkthrough);
const reaction = resolve(args.reaction);
const buyMoment = args['buy-moment'] ? resolve(args['buy-moment']) : null;
const childReaction = args['child-reaction'] ? resolve(args['child-reaction']) : null;
const brief = JSON.parse(readFileSync(args.brief, 'utf8'));
const SPEED = parseFloat(args.speed || '2.9');
const SLUG = args.out;

const W = 1080, H = 1920, FPS = 25;
const TMP = join(ROOT, 'out', 'tmp', `walkthrough-${SLUG}`);
const FINAL_DIR = join(ROOT, 'out', 'videos', 'walkthroughs');
mkdirSync(TMP, { recursive: true });
mkdirSync(FINAL_DIR, { recursive: true });

function ffmpeg(args){const r=spawnSync('ffmpeg',args,{stdio:'inherit'});if(r.status!==0)throw new Error('ffmpeg failed');}
function ffprobeDur(p){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',p],{encoding:'utf8'});return parseFloat(r.stdout.trim());}
function esc(s){return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}

const wtDur = ffprobeDur(walkthrough);
const wtSped = wtDur / SPEED;
const reactionDur = ffprobeDur(reaction);
const buyMomentDur = buyMoment ? ffprobeDur(buyMoment) : 0;
const childReactionDur = childReaction ? ffprobeDur(childReaction) : 0;
const endCardDur = brief.end_card?.duration || 3;
const totalDur = wtSped + reactionDur + buyMomentDur + childReactionDur + endCardDur;
console.log(`\nWalkthrough:    ${wtDur.toFixed(1)}s × ${SPEED}× = ${wtSped.toFixed(1)}s`);
console.log(`Parent react:   ${reactionDur.toFixed(1)}s`);
if (buyMoment) console.log(`Buy moment:     ${buyMomentDur.toFixed(1)}s`);
if (childReaction) console.log(`Child react:    ${childReactionDur.toFixed(1)}s`);
console.log(`End card:       ${endCardDur}s`);
console.log(`Total:          ${totalDur.toFixed(1)}s\n`);

// 1. Speed up walkthrough + scale to 1080x1920
const wtFast = join(TMP, 'walkthrough-fast.mp4');
ffmpeg(['-y', '-i', walkthrough,
  '-vf', `setpts=PTS/${SPEED},scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-r', String(FPS), '-an',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', wtFast]);

// 2. Conform parent reaction to 1080x1920
const reactionConformed = join(TMP, 'reaction.mp4');
ffmpeg(['-y', '-i', reaction,
  '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-r', String(FPS), '-an',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', reactionConformed]);

// 2.5 Conform child reaction (if provided)
let childReactionConformed = null;
if (childReaction) {
  childReactionConformed = join(TMP, 'child-reaction.mp4');
  ffmpeg(['-y', '-i', childReaction,
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-r', String(FPS), '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', childReactionConformed]);
}

// 2.6 Conform buy moment (if provided)
let buyMomentConformed = null;
if (buyMoment) {
  buyMomentConformed = join(TMP, 'buy-moment.mp4');
  ffmpeg(['-y', '-i', buyMoment,
    '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-r', String(FPS), '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', buyMomentConformed]);
}

// 3. End card via Puppeteer
const endCardImg = join(TMP, 'endcard.png');
{
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:#1F1B2E;color:#F4ECDB;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:80px;overflow:hidden}
.glow{position:fixed;inset:-30%;background:radial-gradient(circle at 50% 30%,rgba(122,85,201,.45),transparent 60%);pointer-events:none}
.eyebrow{font-family:'JetBrains Mono',monospace;font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:#E0B7A0;margin-bottom:32px;position:relative}
h1{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:84px;line-height:1.05;letter-spacing:-.01em;position:relative}
.sub{font-family:Inter,sans-serif;font-size:26px;color:rgba(244,236,219,.75);margin-top:32px;position:relative}
.cta{margin-top:60px;padding:28px 56px;background:#D87A3E;color:#fff;border-radius:999px;font-weight:600;font-size:24px;display:inline-flex;align-items:center;gap:10px;position:relative}
</style></head><body><div class="glow"></div>
<div class="eyebrow">${esc(brief.end_card?.eyebrow || 'HEARTHEIRNAME.COM')}</div>
<h1>${esc(brief.end_card?.headline || 'A story made just for them.')}</h1>
<div class="sub">${esc(brief.end_card?.subline || 'Free 2-min preview · £24.99')}</div>
<div class="cta">heartheirname.com →</div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script>
</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
  await page.screenshot({ path: endCardImg });
  await browser.close();
}
const endCardClip = join(TMP, 'endcard.mp4');
ffmpeg(['-y', '-loop', '1', '-i', endCardImg, '-t', String(endCardDur),
  '-r', String(FPS), '-vf', 'format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', endCardClip]);

// 4. Concat all clips (walkthrough → parent reaction → buy moment → child reaction → endcard)
const concatTxt = join(TMP, 'concat.txt');
const concatLines = [`file '${wtFast}'`, `file '${reactionConformed}'`];
if (buyMomentConformed) concatLines.push(`file '${buyMomentConformed}'`);
if (childReactionConformed) concatLines.push(`file '${childReactionConformed}'`);
concatLines.push(`file '${endCardClip}'`);
writeFileSync(concatTxt, concatLines.join('\n') + '\n');
const silentMp4 = join(TMP, 'silent.mp4');
ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', silentMp4]);

// 4.5. Generate voiceover EARLY so we have alignment timestamps for caption sync
const voPath = join(TMP, 'voiceover.mp3');
console.log(`Generating voiceover with timestamps (${brief.voice})…`);
const voText = brief.walkthrough_voiceover || brief.voiceover;
const { alignment: voAlignment } = await generateTTSWithTimestamps({
  text: voText, voice: brief.voice || 'British (warm)', outPath: voPath
});

// 5. Render captions (hook + spoken) via Puppeteer
const captionPngs = [];
{
  const browser = await puppeteer.launch({ headless: 'new' });
  async function renderCap(text, opts) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const fontSize = opts.size || 64;
    const isHi = !!opts.highlight;
    const color = isHi ? '#E8A34A' : '#fff';
    const family = isHi ? "'Cormorant Garamond',serif" : 'Inter,sans-serif';
    const weight = isHi ? '600' : '900';
    const styleAccent = isHi ? 'font-style:italic;letter-spacing:-.01em;text-transform:none' : 'text-transform:uppercase';
    // Two layers of scrim at bottom: a tall soft gradient to darken the
    // background, and a lighter middle band where the text sits. Caption pinned
    // 120px from bottom so it never fights with on-page copy.
    const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500;1,600&family=Inter:wght@800;900&display=swap" rel="stylesheet"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;font-family:${family};overflow:hidden}
.scrim{position:absolute;left:0;right:0;bottom:0;height:55%;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0.65) 35%,rgba(0,0,0,0.25) 75%,rgba(0,0,0,0) 100%)}
.wrap{position:absolute;left:0;right:0;bottom:120px;display:flex;justify-content:center;padding:0 60px}
.cap{font-size:${fontSize}px;font-weight:${weight};color:${color};text-align:center;line-height:1.05;letter-spacing:-.005em;${styleAccent};text-shadow:0 4px 18px rgba(0,0,0,.85),0 0 10px rgba(0,0,0,.95);max-width:960px}
</style></head><body><div class="scrim"></div><div class="wrap"><div class="cap">${esc(text)}</div></div>
<script>document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.dataset.ready='true')));</script></body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });
    const out = join(TMP, `cap-${captionPngs.length}.png`);
    await page.screenshot({ path: out, omitBackground: true });
    await page.close();
    return out;
  }

  // Auto-build phrase captions from voiceover alignment if available.
  // Otherwise fall back to the brief's hook + spoken_captions schedule.
  if (voAlignment && voAlignment.characters && voAlignment.characters.length){
    const phrases = alignmentToPhrases(voAlignment, { minWords: 3, maxWords: 9 });
    console.log(`  Generated ${phrases.length} phrase captions from voiceover alignment.`);
    for (const p of phrases) {
      const path = await renderCap(p.text, { size: 60, bottom: 320 });
      // Audio plays from t=0 of the final ad, so phrase times are absolute already.
      // Add a small lead-in (-0.05s) so the caption appears just before the word.
      captionPngs.push({ path, start: Math.max(0, p.start - 0.05), end: p.end + 0.15 });
    }
    // Optional highlighted reaction-segment captions stay (e.g. the "Maya." moment)
    const spoken = brief.spoken_captions || [];
    for (const s of spoken) {
      if (!s.highlight) continue; // only render highlight ones to avoid duplicate stacking
      const path = await renderCap(s.text, { size: 120, bottom: 380, highlight: true });
      captionPngs.push({ path, start: wtSped + s.start, end: wtSped + s.end });
    }
  } else {
    // Legacy hand-timed schedule
    const hookCap = brief.walkthrough_hook || 'I MADE HER ONE OF THESE IN 60 SECONDS';
    const hookPath = await renderCap(hookCap, { size: 78, bottom: 320 });
    captionPngs.push({ path: hookPath, start: 0.5, end: Math.min(wtSped - 0.3, 4.0) });
    const spoken = brief.spoken_captions || [];
    for (const s of spoken) {
      const path = await renderCap(s.text, { size: s.highlight ? 120 : 70, bottom: 380, highlight: !!s.highlight });
      captionPngs.push({ path, start: wtSped + s.start, end: wtSped + s.end });
    }
  }
  await browser.close();
}

// 6. Overlay captions onto silent video
const captionedMp4 = join(TMP, 'captioned.mp4');
{
  const ffArgs = ['-y', '-i', silentMp4];
  captionPngs.forEach(c => ffArgs.push('-i', c.path));
  let fc = '';
  let prev = '0:v';
  captionPngs.forEach((c, i) => {
    const inIdx = i + 1;
    const out = `v${inIdx}`;
    fc += `[${prev}][${inIdx}:v]overlay=enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})':x=0:y=0[${out}];`;
    prev = out;
  });
  fc = fc.replace(/;$/, '');
  if (captionPngs.length === 0) {
    ffmpeg(['-y', '-i', silentMp4, '-c:v', 'copy', '-an', captionedMp4]);
  } else {
    ffArgs.push('-filter_complex', fc, '-map', `[${prev}]`,
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', captionedMp4);
    ffmpeg(ffArgs);
  }
}

// 7. Mix audio (voiceover already generated in step 4.5)
const musicPath = resolve(ROOT, brief.music || 'public/music/bedtime-ambient.mp3');
const musicVol = brief.music_volume || 0.10;
const audioPath = join(TMP, 'audio.mp3');
ffmpeg(['-y',
  '-i', voPath,
  '-stream_loop', '-1', '-i', musicPath,
  '-filter_complex', `[0:a]apad,atrim=duration=${totalDur},volume=1.0[v];[1:a]volume=${musicVol},atrim=duration=${totalDur}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[mix]`,
  '-map', '[mix]', '-t', String(totalDur), '-ac', '2', '-b:a', '160k', audioPath]);

// 8. Final mux
const finalPath = join(FINAL_DIR, `${SLUG}-${Date.now()}.mp4`);
ffmpeg(['-y', '-i', captionedMp4, '-i', audioPath,
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
  '-t', String(totalDur), '-movflags', '+faststart', finalPath]);

console.log(`\n✓ Done → ${finalPath}\n`);
