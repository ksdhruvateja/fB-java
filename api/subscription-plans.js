import { clampString } from './security.js';

const DEFAULT_PLANS = [
  {
    code: 'personal',
    name: 'Personal',
    amount: 19,
    interval: 'month',
    theme: 'light',
    sortOrder: 1,
    highlight: false,
    unlocksDiy: false,
    trialDays: 0,
    features: [
      { label: 'Service request tracking', included: true },
      { label: 'Property health score', included: false },
      { label: 'Live chat & support', included: true },
      { label: 'AI DIY Action Plans', included: false },
    ],
  },
  {
    code: 'pro_membership',
    name: 'Pro',
    amount: 39,
    interval: 'month',
    theme: 'blue',
    sortOrder: 2,
    highlight: true,
    unlocksDiy: true,
    trialDays: 7,
    features: [
      { label: 'Service request tracking', included: true },
      { label: 'Property health score', included: true },
      { label: 'Live chat & support', included: true },
      { label: 'AI DIY Action Plans', included: true },
    ],
  },
  {
    code: 'homecare',
    name: 'HomeCare',
    amount: 49,
    interval: 'month',
    theme: 'plum',
    sortOrder: 3,
    highlight: false,
    unlocksDiy: true,
    trialDays: 0,
    features: [
      { label: 'Service request tracking', included: true },
      { label: 'Property health score', included: true },
      { label: 'Live chat & support', included: true },
      { label: 'AI DIY Action Plans', included: true },
    ],
  },
];

function normalizeFeatures(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      label: clampString(typeof f?.label === 'string' ? f.label : String(f?.label || ''), 120),
      included: Boolean(f?.included),
    }))
    .filter((f) => f.label)
    .slice(0, 12);
}

function rowToPlan(r) {
  return {
    id: Number(r.id),
    code: r.code,
    name: r.name,
    amount: Number(r.amount) || 0,
    interval: r.interval || 'month',
    theme: r.theme || 'light',
    sortOrder: Number(r.sort_order) || 0,
    features: Array.isArray(r.features) ? r.features : [],
    highlight: Boolean(r.highlight),
    unlocksDiy: Boolean(r.unlocks_diy),
    trialDays: Number(r.trial_days) || 0,
    active: r.active !== false,
    ctaLabel: r.cta_label || 'Select',
    description: r.description || null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  };
}

