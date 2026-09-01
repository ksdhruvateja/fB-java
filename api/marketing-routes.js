import {
  getMarketingPreferences,
  updateMarketingPreferences,
  processUnsubscribeToken,
  listMarketingSubscribers,
  listAllCustomers,
  adminUnsubscribeMarketing,
  migrateLegacyMarketingConsent,
} from './marketing-consent-service.js';

export function registerMarketingRoutes(app, { pool, requireAuth, requireAdmin, requirePermission }) {
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  // Public unsubscribe — no login required
  app.get('/api/marketing/unsubscribe', async (req, res) => {
    try {
      const token = String(req.query.token || '').trim();
      const channel = String(req.query.channel || 'email').toLowerCase();
      if (!token) {
        return res.status(400).json({ ok: false, message: 'Invalid unsubscribe link.' });
      }
      const result = await processUnsubscribeToken(pool, token, { channel, req });
      if (!result.ok) {
        return res.status(400).json({ ok: false, message: 'This unsubscribe link is invalid or has expired.' });
      }
      res.json({
        ok: true,
        channel: result.channel,
        message: result.channel === 'sms'
          ? 'You have been unsubscribed from FixBridge promotional text messages.'
          : 'You have been unsubscribed from FixBridge marketing emails.',
      });
    } catch (e) {
      console.error('marketing unsubscribe:', e);
      res.status(500).json({ ok: false, message: 'Could not process unsubscribe.' });
    }
  });

  app.post('/api/marketing/unsubscribe', async (req, res) => {
    try {
      const token = String(req.body?.token || req.query?.token || '').trim();
      const channel = String(req.body?.channel || 'email').toLowerCase();
      if (!token) return res.status(400).json({ ok: false, message: 'Invalid unsubscribe link.' });
      const result = await processUnsubscribeToken(pool, token, { channel, req });
      if (!result.ok) return res.status(400).json({ ok: false, message: 'Invalid or expired link.' });
      res.json({ ok: true, channel: result.channel });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not process unsubscribe.' });
    }
  });

  // Homeowner communication preferences
  app.get('/api/homeowner/communication-preferences', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const prefs = await getMarketingPreferences(pool, req.authUser.id);
      if (!prefs) return res.status(404).json({ ok: false, message: 'Not found.' });
      res.json({ ok: true, preferences: prefs });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load preferences.' });
    }
  });

  app.patch('/api/homeowner/communication-preferences', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const emailOptIn = typeof req.body?.emailOptIn === 'boolean' ? req.body.emailOptIn : undefined;
      const smsOptIn = typeof req.body?.smsOptIn === 'boolean' ? req.body.smsOptIn : undefined;
      if (emailOptIn === undefined && smsOptIn === undefined) {
        return res.status(400).json({ ok: false, message: 'No preference changes provided.' });
      }
      const prefs = await updateMarketingPreferences(pool, {
        userId: req.authUser.id,
        emailOptIn,
        smsOptIn,
        source: 'homeowner_settings',
        req,
      });
      res.json({ ok: true, preferences: prefs });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not update preferences.' });
    }
  });

  // Admin — all customers directory
  app.get('/api/admin/customers', requireAuth, requireAdmin, need('homeowners.view'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const customers = await listAllCustomers(pool, { q, limit, offset });
      res.json({ ok: true, customers });
    } catch (e) {
      console.error('admin customers:', e);
      res.status(500).json({ ok: false, message: 'Could not load customers.' });
    }
  });

  // Admin — marketing subscribers (derived from consent)
  app.get('/api/admin/marketing-subscribers', requireAuth, requireAdmin, need('homeowners.view'), async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const channel = String(req.query.channel || '').trim();
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const subscribers = await listMarketingSubscribers(pool, { q, channel, limit, offset });
      res.json({ ok: true, subscribers });
    } catch (e) {
      console.error('admin marketing subscribers:', e);
      res.status(500).json({ ok: false, message: 'Could not load subscribers.' });
    }
  });

  // Admin view marketing prefs for a homeowner
  app.get('/api/admin/homeowners/:userId/marketing-preferences', requireAuth, requireAdmin, need('homeowners.view'), async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const prefs = await getMarketingPreferences(pool, userId);
      if (!prefs) return res.status(404).json({ ok: false, message: 'Not found.' });
      res.json({ ok: true, preferences: prefs });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load preferences.' });
    }
  });

  // Admin unsubscribe only — cannot opt in
  app.post('/api/admin/homeowners/:userId/marketing-unsubscribe', requireAuth, requireAdmin, need('homeowners.edit'), async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const channels = Array.isArray(req.body?.channels) ? req.body.channels : ['email', 'sms'];
      const prefs = await adminUnsubscribeMarketing(pool, {
        userId,
        channels,
        adminUserId: req.authUser.id,
        req,
      });
      res.json({ ok: true, preferences: prefs });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not unsubscribe customer.' });
    }
  });

  // Google OAuth config status (public)
  app.get('/api/auth/google/config', (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    res.json({
      ok: true,
      configured: Boolean(clientId),
      clientId: clientId || null,
    });
  });
}

export async function initMarketingConsent(pool) {
  try {
    await migrateLegacyMarketingConsent(pool);
  } catch (e) {
    console.error('marketing consent migration:', e?.message || e);
  }
}
