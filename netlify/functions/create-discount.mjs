import Stripe from 'stripe';

// Creates a unique, one-time-use Stripe promotion code for a customer.
// This is called after each purchase to give them a discount on their next story.

const COUPON_NAME = 'storytold_next_story_25';
const DISCOUNT_PERCENT = 25;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { customerEmail } = await req.json();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Get or create the master coupon (25% off, unlimited uses at coupon level)
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(COUPON_NAME);
    } catch (e) {
      // Coupon doesn't exist yet, create it
      coupon = await stripe.coupons.create({
        id: COUPON_NAME,
        percent_off: DISCOUNT_PERCENT,
        duration: 'once',
        name: 'Next Story 25% Off'
      });
      console.log('Created master coupon:', coupon.id);
    }

    // Generate a short unique code: STORY-XXXXX
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/1/0 to avoid confusion
    let code = 'STORY-';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Create a unique, single-use promotion code
    const promoCode = await stripe.promotionCodes.create({
      coupon: COUPON_NAME,
      code: code,
      max_redemptions: 1,
      metadata: {
        generated_for: customerEmail || 'unknown',
        generated_at: new Date().toISOString()
      }
    });

    console.log('Created promo code:', promoCode.code, 'for:', customerEmail);

    return new Response(JSON.stringify({
      success: true,
      code: promoCode.code,
      percentOff: DISCOUNT_PERCENT
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Create discount error:', err.message);
    // If code already exists (unlikely but possible), try once more with different code
    if (err.code === 'resource_already_exists') {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'STORY-';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const promoCode = await stripe.promotionCodes.create({
          coupon: COUPON_NAME,
          code: code,
          max_redemptions: 1
        });
        return new Response(JSON.stringify({
          success: true,
          code: promoCode.code,
          percentOff: DISCOUNT_PERCENT
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (retryErr) {
        console.error('Retry failed:', retryErr.message);
      }
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/create-discount' };
