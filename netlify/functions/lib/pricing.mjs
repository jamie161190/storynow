// Single source of truth for pricing. Four hard-coded buckets keyed off the
// customer's country. Used by the public /api/get-pricing endpoint AND by
// /api/checkout-paid so display and Stripe charge always agree.
//
//   UK            → GBP £24.99   (£5 returning discount → £19.99)
//   Europe        → EUR €29.99   (€5 returning discount → €24.99)
//   United States → USD $39.99   ($5 returning discount → $34.99)
//   Australia/NZ  → AUD A$45.99  (A$5 returning discount → A$40.99)
//   Anywhere else → USD $45.99   ($5 returning discount → $40.99)
//
// The country code is read from the Netlify edge geo header server-side
// (`x-country` / `x-nf-country`). Client-side hints are NEVER trusted by
// /api/checkout-paid — that's why this lib lives in netlify/functions.

const UK = new Set(['GB','IM','JE','GG','GI']);

const EUROPE = new Set([
  // Eurozone
  'AD','AT','BE','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU',
  'MT','MC','NL','PT','SK','SI','SM','ES','VA','HR',
  // EEA / EU non-euro
  'SE','DK','NO','IS','LI','CH','PL','CZ','HU','RO','BG','FO','GL',
  // Other Europe (price in EUR)
  'AL','BA','ME','MK','XK','RS','UA','MD','BY','RU','TR','AM','AZ','GE',
]);

const US = new Set(['US']);
const AU_NZ = new Set(['AU','NZ']);

const BUCKETS = {
  UK:    { currency: 'GBP', symbol: '£',  amountMinor: 2499, returningDiscountMinor: 500 },
  EU:    { currency: 'EUR', symbol: '€',  amountMinor: 2999, returningDiscountMinor: 500 },
  US:    { currency: 'USD', symbol: '$',  amountMinor: 3999, returningDiscountMinor: 500 },
  AU:    { currency: 'AUD', symbol: 'A$', amountMinor: 4599, returningDiscountMinor: 500 },
  ROW:   { currency: 'USD', symbol: '$',  amountMinor: 4599, returningDiscountMinor: 500 },
};

export function bucketForCountry(country) {
  const c = (country || '').toUpperCase().trim();
  if (UK.has(c))    return 'UK';
  if (EUROPE.has(c)) return 'EU';
  if (US.has(c))    return 'US';
  if (AU_NZ.has(c)) return 'AU';
  return 'ROW';
}

function fmt(amountMinor, symbol) {
  return symbol + (amountMinor / 100).toFixed(2);
}

export function priceForCountry(country) {
  const bucketKey = bucketForCountry(country);
  const b = BUCKETS[bucketKey];
  return {
    bucket: bucketKey,
    country: (country || '').toUpperCase() || null,
    currency: b.currency,
    symbol: b.symbol,
    amountMinor: b.amountMinor,
    amount: b.amountMinor / 100,
    display: fmt(b.amountMinor, b.symbol),
    returningDiscountMinor: b.returningDiscountMinor,
    returningAmountMinor: b.amountMinor - b.returningDiscountMinor,
    returningDisplay: fmt(b.amountMinor - b.returningDiscountMinor, b.symbol),
    returningDiscountDisplay: fmt(b.returningDiscountMinor, b.symbol),
  };
}

// Read the Netlify edge geo header from a Request. Falls back to GB for
// safety so first-time visitors with no header still see UK pricing rather
// than the more expensive RoW catch-all.
export function countryFromRequest(req) {
  return (
    req.headers.get('x-country') ||
    req.headers.get('x-nf-country') ||
    req.headers.get('cf-ipcountry') ||
    'GB'
  ).toUpperCase().trim();
}

// Helpers for downstream callers (emails, admin) that already have the
// minor amount + currency from a Stripe session.
const SYMBOLS = { GBP:'£', EUR:'€', USD:'$', AUD:'A$' };
export function formatPrice(amountMinor, currency) {
  const symbol = SYMBOLS[(currency || '').toUpperCase()] || (currency + ' ');
  return symbol + (amountMinor / 100).toFixed(2);
}
