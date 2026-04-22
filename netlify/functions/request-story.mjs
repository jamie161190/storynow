// ============================================================
// REQUEST FREE STORY
// Saves a free story request to the stories table with status 'pending'.
// Sends confirmation email via Resend.
// No payment required. Admin processes it from the queue.
// ============================================================

import { BRAND_FROM } from './lib/constants.mjs';

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { storyData, voiceId, email } = await req.json();

    if (!storyData || !storyData.childName || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Storage not configured' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }

    const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' };

    // Check for duplicate request from same email + child name
    const dupeCheck = await fetch(
      `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&child_name=eq.${encodeURIComponent(storyData.childName)}&status=in.(pending,generating,ready)&select=id&limit=1`,
      { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
    );
    if (dupeCheck.ok) {
      const dupes = await dupeCheck.json();
      if (dupes.length > 0) {
        return new Response(JSON.stringify({ success: true, orderId: dupes[0].id, status: 'already_requested' }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const orderData = {
      email,
      child_name: storyData.childName || '',
      category: storyData.category || '',
      length: storyData.length || 'long',
      story_text: null,
      voice_id: voiceId || null,
      audio_url: null,
      stripe_session_id: null,
      story_data: storyData,
      status: 'pending',
      feedback: null,
      gift_delivery_preference: null
    };

    const insertRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(orderData)
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('Failed to create story request:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create request' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const inserted = await insertRes.json();
    const orderId = inserted[0]?.id || null;
    console.log('Free story requested:', orderId, 'for', email, '- child:', storyData.childName);

    // Send confirmation email via Resend (fire-and-forget)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const childName = esc(storyData.childName);
      const requesterName = esc(storyData.requesterName || '');
      const greeting = requesterName ? `Hi ${requesterName},` : 'Hi,';
      const catLabel = { bedtime: 'Bedtime', journey: 'Adventure', learning: 'Learning' }[storyData.category] || storyData.category;
      const voiceNames = { 'N2lVS1w4EtoT3dr4eOWO': 'Callum', 'oWAxZDx7w5VEj9dCyTzz': 'Grace', 'onwK4e9ZLuTAKqWW03F9': 'Daniel', 'ThT5KcBeYPX3keUQqHPh': 'Dorothy', 'g5CIjZEefAph4nQFvHAz': 'Ethan', 'ZQe5CZNOzWyzPSCn5a3c': 'James', 'cjVigY5qzO86Huf0OWal': 'Eric' };
      const narratorName = voiceNames[voiceId] || 'Callum';

      const refShort = (orderId || '').replace(/-/g, '').slice(0, 6) || 'pending';
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>We're creating ${childName}'s story</title></head>
<body style="margin:0;padding:0;background:#F7F1E6;-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:0 auto;background:#F7F1E6;padding:40px 24px;font-family:'Newsreader',Georgia,serif;color:#1A1426">
  <p style="margin:0 0 14px;font-size:15.5px;line-height:1.65">${greeting}</p>
  <p style="margin:0 0 14px;font-size:15.5px;line-height:1.65">Thank you for requesting a story for ${childName}.</p>
  <p style="margin:0 0 14px;font-size:15.5px;line-height:1.65">We'll put it together carefully using everything you shared, and send it to you once it's ready. That's usually within a few days.</p>
  <p style="margin:0 0 20px;font-size:15.5px;line-height:1.65">If anything changes or you'd like to add something, just reply to this email.</p>
  <p style="margin:0 0 4px;font-size:15.5px;line-height:1.65;font-style:italic;color:#3D2A5C">Jamie and Chase</p>

  <!-- Receipt card -->
  <div style="margin-top:30px;padding:18px;background:#F0E8D7;border-radius:14px;font-family:'Helvetica Neue',Arial,sans-serif">
    <p style="margin:0 0 10px;font-family:'Courier New',monospace;font-size:11px;color:rgba(26,20,38,0.58);letter-spacing:0.06em;text-transform:uppercase">your request</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;line-height:1.5">
      <tr><td style="color:rgba(26,20,38,0.58);padding:3px 14px 3px 0;width:74px">For</td><td style="color:#1A1426">${childName}</td></tr>
      <tr><td style="color:rgba(26,20,38,0.58);padding:3px 14px 3px 0">Kind</td><td style="color:#1A1426">${esc(catLabel)}</td></tr>
      <tr><td style="color:rgba(26,20,38,0.58);padding:3px 14px 3px 0">Narrator</td><td style="color:#1A1426">${esc(narratorName)}</td></tr>
      <tr><td style="color:rgba(26,20,38,0.58);padding:3px 14px 3px 0">Ref</td><td style="color:#1A1426;font-family:'Courier New',monospace;font-size:11.5px">htn_${refShort}</td></tr>
    </table>
  </div>

  <p style="margin:30px 0 0;padding-top:16px;border-top:1px solid rgba(26,20,38,0.14);font-family:'Courier New',monospace;font-size:11px;color:rgba(26,20,38,0.58);text-align:center">
    Hear Their Name &middot; jamie@heartheirname.com
  </p>
</div>
</body></html>`;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: BRAND_FROM,
            to: [email],
            subject: `We're creating ${storyData.childName}'s story`,
            html: emailHtml
          })
        });
        console.log('Confirmation email sent to', email);
      } catch (emailErr) {
        console.error('Confirmation email failed:', emailErr.message);
      }
    }

    // Auto-enqueue a text-generation job via the admin queue. The queue worker
    // processes text jobs one at a time (respects Claude rate limit). The worker
    // triggers story-text-background which runs the middle layer + writer.
    if (orderId) {
      try {
        const sbHeadersJson = {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        };
        const sbHeaders = {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        };

        // Insert queue row
        await fetch(`${supabaseUrl}/rest/v1/job_queue`, {
          method: 'POST',
          headers: sbHeadersJson,
          body: JSON.stringify({ story_id: orderId, job_type: 'text', payload: null })
        });

        // Check if a worker is already running; spawn one if not.
        const checkRes = await fetch(`${supabaseUrl}/rest/v1/rpc/worker_running`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({ p_job_type: 'text' })
        });
        const running = checkRes.ok ? await checkRes.json() : false;
        if (running !== true) {
          const base = process.env.URL || 'https://heartheirname.com';
          await fetch(`${base}/.netlify/functions/queue-worker-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobType: 'text' })
          });
        }
      } catch (queueErr) {
        // Non-fatal: the story is saved, admin can manually kick generation later.
        console.error('Auto-enqueue failed (non-fatal):', queueErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true, orderId, status: 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Request story error:', err.message);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/request-story' };
