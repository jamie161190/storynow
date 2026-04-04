// Studio Content Library: Save, list, and delete generated content assets in Supabase Storage.
// Uses a JSON index file to track all assets without needing a database table.

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return json({ error: 'Studio not configured' }, 500);
  if (req.headers.get('x-admin-secret') !== adminSecret) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Storage not configured' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const { action } = body;

  // ── List all assets ──
  if (action === 'list') {
    return handleList(supabaseUrl, supabaseKey);
  }

  // ── Save a new asset ──
  if (action === 'save') {
    return handleSave(supabaseUrl, supabaseKey, body);
  }

  // ── Delete an asset ──
  if (action === 'delete') {
    return handleDelete(supabaseUrl, supabaseKey, body.assetId);
  }

  return json({ error: 'Unknown action' }, 400);
};

async function getIndex(supabaseUrl, supabaseKey) {
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/stories/studio-library/index.json`, {
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
    });
    if (res.ok) return await res.json();
    return [];
  } catch { return []; }
}

async function saveIndex(supabaseUrl, supabaseKey, index) {
  await fetch(`${supabaseUrl}/storage/v1/object/stories/studio-library/index.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
      'x-upsert': 'true'
    },
    body: JSON.stringify(index)
  });
}

async function handleList(supabaseUrl, supabaseKey) {
  const index = await getIndex(supabaseUrl, supabaseKey);
  return json({ assets: index });
}

async function handleSave(supabaseUrl, supabaseKey, body) {
  const { name, type, contentType, tags, metadata, data, dataType } = body;
  // type: snippet | story | mockup | adcopy | clip | photo
  // contentType: audio/mpeg | image/png | text/plain
  // data: base64 encoded content (for audio/images) or plain text
  // dataType: base64 | text

  const assetId = 'asset_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const ext = contentType === 'audio/mpeg' ? 'mp3' : contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'txt';
  const storagePath = `studio-library/${assetId}.${ext}`;

  // Upload the asset data
  if (data && dataType === 'base64') {
    const buffer = Buffer.from(data, 'base64');
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });
    if (!uploadRes.ok) {
      console.error('[LIBRARY] Upload failed:', uploadRes.status);
      return json({ error: 'Upload failed' }, 500);
    }
  } else if (data && dataType === 'text') {
    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'text/plain',
        'x-upsert': 'true'
      },
      body: data
    });
    if (!uploadRes.ok) {
      console.error('[LIBRARY] Text upload failed:', uploadRes.status);
      return json({ error: 'Upload failed' }, 500);
    }
  }

  const assetUrl = `${supabaseUrl}/storage/v1/object/public/stories/${storagePath}`;

  // Add to index
  const index = await getIndex(supabaseUrl, supabaseKey);
  const entry = {
    id: assetId,
    name: name || assetId,
    type: type || 'unknown',
    contentType: contentType || 'application/octet-stream',
    url: assetUrl,
    tags: tags || [],
    metadata: metadata || {},
    createdAt: new Date().toISOString()
  };
  index.unshift(entry);
  // Cap at 500 items
  if (index.length > 500) index.length = 500;
  await saveIndex(supabaseUrl, supabaseKey, index);

  return json({ asset: entry });
}

async function handleDelete(supabaseUrl, supabaseKey, assetId) {
  if (!assetId) return json({ error: 'assetId required' }, 400);

  const index = await getIndex(supabaseUrl, supabaseKey);
  const asset = index.find(a => a.id === assetId);
  if (!asset) return json({ error: 'Asset not found' }, 404);

  // Remove from storage
  const urlPath = asset.url.split('/stories/')[1];
  if (urlPath) {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/${urlPath}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
    });
  }

  // Remove from index
  const newIndex = index.filter(a => a.id !== assetId);
  await saveIndex(supabaseUrl, supabaseKey, newIndex);

  return json({ deleted: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export const config = { path: '/api/studio-library' };
