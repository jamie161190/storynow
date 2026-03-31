// ============================================================
// GENERATE PREVIEW — Triggers background worker, returns immediately
// The actual generation (Anthropic + ElevenLabs) runs in
// preview-worker-background.mjs which has a 15-minute timeout.
// Client polls check-preview for the result.
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

  try {
    const { storyData, voiceId, jobId } = await req.json();

    // Validate jobId
    if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input size limits
    if (storyData?.extraDetails && storyData.extraDetails.length > 1000) {
      return new Response(JSON.stringify({ error: 'Extra details too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.customScenario && storyData.customScenario.length > 2000) {
      return new Response(JSON.stringify({ error: 'Custom scenario too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.personalMessage && storyData.personalMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Personal message too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.giftMessage && storyData.giftMessage.length > 500) {
      return new Response(JSON.stringify({ error: 'Gift message too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.themeDetail && storyData.themeDetail.length > 500) {
      return new Response(JSON.stringify({ error: 'Theme detail too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (storyData?.sidekickName && storyData.sidekickName.length > 200) {
      return new Response(JSON.stringify({ error: 'Sidekick name too long' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validate category
    const validCategories = ['bedtime', 'journey', 'learning', 'custom'];
    if (!storyData?.category || !validCategories.includes(storyData.category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log('Triggering preview background worker for job:', jobId, 'category:', storyData.category);

    // ── Trigger background function ──
    const siteUrl = process.env.URL || 'https://storytold.ai';
    const bgRes = await fetch(`${siteUrl}/.netlify/functions/preview-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyData, voiceId, jobId })
    });

    if (bgRes.status === 202) {
      console.log('Preview background worker triggered successfully for job:', jobId);
      return new Response(JSON.stringify({ polling: true, jobId }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // If background trigger failed, log it but still tell client to poll
    // (the background function may have started despite non-202 response)
    console.error('Background trigger returned:', bgRes.status);
    return new Response(JSON.stringify({ polling: true, jobId }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Generate preview error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.', debug: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/generate-preview' };
