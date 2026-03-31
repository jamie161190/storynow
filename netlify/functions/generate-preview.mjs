// ============================================================
// GENERATE PREVIEW — Rate limiting + validation only
// The actual generation runs in preview-worker-background.mjs
// which the client triggers directly for a 15-min timeout.
// ============================================================

export default async (req) => {
  // ── Rate limiting: max 5 previews per IP per hour ──
  const clientIP = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimitKey = `preview_${clientIP}`;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const rlCheck = await fetch(
        `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rateLimitKey)}&created_at=gte.${oneHourAgo}&select=id`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );
      if (rlCheck.ok) {
        const recent = await rlCheck.json();
        if (recent.length >= 5) {
          console.log('Rate limited:', clientIP, recent.length, 'requests in last hour');
          return new Response(JSON.stringify({ error: 'You have reached the preview limit. Please try again later.' }), {
            status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }
          });
        }
      }
      // Record this request
      await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: rateLimitKey, created_at: new Date().toISOString() })
      });
    } catch (rlErr) {
      console.error('Rate limit check failed (allowing request):', rlErr.message);
    }
  }

  // Just return OK — client triggers the background worker directly
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/generate-preview' };
