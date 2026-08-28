import rateLimit from 'express-rate-limit';
import {
  verifyAddress,
  lookupCityState,
  lookupZip,
  suggestAddresses,
  uspsConfigured,
  zip5,
} from './usps-address.js';

const addressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADDRESS_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many address requests. Try again later.' },
});

function sanitizeBody(body = {}) {
  return {
    streetAddress: String(body.streetAddress || body.addressLine1 || '').slice(0, 50),
    secondaryAddress: String(body.secondaryAddress || body.addressLine2 || '').slice(0, 50),
    city: String(body.city || '').slice(0, 28),
    state: String(body.state || '').slice(0, 2).toUpperCase(),
    zip: String(body.zip || body.ZIPCode || '').slice(0, 10),
    ZIPPlus4: String(body.ZIPPlus4 || body.postalCodePlus4 || '').slice(0, 4),
  };
}

export function registerAddressRoutes(app, { requireAuth }) {
  app.get('/api/address/status', (_req, res) => {
    res.json({
      ok: true,
      uspsConfigured: uspsConfigured(),
      autocompleteSupported: false,
      specVersion: '3.3.1',
      specFile: 'addresses-v3r2_0.yaml',
      endpoints: ['GET /address', 'GET /city-state', 'GET /zipcode'],
    });
  });

  app.post('/api/address/verify', requireAuth, addressLimiter, async (req, res) => {
    try {
      const input = sanitizeBody(req.body || {});
      const result = await verifyAddress(input);
      if (!result.ok) {
        const status =
          result.code === 'USPS_NOT_CONFIGURED'
            ? 503
            : result.status || (result.code === 'INCOMPLETE_ADDRESS' ? 400 : 502);
        return res.status(status).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error('[address] verify:', e.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Could not verify address.' });
    }
  });

  app.get('/api/address/city-state', requireAuth, addressLimiter, async (req, res) => {
    try {
      const zip = zip5(req.query?.zip || req.query?.ZIPCode);
      const result = await lookupCityState(zip);
      if (!result.ok) {
        const status = result.code === 'USPS_NOT_CONFIGURED' ? 503 : result.status || 400;
        return res.status(status).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error('[address] city-state:', e.message);
      res.status(500).json({ ok: false, message: 'Could not look up city/state.' });
    }
  });

  app.get('/api/address/zip', requireAuth, addressLimiter, async (req, res) => {
    try {
      const input = sanitizeBody({
        addressLine1: req.query?.streetAddress || req.query?.addressLine1,
        addressLine2: req.query?.secondaryAddress || req.query?.addressLine2,
        city: req.query?.city,
        state: req.query?.state,
        zip: req.query?.zip,
      });
      const result = await lookupZip(input);
      if (!result.ok) {
        const status = result.code === 'USPS_NOT_CONFIGURED' ? 503 : result.status || 400;
        return res.status(status).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error('[address] zip:', e.message);
      res.status(500).json({ ok: false, message: 'Could not look up ZIP code.' });
    }
  });

  app.get('/api/address/suggestions', requireAuth, addressLimiter, (_req, res) => {
    res.status(501).json(suggestAddresses());
  });
}
