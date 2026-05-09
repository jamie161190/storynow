// Shared audio pipeline used by both preview-worker-background.mjs and
// full-worker-v2-background.mjs.
//
// Provides:
//   - chunkedTTS({ text, voiceId, elevenKey, label })
//       Splits text at paragraph/sentence boundaries (eleven_v3 caps a single
//       request at 5,000 chars) and returns a single concatenated MP3 buffer.
//
//   - downloadAudio(url)
//       Fetches an MP3 already stored in Supabase storage as an ArrayBuffer.
//       Used by the full worker to reuse the preview audio as the opening
//       so the customer hears the EXACT 2 minutes they fell in love with,
//       then the continuation joins on a paragraph boundary.
//
//   - concatBuffers(buffers)
//       Binary concat of MP3 ArrayBuffers / Uint8Arrays. Players tolerate
//       the duplicated ID3 headers between parts; splits happen at sentence
//       boundaries so audio joins on natural pauses.
//
//   - uploadAudio({ supabaseUrl, supabaseKey, fileName, audioBuf })
//       Uploads an mp3 buffer to the `stories` bucket with x-upsert. Returns
//       the public URL.
//
//   - callClaude({ apiKey, system, user, model, maxTokens, temperature })
//       Single-shot call to Anthropic Messages API with retry on 429/529/5xx.
//       Returns the text-only output joined together.

import { prepareTTSText, splitTextForTTS } from './tts-text.mjs';

// ── ElevenLabs TTS, chunked + concatenated ────────────────────────────────
export async function chunkedTTS({ text, voiceId, elevenKey, label = 'TTS' }) {
  const cleaned = prepareTTSText(text);
  const chunks = splitTextForTTS(cleaned);

  const audioParts = [];
  for (let i = 0; i < chunks.length; i++) {
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chunks[i],
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
      })
    });
    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      throw new Error(`[${label}] ElevenLabs ${ttsRes.status} on chunk ${i + 1}/${chunks.length}: ${errText.slice(0, 240)}`);
    }
    audioParts.push(new Uint8Array(await ttsRes.arrayBuffer()));
    console.log(`[${label}] TTS chunk ${i + 1}/${chunks.length} OK (${audioParts[i].length} bytes, ${chunks[i].length} chars)`);
  }
  return concatBuffers(audioParts);
}

// ── Download an existing MP3 (e.g. the preview audio for the full story) ─
export async function downloadAudio(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Audio download ${r.status}: ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ── Concatenate MP3 buffers (binary). Returns ArrayBuffer. ───────────────
//
// Each ElevenLabs chunk arrives with its own ID3v2 leading tag (sometimes
// also a 128-byte ID3v1 trailing tag). A naive byte-concat works in most
// browsers because they re-scan frames to compute duration — but Apple
// Podcasts, Apple Music, and some Android/Samsung players read the leading
// ID3v2 header's TLEN frame and trust it. With chunks 4500/4500/930 chars
// long, the first chunk's TLEN says ~6 minutes, so the whole 13-minute
// story is reported as 6 minutes in those players (audio under it plays to
// the end, but the duration UI is wrong).
//
// Fix: strip ID3v2 and ID3v1 tags from each part before concat, then prefix
// a single empty ID3v2 tag at the start so the result is a clean MP3 with
// no misleading metadata. Players frame-scan and report correct duration.
//
// Format references:
//   ID3v2: 10-byte header at offset 0 — "ID3" magic + 2 byte version +
//          1 byte flags + 4 byte synchsafe size of the tag body (each byte
//          uses 7 bits, MSB ignored). Total tag length = 10 + size.
//   ID3v1: 128 bytes at end of file starting with "TAG".
function stripID3v2(buf){
  if (buf.length < 10) return buf;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return buf; // not "ID3"
  const size = ((buf[6] & 0x7F) << 21) | ((buf[7] & 0x7F) << 14) | ((buf[8] & 0x7F) << 7) | (buf[9] & 0x7F);
  return buf.subarray(10 + size);
}
function stripID3v1(buf){
  if (buf.length < 128) return buf;
  const tail = buf.subarray(buf.length - 128);
  if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) return buf.subarray(0, buf.length - 128); // "TAG"
  return buf;
}

export function concatBuffers(buffers) {
  const parts = buffers
    .map(b => b instanceof Uint8Array ? b : new Uint8Array(b))
    .map(b => stripID3v1(stripID3v2(b)));
  if (parts.length === 1) return parts[0].buffer.slice(parts[0].byteOffset, parts[0].byteOffset + parts[0].byteLength);
  const totalLen = parts.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}

// ── Upload mp3 to Supabase storage `stories` bucket. Returns public URL. ─
export async function uploadAudio({ supabaseUrl, supabaseKey, fileName, audioBuf }) {
  const upRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true'
    },
    body: audioBuf
  });
  if (!upRes.ok) {
    const errText = await upRes.text();
    throw new Error(`Upload ${upRes.status}: ${errText.slice(0, 240)}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/stories/${fileName}`;
}

// ── Anthropic Messages API call with retry. Returns story text. ─────────
export async function callClaude({ apiKey, system, user, model = 'claude-sonnet-4-6', maxTokens = 16000, temperature = 1 }) {
  const body = JSON.stringify({
    model, max_tokens: maxTokens, temperature, system,
    messages: [{ role: 'user', content: user }]
  });

  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body
    });
    if (res.ok) break;
    const shouldRetry = res.status === 429 || res.status === 529 || res.status >= 500;
    if (!shouldRetry || attempt === 4) {
      const errText = await res.text();
      throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
    }
    const waitMs = res.status === 429 ? 30_000 : 4_000 * (attempt + 1);
    console.log(`[Claude] ${res.status}, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/5)`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  const data = await res.json();
  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }
  return text.trim();
}
