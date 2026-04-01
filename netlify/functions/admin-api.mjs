// Admin API: Protected endpoints for managing customers, stories, and attempts.
// All requests require the ADMIN_SECRET header to match process.env.ADMIN_SECRET.

export default async (req) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return json({ error: 'Admin not configured' }, 500);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  // Brute-force protection: max 5 failed auth attempts per IP per hour
  const clientIP = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const authHeader = req.headers.get('x-admin-secret');

  if (authHeader !== adminSecret) {
    // Record failed attempt
    if (supabaseUrl && supabaseKey) {
      try {
        // Check if IP is locked out
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const rlCheck = await fetch(
          `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent('admin_fail_' + clientIP)}&created_at=gte.${oneHourAgo}&select=id`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        if (rlCheck.ok) {
          const failures = await rlCheck.json();
          if (failures.length >= 5) {
            return json({ error: 'Too many failed attempts. Locked for 1 hour.' }, 429);
          }
        }
        // Log this failed attempt
        await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'admin_fail_' + clientIP, created_at: new Date().toISOString() })
        });
      } catch (e) { /* best effort */ }
    }
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'Database not configured' }, 500);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  try {
    // ── LIST CUSTOMERS: all unique emails with story count ──
    if (action === 'customers') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/stories?select=email,child_name,category,created_at,audio_url,id&order=created_at.desc`,
        { headers: sbHeaders(supabaseKey) }
      );
      const stories = await res.json();

      // Group by email
      const customers = {};
      for (const s of stories) {
        if (!customers[s.email]) {
          customers[s.email] = { email: s.email, stories: [], storyCount: 0 };
        }
        customers[s.email].stories.push(s);
        customers[s.email].storyCount++;
      }

      return json({ customers: Object.values(customers) });
    }

    // ── LIST ATTEMPTS: recent story generation attempts ──
    if (action === 'attempts') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/story_attempts?select=*&order=created_at.desc&limit=100`,
        { headers: sbHeaders(supabaseKey) }
      );
      const attempts = await res.json();
      return json({ attempts });
    }

    // ── GET CUSTOMER: full detail for one email ──
    if (action === 'customer') {
      const email = url.searchParams.get('email');
      if (!email) return json({ error: 'Email required' }, 400);

      const [storiesRes, attemptsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/stories?email=eq.${enc(email)}&order=created_at.desc`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/story_attempts?story_data->>childName=ilike.*${enc(email)}*&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        )
      ]);

      const stories = await storiesRes.json();
      const attempts = await attemptsRes.json();

      return json({ email, stories, attempts });
    }

    // ── SEARCH: find customers or attempts by email or child name ──
    if (action === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return json({ error: 'Search query required' }, 400);

      const [storiesRes, attemptsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/stories?or=(email.ilike.*${enc(q)}*,child_name.ilike.*${enc(q)}*)&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/story_attempts?or=(child_name.ilike.*${enc(q)}*,story_data->>childName.ilike.*${enc(q)}*)&order=created_at.desc&limit=50`,
          { headers: sbHeaders(supabaseKey) }
        )
      ]);

      const stories = await storiesRes.json();
      const attempts = await attemptsRes.json();

      return json({ stories: Array.isArray(stories) ? stories : [], attempts: Array.isArray(attempts) ? attempts : [] });
    }

    // ── ADMIN GENERATE: generate a story and add to customer account ──
    if (action === 'generate' && req.method === 'POST') {
      const body = await req.json();
      const { email, storyData, voiceId, previewStory } = body;

      if (!email || !storyData) {
        return json({ error: 'Email and storyData required' }, 400);
      }

      // Trigger the background worker
      const jobId = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

      // We call the background worker directly via internal URL
      const bgPayload = JSON.stringify({
        storyData,
        previewStory: previewStory || '',
        voiceId: voiceId || 'EXAVITQu4vr4xnSDxMaL',
        childName: storyData.childName,
        sessionId: 'admin_' + Date.now(),
        jobId,
        fromScratch: !previewStory,
        customerEmail: email
      });

      try {
        await fetch(new URL('/.netlify/functions/full-worker-background', req.url).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bgPayload
        });
      } catch (e) {
        // Background functions return 202 or may error on local, that's fine
      }

      return json({ success: true, jobId, message: 'Story generation started. It will be emailed to ' + email + ' when complete.' });
    }

    // ── DELETE STORY ──
    if (action === 'delete-story' && req.method === 'POST') {
      const { storyId } = await req.json();
      if (!storyId) return json({ error: 'Story ID required' }, 400);

      await fetch(
        `${supabaseUrl}/rest/v1/stories?id=eq.${enc(storyId)}`,
        {
          method: 'DELETE',
          headers: sbHeaders(supabaseKey)
        }
      );

      return json({ success: true });
    }

    // ── UPDATE STORY (e.g. change audio URL) ──
    if (action === 'update-story' && req.method === 'POST') {
      const { storyId, updates } = await req.json();
      if (!storyId || !updates) return json({ error: 'Story ID and updates required' }, 400);

      // Only allow safe fields to be updated
      const allowed = ['audio_url', 'child_name', 'category', 'email'];
      const safeUpdates = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      await fetch(
        `${supabaseUrl}/rest/v1/stories?id=eq.${enc(storyId)}`,
        {
          method: 'PATCH',
          headers: { ...sbHeaders(supabaseKey), 'Content-Type': 'application/json' },
          body: JSON.stringify(safeUpdates)
        }
      );

      return json({ success: true });
    }

    // ── ERROR LOGS ──
    if (action === 'errors') {
      const since = url.searchParams.get('since') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/error_logs?created_at=gte.${enc(since)}&order=created_at.desc&limit=100`,
        { headers: sbHeaders(supabaseKey) }
      );
      const errors = await res.json();
      return json({ errors: Array.isArray(errors) ? errors : [] });
    }

    // ── ERROR COUNT (for badge) ──
    if (action === 'error-count') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/error_logs?created_at=gte.${enc(since)}&select=id`,
        { headers: { ...sbHeaders(supabaseKey), 'Prefer': 'count=exact' } }
      );
      const count = parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
      return json({ count });
    }

    // ── RETRY QUEUE STATUS ──
    if (action === 'retry-queue') {
      const listRes = await fetch(`${supabaseUrl}/storage/v1/object/list/stories`, {
        method: 'POST',
        headers: { ...sbHeaders(supabaseKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'retry-queue/', limit: 50 })
      });
      const items = await listRes.json();
      const queue = [];

      for (const item of (items || [])) {
        if (item.name === '.emptyFolderPlaceholder') continue;
        try {
          const getRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/retry-queue/${item.name}`, {
            headers: sbHeaders(supabaseKey)
          });
          const data = await getRes.json();
          queue.push(data);
        } catch (e) { /* skip */ }
      }

      return json({ queue });
    }

    // ── LIVE VISITORS: real-time page view activity ──
    if (action === 'live') {
      const minutes = parseInt(url.searchParams.get('minutes') || '5');
      const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

      const viewsRes = await fetch(
        `${supabaseUrl}/rest/v1/page_views?created_at=gte.${enc(since)}&select=screen_name,device,referrer,utm_source,created_at&order=created_at.desc&limit=500`,
        { headers: sbHeaders(supabaseKey) }
      ).catch(() => ({ ok: false }));

      let views = [];
      if (viewsRes.ok) {
        const vData = await viewsRes.json().catch(() => []);
        views = Array.isArray(vData) ? vData : [];
      }

      // Group by screen, showing count at each stage
      const screenCounts = {};
      const deviceCounts = {};
      const recentEvents = [];
      const seenMinutes = new Set();

      for (const v of views) {
        const sn = v.screen_name || 'unknown';
        screenCounts[sn] = (screenCounts[sn] || 0) + 1;
        deviceCounts[v.device || 'unknown'] = (deviceCounts[v.device || 'unknown'] || 0) + 1;
        // Track unique minutes as proxy for unique visitors
        const min = v.created_at?.slice(0, 16);
        if (min) seenMinutes.add(min + '_' + (v.device || ''));
      }

      // Get the 20 most recent events for the live feed
      for (const v of views.slice(0, 20)) {
        const ago = Math.round((Date.now() - new Date(v.created_at).getTime()) / 1000);
        recentEvents.push({
          screen: v.screen_name || 'unknown',
          device: v.device || 'unknown',
          source: v.utm_source || (v.referrer ? 'referral' : 'direct'),
          secondsAgo: ago
        });
      }

      return json({
        totalHits: views.length,
        screens: screenCounts,
        devices: deviceCounts,
        recentEvents,
        window: minutes
      });
    }

    // ── METRICS DASHBOARD: aggregated sales, visitors, conversions ──
    if (action === 'metrics') {
      const days = parseInt(url.searchParams.get('days') || '30');
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Fetch stories (sales), attempts (funnels), and page views in parallel
      const [storiesRes, attemptsRes, viewsRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/stories?created_at=gte.${enc(since)}&select=id,email,child_name,category,created_at&order=created_at.desc`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/story_attempts?created_at=gte.${enc(since)}&select=id,child_name,category,status,created_at&order=created_at.desc`,
          { headers: sbHeaders(supabaseKey) }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/page_views?created_at=gte.${enc(since)}&select=page,referrer,utm_source,utm_medium,utm_campaign,device,screen_name,created_at&order=created_at.desc`,
          { headers: sbHeaders(supabaseKey) }
        ).catch(() => ({ ok: false }))
      ]);

      const storiesData = await storiesRes.json().catch(() => []);
      const stories = Array.isArray(storiesData) ? storiesData : [];
      const attemptsData = await attemptsRes.json().catch(() => []);
      const attempts = Array.isArray(attemptsData) ? attemptsData : [];
      let views = [];
      if (viewsRes.ok) {
        const vData = await viewsRes.json().catch(() => []);
        views = Array.isArray(vData) ? vData : [];
      }

      // Aggregate by day
      const dailyMap = {};
      const now = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap[key] = { date: key, sales: 0, revenue: 0, visitors: 0, previews: 0, checkouts: 0 };
      }

      for (const s of stories) {
        const key = s.created_at?.slice(0, 10);
        if (dailyMap[key]) {
          dailyMap[key].sales++;
          dailyMap[key].revenue += 19.99;
        }
      }

      for (const a of attempts) {
        const key = a.created_at?.slice(0, 10);
        if (dailyMap[key]) {
          dailyMap[key].previews++;
        }
      }

      for (const v of views) {
        const key = v.created_at?.slice(0, 10);
        if (dailyMap[key]) {
          dailyMap[key].visitors++;
        }
      }

      const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // Category breakdown
      const catCount = {};
      for (const s of stories) {
        catCount[s.category || 'unknown'] = (catCount[s.category || 'unknown'] || 0) + 1;
      }

      // Top referrers
      const refCount = {};
      for (const v of views) {
        if (v.referrer) {
          try {
            const host = new URL(v.referrer).hostname.replace('www.', '');
            refCount[host] = (refCount[host] || 0) + 1;
          } catch { /* skip invalid */ }
        }
      }
      const topReferrers = Object.entries(refCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([source, count]) => ({ source, count }));

      // UTM breakdown
      const utmCount = {};
      for (const v of views) {
        if (v.utm_source) {
          const key = [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(' / ');
          utmCount[key] = (utmCount[key] || 0) + 1;
        }
      }
      const topUtm = Object.entries(utmCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([campaign, count]) => ({ campaign, count }));

      // Device breakdown
      const deviceCount = {};
      for (const v of views) {
        deviceCount[v.device || 'unknown'] = (deviceCount[v.device || 'unknown'] || 0) + 1;
      }

      // Funnel screen breakdown
      const screenCount = {};
      for (const v of views) {
        if (v.screen_name) {
          screenCount[v.screen_name] = (screenCount[v.screen_name] || 0) + 1;
        }
      }

      // Unique customers
      const uniqueEmails = new Set(stories.map(s => s.email).filter(Boolean));

      // Totals
      const totalSales = stories.length;
      const totalRevenue = stories.length * 19.99;
      const totalVisitors = views.length;
      const totalPreviews = attempts.length;
      const conversionRate = totalPreviews > 0 ? ((totalSales / totalPreviews) * 100).toFixed(1) : '0.0';
      const visitorToPreview = totalVisitors > 0 ? ((totalPreviews / totalVisitors) * 100).toFixed(1) : '0.0';

      return json({
        period: { days, since },
        totals: {
          sales: totalSales,
          revenue: Math.round(totalRevenue * 100) / 100,
          visitors: totalVisitors,
          previews: totalPreviews,
          uniqueCustomers: uniqueEmails.size,
          conversionRate: parseFloat(conversionRate),
          visitorToPreview: parseFloat(visitorToPreview)
        },
        daily,
        categories: catCount,
        topReferrers,
        topUtm,
        devices: deviceCount,
        funnel: screenCount
      });
    }

    // ── REFERRALS: list all referral links ──
    if (action === 'referrals') {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/referrals?select=*&order=created_at.desc`,
        { headers: sbHeaders(supabaseKey) }
      );
      const referrals = res.ok ? await res.json() : [];
      return json({ referrals: Array.isArray(referrals) ? referrals : [] });
    }

    // ── CREATE REFERRAL: generate a new referral link ──
    if (action === 'create-referral') {
      const body = await req.json().catch(() => ({}));
      const name = (body.name || '').trim();
      const email = (body.email || '').trim();
      if (!name) return json({ error: 'Name is required' }, 400);

      // Generate a clean ref code from the name
      let refCode = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
      if (!refCode) refCode = 'ref' + Date.now();

      // Check for duplicates and add suffix if needed
      const existing = await fetch(
        `${supabaseUrl}/rest/v1/referrals?ref_code=eq.${enc(refCode)}&select=id`,
        { headers: sbHeaders(supabaseKey) }
      );
      if (existing.ok) {
        const rows = await existing.json();
        if (rows.length > 0) {
          refCode = refCode + Math.floor(Math.random() * 999);
        }
      }

      const insertRes = await fetch(`${supabaseUrl}/rest/v1/referrals`, {
        method: 'POST',
        headers: {
          ...sbHeaders(supabaseKey),
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          referrer_name: name,
          referrer_email: email || null,
          ref_code: refCode,
          visits: 0,
          conversions: 0,
          revenue: 0,
          referred_emails: []
        })
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        return json({ error: 'Failed to create referral: ' + errText }, 500);
      }

      const created = await insertRes.json();
      return json({ success: true, referral: created[0] || { ref_code: refCode } });
    }

    // ── DELETE REFERRAL ──
    if (action === 'delete-referral') {
      const refId = url.searchParams.get('id');
      if (!refId) return json({ error: 'ID required' }, 400);
      await fetch(
        `${supabaseUrl}/rest/v1/referrals?id=eq.${enc(refId)}`,
        { method: 'DELETE', headers: sbHeaders(supabaseKey) }
      );
      return json({ success: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);

  } catch (err) {
    console.error('Admin API error:', err.message);
    return json({ error: err.message }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function sbHeaders(key) {
  return { 'Authorization': `Bearer ${key}`, 'apikey': key };
}

function enc(str) {
  return encodeURIComponent(str);
}

export const config = {
  path: '/api/admin',
  rateLimit: {
    windowSize: 60,
    windowLimit: 30,
    aggregateBy: ['ip']
  }
};
