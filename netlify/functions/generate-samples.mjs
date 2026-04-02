// ONE-TIME USE: Generate homepage sample narration
// Hit: curl https://storytold.ai/api/generate-samples?name=bedtime
// Hit: curl https://storytold.ai/api/generate-samples?name=adventure
// Hit: curl https://storytold.ai/api/generate-samples?name=learning
// DELETE THIS FILE after generating

export default async (req) => {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!ELEVENLABS_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing ElevenLabs key' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get('name');

  const samples = {
    bedtime: {
      voice: 'onwK4e9ZLuTAKqWW03F9',
      file: 'sample-bedtime.mp3',
      script: 'The bedroom was quiet. The kind of quiet that hums. Chase pulled his blanket tighter... and Pikachu glowed. Just faintly. Just enough to catch the shadows on the ceiling. "Did you see that?" Ellis whispered from the sleeping bag on the floor. Chase had seen it. Because every night, when Daddy thought the lights were out and everyone was sleeping... [whispers] Chase knew something Daddy didn\'t. The glow was getting stronger. And underneath it...'
    },
    adventure: {
      voice: 'N2lVS1w4EtoT3dr4eOWO',
      file: 'sample-adventure.mp3',
      script: 'Chase sprinted down the tunnel. Boots hammering. Lungs burning. "He\'s right behind us!" Ellis screamed. Daddy was close. Too close. Chase clutched the Pikachu coin, the one with the code scratched underneath. Lose it, lose everything. "This door!" Ellis grabbed the handle. Pulled. Pulled harder. It didn\'t move. Chase slammed his shoulder against it. Nothing. Behind them, footsteps. Getting louder. Getting closer. Chase turned. [gasps] Daddy was already there... smiling.'
    },
    learning: {
      voice: 'TX3LPaxmHKxFdv7VOQHJ',
      file: 'sample-learning.mp3',
      script: 'Chase stared at his Pikachu card. Something was wrong. The HP number... it was different. Lower than yesterday. "Ellis," Chase whispered. "Did anyone touch my binder?" Ellis shrugged. "Your dad was in your room this morning." Chase\'s stomach dropped. He checked again. This wasn\'t the same card. "Someone swapped it," Chase said slowly. "But why would Dad..." Then Chase saw the receipt. On the kitchen counter. Dated today. What if we could prove it?'
    }
  };

  if (!name || !samples[name]) {
    return new Response(JSON.stringify({ error: 'Pass ?name=bedtime or ?name=adventure or ?name=learning' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const sample = samples[name];

  try {
    console.log('Generating ' + name + ' with voice ' + sample.voice + '...');

    const ttsRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + sample.voice, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: sample.script,
        model_id: 'eleven_v3',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      })
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      return new Response(JSON.stringify({ name, error: 'TTS failed: ' + ttsRes.status, detail: err }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    console.log(name + ' audio generated:', audioBuffer.byteLength, 'bytes');

    const uploadRes = await fetch(supabaseUrl + '/storage/v1/object/stories/' + sample.file, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + supabaseKey,
        'apikey': supabaseKey,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true'
      },
      body: audioBuffer
    });

    const publicUrl = supabaseUrl + '/storage/v1/object/public/stories/' + sample.file;

    return new Response(JSON.stringify({
      success: true, name, bytes: audioBuffer.byteLength, publicUrl, upload: uploadRes.status
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ name, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-samples' };
