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

      const emailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333">
<p style="margin:0 0 16px;line-height:1.75">${greeting}</p>
<p style="margin:0 0 16px;line-height:1.75">Thank you for requesting a story for ${childName}.</p>
<p style="margin:0 0 16px;line-height:1.75">We'll put it together carefully using everything you shared, and send it to you once it's ready. That's usually within a few days.</p>
<p style="margin:0 0 16px;line-height:1.75">If anything changes or you'd like to add something, just reply to this email.</p>
<p style="margin:24px 0 2px;line-height:1.75;font-weight:600">Jamie and Chase</p>
<p style="margin:0 0 20px;font-size:13px;color:#999">Hear Their Name</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:#aaa">Story for ${childName} &middot; ${esc(catLabel)} &middot; Narrated by ${esc(narratorName)}</p>
</div>`;

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

    // Auto-generate story text via background function
    if (orderId) {
      try {
        await fetch('https://heartheirname.com/.netlify/functions/story-text-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: orderId })
        });
      } catch(e) {
        console.error('Auto-generate trigger failed:', e.message);
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
