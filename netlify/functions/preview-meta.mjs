// GET /api/preview-meta?id=...&t=...
// Returns the metadata needed by /preview/[id] page (status, preview_url, child_name, etc).
// Access controlled via either session cookie OR access_token query.

import { getSessionFromHeaders } from './lib/auth.mjs';
import { normalizeNameList } from './lib/format-names.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const t = url.searchParams.get('t');
  if (!id) return json({ error: 'id required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  let lookup;
  try {
    lookup = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&version=eq.2&select=id,email,child_name,status,preview_url,preview_text,preview_ready_at,verified_at,access_token,payment_status,paid_at,audio_url,story_data,jamie_note`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
  } catch (err) {
    console.error('[preview-meta] supabase fetch threw:', err.message);
    return json({ error: 'Service unavailable' }, 503);
  }
  // Postgrest returns 400 for malformed UUIDs (anything not matching uuid pattern).
  // Treat that as Not Found, not as an internal error — crawlers, link-typoes
  // and stale fbclid replays should never trip Sentry alarms or kill ad tracking.
  if (lookup.status === 400 || lookup.status === 404) return json({ error: 'Not found' }, 404);
  if (!lookup.ok) {
    console.error('[preview-meta] supabase non-ok status:', lookup.status);
    return json({ error: 'Lookup failed' }, 500);
  }
  const rows = await lookup.json();
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  // Access check
  const session = getSessionFromHeaders(req.headers);
  const sessionMatch = session && session.email === s.email;
  const tokenMatch = t && s.access_token && t === s.access_token;
  if (!sessionMatch && !tokenMatch) return json({ error: 'Access denied' }, 403);

  return json({
    id: s.id,
    childName: normalizeNameList(s.child_name),
    email: s.email || null,
    status: s.status,
    deliveryMode: s.story_data?.delivery_mode || 'auto',
    verified: !!s.verified_at,
    preview: s.preview_url ? {
      url: s.preview_url,
      readyAt: s.preview_ready_at,
      title: s.story_data?.title || '',
      text: s.preview_text || ''
    } : null,
    paid: s.payment_status === 'paid' || !!s.paid_at,
    full: s.audio_url ? { url: s.audio_url, jamieNote: s.jamie_note } : null,
    storyData: {
      voice: s.story_data?.voice || '',
      storyKind: s.story_data?.storyKind || '',
      isGift: !!s.story_data?.isGift,
      giftFrom: s.story_data?.giftFrom || ''
    },
    // Reveal lines: short personalisation snippets shown one-at-a-time on the
    // wait screen so the customer sees their inputs being "read". Lines come
    // from what they entered. We compute them server-side so the page doesn't
    // need to know the data shape (and we don't expose more fields than we
    // need to). Order matters: most identifying first, then context.
    revealLines: buildRevealLines(s.story_data)
  });
};

function buildRevealLines(d) {
  if (!d || typeof d !== 'object') return [];
  const lines = [];
  const children = Array.isArray(d.children) ? d.children : [];

  children.forEach(c => {
    if (!c?.name) return;
    const ageNum = parseInt(c.age, 10);
    const ageStr = Number.isFinite(ageNum) && ageNum > 0
      ? `, ${ageNum} ${ageNum === 1 ? 'year' : 'years'} old`
      : '';
    lines.push(`${String(c.name).trim()}${ageStr}.`);
    if (c.bestFriend && c.bestFriend.trim()) {
      lines.push(`${c.bestFriend.trim()}, ${c.name}'s best friend.`);
    }
    if (c.toy && c.toy.trim()) {
      lines.push(`${c.toy.trim()}.`);
    }
    if (c.quirk && c.quirk.trim()) {
      const q = c.quirk.trim();
      lines.push(q.length > 90 ? q.slice(0, 87) + '…' : q);
    }
  });

  if (d.others && d.others.trim()) {
    lines.push(d.others.trim());
  }
  if (d.hasPet && (d.petName || d.petKind)) {
    const pet = [d.petName, d.petKind].filter(Boolean).join(' the ');
    lines.push(pet + '.');
  }
  if (d.hasVillain && d.villainName && d.villainName.trim()) {
    lines.push(`A baddie called ${d.villainName.trim()}.`);
  }
  if (Array.isArray(d.themes) && d.themes.length) {
    lines.push(d.themes.slice(0, 3).join(', ') + '.');
  }
  if (d.themesOther && d.themesOther.trim()) {
    lines.push(d.themesOther.trim());
  }
  const place = (d.placeReal && d.placeReal.trim()) || d.place || '';
  if (place) {
    lines.push(String(place).trim());
  }
  if (d.voice) {
    lines.push(`Read by the ${d.voice} voice.`);
  }
  if (d.isGift && d.giftFrom && d.giftFrom.trim()) {
    lines.push(`A gift from ${d.giftFrom.trim()}.`);
  }
  if (d.isGift && d.giftMessage && d.giftMessage.trim()) {
    const m = d.giftMessage.trim();
    lines.push(`"${m.length > 80 ? m.slice(0, 77) + '…' : m}"`);
  }

  return lines;
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
