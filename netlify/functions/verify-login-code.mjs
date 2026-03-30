// Verifies a 6-digit login code, issues auth token, and returns stories

import { randomBytes } from 'crypto';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email, code } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    // Check attempt count (max 5 per email per 10 minutes)
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const attemptRes = await fetch(
      `${supabaseUrl}/rest/v1/login_attempts?email=eq.${encodeURIComponent(email)}&attempted_at=gte.${tenMinsAgo}&select=id`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    if (attemptRes.ok) {
      const attempts = await attemptRes.json();
      if (attempts.length >= 5) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Please wait 10 minutes and try again.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '600' } });
      }
    }

    // Record this attempt
    await fetch(`${supabaseUrl}/rest/v1/login_attempts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, attempted_at: new Date().toISOString() })
    });

    // Check the code
    const codeRes = await fetch(
      `${supabaseUrl}/rest/v1/login_codes?email=eq.${encodeURIComponent(email)}&code=eq.${code}&select=*&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const codes = await codeRes.json();

    if (!codes.length) {
      return new Response(JSON.stringify({ error: 'Invalid code. Please try again.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Check expiry
    const record = codes[0];
    if (new Date(record.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Code has expired. Please request a new one.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // Delete the used code (and all codes for this email)
    await fetch(
      `${supabaseUrl}/rest/v1/login_codes?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    // Clear login attempts on success
    await fetch(
      `${supabaseUrl}/rest/v1/login_attempts?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    // Issue an auth token (24-hour expiry)
    const token = randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/auth_tokens`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ email, token, expires_at: tokenExpiry })
    });

    // Fetch their stories
    const storiesRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const stories = await storiesRes.json();

    return new Response(JSON.stringify({
      success: true,
      token,
      stories: stories.map(s => ({
        id: s.id,
        childName: s.child_name,
        category: s.category,
        length: s.length,
        audioUrl: s.audio_url,
        createdAt: s.created_at,
        isGift: s.is_gift,
        giftEmail: s.gift_email,
        giftFrom: s.gift_from,
        giftSent: s.gift_sent
      }))
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Verify code error:', err);
    return new Response(JSON.stringify({ error: 'Verification failed. Please try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/verify-login-code' };
