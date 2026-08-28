import { getZipMarketLabel } from './pricing.js';

/** FixBridge pilot service area — NYC metro, Long Island, nearby NJ & CT. */
export function checkServiceAreaZip(zip) {
  const z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (!/^\d{5}$/.test(z)) {
    return { ok: false, covered: false, message: 'Enter a valid 5-digit ZIP code.' };
  }
  const pilot =
    /^(100|101|102|103|104|110|111|112|113|114|116)/.test(z) ||
    /^(115|117|118|119)/.test(z) ||
    /^(070|071|072|073|074|076|077|078|079)/.test(z) ||
    /^(068|069)/.test(z);

  if (pilot) {
    return {
      ok: true,
      covered: true,
      zip: z,
      market: getZipMarketLabel(z),
      message: `We serve ${getZipMarketLabel(z)}.`,
    };
  }
  return {
    ok: true,
    covered: false,
    zip: z,
    message:
      'FixBridge is expanding beyond NYC & Long Island. You can still submit — we will confirm coverage before dispatch.',
  };
}

export function registerServiceAreaRoutes(app) {
  app.get('/api/public/service-area/check', (req, res) => {
    const zip = String(req.query.zip || '').trim();
    res.json(checkServiceAreaZip(zip));
  });

  app.get('/api/service-area/check', (req, res) => {
    const zip = String(req.query.zip || '').trim();
    res.json(checkServiceAreaZip(zip));
  });
}
