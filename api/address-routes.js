import rateLimit from 'express-rate-limit';
import { validateAddressFormat, zip5 } from './address-utils.js';
import { autocompleteAddress, geoapifyConfigured, geoapifyCountryFilter } from './geoapify-address.js';

function addressRateLimitKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const fromHeader = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || '').split(',')[0].trim();
  const nfIp = String(req.headers['x-nf-client-connection-ip'] || '').trim();
  return req.ip || fromHeader || nfIp || 'unknown';
}

const addressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADDRESS_RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false },
  keyGenerator: addressRateLimitKey,
  message: { ok: false, message: 'Too many address requests. Try again later.' },
});

/**
 * Address routes — format validation + Geoapify autocomplete (suggestions only).
 * Autocomplete is never a save/verification gate.
 */
export function registerAddressRoutes(app, { requireAuth }) {
  app.get('/api/address/status', (_req, res) => {
    res.json({
      ok: true,
      verificationProvider: null,
      autocompleteProvider: geoapifyConfigured() ? 'geoapify' : null,
      autocompleteSupported: geoapifyConfigured(),
      countryFilter: geoapifyCountryFilter(),
      note: 'Address suggestions via Geoapify when configured. Manual entry always allowed.',
    });
  });

  /** Basic required-field / ZIP format check — not physical existence verification. */
  app.post('/api/address/validate', requireAuth, addressLimiter, async (req, res) => {
    try {
      const result = validateAddressFormat(req.body || {});
      if (!result.ok) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e) {
      console.error('[address] validate:', e.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: 'Could not validate address format.' });
    }
  });

  /**
   * Geoapify autocomplete proxy — US filter by default.
   * Never returns the API key. Soft-fails so clients can keep typing manually.
   */
  async function handleAutocomplete(req, res) {
    try {
      const q = String(req.query?.q || req.query?.text || '').trim();
      const limit = Number(req.query?.limit) || 6;
      const result = await autocompleteAddress({ text: q, limit });
      // Soft response: 200 even when provider unavailable so UI stays usable.
      res.json({
        ok: true,
        configured: result.configured === true,
        suggestions: result.suggestions || [],
        skipped: result.skipped === true,
        unavailable: result.ok === false,
        message: result.ok === false ? result.message : undefined,
        code: result.ok === false ? result.code : undefined,
      });
    } catch (e) {
      if (e?.name === 'AbortError') {
        return res.status(499).json({ ok: false, message: 'Cancelled.' });
      }
      console.error('[address] autocomplete:', e.message);
      res.json({
        ok: true,
        configured: geoapifyConfigured(),
        suggestions: [],
        unavailable: true,
        message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      });
    }
  }

  app.get('/api/address/autocomplete', requireAuth, addressLimiter, handleAutocomplete);
  // Guest / pre-auth flows (report signup) — same proxy, stricter rate limit window applies.
  app.get('/api/public/address/autocomplete', addressLimiter, handleAutocomplete);

  // Former verification / USPS-style endpoints — gone.
  app.post('/api/address/verify', requireAuth, (_req, res) => {
    res.status(410).json({
      ok: false,
      code: 'ADDRESS_VERIFICATION_REMOVED',
      message: 'Address verification is not used. Use address suggestions or enter the address manually.',
    });
  });

  app.get('/api/address/city-state', requireAuth, (_req, res) => {
    res.status(410).json({
      ok: false,
      code: 'ADDRESS_LOOKUP_REMOVED',
      message: 'Use address autocomplete or enter city/state manually.',
    });
  });

  app.get('/api/address/zip', requireAuth, (_req, res) => {
    res.status(410).json({
      ok: false,
      code: 'ADDRESS_LOOKUP_REMOVED',
      message: 'Use address autocomplete or enter ZIP manually.',
    });
  });

  app.get('/api/address/suggestions', requireAuth, addressLimiter, async (req, res) => {
    // Alias for older clients — same as autocomplete.
    try {
      const q = String(req.query?.q || req.query?.text || req.query?.zip || '').trim();
      const result = await autocompleteAddress({ text: q, limit: Number(req.query?.limit) || 6 });
      res.json({
        ok: true,
        configured: result.configured === true,
        suggestions: result.suggestions || [],
        unavailable: result.ok === false,
        message: result.ok === false ? result.message : undefined,
        zipHint: zip5(req.query?.zip || ''),
      });
    } catch (e) {
      console.error('[address] suggestions:', e.message);
      res.json({
        ok: true,
        suggestions: [],
        unavailable: true,
        message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      });
    }
  });
}
