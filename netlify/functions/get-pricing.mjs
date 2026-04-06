// Detects user's country from Netlify geo headers and returns localised pricing.
// Base price is £19.99 GBP. Rates are approximate and used for display + Stripe checkout.

const BASE_GBP = 19.99;
const BASE_MINOR = 1999;

// Zero-decimal currencies (Stripe: no x100, whole units only)
const ZERO_DECIMAL = new Set([
  'JPY','KRW','VND','IDR','CLP','GNF','ISK','KMF','MGA','PYG',
  'RWF','UGX','VUV','XAF','XOF','XPF','BIF','TWD','HUF'
]);

const CURRENCY_INFO = {
  // Major
  GBP: { symbol: '£',     rate: 1.00   },
  EUR: { symbol: '€',     rate: 1.20   },
  USD: { symbol: '$',     rate: 1.28   },
  CAD: { symbol: 'CA$',   rate: 1.74   },
  AUD: { symbol: 'A$',    rate: 2.02   },
  NZD: { symbol: 'NZ$',   rate: 2.15   },
  // Europe
  NOK: { symbol: 'kr',    rate: 13.80  },
  SEK: { symbol: 'kr',    rate: 13.20  },
  DKK: { symbol: 'kr',    rate: 8.90   },
  CHF: { symbol: 'CHF ',  rate: 1.13   },
  PLN: { symbol: 'zł',    rate: 5.10   },
  CZK: { symbol: 'Kč',    rate: 30.50  },
  HUF: { symbol: 'Ft',    rate: 490    },
  RON: { symbol: 'lei',   rate: 5.80   },
  BGN: { symbol: 'лв',    rate: 2.35   },
  HRK: { symbol: 'kn',    rate: 9.00   },
  ISK: { symbol: 'kr',    rate: 175    },
  TRY: { symbol: '₺',     rate: 43.00  },
  RSD: { symbol: 'din',   rate: 140    },
  UAH: { symbol: '₴',     rate: 52.00  },
  ALL: { symbol: 'L',     rate: 118    },
  BAM: { symbol: 'KM',    rate: 2.34   },
  MKD: { symbol: 'ден',   rate: 73.50  },
  GEL: { symbol: '₾',     rate: 3.50   },
  AMD: { symbol: '֏',     rate: 500    },
  AZN: { symbol: '₼',     rate: 2.18   },
  MDL: { symbol: 'L',     rate: 22.80  },
  // Asia Pacific
  SGD: { symbol: 'S$',    rate: 1.72   },
  HKD: { symbol: 'HK$',   rate: 9.90   },
  JPY: { symbol: '¥',     rate: 195    },
  INR: { symbol: '₹',     rate: 107    },
  MYR: { symbol: 'RM',    rate: 5.70   },
  PHP: { symbol: '₱',     rate: 71.00  },
  THB: { symbol: '฿',     rate: 44.00  },
  KRW: { symbol: '₩',     rate: 1730   },
  TWD: { symbol: 'NT$',   rate: 41.00  },
  IDR: { symbol: 'Rp',    rate: 20500  },
  VND: { symbol: '₫',     rate: 32000  },
  CNY: { symbol: '¥',     rate: 9.30   },
  BDT: { symbol: '৳',     rate: 140    },
  PKR: { symbol: '₨',     rate: 356    },
  LKR: { symbol: '₨',     rate: 390    },
  NPR: { symbol: '₨',     rate: 170    },
  MMK: { symbol: 'K',     rate: 2700   },
  KHR: { symbol: '៛',     rate: 5200   },
  BND: { symbol: 'B$',    rate: 1.73   },
  MOP: { symbol: 'P',     rate: 10.30  },
  // Middle East
  AED: { symbol: 'AED ',  rate: 4.70   },
  SAR: { symbol: 'SAR ',  rate: 4.80   },
  QAR: { symbol: 'QAR ',  rate: 4.66   },
  KWD: { symbol: 'KD',    rate: 0.39   },
  BHD: { symbol: 'BD',    rate: 0.48   },
  OMR: { symbol: 'OMR ',  rate: 0.49   },
  JOD: { symbol: 'JD',    rate: 0.91   },
  ILS: { symbol: '₪',     rate: 4.70   },
  TRY: { symbol: '₺',     rate: 43.00  },
  IRR: { symbol: '﷼',     rate: 53800  },
  LBP: { symbol: 'L£',    rate: 114000 },
  // Africa
  ZAR: { symbol: 'R',     rate: 23.50  },
  NGN: { symbol: '₦',     rate: 2050   },
  KES: { symbol: 'KSh',   rate: 167    },
  GHS: { symbol: 'GH₵',   rate: 19.50  },
  EGP: { symbol: 'E£',    rate: 64.00  },
  TZS: { symbol: 'TSh',   rate: 3400   },
  UGX: { symbol: 'USh',   rate: 4750   },
  ETB: { symbol: 'Br',    rate: 154    },
  XOF: { symbol: 'CFA',   rate: 787    },
  XAF: { symbol: 'FCFA',  rate: 787    },
  MAD: { symbol: 'MAD ',  rate: 12.90  },
  DZD: { symbol: 'DA',    rate: 173    },
  TND: { symbol: 'DT',    rate: 3.97   },
  ZMW: { symbol: 'ZK',    rate: 34.50  },
  BWP: { symbol: 'P',     rate: 17.30  },
  MWK: { symbol: 'MK',    rate: 2210   },
  MZN: { symbol: 'MT',    rate: 81.80  },
  RWF: { symbol: 'RF',    rate: 1760   },
  // Americas
  MXN: { symbol: 'MX$',   rate: 21.50  },
  BRL: { symbol: 'R$',    rate: 6.40   },
  ARS: { symbol: 'AR$',   rate: 1270   },
  CLP: { symbol: 'CLP$',  rate: 1180   },
  COP: { symbol: 'CO$',   rate: 5200   },
  PEN: { symbol: 'S/',    rate: 4.82   },
  UYU: { symbol: '$U',    rate: 53.00  },
  BOB: { symbol: 'Bs',    rate: 8.84   },
  PYG: { symbol: '₲',     rate: 9800   },
  GTQ: { symbol: 'Q',     rate: 9.95   },
  CRC: { symbol: '₡',     rate: 660    },
  DOP: { symbol: 'RD$',   rate: 75.00  },
  TTD: { symbol: 'TT$',   rate: 8.70   },
  JMD: { symbol: 'J$',    rate: 198    },
  BSD: { symbol: 'B$',    rate: 1.28   },
  BBD: { symbol: 'Bds$',  rate: 2.58   },
};

