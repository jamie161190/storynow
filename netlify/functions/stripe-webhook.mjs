// Stripe webhook handler for:
// 1. Server-side conversion tracking (Meta CAPI + TikTok Events API) on successful purchase
// 2. Abandoned cart recovery emails on expired checkout sessions
import Stripe from 'stripe';
import { createHash } from 'crypto';

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

  // ─── PURCHASE COMPLETED: server-side conversion tracking ───
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    const amountTotal = session.amount_total; // in pence
    const currency = session.currency || 'gbp';
    const sessionId = session.id;
    const metadata = session.metadata || {};

    // Use session ID as event_id for deduplication with client-side pixels
    const eventId = `purchase_${sessionId}`;
    const eventTime = Math.floor(new Date(session.created * 1000).getTime() / 1000);
    const hashedEmail = email ? createHash('sha256').update(email.trim().toLowerCase()).digest('hex') : null;

    // Retrieve UTM params from metadata (passed through from create-checkout)
    const utmSource = metadata.utm_source || '';
    const utmMedium = metadata.utm_medium || '';
    const utmCampaign = metadata.utm_campaign || '';
    const fbclid = metadata.fbclid || '';
    const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : (metadata.fbc || '');
    const fbp = metadata.fbp || '';

    // ── Meta Conversions API ──
    const metaPixelId = process.env.META_PIXEL_ID || '1656775315345896';
    const metaToken = process.env.META_CAPI_TOKEN;

    if (metaToken) {
      try {
        const metaPayload = {
          data: [{
            event_name: 'Purchase',
            event_time: eventTime,
            event_id: eventId,
            event_source_url: 'https://heartheirname.com',
            action_source: 'website',
            user_data: {
              ...(hashedEmail ? { em: [hashedEmail] } : {}),
              ...(fbc ? { fbc } : {}),
              ...(fbp ? { fbp } : {}),
              client_user_agent: metadata.user_agent || ''
            },
            custom_data: {
              currency: currency.toUpperCase(),
              value: (amountTotal / 100).toFixed(2),
              content_name: `Story for ${metadata.childName || 'a child'}`,
              content_type: 'product',
              content_ids: ['storytold_personalised_story']
            }
          }]
        };

        const metaRes = await fetch(
          `https://graph.facebook.com/v18.0/${metaPixelId}/events?access_token=${metaToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metaPayload)
          }
        );
        const metaData = await metaRes.json();
        console.log('Meta CAPI Purchase event sent:', metaData);
      } catch (metaErr) {
        console.error('Meta CAPI error:', metaErr.message);
      }
    } else {
      console.warn('META_CAPI_TOKEN not set, skipping server-side Meta tracking');
    }

    // ── TikTok Events API ──
    const tiktokPixelId = process.env.TIKTOK_PIXEL_ID || 'D74JVVJC77U5P0Q29FKG';
    const tiktokToken = process.env.TIKTOK_EVENTS_TOKEN;

    if (tiktokToken) {
      try {
        const tiktokPayload = {
          pixel_code: tiktokPixelId,
          partner_name: 'Hear Their Name',
          event: 'CompletePayment',
          event_id: eventId,
          timestamp: new Date(session.created * 1000).toISOString(),
          context: {
            user: {
              ...(hashedEmail ? { email: hashedEmail } : {}),
              ...(metadata.user_agent ? { user_agent: metadata.user_agent } : {})
            },
            page: { url: 'https://heartheirname.com' }
          },
          properties: {
            currency: currency.toUpperCase(),
            value: (amountTotal / 100).toFixed(2),
            content_type: 'product',
            contents: [{ content_id: 'storytold_personalised_story', content_name: `Story for ${metadata.childName || 'a child'}`, quantity: 1, price: (amountTotal / 100).toFixed(2) }]
          }
        };

        const ttRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': tiktokToken
          },
          body: JSON.stringify(tiktokPayload)
        });
        const ttData = await ttRes.json();
        console.log('TikTok Events API Purchase sent:', ttData);
      } catch (ttErr) {
        console.error('TikTok Events API error:', ttErr.message);
      }
    } else {
      console.warn('TIKTOK_EVENTS_TOKEN not set, skipping server-side TikTok tracking');
    }

    console.log(`Server-side conversion tracking complete for session ${sessionId}`);

    // ── Donation: save to donations table ──
    if (metadata.type === 'donation' && metadata.story_id) {
      const supabaseUrl2 = process.env.SUPABASE_URL;
      const supabaseKey2 = process.env.SUPABASE_SECRET_KEY;
      if (supabaseUrl2 && supabaseKey2) {
        try {
          await fetch(`${supabaseUrl2}/rest/v1/donations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseKey2}`, 'apikey': supabaseKey2, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              story_id: metadata.story_id,
              email: email || null,
              amount: amountTotal / 100,
              currency: currency,
              message: metadata.message || null,
              display_name: metadata.display_name || null
            })
          });
          console.log(`Donation saved: £${(amountTotal/100).toFixed(2)} for story ${metadata.story_id}`);
        } catch (donErr) {
          console.error('Donation save error:', donErr.message);
        }
      }
    }

    // ── Referral conversion tracking ──
    const refCode = metadata.ref_code;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (refCode && supabaseUrl && supabaseKey) {
      try {
        const refLookup = await fetch(
          `${supabaseUrl}/rest/v1/referrals?ref_code=eq.${encodeURIComponent(refCode)}&select=id,conversions,revenue,referred_emails`,
          { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } }
        );
        if (refLookup.ok) {
          const refs = await refLookup.json();
          if (refs.length > 0) {
            const r = refs[0];
            const updatedEmails = [...(r.referred_emails || [])];
            if (email && !updatedEmails.includes(email)) updatedEmails.push(email);
            await fetch(
              `${supabaseUrl}/rest/v1/referrals?id=eq.${r.id}`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${supabaseKey}`,
                  'apikey': supabaseKey,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  conversions: (r.conversions || 0) + 1,
                  revenue: (r.revenue || 0) + (amountTotal / 100),
                  referred_emails: updatedEmails
                })
              }
            );
            console.log(`Referral conversion recorded for code: ${refCode}`);
          }
        }
      } catch (refErr) {
        console.error('Referral tracking error:', refErr.message);
      }
    }
  }

  // Always return 200 to Stripe so it doesn't retry
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = { path: '/api/stripe-webhook' };
