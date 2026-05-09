// POST /api/track-lead { requestId, leadEventId, registerEventId, fbp, fbc }
// Server-side mirror for the client-side fbq calls fired on form submission.
// Browser fires Lead + CompleteRegistration; client posts here with same event_ids.
// Server fires both via CAPI with matching event_ids — Meta deduplicates so we
// count once per submission but keep attribution alive when ad-blockers/iOS strip
// the browser event.

import { sendMetaEvent } from './lib/meta-capi.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad json', { status: 400 }); }

  const { requestId, leadEventId, registerEventId, fbp, fbc } = body || {};
  // Accept legacy field name `eventId` from any cached pages still serving the
  // pre-CompleteRegistration version of the form.
  const finalLeadEventId = leadEventId || body?.eventId;
  if (!requestId || !finalLeadEventId) return new Response('Missing fields', { status: 400 });

  // Look up email by requestId for Advanced Matching.
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  let email = '';
  if (supabaseUrl && supabaseKey) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(requestId)}&select=email&limit=1`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey }, signal: AbortSignal.timeout(3000) }
      );
      if (r.ok) {
        const rows = await r.json();
        email = rows?.[0]?.email || '';
      }
    } catch {}
  }

  const userAgent = req.headers.get('user-agent') || '';
  const sourceUrl = req.headers.get('referer') || 'https://heartheirname.com/start';

  // Fire Lead (always)
  await sendMetaEvent({
    eventName: 'Lead',
    eventId: finalLeadEventId,
    email,
    fbp,
    fbc,
    userAgent,
    sourceUrl,
    customData: { content_name: 'preview-request' },
  });

  // Fire CompleteRegistration if the client passed a matching event_id.
  if (registerEventId) {
    await sendMetaEvent({
      eventName: 'CompleteRegistration',
      eventId: registerEventId,
      email,
      fbp,
      fbc,
      userAgent,
      sourceUrl,
      customData: { content_name: 'preview-request' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
