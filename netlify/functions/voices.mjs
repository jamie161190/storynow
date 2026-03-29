const VOICES = {
  bedtime: [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Warm and gentle', emoji: '👩' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Calm and soothing', emoji: '👨' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Soft and kind', emoji: '👩' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Gentle and warm', emoji: '🧔' }
  ],
  journey: [
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Energetic adventurer', emoji: '🧗' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', desc: 'Bold and exciting', emoji: '🦸' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', desc: 'Strong and brave', emoji: '💪' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Deep and dramatic', emoji: '🎭' }
  ],
  learning: [
    { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', desc: 'Encouraging teacher', emoji: '👩' },
    { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', desc: 'Fun science teacher', emoji: '🔬' },
    { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', desc: 'Patient and clear', emoji: '📚' },
    { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', desc: 'Wise professor', emoji: '🎓' }
  ],
  custom: [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Warm and reassuring', emoji: '👩' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Calm and friendly', emoji: '👨' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Upbeat and fun', emoji: '🧗' },
    { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', desc: 'Gentle and kind', emoji: '👩' }
  ]
};
export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const category = parts[parts.length - 1];
  const voices = VOICES[category];
  if (!voices) return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ voices }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
export const config = { path: '/api/voices/:category' };