// Stripe doesn't support every currency for checkout — map unsupported ones
// to a sensible fallback (EUR for Europe/Africa, USD for rest)
const CURRENCY_FALLBACK = {
  IRR: 'USD', LBP: 'USD', MMK: 'USD', KHR: 'USD', SYP: 'USD',
  DZD: 'EUR', MAD: 'EUR', TND: 'EUR', LYD: 'EUR',
  XOF: 'EUR', XAF: 'EUR',
  MWK: 'USD', MZN: 'USD', ETB: 'USD',
};

// Every country in the world → currency code
const COUNTRY_CURRENCY = {
  // Euro zone
  AD:'EUR', AT:'EUR', BE:'EUR', CY:'EUR', EE:'EUR', FI:'EUR', FR:'EUR',
  DE:'EUR', GR:'EUR', IE:'EUR', IT:'EUR', LV:'EUR', LT:'EUR', LU:'EUR',
  MT:'EUR', MC:'EUR', NL:'EUR', PT:'EUR', SK:'EUR', SI:'EUR', SM:'EUR',
  ES:'EUR', VA:'EUR', ME:'EUR', XK:'EUR', HR:'EUR',
  // Other Europe
  GB:'GBP', IM:'GBP', JE:'GBP', GG:'GBP',
  NO:'NOK', SE:'SEK', DK:'DKK', FO:'DKK', GL:'DKK',
  CH:'CHF', LI:'CHF',
  PL:'PLN', CZ:'CZK', HU:'HUF', RO:'RON', BG:'BGN',
  IS:'ISK', TR:'TRY', RS:'RSD', AL:'ALL', BA:'BAM',
  MK:'MKD', GE:'GEL', AM:'AMD', AZ:'AZN', MD:'MDL',
  UA:'UAH', BY:'EUR', RU:'EUR', KZ:'EUR',
  // Americas
  US:'USD', CA:'CAD', MX:'MXN', BR:'BRL', AR:'ARS', CL:'CLP',
  CO:'COP', PE:'PEN', UY:'UYU', BO:'BOB', PY:'PYG', EC:'USD',
  VE:'USD', GY:'USD', SR:'USD', GT:'GTQ', CR:'CRC', PA:'USD',
  DO:'DOP', CU:'USD', JM:'JMD', TT:'TTD', BB:'BBD', BS:'BSD',
  HN:'USD', SV:'USD', NI:'USD', HT:'USD', BZ:'USD',
  AG:'USD', DM:'USD', GD:'USD', KN:'USD', LC:'USD', VC:'USD',
  // Asia Pacific
  AU:'AUD', NZ:'NZD', SG:'SGD', HK:'HKD', JP:'JPY', IN:'INR',
  MY:'MYR', PH:'PHP', TH:'THB', KR:'KRW', TW:'TWD', ID:'IDR',
  VN:'VND', CN:'CNY', BD:'BDT', PK:'PKR', LK:'LKR', NP:'NPR',
  MM:'MMK', KH:'KHR', BN:'BND', MO:'MOP', LA:'USD', TL:'USD',
  MN:'USD', FJ:'USD', PG:'USD', SB:'USD', VU:'VUV', WS:'USD',
  TO:'USD', PW:'USD', FM:'USD', MH:'USD', KI:'USD', NR:'AUD',
  TV:'AUD', CK:'NZD', NU:'NZD',
  // Middle East
  AE:'AED', SA:'SAR', QA:'QAR', KW:'KWD', BH:'BHD', OM:'OMR',
  JO:'JOD', IL:'ILS', TR:'TRY', IQ:'USD', IR:'IRR', SY:'SYP',
  LB:'LBP', YE:'USD', PS:'ILS',
  // Africa
  ZA:'ZAR', NG:'NGN', KE:'KES', GH:'GHS', EG:'EGP', TZ:'TZS',
  UG:'UGX', ET:'ETB', SN:'XOF', CI:'XOF', ML:'XOF', BF:'XOF',
  NE:'XOF', TG:'XOF', BJ:'XOF', GW:'XOF', CM:'XAF', CF:'XAF',
  CG:'XAF', TD:'XAF', GA:'XAF', GQ:'XAF', MA:'MAD', DZ:'DZD',
  TN:'TND', LY:'LYD', ZM:'ZMW', BW:'BWP', MW:'MWK', MZ:'MZN',
  RW:'RWF', SD:'USD', SS:'USD', SO:'USD', ER:'USD', DJ:'USD',
  ZW:'USD', NA:'ZAR', LS:'ZAR', SZ:'ZAR', MG:'USD', MU:'USD',
  SC:'USD', KM:'USD', CV:'EUR', ST:'EUR', AO:'USD', BI:'RWF',
  // Other
  GI:'GBP', MT:'EUR', CY:'EUR', MV:'USD', AF:'USD', UZ:'USD',
  TM:'USD', TJ:'USD', KG:'USD', KP:'USD',
};

