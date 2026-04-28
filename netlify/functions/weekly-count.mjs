// GET /api/weekly-count
// Returns this week's request count + cap, for the scarcity badge on the homepage.

export default async (req) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey) return json({ count: 0, cap: 10 });

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const today = new Date();
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  monday.setUTCHours(0,0,0,0);
  const weekStart = monday.toISOString().slice(0,10);

  // Count v2 stories created since monday
  const since = monday.toISOString();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/stories?version=eq.2&created_at=gte.${encodeURIComponent(since)}&select=id`,
    { headers: { ...headers, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' } }
  );
  const range = res.headers.get('content-range') || '*/0';
  const count = parseInt(range.split('/')[1] || '0', 10) || 0;

  // Look up cap from weekly_requests table (default 10)
  let cap = 10;
  try {
    const wkRes = await fetch(`${supabaseUrl}/rest/v1/weekly_requests?week_start=eq.${weekStart}&select=cap`, { headers });
    const wk = await wkRes.json();
    if (wk?.[0]?.cap) cap = wk[0].cap;
  } catch {}

  return json({ count, cap, weekStart });
};

function json(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } }); }
