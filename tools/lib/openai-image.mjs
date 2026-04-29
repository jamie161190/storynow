// Reusable gpt-image-2 still generator for the ad pipeline.

import { writeFileSync } from 'node:fs';

export async function generateImage({ prompt, size = '1024x1536', quality = 'high', outPath }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, quality, n: 1 })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI image ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data in response');
  const buf = Buffer.from(b64, 'base64');
  if (outPath) writeFileSync(outPath, buf);
  return buf;
}
