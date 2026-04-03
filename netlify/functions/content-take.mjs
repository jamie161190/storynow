const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const headers = {
  'Authorization': `Bearer ${supabaseKey}`,
  'apikey': supabaseKey,
  'Content-Type': 'application/json'
};

function cors(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors({});

  if (req.method === 'POST') {
    try {
      const { creatorId, creatorName, pieceNumber, pieceTitle } = await req.json();
      if (!creatorId || !pieceNumber) return cors({ error: 'Missing fields' }, 400);

      // Upsert (if already taken, just return it)
      const res = await fetch(`${supabaseUrl}/rest/v1/content_takes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          creator_id: creatorId,
          creator_name: creatorName || 'Unknown',
          piece_number: pieceNumber,
          piece_title: pieceTitle || ''
        })
      });

      if (res.status === 409) {
        // Already taken by this creator
        return cors({ success: true, alreadyTaken: true });
      }

      const take = await res.json();
      return cors({ success: true, take: Array.isArray(take) ? take[0] : take });
    } catch (e) {
      console.error('content-take POST error:', e);
      return cors({ error: 'Server error' }, 500);
    }
  }

  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const creatorId = url.searchParams.get('creator_id');

      if (creatorId) {
        // Get specific creator's takes
        const res = await fetch(
          `${supabaseUrl}/rest/v1/content_takes?creator_id=eq.${encodeURIComponent(creatorId)}&select=piece_number,piece_title,taken_at&order=piece_number`,
          { headers }
        );
        const takes = await res.json();
        return cors({ success: true, takes });
      }

      // Get all takes with counts
      const res = await fetch(
        `${supabaseUrl}/rest/v1/content_takes?select=piece_number,piece_title,creator_name,taken_at&order=piece_number`,
        { headers }
      );
      const allTakes = await res.json();

      // Build counts per piece
      const counts = {};
      (allTakes || []).forEach(t => {
        if (!counts[t.piece_number]) counts[t.piece_number] = { count: 0, creators: [] };
        counts[t.piece_number].count++;
        counts[t.piece_number].creators.push({ name: t.creator_name, taken_at: t.taken_at });
      });

      return cors({ success: true, takes: allTakes, counts });
    } catch (e) {
      console.error('content-take GET error:', e);
      return cors({ error: 'Server error' }, 500);
    }
  }

  return cors({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/content-take' };
