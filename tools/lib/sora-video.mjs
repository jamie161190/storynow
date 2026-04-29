// Reusable Sora 2 image-to-video generator for the ad pipeline.
//
// Usage:
//   const path = await generateVideo({ imagePath, prompt, seconds: 6, outPath })
//
// Polls until the video is ready. Throws on failure. Costs ~$0.30/s of generated video.

import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { basename } from 'node:path';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function uploadImage(imagePath) {
  const apiKey = process.env.OPENAI_API_KEY;
  const form = new FormData();
  const buf = readFileSync(imagePath);
  form.append('file', new Blob([buf], { type: 'image/png' }), basename(imagePath));
  form.append('purpose', 'vision');
  const res = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

export async function generateVideo({ imagePath, prompt, seconds = 6, size = '720x1280', model = 'sora-2', outPath }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const body = { model, prompt, seconds: String(seconds), size };
  if (imagePath) {
    body.input_reference = await uploadImage(imagePath);
  }

  // Submit job
  const submitRes = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
