// Studio Story Gateway: Validates auth, generates jobId, triggers background worker.

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return json({ error: 'Studio not configured' }, 500);

  const authHeader = req.headers.get('x-admin-secret');
  if (authHeader !== adminSecret) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const { storyData, voiceId, length, music } = body;
  if (!storyData || !storyData.childName) return json({ error: 'Child name is required' }, 400);

  const jobId = 'studio_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  // Trigger background worker
  const workerUrl = (process.env.URL || 'https://storytold.netlify.app') + '/.netlify/functions/studio-story-background';
  try {
    await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        storyData,
        voiceId: voiceId || 'EXAVITQu4vr4xnSDxMaL',
        length: length || 'preview',
        music: music || 'none'
      })
    });
  } catch (e) {
    console.log('[STUDIO] Background trigger sent (fire-and-forget):', e.message || 'ok');
  }

  return json({ jobId });
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export const config = { path: '/api/studio-story' };
