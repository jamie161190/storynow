import Stripe from 'stripe';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const storyData = body.storyData || {};
    const childName = storyData.childName || body.childName || 'a special child';
    const customerEmail = body.customerEmail || null;
    const previewStoryText = body.previewStoryText || body.fullStoryText || '';
    const selectedVoiceId = body.selectedVoiceId || '';
    // UTM and tracking params forwarded from the frontend
    const utmSource = body.utm_source || '';
    const utmMedium = body.utm_medium || '';
    const utmCampaign = body.utm_campaign || '';
    const fbclid = body.fbclid || '';
    const fbc = body.fbc || '';
    const fbp = body.fbp || '';
    const userAgent = body.user_agent || '';
    const refCode = body.ref_code || '';

    // Accept localised currency/amount from frontend (set by get-pricing)
    // Validate to prevent manipulation: only allow supported currencies and sane amounts
    const SUPPORTED_CURRENCIES = new Set(['gbp','eur','usd','cad','aud','nzd','sgd','hkd','jpy','inr','zar','nok','sek','dkk','chf','brl','mxn','pln','aed','sar','ils','myr','php','thb','krw']);
    const requestedCurrency = (body.currency || 'gbp').toLowerCase();
    const requestedAmount = parseInt(body.unitAmount, 10) || 1999;
    const currency = SUPPORTED_CURRENCIES.has(requestedCurrency) ? requestedCurrency : 'gbp';
    // Sanity check: amount must be between £5 and £200 equivalent (in minor units)
    const MIN_AMOUNT = 500;
    const MAX_AMOUNT = 200 * 200; // generous upper bound for high-rate currencies
    const unitAmount = (requestedAmount >= MIN_AMOUNT && requestedAmount <= MAX_AMOUNT) ? requestedAmount : 1999;

    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const stripe = new Stripe(stripeKey);
    const siteUrl = req.headers.get('origin') || process.env.URL || 'https://heartheirname.com';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Hear Their Name: Personalised Audio Story',
              description: `A personalised story for ${childName}`
            },
            unit_amount: unitAmount
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: `${siteUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: siteUrl,
      metadata: {
        childName: childName,
        category: storyData.category || '',
        length: storyData.length || '',
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        fbclid: fbclid,
        fbc: fbc,
        fbp: fbp,
        user_agent: userAgent,
        ref_code: refCode
      }
    });

    // Save pending story data to Supabase Storage so it survives the redirect
    // (sessionStorage gets wiped on many mobile browsers during cross-site redirect)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (supabaseUrl && supabaseKey && previewStoryText) {
      try {
        const pendingData = JSON.stringify({ storyData, previewStoryText, selectedVoiceId });
        const fileName = `pending/${session.id}.json`;

        await fetch(`${supabaseUrl}/storage/v1/object/stories/${fileName}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'x-upsert': 'true'
          },
          body: pendingData
        });
      } catch (pendingErr) {
        // Non-fatal: sessionStorage may still work, so don't block checkout
        console.error('Failed to save pending story data:', pendingErr.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Stripe checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/create-checkout' };
