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

      const storyPronoun = isMulti ? 'their' : `${childName}'s`;
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>How did it go?</title></head>
<body style="margin:0;padding:0;background:#F7F1E6;-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:0 auto;background:#F7F1E6;padding:40px 24px;font-family:'Newsreader',Georgia,serif;color:#1A1426">
  <p style="margin:0 0 14px;font-size:15.5px;line-height:1.65">${greeting}</p>
  <p style="margin:0 0 14px;font-size:15.5px;line-height:1.65">We hope ${storyPronoun} story landed well.</p>
  <p style="margin:0 0 22px;font-size:15.5px;line-height:1.65">If it made them smile, or if bedtime felt a little different that night, we'd really love to hear about it.</p>

  <!-- CTA card -->
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 22px">
    <tr><td>
      <a href="https://www.trustpilot.com/review/heartheirname.com" style="display:block;padding:18px 20px;background:#F0E8D7;border:1px solid rgba(26,20,38,0.14);border-radius:16px;text-decoration:none;color:#1A1426;font-family:'Helvetica Neue',Arial,sans-serif">
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>
          <td style="vertical-align:middle">
            <div style="font-size:14px;font-weight:500;color:#1A1426">Tell us on Trustpilot</div>
            <div style="font-size:12px;color:rgba(26,20,38,0.58);margin-top:3px">Takes about a minute.</div>
          </td>
          <td align="right" style="vertical-align:middle;font-size:16px;color:#1A1426">
            <span style="color:#E8A34A">★★★★★</span>&nbsp;→
          </td>
        </tr></table>
      </a>
    </td></tr>
  </table>

  <p style="margin:0 0 14px;font-size:14px;color:rgba(26,20,38,0.58);line-height:1.6">It helps other families find their way to us.</p>
  <p style="margin:0;font-size:15.5px;line-height:1.65;font-style:italic;color:#3D2A5C">Jamie and Chase</p>

  <p style="margin:30px 0 0;padding-top:16px;border-top:1px solid rgba(26,20,38,0.14);font-family:'Courier New',monospace;font-size:11px;color:rgba(26,20,38,0.58);text-align:center">
    Hear Their Name &middot; jamie@heartheirname.com
  </p>
</div>
</body></html>`;

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: BRAND_FROM,
            to: [story.email],
            reply_to: 'jamie@heartheirname.com',
            subject,
            html: emailHtml,
            text: `${requesterName ? 'Hi ' + requesterName + ',' : 'Hi,'}\n\nWe hope ${storyPronoun} story landed well. If it made them smile, or if bedtime felt a little different that night, we'd really love to hear about it.\n\nTell us on Trustpilot: https://www.trustpilot.com/review/heartheirname.com\n\nIt helps other families find their way to us.\n\nJamie and Chase\nHear Their Name\njamie@heartheirname.com\n\nTo unsubscribe: reply with "unsubscribe" in the subject.`,
            headers: {
              'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
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
