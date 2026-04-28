// POST /api/stripe-webhook-paid
// Webhook handler for the v2 paid flow. On checkout.session.completed for a 'paid_v2' session,
// marks the story paid, queues the full story job, sends receipt email.
// On charge.refunded, marks the story refunded.

import Stripe from 'stripe';
import { emailReceipt } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

const RESEND_LIST_UNSUB = {
  'List-Unsubscribe': '<mailto:jamie@heartheirname.com?subject=unsubscribe>',
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
};

export default async (req) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_PAID || process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const appUrl = process.env.PUBLIC_APP_URL || 'https://heartheirname.com';

  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseKey) return new Response('Missing env', { status: 500 });

  const stripe = new Stripe(stripeKey);
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[STRIPE-WH-V2] Bad signature:', err.message);
    return new Response('Bad signature', { status: 400 });
  }

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  if (event.type === 'checkout.session.completed'){
    const sess = event.data.object;
    if (sess.metadata?.kind !== 'paid_v2'){ return new Response('Skipped', { status: 200 }); }
    const storyId = sess.metadata.story_id;
    if (!storyId) return new Response('Missing story_id', { status: 200 });

    // Mark paid
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ payment_status: 'paid', paid_at: new Date().toISOString(), status: 'full_queued' })
    });

    // Queue full story job
    await fetch(`${supabaseUrl}/rest/v1/job_queue`, {
      method: 'POST', headers: headersJson,
      body: JSON.stringify({ story_id: storyId, job_type: 'full-v2', status: 'queued' })
    });

    // Trigger full worker
    try { await fetch(`${appUrl}/.netlify/functions/full-worker-v2-background`, { method: 'POST' }); } catch {}

    // Send receipt email
    if (resendKey){
      const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=email,child_name,access_token,story_data`, { headers });
      const sRows = sRes.ok ? await sRes.json() : [];
      if (sRows.length){
        const s = sRows[0];
        const ref = `HTN-${storyId.slice(0,6).toUpperCase()}`;
        const amount = (sess.amount_total || 2499) / 100;
        const statusUrl = `${appUrl}/preview/${storyId}?t=${s.access_token}`;
        const tmpl = emailReceipt({
          firstName: s.story_data?.giftFrom || (s.story_data?.children?.[0]?.parentName) || '',
          childList: s.child_name, orderRef: ref, amountGbp: amount, statusUrl
        });
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: BRAND_FROM, to: [s.email], reply_to: 'jamie@heartheirname.com',
              subject: tmpl.subject, html: tmpl.html, text: tmpl.text, headers: RESEND_LIST_UNSUB
            })
          });
        } catch (e) { console.error('[STRIPE-WH-V2] Receipt email failed:', e.message); }
      }
    }
    return new Response('ok', { status: 200 });
  }

  if (event.type === 'charge.refunded'){
    const charge = event.data.object;
    const sessId = charge.payment_intent;
    // Find by stripe_session_id_v2 — but we have payment_intent. We need a different lookup.
    // Easier: list all sessions with this payment_intent and match story_id from metadata.
    try {
      const stripe2 = new Stripe(stripeKey);
      const sessions = await stripe2.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 });
      const storyId = sessions.data?.[0]?.metadata?.story_id;
      if (storyId){
        await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
          method: 'PATCH', headers: headersJson,
          body: JSON.stringify({ refunded_at: new Date().toISOString(), payment_status: 'refunded' })
        });
      }
    } catch (e) { console.error('[STRIPE-WH-V2] Refund handler error:', e.message); }
    return new Response('ok', { status: 200 });
  }

  return new Response('Unhandled', { status: 200 });
};

export const config = { type: 'experimental-background' };
