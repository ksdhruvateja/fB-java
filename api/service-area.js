import { getZipMarketLabel } from './pricing.js';

/** US nationwide service area — valid 5-digit ZIP codes are accepted. */
export function checkServiceAreaZip(zip) {
  const z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (!/^\d{5}$/.test(z)) {
    return { ok: false, covered: false, message: 'Enter a valid 5-digit ZIP code.' };
  }
  const market = getZipMarketLabel(z);
  const nationwide = market === 'National baseline';
  return {
    ok: true,
    covered: true,
    zip: z,
    market,
    message: nationwide ? 'Service available nationwide.' : `We serve the ${market}.`,
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
