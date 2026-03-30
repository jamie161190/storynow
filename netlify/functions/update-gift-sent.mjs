// Marks a gift story as sent and updates the recipient email

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { storyId, giftEmail, token } = await req.json();

    if (!storyId || !token) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validate storyId format
    if (!/^\d+$/.test(String(storyId)) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(storyId))) {
      return new Response(JSON.stringify({ error: 'Invalid story ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    // Validate the auth token (must be a logged-in user)
    const tokenRes = await fetch(
      `${supabaseUrl}/rest/v1/auth_tokens?token=eq.${encodeURIComponent(token)}&select=email&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const tokens = await tokenRes.json();
    if (!tokens.length) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const ownerEmail = tokens[0].email;

    // Update the story: set gift_sent = true, gift_email if provided
    // Only allow updating stories owned by this user
    const updateData = { gift_sent: true };
    if (giftEmail) updateData.gift_email = giftEmail;

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&email=eq.${encodeURIComponent(ownerEmail)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updateData)
      }
    );

    if (!updateRes.ok) {
      console.error('Update gift sent error:', await updateRes.text());
      return new Response(JSON.stringify({ error: 'Failed to update' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Update gift sent error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/update-gift-sent' };
