// LEGACY — disabled. The active checkout endpoint is /api/checkout-paid which
// requires authenticated session or accessToken. This v1 endpoint had no auth
// and was publicly creating real Stripe sessions.

export default async () => {
  return new Response('Gone — use /api/checkout-paid', { status: 410 });
};