function calcPrice(currencyCode) {
  // Apply fallback if needed
  const resolvedCode = CURRENCY_FALLBACK[currencyCode] || currencyCode;
  const info = CURRENCY_INFO[resolvedCode] || CURRENCY_INFO['GBP'];
  const isZero = ZERO_DECIMAL.has(resolvedCode);
  const raw = BASE_GBP * info.rate;

  let amount, amountMinor;
  if (isZero) {
    amount = Math.round(raw / 100) * 100;
    amountMinor = amount;
  } else if (resolvedCode === 'GBP') {
    amount = BASE_GBP;
    amountMinor = BASE_MINOR;
  } else {
    // Always .99 pricing
    amount = Math.ceil(raw) - 0.01;
    amountMinor = Math.round(amount * 100);
  }

  const display = info.symbol + (isZero ? amount.toLocaleString() : amount.toFixed(2));

  return {
    currency: resolvedCode,
    symbol: info.symbol,
    amount,
    amountMinor,
    display,
    isZeroDecimal: isZero
  };
}

export default async (req) => {
  const countryCode = (
    req.headers.get('x-country') ||
    req.headers.get('x-nf-country') ||
    'GB'
  ).toUpperCase().trim();

  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'GBP';
  const pricing = calcPrice(currencyCode);

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
