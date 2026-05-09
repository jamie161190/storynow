// Reusable ElevenLabs eleven_v3 TTS helper for the ad pipeline.
// Voice names map to the same 5 voices used in the production worker.
// "British (warm)" was Grace (oWAxZDx7w5VEj9dCyTzz) but Grace is American,
// so the funnel option was removed. Internal ad scripts now default to
// Dorothy (British female).

import { writeFileSync } from 'node:fs';

export const VOICE_MAP = {
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh', // Dorothy, british female
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal', // Eric, irish male
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz', // Ethan, american male
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO', // Callum, scottish male
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'  // James, australian male
};
export const DEFAULT_VOICE_ID = 'ThT5KcBeYPX3keUQqHPh'; // Dorothy

export async function generateTTS({ text, voice = 'British (gentle)', outPath, stability = 0.5, similarityBoost = 0.75 }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  const voiceId = VOICE_MAP[voice] || DEFAULT_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: { stability, similarity_boost: similarityBoost, style: 0 }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (outPath) writeFileSync(outPath, buf);
  return buf;
}

// TTS with character-level alignment timestamps. Returns { buf, alignment }
// where alignment is { characters: [...], char_start: [...], char_end: [...] }
// Character timestamps are in seconds from start of audio.
export async function generateTTSWithTimestamps({ text, voice = 'British (gentle)', outPath, stability = 0.5, similarityBoost = 0.75 }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  const voiceId = VOICE_MAP[voice] || DEFAULT_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_v3',
      voice_settings: { stability, similarity_boost: similarityBoost, style: 0 }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  const buf = Buffer.from(data.audio_base64, 'base64');
  if (outPath) writeFileSync(outPath, buf);
  // ElevenLabs returns alignment in their normalized field. Use whichever is present.
  const al = data.alignment || data.normalized_alignment || {};
  return {
    buf,
    alignment: {
      characters: al.characters || [],
      char_start: al.character_start_times_seconds || [],
      char_end: al.character_end_times_seconds || []
    }
  };
}

// Group character-level alignment into phrase-level captions split by punctuation.
// Returns [{ text, start, end }, ...] with absolute timestamps in seconds.
export function alignmentToPhrases(alignment, opts = {}) {
  const minWords = opts.minWords || 3;
  const maxWords = opts.maxWords || 9;
  const breakOn = /[.!?,;:—]/;

  const chars = alignment.characters || [];
  const starts = alignment.char_start || [];
  const ends = alignment.char_end || [];

  const phrases = [];
  let cur = '', curStart = null, curEnd = null, wordCount = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (curStart == null) curStart = starts[i];
    cur += c;
    curEnd = ends[i];
    if (c === ' ') wordCount++;
    const isHardBreak = breakOn.test(c);
    if ((isHardBreak && wordCount >= minWords) || wordCount >= maxWords) {
      phrases.push({ text: cur.trim(), start: curStart, end: curEnd });
      cur = '';
      curStart = null;
      wordCount = 0;
    }
  }
  if (cur.trim().length) phrases.push({ text: cur.trim(), start: curStart, end: curEnd });
  return phrases;
}
