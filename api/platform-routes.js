/**
 * Platform expansion routes: Direct leads, subscriptions, change orders,
 * refunds/disputes, payout holds, DIY, parts, partner portal, MFA, media, ops.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { brand } from './brand.js';
import {
  stripeConfigured,
  shouldSimulatePayment,
  createCheckoutSession,
  createTransfer,
  getStripe,
} from './stripe.js';
import { retailFromBid, mergePricingRules } from './pricing.js';

async function pushStatusLocal(pool, jobId, fromStatus, toStatus, actorUserId, note) {
  await pool.query(`UPDATE managed_jobs SET status=$1, updated_at=NOW() WHERE id=$2`, [toStatus, jobId]);
  await pool.query(
    `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [jobId, fromStatus || null, toStatus, actorUserId || null, note || null]
  );
}

const PLAN_CATALOG = {
  diy_plus: { family: 'diy', label: 'DIY Plus', amount: 14.99, interval: 'month' },
  diy_plus_annual: { family: 'diy', label: 'DIY Plus Annual', amount: 119, interval: 'year' },
  homecare_plus: { family: 'diy', label: 'HomeCare Plus', amount: 24.99, interval: 'month' },
  property_pro: { family: 'property', label: 'Property Pro', amount: 49, interval: 'month' },
  portfolio: { family: 'property', label: 'Portfolio', amount: 149, interval: 'month' },
  brokerage: { family: 'property', label: 'Brokerage / White Label', amount: 499, interval: 'month' },
  contractor_pro: { family: 'contractor', label: 'Contractor Pro', amount: 99, interval: 'month' },
  contractor_growth: { family: 'contractor', label: 'Contractor Growth', amount: 249, interval: 'month' },
};

async function audit(pool, actorUserId, action, entityType, entityId, detail) {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorUserId || null, action, entityType || null, entityId != null ? String(entityId) : null, JSON.stringify(detail || {})]
  );
}

async function sendEmailSafe({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.log(`[Email skipped] to=${to} subject=${subject}`);
    return { ok: true, simulated: true };
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || `${brand.productName} <onboarding@resend.dev>`,
      to,
      subject,
      html,
    });
    return { ok: true, simulated: false };
  } catch (e) {
    console.error('[Resend]', e.message);
    return { ok: false, message: e.message };
  }
}

async function sendSmsSafe({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    console.log(`[SMS skipped] to=${to} body=${body}`);
    return { ok: true, simulated: true };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[Twilio]', text);
      return { ok: false, message: text };
    }
    return { ok: true, simulated: false };
  } catch (e) {
    console.error('[Twilio]', e.message);
    return { ok: false, message: e.message };
  }
}

function notifyOps(message) {
  const url = process.env.SLACK_WEBHOOK_URL?.trim() || process.env.N8N_WEBHOOK_URL?.trim();
  if (!url) {
    console.log(`[Ops alert] ${message}`);
    return;
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  }).catch((e) => console.error('[Ops webhook]', e.message));
}

export function registerPlatformRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, pushStatus }) {
  const statusPush = typeof pushStatus === 'function' ? pushStatus : pushStatusLocal;
  // ── Catalog / health for integrations ────────────────────────────────────
  app.get('/api/platform/status', requireAuth, requireAdmin, (_req, res) => {
    res.json({
      ok: true,
      stripe: stripeConfigured(),
      resend: Boolean(process.env.RESEND_API_KEY?.trim()),
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim()),
      places: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim()),
      slackOrN8n: Boolean(process.env.SLACK_WEBHOOK_URL?.trim() || process.env.N8N_WEBHOOK_URL?.trim()),
      sentry: Boolean(process.env.SENTRY_DSN?.trim()),
      posthog: Boolean(process.env.POSTHOG_API_KEY?.trim()),
      storage: process.env.MEDIA_STORAGE_MODE || 'inline',
      authMode: 'jwt+neon',
      note: 'Neon + Express provides the managed source of truth; RLS-equivalent checks are enforced in route handlers.',
    });
  });

  app.get('/api/admin/subscription-stats', requireAuth, requireAdmin, async (req, res) => {
    try {
      // Get all homeowners with active subscription details
      const { rows: homeowners } = await pool.query(
        `SELECT u.id, u.name, u.email, u.plan_code, u.created_at,
                s.current_period_end, s.meta AS sub_meta
         FROM users u
         LEFT JOIN (
           SELECT DISTINCT ON (user_id) user_id, current_period_end, meta
           FROM subscriptions
           WHERE plan_code = 'pro_membership' AND status = 'active'
           ORDER BY user_id, created_at DESC
         ) s ON s.user_id = u.id
         WHERE u.role='homeowner'
         ORDER BY u.created_at DESC`
      );

      const totalHomeowners = homeowners.length;
      const subscribedCount = homeowners.filter(h => h.plan_code === 'pro_membership').length;
      const nonSubscribedCount = totalHomeowners - subscribedCount;

      const customers = homeowners.map(h => {
        let isTrial = false;
        let trialDaysLeft = 0;
        const now = new Date();
        const end = h.current_period_end ? new Date(h.current_period_end) : null;
        
        if (h.plan_code === 'pro_membership' && end && end > now) {
          const meta = h.sub_meta ? (typeof h.sub_meta === 'string' ? JSON.parse(h.sub_meta) : h.sub_meta) : {};
          if (meta.isLocalTrial) {
            isTrial = true;
            const diffTime = end - now;
            trialDaysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          }
        }

        return {
          id: h.id,
          name: h.name,
          email: h.email,
          planCode: h.plan_code,
          createdAt: h.created_at,
          currentPeriodEnd: h.current_period_end,
          isTrial,
          trialDaysLeft,
        };
      });

      res.json({
        ok: true,
        stats: {
          totalHomeowners,
          subscribedCount,
          nonSubscribedCount,
        },
        customers,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error fetching subscription stats.' });
    }
  });

  app.post('/api/admin/subscriptions/update', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const b = req.body || {};
      const { homeownerUserId, planCode, staffName } = b;
      if (!homeownerUserId) {
        return res.status(400).json({ ok: false, message: 'homeownerUserId is required.' });
      }
      if (!staffName || !staffName.trim()) {
        return res.status(400).json({ ok: false, message: 'Staff name is required for audit logs.' });
      }

      // Update users table plan_code
      await pool.query(
        `UPDATE users SET plan_code=$1 WHERE id=$2 AND role='homeowner'`,
        [planCode === 'pro_membership' ? 'pro_membership' : null, homeownerUserId]
      );

      // Log subscription record
      const meta = JSON.stringify({
        isLocalTrial: false,
        editedByStaffName: staffName.trim(),
        editedByStaffEmail: req.authUser.email,
        editedAt: new Date().toISOString(),
      });

      if (planCode === 'pro_membership') {
        // Insert active subscription
        await pool.query(
          `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
           VALUES ($1, 'pro_membership', 'pro_membership', 'active', TRUE, NOW() + INTERVAL '1 year', $2)`,
          [homeownerUserId, meta]
        );
      } else {
        // Deactivate active subscriptions
        await pool.query(
          `UPDATE subscriptions SET status='canceled', meta=$1 WHERE user_id=$2 AND plan_code='pro_membership'`,
          [meta, homeownerUserId]
        );
      }

      // Insert audit log
      await pool.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'subscription_change_by_admin', 'user', $2, $3)`,
        [
          req.authUser.id,
          String(homeownerUserId),
          JSON.stringify({ planCode, staffName, editedAt: new Date().toISOString() })
        ]
      );

      res.json({ ok: true, message: 'Subscription status updated successfully.' });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: e.message });
    }
  });


  app.get('/api/platform/plans', async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
      const rules = rows[0]?.rules || {};
      const proPrice = Number(rules.pro_subscription_price != null ? rules.pro_subscription_price : 0);
      const plans = Object.entries(PLAN_CATALOG).map(([code, p]) => ({ code, ...p }));
      plans.push({
        code: 'pro_membership',
        family: 'diy',
        label: 'Pro Membership',
        amount: proPrice,
        interval: 'month',
        trialDays: 7,
      });
      res.json({ ok: true, plans });
    } catch {
      res.json({
        ok: true,
        plans: [
          ...Object.entries(PLAN_CATALOG).map(([code, p]) => ({ code, ...p })),
          { code: 'pro_membership', family: 'diy', label: 'Pro Membership', amount: 0, interval: 'month', trialDays: 7 }
        ]
      });
    }
  });

  // ── Subscriptions (Stripe Billing-ready; simulates without Stripe) ────────
  app.post('/api/subscriptions/checkout', requireAuth, async (req, res) => {
    try {
      const planCode = String(req.body?.planCode || '');
      let amount = 0;
      let label = '';
      let family = '';
      let trialDays = 0;

      if (planCode === 'pro_membership') {
        const { rows: ruleRows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
        const rules = ruleRows[0]?.rules || {};
        amount = Number(rules.pro_subscription_price != null ? rules.pro_subscription_price : 0);
        label = 'Pro Membership';
        family = 'diy';

        // Check if the user has EVER had a subscription for pro_membership
        const { rows: existingSubs } = await pool.query(
          `SELECT id FROM subscriptions WHERE user_id = $1 AND plan_code = 'pro_membership'`,
          [req.authUser.id]
        );

        if (existingSubs.length === 0) {
          // This is their first time subscribing!
          // They get a 7-day local free trial (without Stripe redirect)
          const { rows } = await pool.query(
            `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
             VALUES ($1,$2,$3,'active',true, NOW() + INTERVAL '7 days', $4) RETURNING *`,
            [req.authUser.id, planCode, family, JSON.stringify({ planCode, amount, label, family, isLocalTrial: true })]
          );
          await pool.query(`UPDATE users SET plan_code=$1 WHERE id=$2`, [planCode, req.authUser.id]);
          await audit(pool, req.authUser.id, 'subscription_started', 'subscription', rows[0].id, { planCode, localTrial: true });
          return res.json({ ok: true, simulated: true, subscription: rows[0] });
        } else {
          // They already had a trial, so Stripe comes now with NO trial days!
          trialDays = 0;
        }
      } else {
        const plan = PLAN_CATALOG[planCode];
        if (!plan) return res.status(400).json({ ok: false, message: 'Unknown plan.' });
        amount = plan.amount;
        label = plan.label;
        family = plan.family;
        trialDays = 0;
      }

      const simulate = shouldSimulatePayment(req.body?.simulate === true);
      if (simulate) {
        const { rows } = await pool.query(
          `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
           VALUES ($1,$2,$3,'active',true, NOW() + INTERVAL '30 days', $4) RETURNING *`,
          [req.authUser.id, planCode, family, JSON.stringify({ planCode, amount, label, family })]
        );
        await pool.query(`UPDATE users SET plan_code=$1 WHERE id=$2`, [planCode, req.authUser.id]);
        await audit(pool, req.authUser.id, 'subscription_started', 'subscription', rows[0].id, { planCode, simulated: true });
        return res.json({ ok: true, simulated: true, subscription: rows[0] });
      }

      const jobId = req.body?.jobId ? Number(req.body.jobId) : null;
      const successPath = jobId
        ? `/?paid=subscription&plan=${planCode}&jobId=${jobId}`
        : `/?paid=subscription&plan=${planCode}`;
      const cancelPath = jobId
        ? `/?canceled=subscription&jobId=${jobId}`
        : `/?canceled=subscription`;

      const origin = req.get('origin') || req.get('referer');
      const checkout = await createCheckoutSession({
        amountCents: Math.round(amount * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} ${label}`,
        successPath,
        cancelPath,
        mode: 'subscription',
        trialDays,
        origin,
        metadata: {
          paymentType: 'subscription',
          planCode,
          userId: String(req.authUser.id),
          jobId: jobId ? String(jobId) : '',
        },
      });

      if (checkout.simulated) {
        const { rows } = await pool.query(
          `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
           VALUES ($1,$2,$3,'active',true, NOW() + INTERVAL '30 days', $4) RETURNING *`,
          [req.authUser.id, planCode, family, JSON.stringify({ planCode, amount, label, family })]
        );
        await pool.query(`UPDATE users SET plan_code=$1 WHERE id=$2`, [planCode, req.authUser.id]);
        await audit(pool, req.authUser.id, 'subscription_started', 'subscription', rows[0].id, { planCode, simulated: true });
        return res.json({ ok: true, simulated: true, subscription: rows[0] });
      }

      await pool.query(
        `INSERT INTO payments (user_id, payment_type, amount, status, stripe_session_id, simulated, meta)
         VALUES ($1,'subscription',$2,'pending',$3,false,$4)`,
        [req.authUser.id, amount, checkout.sessionId, JSON.stringify({ planCode })]
      );
      res.json({ ok: true, simulated: false, url: checkout.url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not start subscription.' });
    }
  });

  app.get('/api/subscriptions/mine', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      res.json({ ok: true, subscriptions: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Direct lead unlock ───────────────────────────────────────────────────
  app.post('/api/direct/jobs/:id/unlock', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = rows[0];
      if (String(job.job_mode || 'managed') !== 'direct') {
        return res.status(400).json({ ok: false, message: 'Not a Direct lead job.' });
      }
      const fee = Number(req.body?.amount || 65);
      const simulate = shouldSimulatePayment(true);
      if (simulate) {
        await pool.query(
          `INSERT INTO lead_purchases (job_id, contractor_user_id, amount, status, unlocked_at, simulated)
           VALUES ($1,$2,$3,'unlocked',NOW(),true)
           ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET status='unlocked', unlocked_at=NOW()`,
          [jobId, req.authUser.id, fee]
        );
        await audit(pool, req.authUser.id, 'lead_unlocked', 'managed_job', jobId, { fee, simulated: true });
        return res.json({
          ok: true,
          simulated: true,
          contact: {
            fullAddress: job.full_address,
            contactName: job.contact_name,
            contactPhone: job.contact_phone,
          },
        });
      }
      const origin = req.get('origin') || req.get('referer');
      const checkout = await createCheckoutSession({
        amountCents: Math.round(fee * 100),
        customerEmail: req.authUser.email,
        description: `${brand.productName} Direct lead unlock`,
        successPath: `/?paid=lead&job=${jobId}`,
        cancelPath: `/?canceled=lead&job=${jobId}`,
        origin,
        metadata: {
          paymentType: 'lead_unlock',
          jobId: String(jobId),
          userId: String(req.authUser.id),
        },
      });
      await pool.query(
        `INSERT INTO lead_purchases (job_id, contractor_user_id, amount, status, stripe_session_id, simulated)
         VALUES ($1,$2,$3,'pending',$4,false)
         ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET stripe_session_id=EXCLUDED.stripe_session_id, status='pending'`,
        [jobId, req.authUser.id, fee, checkout.sessionId]
      );
      res.json({ ok: true, simulated: false, url: checkout.url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not unlock lead.' });
    }
  });

  app.put('/api/admin/managed/jobs/:id/mode', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const mode = String(req.body?.jobMode || '').toLowerCase();
      if (!['managed', 'direct'].includes(mode)) {
        return res.status(400).json({ ok: false, message: 'jobMode must be managed or direct.' });
      }
      await pool.query(`UPDATE managed_jobs SET job_mode=$1, updated_at=NOW() WHERE id=$2`, [mode, jobId]);
      await audit(pool, req.authUser.id, 'job_mode_set', 'managed_job', jobId, { mode });
      res.json({ ok: true, jobMode: mode });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Change orders ────────────────────────────────────────────────────────
  app.post('/api/managed/jobs/:id/change-orders', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = rows[0];
      const isContractor = Number(job.assigned_contractor_user_id) === Number(req.authUser.id);
      if (!isContractor && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const net = Number(req.body?.contractorNet);
      if (!(net > 0) || !req.body?.description) {
        return res.status(400).json({ ok: false, message: 'description and contractorNet required.' });
      }
      const { rows: inserted } = await pool.query(
        `INSERT INTO change_orders (job_id, contractor_user_id, description, media_data_url, contractor_net, status)
         VALUES ($1,$2,$3,$4,$5,'pending_admin') RETURNING *`,
        [jobId, req.authUser.id, String(req.body.description).slice(0, 4000), req.body.mediaDataUrl || null, net]
      );
      if (typeof statusPush === 'function') {
        await statusPush(pool, jobId, job.status, 'change_order_pending', req.authUser.id, 'Change order submitted');
      }
      res.json({ ok: true, changeOrder: inserted[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not create change order.' });
    }
  });

  app.post('/api/admin/change-orders/:id/price', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM change_orders WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      let retail = Number(req.body?.retailAmount);
      if (!(retail > 0)) {
        const priced = retailFromBid(Number(rows[0].contractor_net), mergePricingRules({}));
        retail = Number(priced.customer_final_retail_amount || Number(rows[0].contractor_net) * 1.35);
      }
      const { rows: updated } = await pool.query(
        `UPDATE change_orders SET retail_amount=$1, status='awaiting_customer' WHERE id=$2 RETURNING *`,
        [retail, id]
      );
      res.json({ ok: true, changeOrder: updated[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not price change order.' });
    }
  });

  app.post('/api/managed/jobs/:id/change-orders/:coId/approve', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const coId = Number(req.params.coId);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      if (Number(jobs[0].homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows } = await pool.query(
        `UPDATE change_orders SET status='approved', approved_at=NOW()
         WHERE id=$1 AND job_id=$2 RETURNING *`,
        [coId, jobId]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Change order not found.' });
      if (typeof statusPush === 'function') {
        await statusPush(pool, jobId, 'change_order_pending', 'work_started', req.authUser.id, 'Change order approved');
      }
      res.json({ ok: true, changeOrder: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not approve change order.' });
    }
  });

  app.get('/api/managed/jobs/:id/change-orders', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT * FROM change_orders WHERE job_id=$1 ORDER BY created_at DESC`,
        [jobId]
      );
      const role = req.authUser.role;
      const mapped = rows.map((r) => {
        const base = {
          id: Number(r.id),
          jobId: Number(r.job_id),
          description: r.description,
          status: r.status,
          createdAt: r.created_at,
          approvedAt: r.approved_at,
        };
        if (role === 'admin' || role === 'contractor') base.contractorNet = Number(r.contractor_net);
        if (role === 'admin' || role === 'homeowner') {
          base.retailAmount = r.retail_amount != null ? Number(r.retail_amount) : null;
        }
        return base;
      });
      res.json({ ok: true, changeOrders: mapped });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Refunds / disputes / payout holds ────────────────────────────────────
  app.post('/api/admin/payments/:id/refund', requireAuth, requireAdmin, async (req, res) => {
    try {
      const paymentId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM payments WHERE id=$1`, [paymentId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Payment not found.' });
      const amount = Number(req.body?.amount ?? rows[0].amount);
      const reason = String(req.body?.reason || 'admin_refund').slice(0, 500);
      const simulate = shouldSimulatePayment(true) || !rows[0].stripe_payment_intent;
      
      let stripeRefundId = null;
      if (!simulate && rows[0].stripe_payment_intent) {
        const stripe = await getStripe();
        if (stripe) {
          const refund = await stripe.refunds.create({
            payment_intent: rows[0].stripe_payment_intent,
            amount: Math.round(amount * 100),
          });
          stripeRefundId = refund.id;
        }
      }

      const { rows: refundRows } = await pool.query(
        `INSERT INTO refunds (payment_id, job_id, amount, reason, status, simulated, created_by, stripe_refund_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          paymentId,
          rows[0].job_id,
          amount,
          reason,
          'succeeded',
          simulate,
          req.authUser.id,
          simulate ? `sim_re_${Date.now()}` : stripeRefundId,
        ]
      );
      await pool.query(`UPDATE payments SET status='refunded' WHERE id=$1`, [paymentId]);
      if (rows[0].job_id && typeof statusPush === 'function') {
        const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [rows[0].job_id]);
        await statusPush(pool, rows[0].job_id, jobs[0]?.status, 'refunded', req.authUser.id, reason);
      }
      await audit(pool, req.authUser.id, 'payment_refunded', 'payment', paymentId, { amount, reason, simulate, stripeRefundId });
      notifyOps(`Refund ${simulate ? '(sim) ' : ''}$${amount} on payment #${paymentId}`);
      res.json({ ok: true, refund: refundRows[0], simulated: simulate });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: e instanceof Error ? e.message : 'Could not refund.' });
    }
  });

  app.post('/api/admin/disputes', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO disputes (payment_id, job_id, amount, reason, status, meta)
         VALUES ($1,$2,$3,$4,'open',$5) RETURNING *`,
        [
          req.body?.paymentId || null,
          req.body?.jobId || null,
          Number(req.body?.amount || 0),
          String(req.body?.reason || '').slice(0, 500),
          JSON.stringify(req.body?.meta || {}),
        ]
      );
      if (req.body?.jobId && typeof statusPush === 'function') {
        const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [req.body.jobId]);
        await statusPush(pool, req.body.jobId, jobs[0]?.status, 'disputed', req.authUser.id, 'Dispute opened');
      }
      res.json({ ok: true, dispute: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not open dispute.' });
    }
  });

  app.post('/api/admin/transfers/:id/hold', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || 'Admin hold').slice(0, 500);
      const { rows } = await pool.query(
        `UPDATE transfers SET status='held', hold_reason=$1 WHERE id=$2 RETURNING *`,
        [reason, id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Transfer not found.' });
      res.json({ ok: true, transfer: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not hold payout.' });
    }
  });

  app.post('/api/admin/transfers/:id/release', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM transfers WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Transfer not found.' });
      const amount = Number(req.body?.amount ?? rows[0].amount);
      const simulate = shouldSimulatePayment(true) || !stripeConfigured();
      let transferId = rows[0].stripe_transfer_id;
      if (!simulate && req.body?.destinationAccountId) {
        const result = await createTransfer({
          amountCents: Math.round(amount * 100),
          destinationAccountId: req.body.destinationAccountId,
          transferGroup: `job_${rows[0].job_id}`,
          metadata: { jobId: String(rows[0].job_id), partial: 'true' },
        });
        transferId = result.transferId;
      }
      const { rows: updated } = await pool.query(
        `UPDATE transfers SET status='paid', amount=$1, stripe_transfer_id=$2, hold_reason=NULL, simulated=$3
         WHERE id=$4 RETURNING *`,
        [amount, transferId || `sim_tr_${Date.now()}`, simulate, id]
      );
      res.json({ ok: true, transfer: updated[0], simulated: simulate });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not release payout.' });
    }
  });

  app.post('/api/admin/transfers/:id/reverse', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        `UPDATE transfers SET status='reversed', reversed_at=NOW() WHERE id=$1 RETURNING *`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Transfer not found.' });
      res.json({ ok: true, transfer: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not reverse transfer.' });
    }
  });

  // ── Payment schedules (deposit / progress / final) ───────────────────────
  app.put('/api/admin/managed/jobs/:id/payment-schedule', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      await pool.query(`DELETE FROM payment_schedules WHERE job_id=$1 AND status='pending'`, [jobId]);
      const saved = [];
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i];
        const { rows } = await pool.query(
          `INSERT INTO payment_schedules (job_id, label, amount, due_at, sort_order)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [jobId, String(it.label || `Payment ${i + 1}`), Number(it.amount || 0), it.dueAt || null, i]
        );
        saved.push(rows[0]);
      }
      res.json({ ok: true, schedule: saved });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not save schedule.' });
    }
  });

  app.get('/api/managed/jobs/:id/payment-schedule', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM payment_schedules WHERE job_id=$1 ORDER BY sort_order ASC, id ASC`,
        [Number(req.params.id)]
      );
      res.json({ ok: true, schedule: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Coverage / matching / ops deadlines ──────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/match', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const category = String(jobs[0].category || '').toLowerCase();
      const { rows: contractors } = await pool.query(
        `SELECT id, name, email, trade, compliance_status FROM users
         WHERE role='contractor' AND COALESCE(is_blocked,false)=false
           AND LOWER(COALESCE(compliance_status,''))='approved'`
      );
      const matches = contractors.filter((c) => {
        const trade = String(c.trade || '').toLowerCase();
        if (!category) return true;
        return trade.includes(category) || category.includes(trade.split(' ')[0] || '');
      });
      const coverage = matches.length === 0 ? 'no_coverage' : matches.length < 2 ? 'limited' : 'covered';
      const deadlineHours = Number(req.body?.responseHours || 4);
      await pool.query(
        `UPDATE managed_jobs SET coverage_state=$1, invite_deadline_at=NOW() + ($2 || ' hours')::interval, updated_at=NOW()
         WHERE id=$3`,
        [coverage, String(deadlineHours), jobId]
      );
      res.json({
        ok: true,
        coverageState: coverage,
        matches: matches.map((m) => ({ id: Number(m.id), name: m.name, email: m.email, trade: m.trade })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Match failed.' });
    }
  });

  app.get('/api/admin/ops/overdue', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, booking_id, title, status, coverage_state, invite_deadline_at, assigned_contractor_user_id
         FROM managed_jobs
         WHERE invite_deadline_at IS NOT NULL
           AND invite_deadline_at < NOW()
           AND status IN ('awaiting_contractor','contractor_invited','awaiting_bid')
         ORDER BY invite_deadline_at ASC
         LIMIT 100`
      );
      res.json({ ok: true, overdue: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── DIY projects + parts catalog ─────────────────────────────────────────
  app.post('/api/diy/projects', requireAuth, async (req, res) => {
    try {
      const plan = req.body?.plan || {};
      const { rows } = await pool.query(
        `INSERT INTO diy_projects (user_id, job_id, title, plan, steps_completed)
         VALUES ($1,$2,$3,$4,'[]') RETURNING *`,
        [
          req.authUser.id,
          req.body?.jobId || null,
          String(req.body?.title || plan.summary || 'DIY project').slice(0, 200),
          JSON.stringify(plan),
        ]
      );
      res.json({ ok: true, project: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not save DIY project.' });
    }
  });

  app.get('/api/diy/projects', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM diy_projects WHERE user_id=$1 ORDER BY updated_at DESC`,
        [req.authUser.id]
      );
      res.json({ ok: true, projects: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/diy/projects/:id/steps', requireAuth, async (req, res) => {
    try {
      const steps = Array.isArray(req.body?.stepsCompleted) ? req.body.stepsCompleted : [];
      const { rows } = await pool.query(
        `UPDATE diy_projects SET steps_completed=$1, updated_at=NOW()
         WHERE id=$2 AND user_id=$3 RETURNING *`,
        [JSON.stringify(steps), Number(req.params.id), req.authUser.id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      res.json({ ok: true, project: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/parts', async (req, res) => {
    try {
      const q = String(req.query.q || '').trim().toLowerCase();
      const { rows } = await pool.query(
        `SELECT * FROM parts_catalog WHERE approved=true ORDER BY name ASC LIMIT 100`
      );
      const filtered = q
        ? rows.filter((r) => `${r.name} ${r.category} ${r.brand}`.toLowerCase().includes(q))
        : rows;
      res.json({ ok: true, parts: filtered });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Property opportunity budgets + units ─────────────────────────────────
  app.get('/api/properties/:id/opportunity-budgets', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      // Retail ranges derived from linked jobs on this property
      const { rows } = await pool.query(
        `SELECT customer_retail_estimate_low AS low, customer_retail_estimate_high AS high, ai_assessment, category
         FROM managed_jobs WHERE property_id=$1 AND homeowner_user_id=$2`,
        [propertyId, req.authUser.id]
      );
      let essential = 0;
      let moveIn = 0;
      let resale = 0;
      for (const j of rows) {
        const mid = (Number(j.low || 0) + Number(j.high || 0)) / 2;
        let assessment = j.ai_assessment;
        if (typeof assessment === 'string') {
          try {
            assessment = JSON.parse(assessment);
          } catch {
            assessment = null;
          }
        }
        const urg = String(assessment?.urgency || '').toLowerCase();
        if (urg === 'high' || urg === 'emergency' || urg === 'critical') essential += mid;
        else moveIn += mid;
        resale += mid * 1.15;
      }
      if (!rows.length) {
        essential = 0;
        moveIn = 0;
        resale = 0;
      }
      res.json({
        ok: true,
        budgets: {
          essential: { label: 'Essential / Safety', amount: Math.round(essential) },
          moveIn: { label: 'Move-In / Rental Ready', amount: Math.round(essential + moveIn) },
          resale: { label: 'Resale / Upgrade', amount: Math.round(Math.max(resale, essential + moveIn)) },
        },
        jobCount: rows.length,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/properties/:id/units', requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const { rows: props } = await pool.query(`SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`, [
        propertyId,
        req.authUser.id,
      ]);
      if (!props[0] && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows } = await pool.query(
        `INSERT INTO property_units (property_id, unit_label, tenant_name, tenant_email, approval_limit, emergency_limit)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          propertyId,
          String(req.body?.unitLabel || 'Unit').slice(0, 80),
          req.body?.tenantName || null,
          req.body?.tenantEmail || null,
          req.body?.approvalLimit ?? null,
          req.body?.emergencyLimit ?? null,
        ]
      );
      res.json({ ok: true, unit: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not add unit.' });
    }
  });

  app.get('/api/properties/:id/units', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM property_units WHERE property_id=$1 ORDER BY id ASC`,
        [Number(req.params.id)]
      );
      res.json({ ok: true, units: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Inspection converter (lightweight AI extraction stub + structured items) ─
  app.post('/api/inspections/convert', requireAuth, async (req, res) => {
    try {
      const text = String(req.body?.reportText || '').slice(0, 20000);
      if (!text.trim()) return res.status(400).json({ ok: false, message: 'reportText required.' });
      const lines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 12)
        .slice(0, 40);
      const items = lines.map((line, i) => ({
        id: i + 1,
        finding: line.slice(0, 240),
        urgency: /electr|gas|mold|struct|sewage|leak/i.test(line) ? 'high' : 'medium',
        trade: /plumb|leak|pipe|water/i.test(line)
          ? 'plumbing'
          : /electr|outlet|panel/i.test(line)
            ? 'electrical'
            : /hvac|furnace|ac /i.test(line)
              ? 'hvac'
              : 'general',
      }));
      res.json({
        ok: true,
        items,
        disclaimer: 'Extracted findings require admin review before becoming work orders.',
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Conversion failed.' });
    }
  });

  // ── Partner portal (login + referrals) ───────────────────────────────────
  app.post('/api/partner/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const { rows } = await pool.query(
        `SELECT pu.*, p.code AS partner_code, p.name AS partner_name
         FROM partner_users pu JOIN partners p ON p.id = pu.partner_id
         WHERE LOWER(pu.email)=LOWER($1) LIMIT 1`,
        [email]
      );
      if (!rows[0] || !rows[0].password_hash) {
        return res.status(401).json({ ok: false, message: 'Invalid partner credentials.' });
      }
      const match = await bcrypt.compare(password, rows[0].password_hash);
      if (!match) return res.status(401).json({ ok: false, message: 'Invalid partner credentials.' });
      const token = crypto.createHash('sha256').update(`${rows[0].id}:${Date.now()}:${password}`).digest('hex');
      // Lightweight opaque token stored in audit for pilot (JWT-style optional later)
      await audit(pool, null, 'partner_login', 'partner_user', rows[0].id, { email });
      res.json({
        ok: true,
        token,
        partner: {
          id: Number(rows[0].partner_id),
          code: rows[0].partner_code,
          name: rows[0].partner_name,
          email: rows[0].email,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Partner login failed.' });
    }
  });

  app.post('/api/admin/partners/:id/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const partnerId = Number(req.params.id);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || 'partner123');
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO partner_users (partner_id, email, name, password_hash)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (partner_id, email) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=EXCLUDED.name
         RETURNING id, partner_id, email, name`,
        [partnerId, email, req.body?.name || email, hash]
      );
      res.json({ ok: true, user: rows[0], tempPassword: password });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not create partner user.' });
    }
  });

  app.get('/api/partner/:code/referrals', async (req, res) => {
    try {
      const code = String(req.params.code || '').toUpperCase();
      const { rows } = await pool.query(
        `SELECT id, status, created_at, job_id FROM partner_referrals WHERE UPPER(partner_code)=$1 ORDER BY created_at DESC LIMIT 100`,
        [code]
      );
      res.json({
        ok: true,
        referrals: rows.map((r) => ({
          id: Number(r.id),
          status: r.status,
          createdAt: r.created_at,
          jobId: r.job_id,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Contractor CRM notes ─────────────────────────────────────────────────
  app.get('/api/contractor/crm/notes', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(
        `SELECT * FROM contractor_crm_notes WHERE contractor_user_id=$1 ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      res.json({ ok: true, notes: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/contractor/crm/notes', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(
        `INSERT INTO contractor_crm_notes (contractor_user_id, customer_name, note, due_at)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.authUser.id, req.body?.customerName || null, String(req.body?.note || '').slice(0, 4000), req.body?.dueAt || null]
      );
      res.json({ ok: true, note: rows[0] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not save note.' });
    }
  });

  // ── Places proxy ─────────────────────────────────────────────────────────
  app.get('/api/places/autocomplete', requireAuth, async (req, res) => {
    try {
      const key = process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim();
      const input = String(req.query.input || '').trim();
      if (!input) return res.status(400).json({ ok: false, message: 'input required' });
      if (!key) {
        return res.json({
          ok: true,
          simulated: true,
          predictions: [{ description: input, place_id: 'sim_place' }],
        });
      }
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&types=address`;
      const data = await fetch(url).then((r) => r.json());
      res.json({ ok: true, simulated: false, predictions: data.predictions || [] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Places lookup failed.' });
    }
  });

  // ── Notifications ────────────────────────────────────────────────────────
  app.post('/api/notify/test', requireAuth, requireAdmin, async (req, res) => {
    try {
      const email = await sendEmailSafe({
        to: req.body?.email || req.authUser.email,
        subject: `${brand.productName} notification test`,
        html: `<p>Test email from ${brand.productName}.</p>`,
      });
      const sms = await sendSmsSafe({
        to: req.body?.phone || '',
        body: `${brand.productName} SMS test`,
      });
      notifyOps(`${brand.productName} ops test from admin ${req.authUser.email}`);
      res.json({ ok: true, email, sms });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Notify failed.' });
    }
  });

  // ── MFA (email OTP pilot) ────────────────────────────────────────────────
  app.post('/api/auth/mfa/start', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'admin' && !req.body?.force) {
        return res.status(403).json({ ok: false, message: 'Admin MFA only in pilot.' });
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hash = await bcrypt.hash(code, 8);
      await pool.query(
        `INSERT INTO mfa_challenges (user_id, code_hash, expires_at) VALUES ($1,$2, NOW() + INTERVAL '10 minutes')`,
        [req.authUser.id, hash]
      );
      await sendEmailSafe({
        to: req.authUser.email,
        subject: `${brand.productName} admin verification code`,
        html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
      });
      await pool.query(`UPDATE users SET mfa_enabled=true WHERE id=$1`, [req.authUser.id]);
      res.json({ ok: true, sent: true, demoCode: process.env.NODE_ENV === 'production' ? undefined : code });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not start MFA.' });
    }
  });

  app.post('/api/auth/mfa/verify', requireAuth, async (req, res) => {
    try {
      const code = String(req.body?.code || '');
      const { rows } = await pool.query(
        `SELECT * FROM mfa_challenges WHERE user_id=$1 AND consumed=false AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [req.authUser.id]
      );
      if (!rows[0]) return res.status(400).json({ ok: false, message: 'No active challenge.' });
      const match = await bcrypt.compare(code, rows[0].code_hash);
      if (!match) return res.status(401).json({ ok: false, message: 'Invalid code.' });
      await pool.query(`UPDATE mfa_challenges SET consumed=true WHERE id=$1`, [rows[0].id]);
      res.json({ ok: true, verified: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Verify failed.' });
    }
  });

  // ── Media storage (inline DB now; S3-ready via MEDIA_STORAGE_MODE) ────────
  app.post('/api/media/upload', requireAuth, async (req, res) => {
    try {
      const dataUrl = String(req.body?.dataUrl || '');
      if (!dataUrl.startsWith('data:')) {
        return res.status(400).json({ ok: false, message: 'dataUrl required.' });
      }
      if (dataUrl.length > 6_000_000) {
        return res.status(400).json({ ok: false, message: 'File too large.' });
      }
      const key = `media_${req.authUser.id}_${Date.now()}`;
      const mode = process.env.MEDIA_STORAGE_MODE || 'inline';
      const { rows } = await pool.query(
        `INSERT INTO media_objects (owner_user_id, job_id, kind, storage_key, content_type, byte_size, data_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, storage_key, created_at`,
        [
          req.authUser.id,
          req.body?.jobId || null,
          req.body?.kind || 'upload',
          key,
          req.body?.contentType || null,
          dataUrl.length,
          mode === 'inline' ? dataUrl : null,
        ]
      );
      // Signed URL equivalent for inline mode
      const signedUrl = `/api/media/${rows[0].id}?token=${crypto
        .createHmac('sha256', process.env.SESSION_SECRET || 'local-dev-secret')
        .update(String(rows[0].id))
        .digest('hex')
        .slice(0, 24)}`;
      res.json({ ok: true, media: rows[0], signedUrl, mode });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Upload failed.' });
    }
  });

  app.get('/api/media/:id', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM media_objects WHERE id=$1`, [Number(req.params.id)]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (
        Number(rows[0].owner_user_id) !== Number(req.authUser.id) &&
        req.authUser.role !== 'admin'
      ) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      res.json({ ok: true, media: { id: Number(rows[0].id), dataUrl: rows[0].data_url, contentType: rows[0].content_type } });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // Commercial NTE / SLA on job
  app.put('/api/admin/managed/jobs/:id/commercial', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      await pool.query(
        `UPDATE managed_jobs SET nte_limit=$1, sla_hours=$2, updated_at=NOW() WHERE id=$3`,
        [req.body?.nteLimit ?? null, req.body?.slaHours ?? null, jobId]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });
}

export { sendEmailSafe, sendSmsSafe, notifyOps, PLAN_CATALOG };
