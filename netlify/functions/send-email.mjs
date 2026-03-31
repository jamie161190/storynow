// Transactional email sending via Resend
// Set RESEND_API_KEY in Netlify env vars after creating account at resend.com
import Stripe from 'stripe';

// Prevent XSS: escape user input before inserting into HTML emails
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { type, to, childName, giftFrom, giftMessage, category, length, storyId, sessionId, reviewName, reviewChildName, reviewText, contactName, contactEmail, contactText, discountCode, discountPercent } = body;

    if (!type || !to) {
      return new Response(JSON.stringify({ error: 'Missing type or recipient email' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Rate limit unauthenticated email types (review, contact, share)
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

    // ── Verify the request is legitimate ──────────────────────
    if (type === 'purchase') {
      // Purchase emails require a valid paid Stripe session
      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'Missing payment session' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!session || session.payment_status !== 'paid') {
        return new Response(JSON.stringify({ error: 'Payment not verified' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'gift') {
      // Gift emails can be sent either with a Stripe session (at purchase time)
      // or with an auth token (sending later from account)
      if (sessionId) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (!session || session.payment_status !== 'paid') {
          return new Response(JSON.stringify({ error: 'Payment not verified' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
      } else if (body.token) {
        // Verify auth token for account-based gift sending
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY;
        const tokenRes = await fetch(
          `${supabaseUrl}/rest/v1/auth_tokens?token=eq.${encodeURIComponent(body.token)}&select=email&limit=1`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        const tokens = await tokenRes.json();
        if (!tokens.length) {
          return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'review') {
      // Reviews just need basic content, no auth required
      if (!reviewText || !reviewName) {
        return new Response(JSON.stringify({ error: 'Missing review content' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'contact') {
      // Contact form just needs basic fields
      if (!contactName || !contactEmail || !contactText) {
        return new Response(JSON.stringify({ error: 'Missing contact form fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (type === 'share') {
      // Share emails require a valid story ID that exists in the database
      if (!storyId) {
        return new Response(JSON.stringify({ error: 'Missing story ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY;
      if (supabaseUrl && supabaseKey) {
        const checkRes = await fetch(
          `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id&limit=1`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        const stories = await checkRes.json();
        if (!stories || !stories.length) {
          return new Response(JSON.stringify({ error: 'Story not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }
    // ─────────────────────────────────────────────────────────

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let subject, html;

    if (type === 'purchase') {
      subject = `${esc(childName)}'s story is ready! 🎧`;
      html = purchaseEmail(childName, category, length, to, storyId, discountCode, discountPercent);
    } else if (type === 'gift') {
      subject = `${esc(giftFrom)} made something special for ${esc(childName)} 🎁`;
      html = giftEmail(childName, giftFrom, giftMessage, storyId);
    } else if (type === 'review') {
      subject = `New review from ${esc(reviewName)}`;
      html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2>New Review Submitted</h2><p><strong>From:</strong> ${esc(reviewName)}</p>${reviewChildName ? `<p><strong>Child:</strong> ${esc(reviewChildName)}</p>` : ''}<p><strong>Review:</strong></p><blockquote style="border-left:3px solid #7C3AED;padding-left:12px;color:#333">${esc(reviewText)}</blockquote></div>`;
    } else if (type === 'contact') {
      subject = `Storytold contact from ${esc(contactName)}`;
      html = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px"><h2>Contact Form Message</h2><p><strong>Name:</strong> ${esc(contactName)}</p><p><strong>Email:</strong> ${esc(contactEmail)}</p><p><strong>Message:</strong></p><blockquote style="border-left:3px solid #7C3AED;padding-left:12px;color:#333">${esc(contactText)}</blockquote><p style="color:#666;font-size:13px">Reply directly to ${esc(contactEmail)}</p></div>`;
    } else if (type === 'share') {
      subject = `${esc(giftFrom)} shared ${esc(childName)}'s story with you 🎧`;
      html = shareEmail(childName, giftFrom, giftMessage, storyId);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid email type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Storytold <hello@storytold.ai>',
        to: [to],
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

function purchaseEmail(childName, category, length, customerEmail, storyId, discountCode, discountPercent) {
  const safeChild = esc(childName);
  const safeEmail = esc(customerEmail);
  const lengthLabel = '~15 min';
  const categoryLabel = category === 'learning' ? 'Learning Adventure' : category === 'journey' ? 'Adventure Story' : 'Bedtime Story';
  const listenUrl = storyId ? `https://storytold.ai?listen=${encodeURIComponent(storyId)}` : 'https://storytold.ai';
  const waText = encodeURIComponent(`Listen to ${childName}'s personalised audio story!\n\n${listenUrl}\n\nMade with storytold.ai`);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:24px;text-align:center;margin:0 0 8px;">🎧</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">${safeChild}'s story is ready!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Thank you for creating something truly special. ${safeChild}'s personalised ${categoryLabel.toLowerCase()} (${lengthLabel}) has been created and is ready to enjoy.
      </p>
      ${storyId ? `
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${listenUrl}" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Listen to ${safeChild}'s story</a>
      </div>` : ''}
      <div style="background:#FFF0E5;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 8px;font-size:15px;color:#2D2844;font-weight:700;">Share with the whole family</p>
        <p style="margin:0 0 12px;font-size:13px;color:#666;line-height:1.5;">Grandparents, aunties, uncles. Let everyone hear ${safeChild}'s story. No extra cost.</p>
        <a href="https://wa.me/?text=${waText}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:10px 24px;border-radius:50px;font-size:14px;font-weight:600;">Share on WhatsApp</a>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 16px;">
        You can replay your story any time. Just visit storytold.ai, tap <strong>My Stories</strong>, and log in with this email:
      </p>
      <div style="background:#F8F5FF;border-radius:10px;padding:12px;text-align:center;margin:0 0 20px;">
        <p style="margin:0;font-size:16px;font-weight:700;color:#7C5CFC;">${safeEmail}</p>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">
        We hope ${safeChild} loves every second of it.
      </p>
      ${discountCode ? `
      <div style="background:#E3FAEB;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:15px;color:#2D2844;font-weight:700;">Your next story: ${discountPercent || 25}% off</p>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5;">Because you are part of the Storytold family. Use code <strong style="color:#7C5CFC">${esc(discountCode)}</strong> at checkout.</p>
        <a href="https://storytold.ai" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-size:15px;font-weight:600;">Create another story</a>
      </div>` : `
      <div style="background:#E3FAEB;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 4px;font-size:15px;color:#2D2844;font-weight:700;">Loved it?</p>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.5;">Create another story for a child you love.</p>
        <a href="https://storytold.ai" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-size:15px;font-weight:600;">Create another story</a>
      </div>`}
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
  </div>
</body>
</html>`;
}

function giftEmail(childName, giftFrom, giftMessage, storyId) {
  const safeChild = esc(childName);
  const safeFrom = esc(giftFrom);
  const safeMsg = esc(giftMessage);
  const listenUrl = storyId ? `https://storytold.ai?listen=${encodeURIComponent(storyId)}` : 'https://storytold.ai';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:32px;text-align:center;margin:0 0 8px;">🎁</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">A special gift for ${safeChild}</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        ${safeFrom} has created a personalised audio story just for ${safeChild}. It is a one of a kind story where ${safeChild} is the star of the adventure.
      </p>
      ${giftMessage ? `
      <div style="background:#FFF0E5;border-radius:12px;padding:16px;margin:0 0 20px;border-left:4px solid #FF8C42;">
        <p style="margin:0 0 4px;font-size:13px;color:#999;">A message from ${safeFrom}:</p>
        <p style="margin:0;font-size:15px;color:#2D2844;font-style:italic;line-height:1.5;">"${safeMsg}"</p>
      </div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${listenUrl}" style="display:inline-block;background:#FF8C42;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Listen to ${safeChild}'s story</a>
      </div>
      <p style="color:#999;font-size:13px;text-align:center;line-height:1.5;margin:0;">
        This story was made with love using Storytold, where every child becomes the hero of their own audio adventure.
      </p>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
  </div>
</body>
</html>`;
}

function shareEmail(childName, fromName, message, storyId) {
  const safeChild = esc(childName);
  const safeFrom = esc(fromName);
  const safeMsg = esc(message);
  const listenUrl = storyId ? `https://storytold.ai?listen=${encodeURIComponent(storyId)}` : 'https://storytold.ai';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:32px;text-align:center;margin:0 0 8px;">🎧</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">Listen to ${safeChild}'s story!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        ${safeFrom} shared a personalised audio story made for ${safeChild}. It is a one of a kind story where ${safeChild} is the star of the adventure.
      </p>
      ${message ? `
      <div style="background:#F8F5FF;border-radius:12px;padding:16px;margin:0 0 20px;border-left:4px solid #7C5CFC;">
        <p style="margin:0 0 4px;font-size:13px;color:#999;">Message from ${safeFrom}:</p>
        <p style="margin:0;font-size:15px;color:#2D2844;font-style:italic;line-height:1.5;">"${safeMsg}"</p>
      </div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${listenUrl}" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Listen now</a>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
        Want to create a personalised story for a child in your life?
      </p>
      <div style="text-align:center;">
        <a href="https://storytold.ai" style="color:#7C5CFC;font-size:14px;font-weight:600;text-decoration:none;">Create your own story &rarr;</a>
      </div>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
  </div>
</body>
</html>`;
}

export const config = { path: '/api/send-email' };
