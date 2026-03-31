// Stripe webhook handler for abandoned cart recovery
// Listens for checkout.session.expired events and sends recovery emails
import Stripe from 'stripe';

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
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return new Response('Webhook not configured', { status: 500 });
  }

  // Verify webhook signature
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Only handle expired checkout sessions (abandoned carts)
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const childName = session.metadata?.childName || '';

    if (!email) {
      console.log('Expired session has no email, skipping');
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Check if this customer already completed a purchase (don't email paying customers)
    // and rate limit: max 1 abandoned cart email per email per 24h
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        // Check if they already have a story (they purchased successfully)
        const storyCheck = await fetch(
          `${supabaseUrl}/rest/v1/stories?customer_email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        if (storyCheck.ok) {
          const stories = await storyCheck.json();
          if (stories.length > 0) {
            console.log(`Skipping abandoned cart email for ${email}: already a customer`);
            return new Response(JSON.stringify({ received: true, skipped: 'existing_customer' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }

        // Rate limit: 1 abandoned cart email per 24 hours per email
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rlKey = `abandoned_${email}`;
        const rlCheck = await fetch(
          `${supabaseUrl}/rest/v1/rate_limits?key=eq.${encodeURIComponent(rlKey)}&created_at=gte.${oneDayAgo}&select=id`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        if (rlCheck.ok) {
          const recent = await rlCheck.json();
          if (recent.length > 0) {
            console.log(`Skipping abandoned cart email for ${email}: already sent in last 24h`);
            return new Response(JSON.stringify({ received: true, skipped: 'rate_limited' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }

        // Record that we're sending this email
        await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: rlKey, created_at: new Date().toISOString() })
        });
      } catch (dbErr) {
        console.error('Database check failed, sending email anyway:', dbErr.message);
      }
    }

    // Send the recovery email
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ received: true, error: 'email_not_configured' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const html = abandonedCartEmail(childName);

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Jamie from Storytold <hello@storytold.ai>',
          to: [email],
          subject: childName
            ? `${esc(childName)}'s story is still waiting for you`
            : `Your story is still waiting for you`,
          html
        })
      });

      const emailData = await emailRes.json();
      if (!emailRes.ok) {
        console.error('Failed to send abandoned cart email:', emailData);
      } else {
        console.log(`Abandoned cart email sent to ${email}`, emailData.id);
      }
    } catch (emailErr) {
      console.error('Abandoned cart email error:', emailErr.message);
    }
  }

  // Always return 200 to Stripe so it doesn't retry
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function abandonedCartEmail(childName) {
  const safeChild = esc(childName);
  const hasChild = !!childName;

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
      <p style="font-size:28px;text-align:center;margin:0 0 8px;">🎧</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 20px;">
        ${hasChild ? `${safeChild}'s story is still waiting` : `Your story is still waiting`}
      </h2>
      <p style="color:#666;font-size:15px;line-height:1.7;margin:0 0 20px;">
        ${hasChild
          ? `You were so close to creating something magical for ${safeChild}. A personalised audio story where ${safeChild} is the hero, narrated with their name woven into every chapter.`
          : `You were so close to creating something magical. A personalised audio story where your child is the hero, narrated with their name woven into every chapter.`
        }
      </p>
      <p style="color:#666;font-size:15px;line-height:1.7;margin:0 0 24px;">
        Life gets busy, I know. But the story you started is ready to be finished whenever you are.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="https://storytold.ai" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Pick up where you left off</a>
      </div>
      <div style="background:#FFF8F0;border-radius:12px;padding:16px;margin:0 0 20px;text-align:center;">
        <p style="margin:0 0 6px;font-size:14px;color:#2D2844;font-weight:700;">Not sure yet?</p>
        <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">
          Every story is truly unique. We use AI to write, narrate, and personalise a complete audio story around your child's name, age, interests, and the people they love. Nothing is recycled. Nothing is generic. It is theirs and theirs alone.
        </p>
      </div>
      <p style="color:#999;font-size:13px;text-align:center;line-height:1.5;margin:0;">
        ${hasChild
          ? `${safeChild} deserves to hear their name in a story made just for them.`
          : `Every child deserves to hear their name in a story made just for them.`
        }
      </p>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
    <p style="text-align:center;margin-top:12px;">
      <a href="https://storytold.ai" style="color:#bbb;font-size:11px;text-decoration:underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}

export const config = { path: '/api/stripe-webhook' };
