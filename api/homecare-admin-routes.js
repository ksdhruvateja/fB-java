/**
 * Admin + public HomeCare Pro configuration APIs.
 */
import { writeAudit } from './audit.js';
import { requirePermission } from './rbac.js';
import {
  DEFAULT_HOMECARE_CONFIG,
  detectEntitlementWarnings,
  getHomeCareConfig,
  invalidateHomeCareConfigCache,
  mergeHomeCareConfig,
  patchHomeCareConfig,
  toPublicHomeCareConfig,
} from './homecare-config.js';
import { processDueServiceReminders, verifyReminderCronAuth, getReminderSchedulerStatus } from './service-reminders.js';

async function ensureHomeCareSettingsRow(pool) {
  const { rows } = await pool.query(`SELECT id FROM homecare_settings WHERE id='default'`);
  if (!rows.length) {
    await pool.query(
      `INSERT INTO homecare_settings (id, config, config_version) VALUES ('default', $1, $2)`,
      [JSON.stringify(DEFAULT_HOMECARE_CONFIG), DEFAULT_HOMECARE_CONFIG.configVersion]
    );
  }
}

export function registerHomeCareAdminRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/homecare/config', async (req, res) => {
    try {
      await ensureHomeCareSettingsRow(pool);
      const config = await getHomeCareConfig(pool, { fresh: true });
      const planCode = req.headers.authorization ? null : null;
      res.json({ ok: true, config: toPublicHomeCareConfig(config, { planCode }) });
    } catch (e) {
      console.error('public homecare config:', e);
      res.status(500).json({ ok: false, message: 'Could not load configuration.' });
    }
  });

  app.get('/api/homecare/config/me', requireAuth, async (req, res) => {
    try {
      await ensureHomeCareSettingsRow(pool);
      const config = await getHomeCareConfig(pool);
      res.json({
        ok: true,
        config: toPublicHomeCareConfig(config, { planCode: req.authUser?.planCode }),
      });
    } catch (e) {
      console.error('homecare config me:', e);
      res.status(500).json({ ok: false, message: 'Could not load configuration.' });
    }
  });

  app.get(
    '/api/admin/homecare/settings',
    requireAuth,
    requireAdmin,
    async (_req, res) => {
      try {
        await ensureHomeCareSettingsRow(pool);
        const config = await getHomeCareConfig(pool, { fresh: true });
        const { rows: pr } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
        const rules = pr[0]?.rules || {};
        const parsed = typeof rules === 'string' ? JSON.parse(rules) : rules;
        res.json({
          ok: true,
          config,
          pricing: {
            standardCoordinationFee: Number(parsed.standard_coordination_fee ?? 125),
            homecareProCoordinationFee: Number(parsed.homecare_pro_coordination_fee ?? 99),
            subscriptionDiscount: Number(parsed.subscription_discount ?? 0),
          },
        });
      } catch (e) {
        console.error('admin homecare settings get:', e);
        res.status(500).json({ ok: false, message: 'Could not load HomeCare settings.' });
      }
    }
  );

  app.patch(
    '/api/admin/homecare/settings',
    requireAuth,
    requireAdmin,
    requirePermission('homecare.manage', 'settings.edit'),
    async (req, res) => {
      try {
        await ensureHomeCareSettingsRow(pool);
        const body = req.body || {};
        const current = await getHomeCareConfig(pool, { fresh: true });
        const next = patchHomeCareConfig(current, body.config || body);
        const warnings = detectEntitlementWarnings(current, next);
        if (warnings.length && !body.confirmImpact) {
          return res.status(409).json({
            ok: false,
            code: 'CONFIRMATION_REQUIRED',
            warnings,
            message: 'This change may affect existing homeowners. Confirm to proceed.',
          });
        }

        const { rows: prevRows } = await pool.query(
          `SELECT config FROM homecare_settings WHERE id='default'`
        );
        const prevConfig = prevRows[0]?.config || {};

        await pool.query(
          `UPDATE homecare_settings SET config=$1, config_version=$2, updated_at=NOW(), updated_by=$3 WHERE id='default'`,
          [JSON.stringify(next), next.configVersion, req.authUser.id]
        );
        invalidateHomeCareConfigCache();

        await writeAudit(pool, req.authUser.id, 'homecare_settings_update', 'homecare_settings', 'default', {
          previous: prevConfig,
          next,
          warnings,
        });

        res.json({ ok: true, config: next, warnings });
      } catch (e) {
        console.error('admin homecare settings patch:', e);
        res.status(500).json({ ok: false, message: 'Could not save HomeCare settings.' });
      }
    }
  );

  app.patch(
    '/api/admin/homecare/pricing',
    requireAuth,
    requireAdmin,
    requirePermission('pricing.edit', 'homecare.manage'),
    async (req, res) => {
      try {
        const b = req.body || {};
        const stdFee = Number(b.standardCoordinationFee);
        const proFee = Number(b.homecareProCoordinationFee);
        if (!Number.isFinite(stdFee) || stdFee < 0 || !Number.isFinite(proFee) || proFee < 0) {
          return res.status(400).json({ ok: false, message: 'Coordination fees must be non-negative numbers.' });
        }
        if (!b.confirmImpact) {
          return res.status(409).json({
            ok: false,
            code: 'CONFIRMATION_REQUIRED',
            message:
              'Coordination fee changes apply to new quotes only. Existing accepted quotes are unchanged. Confirm to proceed.',
            preview: { standardCoordinationFee: stdFee, homecareProCoordinationFee: proFee },
          });
        }
        const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
        const rules = rows[0]?.rules || {};
        const parsed = typeof rules === 'string' ? JSON.parse(rules) : { ...rules };
        const previous = {
          standard_coordination_fee: parsed.standard_coordination_fee,
          homecare_pro_coordination_fee: parsed.homecare_pro_coordination_fee,
        };
        parsed.standard_coordination_fee = stdFee;
        parsed.homecare_pro_coordination_fee = proFee;
        if (b.subscriptionDiscount != null) {
          const disc = Number(b.subscriptionDiscount);
          if (!Number.isFinite(disc) || disc < 0 || disc > 1) {
            return res.status(400).json({ ok: false, message: 'subscriptionDiscount must be between 0 and 1.' });
          }
          parsed.subscription_discount = disc;
        }
        await pool.query(
          `UPDATE pricing_rules SET rules=$1, updated_at=NOW(), updated_by=$2 WHERE id='default'`,
          [JSON.stringify(parsed), req.authUser.id]
        );
        await writeAudit(pool, req.authUser.id, 'homecare_pricing_update', 'pricing_rules', 'default', {
          previous,
          next: {
            standard_coordination_fee: stdFee,
            homecare_pro_coordination_fee: proFee,
            subscription_discount: parsed.subscription_discount,
          },
        });
        res.json({
          ok: true,
          pricing: {
            standardCoordinationFee: stdFee,
            homecareProCoordinationFee: proFee,
            subscriptionDiscount: Number(parsed.subscription_discount ?? 0),
          },
        });
      } catch (e) {
        console.error('admin homecare pricing patch:', e);
        res.status(500).json({ ok: false, message: 'Could not update coordination fees.' });
      }
    }
  );

  app.post(
    '/api/admin/service-reminders/process',
    requireAuth,
    requireAdmin,
    requirePermission('homecare.manage'),
    async (_req, res) => {
      try {
        const result = await processDueServiceReminders(pool);
        res.json({ ok: true, ...result });
      } catch (e) {
        console.error('process service reminders:', e);
        res.status(500).json({ ok: false, message: 'Could not process reminders.' });
      }
    }
  );

  app.post('/api/internal/service-reminders/process', async (req, res) => {
    if (!verifyReminderCronAuth(req)) {
      return res.status(401).json({ ok: false, message: 'Unauthorized.' });
    }
    try {
      const result = await processDueServiceReminders(pool);
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('cron process service reminders:', e);
      res.status(500).json({ ok: false, message: 'Could not process reminders.' });
    }
  });

  app.get(
    '/api/admin/service-reminders/status',
    requireAuth,
    requireAdmin,
    requirePermission('homecare.manage'),
    async (_req, res) => {
      try {
        const status = await getReminderSchedulerStatus(pool);
        res.json({ ok: true, ...status });
      } catch (e) {
        console.error('service reminder status:', e);
        res.status(500).json({ ok: false, message: 'Could not load reminder status.' });
      }
    }
  );
}

export async function initHomeCareSettingsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homecare_settings (
      id              TEXT PRIMARY KEY DEFAULT 'default',
      config          JSONB NOT NULL,
      config_version  INT NOT NULL DEFAULT 1,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_by      INT
    )
  `);
  const { rows } = await pool.query(`SELECT id FROM homecare_settings WHERE id='default'`);
  if (!rows.length) {
    await pool.query(
      `INSERT INTO homecare_settings (id, config, config_version) VALUES ('default', $1, $2)`,
      [JSON.stringify(DEFAULT_HOMECARE_CONFIG), DEFAULT_HOMECARE_CONFIG.configVersion]
    );
  }
}
