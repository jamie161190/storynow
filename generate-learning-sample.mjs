import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read API key from .env
const env = readFileSync(resolve(__dirname, '.env'), 'utf-8');
const apiKey = env.match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) { console.error('No ELEVENLABS_API_KEY in .env'); process.exit(1); }

// Dorothy - British, encouraging, patient - best for learning
const VOICE_ID = 'ThT5KcBeYPX3keUQqHPh';

const storyText = `Chase stared at the screen. Three numbers. That was all he had to work with. Three numbers, and sixty seconds on the clock.

Ellis leaned over his shoulder. "It's not random," she whispered. "Look at the gaps between them."

... Chase looked again. Four. Seven. Eleven. The gaps were three, then four. So the next gap would be ...

"Five," Chase said. "The next number is sixteen."

The screen flashed green. [excitedly] A door slid open in the wall that had not been there a second ago.

Pikachu darted through it before either of them could move.

"Brilliant start," said a voice from somewhere above them. A voice Chase knew very well.

... Daddy.

"But that was the easy one," the voice continued. "Let's see how you handle what's next."

The room beyond the door was enormous. The walls were covered in equations, patterns, and symbols that seemed to shift when Chase was not looking directly at them. In the centre of the room sat a table with four cards face down, each one glowing faintly at the edges.

Ellis walked around the table slowly. "There's something written on the back of each one. Tiny numbers."

Chase crouched down to look. She was right. Each card had a sequence etched into it. But one card was different. One card had a sequence that broke the pattern.

"Pick the wrong card," Daddy's voice echoed, "and you start all over again."

... Chase's heart was thumping now. He could feel it in his ears.

Pikachu sat perfectly still on the edge of the table, watching him. Waiting.

Chase studied the first card. Two, four, eight, sixteen. Doubling. That made sense. The second card. One, one, two, three, five. Each number the sum of the two before it. He knew that one. The third card. Ten, twenty, thirty, forty. Simple. Just adding ten.

... The fourth card. Three, six, ten, fifteen.

Chase frowned. "The gaps are three, four, five. So it's adding one more each time."

Ellis nodded slowly. "They all follow a rule."

"Exactly," Chase murmured. "They ALL follow a rule. So which one is the wrong card?"

... He looked again. Harder this time. And then he saw it. The second card. One, one, two, three, five. The last number should have been eight, not five. Someone had changed it.

[whispers] "That one," Chase said quietly, reaching for the second card.

The moment his fingers touched it, every equation on every wall lit up gold. The table split apart and revealed a staircase spiralling downward into warm amber light.

Daddy's voice came again, but softer this time. "I knew you'd get it. But Chase ... the next level is mine. And I don't make it easy."

Chase looked at Ellis. Ellis looked at Pikachu. Pikachu was already halfway down the stairs.

... "Come on then," Chase said, grinning. "He never makes it easy. That's what makes it fun."

... ... To hear what happens next, unlock the full story. This story was made just for Chase.`;

// Prepare text for TTS (same as production prepareTTSText)
let tts = storyText;
tts = tts.replace(/\.\s*\.\.\s*\.\.\./g, '.\n\n');
tts = tts.replace(/\.\.\.\s*\.\.\./g, '.\n\n');
tts = tts.replace(/\s*\.\.\.\s*/g, '. ');
tts = tts.replace(/\.\s*\.\s+/g, '. ');
tts = tts.replace(/\s{3,}/g, ' ');
tts = tts.trim();

console.log(`Text: ${tts.length} chars`);
console.log('Calling ElevenLabs with Dorothy (British voice)...');

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: tts,
    model_id: 'eleven_v3',
    voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0 }
  })
});

if (!res.ok) {
  const err = await res.text();
  console.error(`ElevenLabs error ${res.status}: ${err}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
const outPath = resolve(__dirname, 'public/samples/sample-learning.mp3');

// Ensure directory exists
import { mkdirSync } from 'fs';
mkdirSync(resolve(__dirname, 'public/samples'), { recursive: true });

writeFileSync(outPath, buf);
console.log(`Done! Saved ${buf.length} bytes to public/samples/sample-learning.mp3`);
