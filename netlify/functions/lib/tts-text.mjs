// Pre-TTS text cleanup. Run on the writer's raw output before sending to
// ElevenLabs. Belt-and-braces against rule violations the writer occasionally
// produces despite the system prompt forbidding them.
//
// Why this exists:
//   - The writer prompt forbids em-dashes (—), en-dashes (–), and "--"
//     because ElevenLabs eleven_v3 renders them as awkward gaps or skips them
//     entirely. Despite escalated prompt warnings, the model still emits them
//     in 100% of stories observed in the A/B suite (Apr-May 2026).
//   - Markdown emphasis markers (**, *, _) sometimes appear despite "no visual
//     formatting" rules.
//
// Replacements:
//   em-dash / en-dash / double-hyphen → ", " (preserves clause break, lets
//     TTS pause naturally)
//   ** / * / _ → "" (silently dropped)
//
// Then a small tidy pass cleans up adjacent commas / commas-before-periods
// introduced by the dash swap. Multi-space runs are collapsed.
//
// IMPORTANT: do NOT collapse the audio pause marker ` ... ` (space-dot-dot-
// dot-space). The collapse step uses 2+ spaces only, leaving ` ... ` intact.

// ElevenLabs eleven_v3 caps a single text-to-speech request at 5,000 chars.
// Full 15-min stories are ~7,000–11,000 chars, so we chunk at paragraph
// boundaries (then sentence boundaries if a paragraph is too long), call TTS
// per chunk, and concatenate the resulting MP3 buffers in the worker.
//
// Splitting at paragraph breaks means the audio joins on natural pauses, so
// simple binary MP3 concatenation produces audio that sounds clean to the
// listener. (MP3 frames are independent; players tolerate the duplicated
// ID3 headers between chunks.)
//
// Default cap is 4,500 chars (500-char buffer below the 5k limit) to leave
// headroom for whitespace handling on ElevenLabs' side.
export function splitTextForTTS(text, maxChars = 4500) {
  if (!text || text.length <= maxChars) return [text || ''];

  const chunks = [];
  let current = '';

  const paragraphs = text.split(/\n\n+/);
  for (const paraRaw of paragraphs) {
    const para = paraRaw.trim();
    if (!para) continue;

    // Paragraph fits inside current chunk — append it
    if (current.length + para.length + 2 <= maxChars) {
      current = current ? current + '\n\n' + para : para;
      continue;
    }

    // Paragraph doesn't fit. Push what we have, then handle the new para.
    if (current) { chunks.push(current); current = ''; }

    if (para.length <= maxChars) {
      current = para;
      continue;
    }

    // Paragraph itself is too long — split on sentence boundaries
    const sentences = para.split(/(?<=[.!?])\s+/);
    let sub = '';
    for (const sentRaw of sentences) {
      const sent = sentRaw.trim();
      if (!sent) continue;

      if (sent.length > maxChars) {
        // Single sentence is too long — emit any pending sub, then hard-split
        if (sub) { chunks.push(sub); sub = ''; }
        for (let i = 0; i < sent.length; i += maxChars) {
          chunks.push(sent.slice(i, i + maxChars));
        }
        continue;
      }

      if (sub.length + sent.length + 1 <= maxChars) {
        sub = sub ? sub + ' ' + sent : sent;
      } else {
        if (sub) chunks.push(sub);
        sub = sent;
      }
    }
    if (sub) current = sub;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function prepareTTSText(text) {
  if (!text || typeof text !== 'string') return text;
  let cleaned = text;

  // Strip markdown emphasis markers
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '');

  // Replace em-dashes, en-dashes, and double-hyphens with comma+space.
  // Comma is right because almost every em-dash use in narrative prose is a
  // clause break that wants a comma's pacing in audio.
  cleaned = cleaned.replace(/[—–]/g, ', ');
  cleaned = cleaned.replace(/--/g, ', ');

  // Tidy: ", ," introduced when an em-dash was already next to a comma; ", ."
  // when an em-dash ended a sentence; runs of spaces from "word — word" → "word ,  word".
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/,\s*([.!?])/g, '$1');
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned.trim();
}
