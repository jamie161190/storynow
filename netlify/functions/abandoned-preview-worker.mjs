// Scheduled function: sends abandoned preview emails to users who generated
// a preview but never purchased. Runs every 30 minutes via netlify.toml.
//
// Catches users BEFORE checkout (they heard the preview but didn't proceed).
// Different from the Stripe webhook abandoned cart email which fires after
// checkout.session.expired.

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseKey || !resendKey) {
    console.log('Missing env vars, skipping abandoned preview worker');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  // Find attempts from 2-48 hours ago with email + job_id
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  let attempts;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/story_attempts?email=not.is.null&job_id=not.is.null&created_at=gte.${fortyEightHoursAgo}&created_at=lte.${twoHoursAgo}&status=eq.preview_generated&select=id,email,child_name,category,job_id,story_data,created_at&limit=20`,
      { headers }
    );
    if (!res.ok) {
      console.error('Failed to query story_attempts:', res.status);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    attempts = await res.json();
  } catch (e) {
    console.error('Query error:', e.message);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (!attempts.length) {
    console.log('No abandoned previews to process');
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0;
  let skipped = 0;

  for (const attempt of attempts) {
    const { email, child_name, category, job_id, story_data } = attempt;
    if (!email || !child_name) { skipped++; continue; }

    try {
      // Check if they already purchased
      const storyCheck = await fetch(
        `${supabaseUrl}/rest/v1/stories?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
        { headers }
      );
      if (storyCheck.ok) {
        const stories = await storyCheck.json();
        if (stories.length > 0) {
          console.log(`Skipping ${email}: already a customer`);
          skipped++;
          continue;
        }
      }

      // Check rate limit: max 1 abandoned preview email per 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const rlKey = `abandoned_preview_${email}`;
      const rlCheck = await fetch(
        `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rlKey)}&created_at=gte.${sevenDaysAgo}&select=id`,
        { headers }
      );
      if (rlCheck.ok) {
        const recent = await rlCheck.json();
        if (recent.length > 0) {
          console.log(`Skipping ${email}: already sent abandoned preview email in last 7 days`);
          skipped++;
          continue;
        }
      }

      // Check if Stripe abandoned cart email was already sent in last 24h (don't double-email)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const cartRlKey = `abandoned_${email}`;
      const cartCheck = await fetch(
        `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(cartRlKey)}&created_at=gte.${oneDayAgo}&select=id`,
        { headers }
      );
      if (cartCheck.ok) {
        const cartRecent = await cartCheck.json();
        if (cartRecent.length > 0) {
          console.log(`Skipping ${email}: Stripe abandoned cart email sent recently`);
          skipped++;
          continue;
        }
      }

      // Record rate limit before sending
      await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: headersJson,
        body: JSON.stringify({ key: rlKey, created_at: new Date().toISOString() })
      });

      // Build personalised details from story_data
      const sd = story_data || {};
      const friendName = sd.friendName || '';
      const themes = sd.themes || [];
      const setting = sd.setting || sd.where || '';

      const html = abandonedPreviewEmail(child_name, category, job_id, friendName, themes, setting);
      const safeChild = esc(child_name);

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Jamie from Hear Their Name <jamie@heartheirname.com>',
          to: [email],
          subject: `${safeChild}'s story is only just beginning...`,
          html
        })
      });

      const emailData = await emailRes.json();
      if (!emailRes.ok) {
        console.error(`Failed to send abandoned preview email to ${email}:`, emailData);
      } else {
        console.log(`Abandoned preview email sent to ${email}`, emailData.id);
        sent++;
      }
    } catch (err) {
      console.error(`Error processing attempt for ${email}:`, err.message);
      skipped++;
    }
  }

  console.log(`Abandoned preview worker done: ${sent} sent, ${skipped} skipped`);
  return new Response(JSON.stringify({ ok: true, sent, skipped }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function abandonedPreviewEmail(childName, category, jobId, friendName, themes, setting) {
  const safe = esc(childName);
  const catLabels = { bedtime: 'bedtime story', journey: 'adventure', learning: 'learning story' };
  const catLabel = catLabels[category] || 'story';
  const returnUrl = `https://heartheirname.com?preview=${encodeURIComponent(jobId)}&utm_source=email&utm_medium=abandoned_preview&utm_campaign=preview_recovery`;

  // Build the "what you created" details
  let details = `A ${esc(catLabel)} for <strong>${safe}</strong>`;
  if (friendName) details += ` with best friend <strong>${esc(friendName)}</strong>`;
  if (themes && themes.length) details += `, featuring ${esc(themes.join(', ').toLowerCase())}`;
  if (setting && setting !== 'Surprise me') details += `, set in ${esc(setting.toLowerCase())}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://heartheirname.com/logo-email.png" alt="Hear Their Name" style="height:56px;width:auto;margin:0;" />
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

      <p style="font-size:32px;text-align:center;margin:0 0 4px;">🎧</p>
      <h2 style="color:#2D2844;font-size:22px;text-align:center;margin:0 0 8px;line-height:1.3;">
        You heard the opening.
      </h2>
      <p style="color:#6B2F93;font-size:16px;text-align:center;margin:0 0 24px;font-weight:700;">
        ${safe}'s full story is waiting.
      </p>

      <p style="color:#666;font-size:15px;line-height:1.7;margin:0 0 16px;">
        You created something special for ${safe} &mdash; a one-of-a-kind ${esc(catLabel)} where ${safe} is the hero. You heard the first minute. The full story is 15 minutes of magic, adventure, and their name woven through every chapter.
      </p>

      <p style="color:#666;font-size:15px;line-height:1.7;margin:0 0 24px;">
        Your preview is still saved. The audio you heard, the story you built &mdash; it is all still there, exactly as you left it.
      </p>

      <div style="text-align:center;margin:0 0 28px;">
        <a href="${returnUrl}" style="display:inline-block;background:#6B2F93;color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:0.3px;">Continue ${safe}'s story</a>
      </div>

      <div style="background:#FFF8F0;border-radius:14px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#F1753B;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">What you created</p>
        <p style="margin:0;font-size:14px;color:#2D2844;line-height:1.6;">
          ${details}.
        </p>
      </div>

      <div style="background:#F8F5FF;border-radius:14px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6B2F93;font-weight:700;">What happens next?</p>
        <table style="width:100%;border-spacing:0 8px;">
          <tr>
            <td style="vertical-align:top;padding:0 8px 0 0;width:24px;font-size:16px;">&#9654;</td>
            <td style="font-size:13px;color:#666;line-height:1.5;">Hit play to hear your preview again</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:0 8px 0 0;width:24px;font-size:16px;">&#128275;</td>
            <td style="font-size:13px;color:#666;line-height:1.5;">Unlock the full 15-minute story</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:0 8px 0 0;width:24px;font-size:16px;">&#127911;</td>
            <td style="font-size:13px;color:#666;line-height:1.5;">Listen together, share with family, download the MP3</td>
          </tr>
        </table>
      </div>

      <p style="color:#999;font-size:13px;text-align:center;line-height:1.6;margin:0;">
        ${safe} deserves to hear their name in a story made just for them.
      </p>

    </div>

    <div style="text-align:center;margin-top:28px;">
      <p style="color:#bbb;font-size:12px;margin:0 0 8px;">Hear Their Name. Audio stories that know them by name.</p>
      <a href="https://heartheirname.com" style="color:#bbb;font-size:11px;text-decoration:underline;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}

export const config = { path: '/api/abandoned-preview-worker' };
