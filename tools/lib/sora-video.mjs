// Reusable Sora 2 image-to-video generator for the ad pipeline.
//
// Usage:
//   const path = await generateVideo({ imagePath, prompt, seconds: 6, outPath })
//
// Polls until the video is ready. Throws on failure. Costs ~$0.30/s of generated video.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function resizeForSora(srcPath, size) {
  const [w, h] = size.split('x').map(n => parseInt(n, 10));
  const tmpDir = dirname(srcPath);
  const outPath = join(tmpDir, `_sora-${w}x${h}-${basename(srcPath, extname(srcPath))}.png`);
  const r = spawnSync('ffmpeg', ['-y', '-i', srcPath,
    '-vf', `scale=${w}:${h}:flags=lanczos`, outPath
  ], { stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`Resize failed: ${r.stderr.toString()}`);
  return outPath;
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export async function generateVideo({ imagePath, prompt, seconds = 6, size = '720x1280', model = 'sora-2', outPath }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  // Image-to-video uses multipart/form-data with input_reference attached as a file.
  // Text-to-video can stay JSON.
  let submitRes;
  if (imagePath) {
    // Sora requires input image dimensions to exactly match the output video size.
    // Resize the still via ffmpeg before upload.
    const resized = resizeForSora(imagePath, size);
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('seconds', String(seconds));
    form.append('size', size);
    const buf = readFileSync(resized);
    form.append('input_reference', new Blob([buf], { type: 'image/png' }), basename(resized));
    submitRes = await fetch('https://api.openai.com/v1/videos', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    });
  } else {
    submitRes = await fetch('https://api.openai.com/v1/videos', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, seconds: String(seconds), size })
    });
  }

  if (!submitRes.ok) throw new Error(`Sora submit failed: ${submitRes.status} ${await submitRes.text()}`);
  const job = await submitRes.json();
  const id = job.id;
  console.log(`  Sora job ${id} queued…`);

  // Poll until done
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!pollRes.ok) throw new Error(`Sora poll failed: ${pollRes.status} ${await pollRes.text()}`);
    const status = await pollRes.json();
    if (status.status === 'completed') {
      // Download the video content
      const dlRes = await fetch(`https://api.openai.com/v1/videos/${id}/content`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (!dlRes.ok) throw new Error(`Sora download failed: ${dlRes.status}`);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      if (outPath) writeFileSync(outPath, buf);
      console.log(`  Sora job ${id} completed (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      return buf;
    }
    if (status.status === 'failed') {
      throw new Error(`Sora job failed: ${status.error?.message || JSON.stringify(status)}`);
    }
    // Otherwise still in_progress / queued
    process.stdout.write('.');
  }
  throw new Error(`Sora job ${id} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}
