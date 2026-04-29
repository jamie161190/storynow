// Arcads.ai API client.
//
// Arcads exposes an HTTP API for programmatic ad creation. The exact endpoint
// surface evolves; see https://docs.arcads.ai for the live shape. This wrapper
// targets the v1 API as of 2026 — adjust constants if the spec changes.
//
// Auth: ARCADS_API_KEY env var (Bearer token).
//
// Pattern: POST → returns { id }, then poll GET /videos/{id} until status === 'ready'.

const BASE = 'https://api.arcads.ai/v1';
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

function authHeaders() {
  const k = process.env.ARCADS_API_KEY;
  if (!k) throw new Error('ARCADS_API_KEY not set. Sign up at arcads.ai and add the key to your env.');
  return { 'Authorization': `Bearer ${k}`, 'Content-Type': 'application/json' };
}

export async function listActors() {
  const res = await fetch(`${BASE}/actors`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Arcads listActors: ${res.status} ${await res.text()}`);
  return res.json();
}

// Create a video. Returns { id, status }.
//   actorId        — pick from /actors (Arcads dashboard)
//   script         — the spoken text
//   aspectRatio    — '9:16' | '1:1' | '16:9'
export async function createVideo({ actorId, script, aspectRatio = '9:16', language = 'en', voiceId = null }) {
  const body = {
    actor_id: actorId,
    script,
    aspect_ratio: aspectRatio,
    language
  };
  if (voiceId) body.voice_id = voiceId;
  const res = await fetch(`${BASE}/videos`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Arcads createVideo: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getVideo(id) {
  const res = await fetch(`${BASE}/videos/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Arcads getVideo: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function waitForVideo(id, { onProgress } = {}) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const v = await getVideo(id);
    if (onProgress) onProgress(v);
    if (v.status === 'ready' || v.status === 'completed') return v;
    if (v.status === 'failed' || v.status === 'error') throw new Error(`Arcads job ${id} failed: ${v.error || JSON.stringify(v)}`);
  }
  throw new Error(`Arcads job ${id} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

export async function downloadVideo(url, outPath) {
  const { writeFileSync } = await import('node:fs');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return outPath;
}
