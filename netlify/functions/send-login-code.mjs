// Sends a 6-digit login code to the user's email

import { randomInt } from 'crypto';
import { BRAND_FROM } from './lib/constants.mjs';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      console.error('Missing env vars:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey, resendKey: !!resendKey });
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable. Please try again shortly.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    // Check if this email has any stories
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    const stories = await checkRes.json();
    if (!stories.length) {
      // Return success even if no stories exist to prevent email enumeration
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Rate limit: max 3 code requests per email per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rlCheck = await fetch(
      `${supabaseUrl}/rest/v1/login_codes?email=eq.${encodeURIComponent(email)}&created_at=gte.${oneHourAgo}&select=id`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );
    if (rlCheck.ok) {
      const recentCodes = await rlCheck.json();
      if (recentCodes.length >= 3) {
        return new Response(JSON.stringify({ error: 'Too many code requests. Please wait and try again.' }), {
          status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }
        });
      }
    }

    // Generate a 6-digit code
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store the code in a login_codes table
    await fetch(`${supabaseUrl}/rest/v1/login_codes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ email, code, expires_at: expiresAt })
    });

    // Send the code via email
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: BRAND_FROM,
        to: [email],
        subject: 'Your Hear Their Name login code',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://heartheirname.com/images/logo-email.png" alt="Hear Their Name" style="height:60px;width:auto;margin:0;" />
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center;">
      <p style="font-size:16px;color:#2D2844;margin:0 0 8px;">Your login code</p>
      <div style="background:#F8F5FF;border-radius:12px;padding:20px;margin:16px 0;">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#6B2F93;">${code}</span>
      </div>
      <p style="color:#999;font-size:14px;margin:0;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Login code error:', err);
    return new Response(JSON.stringify({ error: 'Login service temporarily unavailable. Please try again.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = {
  path: '/api/send-login-code',
  rateLimit: {
    windowSize: 60,
    windowLimit: 5,
    aggregateBy: ['ip']
  }
};
