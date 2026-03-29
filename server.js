const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const VOICES = {
  bedtime: [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Warm and gentle', emoji: '👩' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Calm and soothing', emoji: '👨' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Soft and kind', emoji: '👩‍🦱' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Gentle and warm', emoji: '🧔' }
  ],
  journey: [
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Energetic adventurer', emoji: '🧗' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', desc: 'Bold and exciting', emoji: '🦸' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', desc: 'Strong and brave', emoji: '💪' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Deep and dramatic', emoji: '🎭' }
  ],
  learning: [
    { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', desc: 'Encouraging teacher', emoji: '👩‍🏫' },
    { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', desc: 'Fun science teacher', emoji: '🔬' },
    { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', desc: 'Patient and clear', emoji: '📚' },
    { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', desc: 'Wise professor', emoji: '🎓' }
  ]
};

const STORY_PROMPTS = {
  bedtime: (d) => `Write a calming, warm bedtime story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} The story should be gentle, soothing and end with ${d.childName} drifting off to sleep feeling safe and loved. Make it feel completely personal, like it was written just for them. Around 600 words. No chapter titles.`,
  journey: (d) => `Write an exciting episodic adventure story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} The story should have three short chapters with cliffhangers, perfect for reading aloud on a long car or plane journey. Make it gripping and fun. Around 600 words.`,
  learning: (d) => `Write an exciting educational story for a ${d.age} year old ${d.gender} named ${d.childName}. Their best friend is called ${d.friendName}. They love ${d.interest}. ${d.hasPet ? `They have a pet called ${d.petName}.` : ''} ${d.childName} is a superhero who must solve ${d.subject} problems to save the day. Make the ${d.subject} challenges age appropriate and woven naturally into the adventure. Around 600 words.`
};

app.get('/api/voices/:category', (req, res) => {
  const voices = VOICES[req.params.category];
  if (!voices) return res.status(400).json({ error: 'Invalid category' });
  res.json({ voices });
});

app.post('/api/generate-preview', express.json(), async (req, res) => {
  try {
    const { storyData, voiceId } = req.body;
    const promptFn = STORY_PROMPTS[storyData.category];
    if (!promptFn) return res.status(400).json({ error: 'Invalid category' });

    const storyResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptFn(storyData) }]
    });

    const fullStory = storyResponse.content[0].text;
    const messageIntro = storyData.personalMessage 
      ? `${storyData.personalMessage} ... ` 
      : '';
    const fullStoryWithMessage = messageIntro + fullStory;
    const previewText = fullStoryWithMessage.split(' ').slice(0, 40).join(' ') + '...';

    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      throw new Error('ElevenLabs error: ' + err);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    res.json({ success: true, previewAudio: audioBase64, fullStory: fullStoryWithMessage, storyData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-full', express.json(), async (req, res) => {
  try {
    const { fullStory, voiceId } = req.body;
    const useVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL';

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${useVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: fullStory,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!ttsResponse.ok) throw new Error('Audio generation failed');

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    res.json({ success: true, fullAudio: audioBase64 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Storytold running on http://localhost:${PORT}`));
