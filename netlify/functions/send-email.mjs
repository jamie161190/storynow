// Transactional email sending via Resend
// Types: review (internal notification), contact (internal notification), share (story shared with someone)

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { type, to, childName, reviewName, reviewChildName, reviewText, contactName, contactEmail, contactText, fromName, message, storyId } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: 'Missing email type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Rate limit unauthenticated email types
    if (type === 'review' || type === 'contact' || type === 'share') {
      const clientIP = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY;
      if (supabaseUrl && supabaseKey) {
        try {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const rlKey = `email_${type}_${clientIP}`;
          const rlCheck = await fetch(
            `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rlKey)}&created_at=gte.${oneHourAgo}&select=id`,
            { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
          );
          if (rlCheck.ok) {
            const recent = await rlCheck.json();
            if (recent.length >= 3) {
              return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
                status: 429, headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: rlKey, created_at: new Date().toISOString() })
          });
        } catch (rlErr) {
          console.error('Rate limit check failed:', rlErr.message);
        }
      }
    }

    // Validate by type
    if (type === 'review') {
      if (!reviewText || !reviewName) {
        return new Response(JSON.stringify({ error: 'Missing review content' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'contact') {
      if (!contactName || !contactEmail || !contactText) {
        return new Response(JSON.stringify({ error: 'Missing contact form fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'share') {
      if (!storyId || !to) {
        return new Response(JSON.stringify({ error: 'Missing story ID or recipient' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid email type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let subject, html, recipient;

    if (type === 'review') {
      recipient = 'jamie@heartheirname.com';
      subject = `New review from ${esc(reviewName)}`;
      html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2>New Review</h2><p><strong>From:</strong> ${esc(reviewName)}</p>${reviewChildName ? `<p><strong>Child:</strong> ${esc(reviewChildName)}</p>` : ''}<p><strong>Review:</strong></p><blockquote style="border-left:3px solid #6B2F93;padding-left:12px;color:#333">${esc(reviewText)}</blockquote></div>`;
    } else if (type === 'contact') {
      recipient = 'jamie@builtsmarter.co.uk';
      subject = `Hear Their Name contact from ${esc(contactName)}`;
      html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2>Contact Form</h2><p><strong>Name:</strong> ${esc(contactName)}</p><p><strong>Email:</strong> ${esc(contactEmail)}</p><p><strong>Message:</strong></p><blockquote style="border-left:3px solid #6B2F93;padding-left:12px;color:#333">${esc(contactText)}</blockquote><p style="color:#666;font-size:13px">Reply directly to ${esc(contactEmail)}</p></div>`;
    } else if (type === 'share') {
      recipient = to;
      const safeChild = esc(childName);
      const safeFrom = esc(fromName);
      const listenUrl = `https://heartheirname.com/story/${encodeURIComponent(storyId)}`;
      subject = `${safeFrom} shared ${safeChild}'s story with you`;
      html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333">
<p style="margin:0 0 16px;line-height:1.75">${safeFrom} wanted you to hear a story we made for ${safeChild}.</p>
<p style="text-align:center;margin:24px 0"><a href="${listenUrl}" style="display:inline-block;background:#6B2F93;color:#fff;text-decoration:none;padding:14px 32px;border-radius:50px;font-size:1rem;font-weight:700">Listen to ${safeChild}'s story</a></p>
${message ? `<p style="margin:0 0 16px;font-style:italic;color:#666;line-height:1.6">"${esc(message)}"</p>` : ''}
<p style="margin:24px 0 2px;font-weight:600">Jamie and Chase</p>
<p style="margin:0;font-size:13px;color:#999">Hear Their Name</p>
</div>`;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Jamie and Chase from Hear Their Name <jamie@heartheirname.com>',
        to: [recipient],
        subject,
        html
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Resend error:', data);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Email error:', err);
    return new Response(JSON.stringify({ error: 'Email sending failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = {
  path: '/api/send-email',
  rateLimit: {
    windowSize: 60,
    windowLimit: 10,
    aggregateBy: ['ip']
  }
};
