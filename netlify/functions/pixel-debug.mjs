// GET /api/pixel-debug?token=heartheirname-debug
// One-shot diagnostic: fires a test Lead via CAPI to Meta and returns Meta's
// full response body so we can see if the META_CAPI_TOKEN matches the pixel,
// if events are accepted, and if there are any matching warnings.
//
// Pass &test_event_code=TEST00000 to route the event to the Test Events tab
// in Events Manager (replace TEST00000 with the actual code Meta gave you).
//
// SECURITY: requires the magic ?token=heartheirname-debug query param so
// random visitors can't spam your CAPI quota. Remove this file after
// debugging is finished.

const PIXEL_ID = process.env.META_PIXEL_ID || '1656775315345896';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('token') !== 'heartheirname-debug') {
    return new Response('Forbidden', { status: 403 });
  }

  if (!ACCESS_TOKEN) {
    return json({
      ok: false,
      reason: 'META_CAPI_TOKEN env var is not set',
    });
  }

  const testEventCode = url.searchParams.get('test_event_code') || '';
  const eventId = `pixel_debug_${Date.now()}`;

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: 'https://heartheirname.com/start',
      action_source: 'website',
      user_data: {
        client_user_agent: 'pixel-debug-diagnostic',
        em: ['8b2c0c5b8a9e2c4d1f3e5a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d'],
      },
      custom_data: {
        content_name: 'pixel-debug-test',
      },
    }],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  let metaResponse;
  let metaBody;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }
    );
    metaResponse = res.status;
    metaBody = await res.json().catch(() => ({ parse_error: true }));
  } catch (err) {
    return json({
      ok: false,
      pixel_id_used: PIXEL_ID,
      reason: 'Network error or timeout',
      error: err.message,
    });
  }

  return json({
    ok: !metaBody.error && metaResponse === 200,
    pixel_id_we_sent_to: PIXEL_ID,
    test_event_code_used: testEventCode || '(none — went to production)',
    event_id: eventId,
    meta_http_status: metaResponse,
    meta_response: metaBody,
    interpretation: interpret(metaResponse, metaBody),
  });
};

function interpret(status, body) {
  if (status === 200 && body.events_received >= 1 && !body.error) {
    return '✅ CAPI accepted the event. Token + pixel match. Should appear in Events Manager (Test Events tab if test_event_code was used; Overview tab otherwise, with up to 60min lag).';
  }
  if (body.error?.code === 190) {
    return '❌ Token is invalid or expired. Generate a new CAPI token at Events Manager → StoryTold pixel (' + PIXEL_ID + ') → Settings → Generate Access Token. Update META_CAPI_TOKEN in Netlify env.';
  }
  if (body.error?.code === 100 && body.error?.message?.includes('object')) {
    return '❌ The token does not belong to pixel ' + PIXEL_ID + '. The token was likely generated for a DIFFERENT pixel (e.g. StoryToldCAPI = 24225528803810871). Either: (a) generate a new token on the StoryTold pixel, OR (b) tell us to point the codebase at the pixel the token belongs to.';
  }
  if (body.error) {
    return '❌ Meta rejected the event. Error code ' + (body.error.code || '?') + ': ' + (body.error.message || 'unknown');
  }
  if (status >= 400) {
    return '❌ Meta returned HTTP ' + status + '. Check the meta_response field above.';
  }
  return '⚠️ Unexpected response. Inspect meta_response.';
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
