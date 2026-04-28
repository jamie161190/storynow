// POST /api/refund-request { storyId, accessToken, reason }
// Creates a refund record + (best-effort) issues the Stripe refund. Emails Jamie.

import Stripe from 'stripe';
import { getSessionFromHeaders } from './lib/auth.mjs';
import { BRAND_FROM } from './lib/constants.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { storyId, accessToken, reason } = await req.json().catch(() => ({}));
  if (!storyId) return json({ error: 'storyId required' }, 400);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'jamie@heartheirname.com';
  if (!supabaseUrl || !supabaseKey) return json({ error: 'Service not configured' }, 503);

  const headers = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };
  const headersJson = { ...headers, 'Content-Type': 'application/json' };

  const lookup = await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}&select=id,email,child_name,access_token,stripe_session_id_v2,refunded_at,delivered_at`, { headers });
  const rows = lookup.ok ? await lookup.json() : [];
  if (!rows.length) return json({ error: 'Not found' }, 404);
  const s = rows[0];

  const session = getSessionFromHeaders(req.headers);
  if (!(session && session.email === s.email) && !(accessToken && accessToken === s.access_token)){
    return json({ error: 'Access denied' }, 403);
  }
  if (s.refunded_at) return json({ error: 'Already refunded' }, 409);

  // 14-day window from delivery
  const delivered = s.delivered_at ? new Date(s.delivered_at) : null;
  if (delivered && (Date.now() - delivered.getTime()) > 14 * 86400 * 1000){
    return json({ error: 'Past 14-day refund window. Please email jamie@heartheirname.com' }, 410);
  }

  // Insert refund row
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/refund_requests`, {
    method: 'POST', headers: { ...headersJson, 'Prefer': 'return=representation' },
    body: JSON.stringify({ story_id: storyId, reason: reason || '' })
  });
  const refundRow = (await insertRes.json())?.[0];

  // Issue Stripe refund
  let stripeRefundId = null;
  if (stripeKey && s.stripe_session_id_v2){
    try {
      const stripe = new Stripe(stripeKey);
      const sess = await stripe.checkout.sessions.retrieve(s.stripe_session_id_v2);
      if (sess.payment_intent){
        const refund = await stripe.refunds.create({ payment_intent: sess.payment_intent });
        stripeRefundId = refund.id;
      }
    } catch (e) { console.error('[REFUND] Stripe refund failed:', e.message); }
  }

  await fetch(`${supabaseUrl}/rest/v1/refund_requests?id=eq.${encodeURIComponent(refundRow?.id)}`, {
    method: 'PATCH', headers: headersJson,
    body: JSON.stringify({ stripe_refund_id: stripeRefundId, status: stripeRefundId ? 'completed' : 'pending', resolved_at: stripeRefundId ? new Date().toISOString() : null })
  });

  // Mark story refunded if Stripe succeeded
  if (stripeRefundId){
    await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(storyId)}`, {
      method: 'PATCH', headers: headersJson,
      body: JSON.stringify({ refunded_at: new Date().toISOString(), payment_status: 'refunded' })
    });
  }

  if (resendKey){
    const subject = stripeRefundId ? `Refund issued: ${s.child_name}` : `Refund requested: ${s.child_name}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: BRAND_FROM, to: [adminEmail], reply_to: s.email,
        subject, html: `<p>${stripeRefundId ? '✓ Refund auto-issued' : '⚠ Manual refund needed'}</p><p>Story: ${storyId}<br>From: ${s.email}<br>Stripe refund: ${stripeRefundId || 'none'}</p><p>${reason || ''}</p>`,
        text: `Refund ${stripeRefundId ? 'issued' : 'requested'} for ${s.child_name}\nFrom: ${s.email}\nStripe: ${stripeRefundId || 'manual needed'}\n\n${reason || ''}`
      })
    }).catch(() => {});
  }

  return json({ ok: true, refunded: !!stripeRefundId });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }); }
