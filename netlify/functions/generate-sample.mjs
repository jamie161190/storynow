// Temporary function to generate a new homepage sample MP3
// DELETE THIS FILE after downloading the generated audio
export default async (req) => {
  const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
  // Daniel - calm, deep, British male voice
  const voiceId = 'onwK4e9ZLuTAKqWW03F9';

  const storyText = `This story was made just for you, Chase.

Chase lay in bed, staring at the glow-in-the-dark stars on his ceiling. But tonight, something was different. One of the stars was getting brighter. And brighter. And brighter.

He sat up. The light filled his whole room, warm and golden, and then, with a gentle whoooosh, the ceiling opened up like a hatch, and a small silver rocket floated down and hovered right above his bed.

A voice crackled from inside. "Chase? Are you ready? We've been waiting for you."

Chase grinned. He grabbed his favourite teddy, climbed aboard, and before he could even buckle in, the rocket shot upwards, through the roof, through the clouds, through the sky, until the whole of Earth was just a little blue marble behind him.

"First stop," the voice said, "the Moon."

The Moon was quiet. Chase's boots left footprints in the silver dust, and he bounced with every step, higher and higher, laughing as he floated back down. He found a crater filled with moonflowers that glowed pale blue, and he picked one to bring home.

"Next stop," the voice said, "Saturn."

Saturn's rings were made of ice crystals that chimed like tiny bells when Chase ran his fingers through them. He slid down the biggest ring like the longest slide in the universe, spinning and laughing, his teddy tucked under one arm.

And then Chase looked out into the distance, at all the stars he hadn't visited yet, at all the adventures still waiting for him. He smiled, closed his eyes, and whispered, "I'll be back tomorrow."

The rocket knew. It always knew. It carried him gently home, back through the clouds, back through the ceiling, back into his warm bed. The glow-in-the-dark stars on his ceiling twinkled, just a little brighter than before.

Goodnight, Chase. The stars will be there whenever you're ready.`;

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: storyText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Disposition': 'attachment; filename="sample-story.mp3"' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
