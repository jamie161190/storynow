// POST /api/stripe-webhook-paid
// Webhook handler for the v2 paid flow. On checkout.session.completed for a 'paid_v2' session,
// marks the story paid, queues the full story job, sends receipt email.
// On charge.refunded, marks the story refunded.

import Stripe from 'stripe';
import { emailReceipt } from './lib/email-templates-v2.mjs';
import { BRAND_FROM } from './lib/constants.mjs';
import { sendMetaEvent } from './lib/meta-capi.mjs';
import { normalizeNameList } from './lib/format-names.mjs';
import { formatPrice } from './lib/pricing.mjs';

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

    // Read story_data first to check delivery_mode. Some legacy customers
    // (the three who came through the manual-review-by-Jamie funnel before
    // we shipped the in-browser flow) are flagged delivery_mode='manual':
    // they expect Jamie to make the story for them, not auto-generation. For
    // those rows we mark paid + send confirmation but do NOT trigger the
    // full worker. Jamie delivers via the admin queue afterwards.
    const preLookup = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=story_data`,
      { headers }
    );
    const preRows = preLookup.ok ? await preLookup.json() : [];
    const preData = preRows[0]?.story_data || {};
    const isManualDelivery = preData.delivery_mode === 'manual';

    // Mark paid. If we let Stripe collect email (no customer_email passed at
    // checkout), it now lives in customer_details.email — patch it onto the
    // row so the story-ready email and admin notifications have an address.
    const stripeEmail = (sess.customer_details?.email || sess.customer_email || '').toLowerCase();
    const paidPatch = {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      // Manual delivery: status reflects "paid, awaiting Jamie". Auto delivery:
      // status reflects "the worker is now writing the audio".
      status: isManualDelivery ? 'paid_manual_pending' : 'full_running'
    };
    if (stripeEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stripeEmail)) {
      paidPatch.email = stripeEmail;
    }
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify(paidPatch)
    });

    // ── Meta Pixel: Purchase (server-side) ──
    // Use the Stripe session id as the deterministic event_id so the browser
    // pixel on /preview/{id}?paid=1 can dedupe with us. Email + fbp + fbc came
    // through Stripe metadata when the checkout session was created.
    try {
      const amount = (sess.amount_total ?? 2499) / 100;
      const customerEmail = sess.customer_email || sess.customer_details?.email || '';
      await sendMetaEvent({
        eventName: 'Purchase',
        eventId: `purchase_${sess.id}`,
        email: customerEmail,
        fbp: sess.metadata?.fbp || '',
        fbc: sess.metadata?.fbc || '',
        userAgent: sess.metadata?.user_agent || '',
        sourceUrl: `${appUrl}/preview/${storyId}`,
        value: amount,
        currency: (sess.currency || 'gbp').toUpperCase(),
        customData: {
          content_name: 'Full story',
          content_type: 'product',
          content_ids: ['storytold_personalised_story'],
          num_items: 1,
        },
      });
    } catch (e) { console.error('[STRIPE-WH-V2] Meta CAPI Purchase failed:', e.message); }

    // Trigger full worker directly with storyId in body. We bypass job_queue
    // because the table's job_type CHECK constraint doesn't include 'full-v2'
    // and a queued insert silently fails (a paying customer would never get
    // their story). Hard 5s timeout so a stuck dispatch can't make us miss
    // Stripe's 10s webhook deadline (which would trigger a retry and a
    // duplicate story).
    //
    // Skipped entirely when delivery_mode='manual' — Jamie ships those by
    // hand from the admin queue. The customer sees a "thanks, within 24h"
    // screen on the preview page (not the auto-generation wait UI).
    if (!isManualDelivery) {
      try {
        await fetch(`${appUrl}/.netlify/functions/full-worker-v2-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId }),
          signal: AbortSignal.timeout(5000)
        });
      } catch (e) {
        console.error('[STRIPE-WH-V2] Worker trigger failed:', e.message);
      }
    } else {
      console.log('[STRIPE-WH-V2] Manual delivery flagged for', storyId, '— skipping worker trigger.');
    }

    // Send receipt email + admin notification
    if (resendKey){
      const sRes = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=email,child_name,access_token,story_data`, { headers });
      const sRows = sRes.ok ? await sRes.json() : [];
      if (sRows.length){
        const s = sRows[0];
        s.child_name = normalizeNameList(s.child_name);
        const ref = `HTN-${storyId.slice(0,6).toUpperCase()}`;
        const sessionCurrency = (sess.currency || 'gbp').toUpperCase();
        const amountMinor = sess.amount_total || 2499;
        const priceDisplay = formatPrice(amountMinor, sessionCurrency);
        const statusUrl = `${appUrl}/preview/${storyId}?t=${s.access_token}`;
        const tmpl = emailReceipt({
          firstName: s.story_data?.giftFrom || (s.story_data?.children?.[0]?.parentName) || '',
          childList: s.child_name, orderRef: ref, priceDisplay, statusUrl
        });
        // Customer receipt
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: BRAND_FROM, to: [s.email], reply_to: 'jamie@heartheirname.com',
              subject: tmpl.subject, html: tmpl.html, text: tmpl.text, headers: RESEND_LIST_UNSUB
            }),
            signal: AbortSignal.timeout(5000)
          });
        } catch (e) { console.error('[STRIPE-WH-V2] Receipt email failed:', e.message); }

        // Admin notification — fires every time someone pays
        const adminEmail = process.env.ADMIN_EMAIL || 'jamie@heartheirname.com';
        const adminUrl = `${appUrl}/admin?focus=${storyId}`;
        const adminSubject = `💷 Paid: ${s.child_name} — ${priceDisplay}`;
        const adminText = [
          `New paid order:`,
          ``,
          `  Child: ${s.child_name}`,
          `  Email: ${s.email}`,
          `  Amount: ${priceDisplay}`,
          `  Ref: ${ref}`,
          `  Story ID: ${storyId}`,
          ``,
          `Full story is being generated now (full-worker-v2-background was triggered).`,
          ``,
          `Customer view: ${statusUrl}`,
          `Admin dashboard: ${adminUrl}`,
        ].join('\n');
        const adminHtml = `
          <div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F1B2E">
            <p style="font-family:Georgia,serif;font-size:22px;margin:0 0 18px;color:#1F1B2E">New paid order &middot; ${priceDisplay}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
              <tr><td style="color:#5C5240;width:90px">Child</td><td><strong>${s.child_name}</strong></td></tr>
              <tr><td style="color:#5C5240">Email</td><td>${s.email}</td></tr>
              <tr><td style="color:#5C5240">Ref</td><td>${ref}</td></tr>
              <tr><td style="color:#5C5240">Story ID</td><td><code style="font-size:12px">${storyId}</code></td></tr>
            </table>
            <p style="margin:22px 0 8px;font-size:13.5px;color:#5C5240">Full story generation has been triggered.</p>
            <p style="margin:18px 0"><a href="${adminUrl}" style="display:inline-block;background:#D87A3E;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:14px">Open admin &rsaquo;</a></p>
            <p style="font-size:12px;color:#8A7E64;margin-top:24px">Customer view: <a href="${statusUrl}" style="color:#4B2E83">${statusUrl}</a></p>
          </div>`;
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: BRAND_FROM, to: [adminEmail], reply_to: 'jamie@heartheirname.com',
              subject: adminSubject, html: adminHtml, text: adminText
            }),
            signal: AbortSignal.timeout(5000)
          });
        } catch (e) { console.error('[STRIPE-WH-V2] Admin notification failed:', e.message); }
      }
    }
    return new Response('ok', { status: 200 });
  }

  if (event.type === 'charge.refunded'){
    const charge = event.data.object;
    const sessId = charge.payment_intent;
    // Find by stripe_session_id_v2: but we have payment_intent. We need a different lookup.
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

// Stripe webhooks must respond synchronously within 10s. Background-mode would
// cause Stripe to receive a 202 immediately and then we'd lose the ability to
// signal real failures (bad signature, Supabase errors). Keep this synchronous.
