// GET /api/get-pricing
// Returns the localised price for the visitor's country, derived from the
// Netlify edge geo header. Public — cached for an hour.
//
// Shape:
//   {
//     bucket: 'UK' | 'EU' | 'US' | 'AU' | 'ROW',
//     country: 'GB',
//     currency: 'GBP',
//     symbol: '£',
//     amount: 24.99,
//     amountMinor: 2499,
//     display: '£24.99',
//     returningAmountMinor: 1999,
//     returningDisplay: '£19.99',
//     returningDiscountDisplay: '£5.00'
//   }

import { priceForCountry, countryFromRequest } from './lib/pricing.mjs';

export default async (req) => {
  const country = countryFromRequest(req);
  const pricing = priceForCountry(country);
  return new Response(JSON.stringify(pricing), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'x-country, x-nf-country'
    }
  });
};

export const config = { path: '/api/get-pricing' };
