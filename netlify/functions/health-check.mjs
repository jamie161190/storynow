// Health check endpoint - tests all external APIs are working
// Hit /api/health-check in browser to diagnose issues

export default async (req) => {
  // Require admin auth to prevent public probing of service status
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.get('x-admin-secret');
  if (!adminSecret || authHeader !== adminSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const results = {
    timestamp: new Date().toISOString(),
    stripe: { status: 'untested' },
    anthropic: { status: 'untested' },
    elevenlabs: { status: 'untested' },
    supabase_storage: { status: 'untested' },
    supabase_db: { status: 'untested' },
    env_vars: {}
  };

  // Check which env vars exist (don't reveal values)
  const vars = ['STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'META_CAPI_TOKEN', 'TIKTOK_EVENTS_TOKEN'];
  for (const v of vars) {
    results.env_vars[v] = process.env[v] ? 'SET' : 'MISSING';
  }

  // Test Stripe
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const balance = await stripe.balance.retrieve();
    results.stripe = { status: 'OK', currency: balance.available?.[0]?.currency || 'unknown' };
  } catch (e) {
    results.stripe = { status: 'FAIL', error: e.message };
  }

  // Test Anthropic API (basic call)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say OK' }]
      })
    });
    if (res.ok) {
      const data = await res.json();
      results.anthropic = { status: 'OK', model: 'claude-sonnet-4-6', response: data.content?.[0]?.text || 'ok' };
    } else {
      const errText = await res.text();
      results.anthropic = { status: 'FAIL', httpStatus: res.status, error: errText.slice(0, 300) };
    }
  } catch (e) {
    results.anthropic = { status: 'FAIL', error: e.message };
  }

  // Test Anthropic API with thinking mode (matches preview generation settings)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        temperature: 1,
        thinking: { type: 'adaptive' },
        messages: [{ role: 'user', content: 'Say OK' }]
      })
    });
    if (res.ok) {
      results.anthropic_thinking = { status: 'OK' };
    } else {
      const errText = await res.text();
      results.anthropic_thinking = { status: 'FAIL', httpStatus: res.status, error: errText.slice(0, 300) };
    }
  } catch (e) {
    results.anthropic_thinking = { status: 'FAIL', error: e.message };
  }

  // Test ElevenLabs API (just check voice list, don't generate audio)
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    if (res.ok) {
      const data = await res.json();
      results.elevenlabs = { status: 'OK', voiceCount: data.voices?.length || 0 };
    } else {
      const errText = await res.text();
      results.elevenlabs = { status: 'FAIL', httpStatus: res.status, error: errText.slice(0, 300) };
    }
  } catch (e) {
    results.elevenlabs = { status: 'FAIL', error: e.message };
  }

  // Test Supabase Storage (try to list files in the stories bucket)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket/stories`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (res.ok) {
      const data = await res.json();
      results.supabase_storage = { status: 'OK', bucket: data.name || 'stories', public: data.public };
    } else {
      const errText = await res.text();
      results.supabase_storage = { status: 'FAIL', httpStatus: res.status, error: errText.slice(0, 300) };
    }
  } catch (e) {
    results.supabase_storage = { status: 'FAIL', error: e.message };
  }

  // Test Supabase DB (try to query stories table)
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/stories?select=id&limit=1`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (res.ok) {
      const data = await res.json();
      results.supabase_db = { status: 'OK', hasStories: data.length > 0 };
    } else {
      const errText = await res.text();
      results.supabase_db = { status: 'FAIL', httpStatus: res.status, error: errText.slice(0, 300) };
    }
  } catch (e) {
    results.supabase_db = { status: 'FAIL', error: e.message };
  }

  // Summary
  const allOk = ['stripe', 'anthropic', 'anthropic_thinking', 'elevenlabs', 'supabase_storage', 'supabase_db'].every(k => results[k].status === 'OK');
  results.summary = allOk ? 'ALL SYSTEMS OK' : 'ISSUES DETECTED - check individual services above';

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/health-check' };
