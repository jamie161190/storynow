// Reusable ElevenLabs eleven_v3 TTS helper for the ad pipeline.
// Voice names map to the same 6 voices used in the production worker.

import { writeFileSync } from 'node:fs';

export const VOICE_MAP = {
  'British (warm)':       'oWAxZDx7w5VEj9dCyTzz',
  'British (gentle)':     'ThT5KcBeYPX3keUQqHPh',
  'Irish (lilting)':      'cjVigY5qzO86Huf0OWal',
  'American (cosy)':      'g5CIjZEefAph4nQFvHAz',
  'Scottish (kind)':      'N2lVS1w4EtoT3dr4eOWO',
  'Australian (bright)':  'ZQe5CZNOzWyzPSCn5a3c'
};
export const DEFAULT_VOICE_ID = 'oWAxZDx7w5VEj9dCyTzz';

export async function generateTTS({ text, voice = 'British (warm)', outPath, stability = 0.5, similarityBoost = 0.75 }) {
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