export async function initSubscriptionPlansSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id            BIGSERIAL PRIMARY KEY,
      code          TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
      interval      TEXT NOT NULL DEFAULT 'month',
      theme         TEXT NOT NULL DEFAULT 'light',
      sort_order    INT NOT NULL DEFAULT 0,
      features      JSONB NOT NULL DEFAULT '[]'::jsonb,
      highlight     BOOLEAN NOT NULL DEFAULT FALSE,
      unlocks_diy   BOOLEAN NOT NULL DEFAULT FALSE,
      trial_days    INT NOT NULL DEFAULT 0,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      cta_label     TEXT NOT NULL DEFAULT 'Select',
      description   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM subscription_plans`);
  if ((rows[0]?.n || 0) === 0) {
    // Seed defaults; prefer admin-configured Pro price if present
    let proAmount = 39;
    try {
      const { rows: ruleRows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
      const rules = ruleRows[0]?.rules || {};
      const fromRules = Number(rules.pro_subscription_price);
      if (Number.isFinite(fromRules) && fromRules > 0) proAmount = fromRules;
    } catch {
      // ignore
    }

    for (const p of DEFAULT_PLANS) {
      const amount = p.code === 'pro_membership' ? proAmount : p.amount;
      await pool.query(
        `INSERT INTO subscription_plans
          (code, name, amount, interval, theme, sort_order, features, highlight, unlocks_diy, trial_days, active, cta_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,TRUE,'Select')
         ON CONFLICT (code) DO NOTHING`,
        [
          p.code,
          p.name,
          amount,
          p.interval,
          p.theme,
          p.sortOrder,
          JSON.stringify(p.features),
          p.highlight,
          p.unlocksDiy,
          p.trialDays,
        ]
      );
    }
  }
}

export async function listActiveSubscriptionPlans(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM subscription_plans WHERE active=TRUE ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(rowToPlan);
}

export async function listAllSubscriptionPlans(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(rowToPlan);
}

export async function getSubscriptionPlanByCode(pool, code) {
  const { rows } = await pool.query(`SELECT * FROM subscription_plans WHERE code=$1`, [code]);
  return rows[0] ? rowToPlan(rows[0]) : null;
}

async function syncProPriceToRules(pool, amount) {
  try {
    const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
    const rules = { ...(rows[0]?.rules || {}), pro_subscription_price: Number(amount) || 0 };
    await pool.query(
      `INSERT INTO pricing_rules (id, rules, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET rules=$1::jsonb, updated_at=NOW()`,
      [JSON.stringify(rules)]
    );
  } catch (e) {
    console.warn('sync pro price to pricing_rules:', e.message);
  }
}

function parsePlanBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.code != null) {
    const code = clampString(String(body.code || ''), 40)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!code) {
      const err = new Error('Plan code is required.');
      err.status = 400;
      throw err;
    }
    out.code = code;
  }
  if (!partial || body.name != null) {
    const name = clampString(String(body.name || ''), 80);
    if (!name) {
      const err = new Error('Plan name is required.');
      err.status = 400;
      throw err;
    }
    out.name = name;
  }
  if (!partial || body.amount != null) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      const err = new Error('Amount must be a non-negative number.');
      err.status = 400;
      throw err;
    }
    out.amount = amount;
  }
  if (!partial || body.interval != null) {
    out.interval = body.interval === 'year' ? 'year' : 'month';
  }
  if (!partial || body.theme != null) {
    out.theme = ['light', 'blue', 'plum'].includes(body.theme) ? body.theme : 'light';
  }
  if (!partial || body.sortOrder != null) {
    out.sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  }
  if (!partial || body.features != null) {
    out.features = normalizeFeatures(body.features);
  }
  if (!partial || body.highlight != null) out.highlight = Boolean(body.highlight);
  if (!partial || body.unlocksDiy != null) out.unlocksDiy = Boolean(body.unlocksDiy);
  if (!partial || body.trialDays != null) {
    const td = Number(body.trialDays);
    out.trialDays = Number.isFinite(td) && td >= 0 ? Math.min(90, Math.floor(td)) : 0;
  }
  if (!partial || body.active != null) out.active = body.active !== false;
  if (!partial || body.ctaLabel != null) {
    out.ctaLabel = clampString(String(body.ctaLabel || 'Select'), 40) || 'Select';
  }
  if (!partial || body.description != null) {
    out.description = body.description ? clampString(String(body.description), 500) : null;
  }
  return out;
}

export function registerSubscriptionPlanRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
  app.get('/api/platform/go-pro-plans', async (_req, res) => {
    try {
      const plans = await listActiveSubscriptionPlans(pool);
      return res.json({ ok: true, plans });
    } catch (e) {
      console.error('list go-pro plans:', e);
      return res.status(500).json({ ok: false, message: 'Could not load plans.' });
    }
  });

  app.get('/api/admin/subscription-plans', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const plans = await listAllSubscriptionPlans(pool);
      return res.json({ ok: true, plans });
    } catch (e) {
      console.error('admin list subscription plans:', e);
      return res.status(500).json({ ok: false, message: 'Could not load plans.' });
    }
  });

  app.post('/api/admin/subscription-plans', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const p = parsePlanBody(req.body || {});
      const { rows } = await pool.query(
        `INSERT INTO subscription_plans
          (code, name, amount, interval, theme, sort_order, features, highlight, unlocks_diy, trial_days, active, cta_label, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          p.code,
          p.name,
          p.amount,
          p.interval || 'month',
          p.theme || 'light',
          p.sortOrder ?? 0,
          JSON.stringify(p.features || []),
          Boolean(p.highlight),
          Boolean(p.unlocksDiy),
          p.trialDays ?? 0,
          p.active !== false,
          p.ctaLabel || 'Select',
          p.description || null,
        ]
      );
      if (p.code === 'pro_membership') await syncProPriceToRules(pool, p.amount);
      return res.json({ ok: true, plan: rowToPlan(rows[0]) });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ ok: false, message: 'A plan with that code already exists.' });
      }
      console.error('create subscription plan:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not create plan.' });
    }
  });

  app.patch('/api/admin/subscription-plans/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid plan id.' });

      const { rows: existing } = await pool.query(`SELECT * FROM subscription_plans WHERE id=$1`, [id]);
      if (!existing[0]) return res.status(404).json({ ok: false, message: 'Plan not found.' });

      const p = parsePlanBody(req.body || {}, { partial: true });
      const cur = rowToPlan(existing[0]);
      const next = {
        code: p.code ?? cur.code,
        name: p.name ?? cur.name,
        amount: p.amount ?? cur.amount,
        interval: p.interval ?? cur.interval,
        theme: p.theme ?? cur.theme,
        sortOrder: p.sortOrder ?? cur.sortOrder,
        features: p.features ?? cur.features,
        highlight: p.highlight ?? cur.highlight,
        unlocksDiy: p.unlocksDiy ?? cur.unlocksDiy,
        trialDays: p.trialDays ?? cur.trialDays,
        active: p.active ?? cur.active,
        ctaLabel: p.ctaLabel ?? cur.ctaLabel,
        description: p.description !== undefined ? p.description : cur.description,
      };

      const { rows } = await pool.query(
        `UPDATE subscription_plans SET
           code=$1, name=$2, amount=$3, interval=$4, theme=$5, sort_order=$6,
           features=$7::jsonb, highlight=$8, unlocks_diy=$9, trial_days=$10,
           active=$11, cta_label=$12, description=$13, updated_at=NOW()
         WHERE id=$14 RETURNING *`,
        [
          next.code,
          next.name,
          next.amount,
          next.interval,
          next.theme,
          next.sortOrder,
          JSON.stringify(next.features),
          next.highlight,
          next.unlocksDiy,
          next.trialDays,
          next.active,
          next.ctaLabel,
          next.description,
          id,
        ]
      );

      if (next.code === 'pro_membership') await syncProPriceToRules(pool, next.amount);
      return res.json({ ok: true, plan: rowToPlan(rows[0]) });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ ok: false, message: 'A plan with that code already exists.' });
      }
      console.error('update subscription plan:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not update plan.' });
    }
  });

  app.delete('/api/admin/subscription-plans/:id', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: 'Invalid plan id.' });
      const { rows } = await pool.query(`DELETE FROM subscription_plans WHERE id=$1 RETURNING *`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Plan not found.' });
      return res.json({ ok: true, plan: rowToPlan(rows[0]) });
    } catch (e) {
      console.error('delete subscription plan:', e);
      return res.status(500).json({ ok: false, message: 'Could not delete plan.' });
    }
  });
}
