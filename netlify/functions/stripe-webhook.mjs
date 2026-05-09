// LEGACY — disabled. The active webhook is /api/stripe-webhook-paid.
// Returns 410 Gone so any old Stripe webhook endpoint configuration that
// still points here gets a clean signal instead of a 500 (which Stripe sees
// as transient and keeps retrying for hours).

export default async () => {
  return new Response('Gone — use /api/stripe-webhook-paid', { status: 410 });
};
