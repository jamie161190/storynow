// Scheduled function: sends follow-up email 24 hours after story delivery.
// Runs every 30 minutes. Checks for delivered stories where:
// - delivered_at is 24-48 hours ago
// - followup_sent is false

import { BRAND_FROM } from './lib/constants.mjs';

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    console.log('[FOLLOWUP] Missing env vars, skipping');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  // Find stories delivered 24-48 hours ago that haven't had follow-up sent
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?status=eq.delivered&followup_sent=eq.false&delivered_at=gte.${fortyEightHoursAgo}&delivered_at=lte.${twentyFourHoursAgo}&select=id,email,child_name,story_data&limit=20`,
      { headers }
    );

    if (!res.ok) {
      console.error('[FOLLOWUP] Failed to fetch stories:', await res.text());
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const stories = await res.json();
    if (!stories.length) {
      console.log('[FOLLOWUP] No stories ready for follow-up');
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[FOLLOWUP] Found ${stories.length} stories to follow up`);

    for (const story of stories) {
      const sd = story.story_data || {};
      const requesterName = esc(sd.requesterName || '');
      const childName = esc(story.child_name || '');
      const greeting = requesterName ? `Hi ${requesterName},` : 'Hi,';
      const isMulti = sd.isMultiChild && sd.children && sd.children.length > 1;

      const subject = 'How did it go?';

      const emailHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333">
<p style="margin:0 0 16px;line-height:1.75">${greeting}</p>
<p style="margin:0 0 16px;line-height:1.75">We hope ${isMulti ? 'their' : childName + "'s"} story landed well.</p>
<p style="margin:0 0 16px;line-height:1.75">If it made them smile, or if bedtime felt a little different that night, we'd really love to hear about it.</p>
<p style="text-align:center;margin:24px 0"><a href="https://www.trustpilot.com/review/heartheirname.com" style="display:inline-block;background:#6B2F93;color:#fff;text-decoration:none;padding:12px 28px;border-radius:50px;font-size:0.95rem;font-weight:700">Tell us on Trustpilot</a></p>
<p style="margin:0 0 16px;line-height:1.75">It only takes a minute and it helps other families find their way to us.</p>
<p style="margin:24px 0 2px;line-height:1.75;font-weight:600">Jamie and Chase</p>
<p style="margin:0;font-size:13px;color:#999">Hear Their Name</p>
</div>`;

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: BRAND_FROM,
            to: [story.email],
            subject,
            html: emailHtml
          })
        });

        if (emailRes.ok) {
          // Mark as sent
          await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(story.id)}`, {
            method: 'PATCH', headers: headersJson,
            body: JSON.stringify({ followup_sent: true })
          });
          console.log(`[FOLLOWUP] Sent to ${story.email} for ${story.child_name}`);
        } else {
          const errData = await emailRes.json();
          console.error(`[FOLLOWUP] Email failed for ${story.email}:`, errData);
        }
      } catch (emailErr) {
        console.error(`[FOLLOWUP] Error sending to ${story.email}:`, emailErr.message);
      }
    }

    return new Response(JSON.stringify({ ok: true, count: stories.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[FOLLOWUP] Worker error:', err.message);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { schedule: "*/30 * * * *" };
