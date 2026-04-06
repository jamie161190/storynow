// Detects user's country from Netlify geo headers and returns localised pricing.
// Base price is £19.99 GBP. Rates are approximate and used for display + Stripe checkout.

const BASE_GBP = 19.99;
const BASE_MINOR = 1999;

// Zero-decimal currencies (Stripe requires whole numbers, no x100)
const ZERO_DECIMAL = new Set(['JPY','KRW','VND','IDR','CLP','GNF','ISK','KMF','MGA','PYG','RWF','UGX','VUV','XAF','XOF','XPF','BIF','TWD']);

const CURRENCY_INFO = {
  GBP: { symbol: '£',    rate: 1.00  },
  EUR: { symbol: '€',    rate: 1.20  },
  USD: { symbol: '$',    rate: 1.28  },
  CAD: { symbol: 'CA$',  rate: 1.74  },
  AUD: { symbol: 'A$',   rate: 2.02  },
  NZD: { symbol: 'NZ$',  rate: 2.15  },
  SGD: { symbol: 'S$',   rate: 1.72  },
  HKD: { symbol: 'HK$',  rate: 9.90  },
  JPY: { symbol: '¥',    rate: 195   },
  INR: { symbol: '₹',    rate: 107   },
  ZAR: { symbol: 'R',    rate: 23.50 },
  NOK: { symbol: 'kr',   rate: 13.80 },
  SEK: { symbol: 'kr',   rate: 13.20 },
  DKK: { symbol: 'kr',   rate: 8.90  },
  CHF: { symbol: 'CHF ', rate: 1.13  },
  BRL: { symbol: 'R$',   rate: 6.40  },
  MXN: { symbol: 'MX$',  rate: 21.50 },
  PLN: { symbol: 'zł',   rate: 5.10  },
  AED: { symbol: 'AED ', rate: 4.70  },
  SAR: { symbol: 'SAR ', rate: 4.80  },
  ILS: { symbol: '₪',    rate: 4.70  },
  MYR: { symbol: 'RM',   rate: 5.70  },
  PHP: { symbol: '₱',    rate: 71.00 },
  THB: { symbol: '฿',    rate: 44.00 },
  KRW: { symbol: '₩',    rate: 1730  },
};

// Country → currency code
const COUNTRY_CURRENCY = {
  // Euro zone
  AT:'EUR',BE:'EUR',CY:'EUR',EE:'EUR',FI:'EUR',FR:'EUR',DE:'EUR',
  GR:'EUR',IE:'EUR',IT:'EUR',LV:'EUR',LT:'EUR',LU:'EUR',MT:'EUR',
  NL:'EUR',PT:'EUR',SK:'EUR',SI:'EUR',ES:'EUR',ME:'EUR',XK:'EUR',
  // Other Europe
  GB:'GBP', NO:'NOK', SE:'SEK', DK:'DKK', CH:'CHF', PL:'PLN',
  CZ:'CZK', HU:'HUF', RO:'RON', BG:'BGN', HR:'HRK', RS:'RSD',
  // Americas
  US:'USD', CA:'CAD', MX:'MXN', BR:'BRL', AR:'ARS', CL:'CLP',
  CO:'COP', PE:'PEN',
  // Asia Pacific
  AU:'AUD', NZ:'NZD', SG:'SGD', HK:'HKD', JP:'JPY', IN:'INR',
  MY:'MYR', PH:'PHP', TH:'THB', KR:'KRW', TW:'TWD', ID:'IDR',
  CN:'CNY',
  // Middle East & Africa
  AE:'AED', SA:'SAR', IL:'ILS', ZA:'ZAR', EG:'EGP', NG:'NGN',
  KE:'KES', GH:'GHS',
};

function calcPrice(currencyCode) {
  const info = CURRENCY_INFO[currencyCode] || CURRENCY_INFO['GBP'];
  const isZero = ZERO_DECIMAL.has(currencyCode);
  const raw = BASE_GBP * info.rate;

  let amount, amountMinor;
  if (isZero) {
    // Round to nearest 100 for JPY/KRW etc.
    amount = Math.round(raw / 100) * 100;
    amountMinor = amount;
  } else if (currencyCode === 'GBP') {
    // Keep GBP as the established £19.99
    amount = BASE_GBP;
    amountMinor = BASE_MINOR;
  } else {
    // Always .99 pricing — round up to next whole number then subtract 0.01
    amount = Math.ceil(raw) - 0.01;
    amountMinor = Math.round(amount * 100);
  }

  const display = info.symbol + (isZero ? amount.toLocaleString() : amount.toFixed(2));

  return { currency: currencyCode, symbol: info.symbol, amount, amountMinor, display, isZeroDecimal: isZero };
}

export default async (req) => {
  // Netlify injects x-country header automatically on all requests
  const countryCode = (
    req.headers.get('x-country') ||
    req.headers.get('x-nf-country') ||
    'GB'
  ).toUpperCase().trim();

  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'GBP';

  // Fall back to GBP if we don't have info for this currency
  const pricing = CURRENCY_INFO[currencyCode]
    ? calcPrice(currencyCode)
    : calcPrice('GBP');

  return new Response(JSON.stringify(pricing), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
};

export const config = { path: '/api/get-pricing' };
