/**
 * Platform expansion routes: Direct leads, subscriptions, change orders,
 * refunds/disputes, payout holds, DIY, parts, partner portal, MFA, media, ops.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { brand } from './brand.js';
import { loadHomeownerProfileExtras } from './homeowner-admin-routes.js';
import {
  stripeConfigured,
  assertPaymentsAvailable,
  shouldSimulatePayment,
  createCheckoutSession,
  createTransfer,
  getStripe,
} from './stripe.js';
import { isAdminRole } from './auth-helpers.js';
import { convertPendingServiceRequest } from './managed-routes.js';
import { reconcileRefundForJob } from './payment-settlement.js';
import { FINANCIAL_EVENT, recordFinancialEvent } from './financial-ledger.js';
import { isPaidHomeCarePlan, PAID_HOME_CARE_PLAN_CODE } from './subscription-catalog.js';
import {
  syncUserHomeCareEntitlement,
  toPublicHomeCareSubscriptionDto,
  loadBestHomeCareSubscription,
  subscriptionGrantsProAccess,
  parseSubscriptionMeta,
  invalidateHomeCareEntitlementCache,
} from './subscription-state.js';
import { writeAudit } from './audit.js';
import { sendEmailSafe, sendSmsSafe, notifyOps, mailStatus } from './notify.js';
import { lookupTimezoneFromCoordinates, isValidIanaTimezone } from './property-timezone.js';
import {
  ACKNOWLEDGMENT_TYPES,
  requireHomeownerAcknowledgment,
} from './homeowner-acknowledgments.js';

const PARTNER_JWT_SECRET = process.env.SESSION_SECRET || (!process.env.NETLIFY && process.env.NODE_ENV !== 'production' ? 'local-dev-secret' : undefined);

async function pushStatusLocal(pool, jobId, fromStatus, toStatus, actorUserId, note) {
  await pool.query(`UPDATE managed_jobs SET status=$1, updated_at=NOW() WHERE id=$2`, [toStatus, jobId]);
  await pool.query(
    `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [jobId, fromStatus || null, toStatus, actorUserId || null, note || null]
  );
}

/** Homeowner owner, assigned/invited contractor, or admin may access a managed job. */
async function assertManagedJobAccess(pool, jobId, authUser) {
  const id = Number(jobId);
  if (!Number.isFinite(id)) return { status: 400, message: 'Invalid job id.' };
  const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [id]);
  const job = rows[0];
  if (!job) return { status: 404, message: 'Job not found.' };
  if (isAdminRole(authUser)) return { job };
  if (authUser?.role === 'homeowner' && Number(job.homeowner_user_id) === Number(authUser.id)) {
    return { job };
  }
  if (authUser?.role === 'contractor') {
    if (Number(job.assigned_contractor_user_id) === Number(authUser.id)) return { job };
    const { rows: inv } = await pool.query(
      `SELECT 1 FROM job_invitations WHERE job_id=$1 AND contractor_user_id=$2 LIMIT 1`,
      [id, authUser.id]
    );
    if (inv[0]) return { job };
  }
  return { status: 403, message: 'Not allowed.' };
}

function serializeChangeOrder(row, role) {
  const base = {
    id: Number(row.id),
    jobId: Number(row.job_id),
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
  if (role === 'admin' || role === 'contractor') {
    base.contractorNet = row.contractor_net != null ? Number(row.contractor_net) : null;
  }
  if (role === 'admin' || role === 'homeowner') {
    base.retailAmount = row.retail_amount != null ? Number(row.retail_amount) : null;
  }
  return base;
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

async function resolveSubscriptionPlan(pool, planCode, lookupManagedPlan) {
  const managed = await lookupManagedPlan(pool, planCode);
  if (managed && managed.active) {
    return {
      amount: Number(managed.amount) || 0,
      label: managed.name,
      family: 'diy',
      trialDays: Number(managed.trialDays) || 0,
      unlocksDiy: Boolean(managed.unlocksDiy),
      interval: managed.interval === 'year' ? 'year' : 'month',
    };
  }
  if (planCode === PAID_HOME_CARE_PLAN_CODE || planCode === 'pro_membership' || planCode === 'homecare') {
    const { rows: ruleRows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
    const rules = ruleRows[0]?.rules || {};
    const amount = Number(
      rules.homecare_subscription_price != null
        ? rules.homecare_subscription_price
        : rules.pro_subscription_price != null
          ? rules.pro_subscription_price
          : 0
    );
    return {
      amount,
      label: planCode === PAID_HOME_CARE_PLAN_CODE ? 'HomeCare Pro' : 'Pro Membership',
      family: 'diy',
      trialDays: 7,
      unlocksDiy: true,
      interval: 'month',
    };
  }
  const plan = PLAN_CATALOG[planCode];
  if (!plan) return null;
  return {
    amount: plan.amount,
    label: plan.label,
    family: plan.family,
    trialDays: 0,
    unlocksDiy: false,
    interval: plan.interval === 'year' ? 'year' : 'month',
  };
}

async function startSubscriptionCheckout(pool, {
  userId,
  userEmail,
  planCode,
  jobId,
  returnTo,
  origin,
  lookupManagedPlan,
  auditUserId,
  pendingServiceRequestId,
}) {
  const plan = await resolveSubscriptionPlan(pool, planCode, lookupManagedPlan);
  if (!plan) {
    const err = new Error('Unknown plan.');
    err.status = 400;
    throw err;
  }

  let { amount, label, family, trialDays, unlocksDiy, interval } = plan;
  if (amount <= 0) {
    const err = new Error('This plan is included with your account — no checkout needed.');
    err.status = 400;
    throw err;
  }
  if (isPaidHomeCarePlan(planCode)) {
    const state = await syncUserHomeCareEntitlement(pool, userId, { force: true });
    if (state.isPro) {
      // A request can have been created before HomeCare was activated. If the
      // homeowner is already entitled when they return, reconcile that saved
      // request without creating another Stripe charge.
      if (pendingServiceRequestId) {
        try {
          const converted = await convertPendingServiceRequest(pool, pendingServiceRequestId, {
            amountCents: 0,
            homeownerUserId: userId,
            paymentType: 'subscription_entitlement',
          });
          return {
            alreadySubscribed: true,
            convertedPendingServiceRequest: Boolean(converted?.job),
            managedJobId: converted?.job?.id || null,
            plan: state.effectivePlanCode || state.planCode || planCode,
            status: state.status || 'active',
            cancelAtPeriodEnd: state.cancelAtPeriodEnd,
            subscription: toPublicHomeCareSubscriptionDto(state),
          };
        } catch (conversionError) {
          console.error('[PENDING SERVICE REQUEST] already-subscribed conversion failed:', conversionError?.message || conversionError);
          // Do not block an otherwise valid HomeCare entitlement.
        }
      }
      return {
        alreadySubscribed: true,
        plan: state.effectivePlanCode || state.planCode || planCode,
        status: state.status || 'active',
        cancelAtPeriodEnd: state.cancelAtPeriodEnd,
        subscription: toPublicHomeCareSubscriptionDto(state),
      };
    }
    if (state.paymentIssue) {
      const err = new Error('There is a problem with your HomeCare Pro billing. Update your payment method instead of starting a new subscription.');
      err.status = 409;
      err.code = 'BILLING_ISSUE';
      throw err;
    }
  }

  assertPaymentsAvailable();

  if (pendingServiceRequestId) {
    const { rows: pendingRows } = await pool.query(
      `SELECT id, homeowner_user_id, status
         FROM pending_service_requests
        WHERE id=$1`,
      [pendingServiceRequestId]
    );
    const pending = pendingRows[0];
    if (!pending) {
      const err = new Error('Saved service request not found.');
      err.status = 404;
      err.code = 'PENDING_SERVICE_REQUEST_NOT_FOUND';
      throw err;
    }
    if (Number(pending.homeowner_user_id) !== Number(userId)) {
      const err = new Error('You cannot use another homeowner\'s saved service request.');
      err.status = 403;
      err.code = 'PENDING_SERVICE_REQUEST_OWNER_MISMATCH';
      throw err;
    }
    if (String(pending.status || '').toLowerCase() === 'converted') {
      const err = new Error('This saved service request has already been converted.');
      err.status = 409;
      err.code = 'PENDING_SERVICE_REQUEST_ALREADY_CONVERTED';
      throw err;
    }
  }

  const returnFeature = ['diy', 'report', 'hire', 'passport', 'dashboard'].includes(String(returnTo || ''))
    ? String(returnTo)
    : '';
  const returnQuery = returnFeature ? `&returnTo=${encodeURIComponent(returnFeature)}` : '';
  const pendingQuery = pendingServiceRequestId
    ? `&pendingServiceRequestId=${encodeURIComponent(String(pendingServiceRequestId))}`
    : '';
  const successPath = jobId
    ? `/?paid=subscription&plan=${encodeURIComponent(planCode)}&jobId=${jobId}${pendingQuery}${returnQuery}`
    : `/?paid=subscription&plan=${encodeURIComponent(planCode)}${pendingQuery}${returnQuery}`;
  const cancelPath = jobId
    ? `/?canceled=subscription&plan=${encodeURIComponent(planCode)}&jobId=${jobId}${pendingQuery}`
    : `/?canceled=subscription&plan=${encodeURIComponent(planCode)}${pendingQuery}`;

  const checkout = await createCheckoutSession({
    amountCents: Math.round(amount * 100),
    customerEmail: userEmail,
    description: `${brand.productName} ${label}`,
    successPath,
    cancelPath,
    mode: 'subscription',
    trialDays,
    interval,
    origin,
    metadata: {
      paymentType: 'subscription',
      planCode,
      userId: String(userId),
      jobId: jobId ? String(jobId) : '',
      pendingServiceRequestId: pendingServiceRequestId ? String(pendingServiceRequestId) : '',
    },
    idempotencyKey: `homecare-${userId}-${planCode}-${Math.floor(Date.now() / 20000)}`,
  });

  await pool.query(
    `INSERT INTO payments (user_id, payment_type, amount, currency, status, stripe_session_id, provider, simulated, meta)
     VALUES ($1,'subscription',$2,'usd','pending',$3,'stripe',false,$4)`,
    [
      userId,
      amount,
      checkout.sessionId,
      JSON.stringify({
        planCode,
        pendingServiceRequestId: pendingServiceRequestId || null,
      }),
    ]
  );
  return { simulated: false, url: checkout.url };
}

export function registerPlatformRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, requirePermission, pushStatus, getSubscriptionPlanByCode, makeToken, rowToUser }) {
  const statusPush = typeof pushStatus === 'function' ? pushStatus : pushStatusLocal;
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();
  const lookupManagedPlan =
    typeof getSubscriptionPlanByCode === 'function'
      ? getSubscriptionPlanByCode
      : async () => null;
  // ── Catalog / health for integrations ────────────────────────────────────
  app.get('/api/platform/status', requireAuth, requireAdmin, (_req, res) => {
    const gmail = mailStatus();
    res.json({
      ok: true,
      stripe: stripeConfigured(),
      gmail: gmail.configured,
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
      const q = String(req.query.q || '').trim();
      // Get all homeowners with active subscription details
      const { rows: homeowners } = await pool.query(
        `SELECT u.id, u.name, u.email, u.phone, u.plan_code, u.created_at, u.is_blocked,
                s.current_period_end, s.meta AS sub_meta
         FROM users u
         LEFT JOIN (
           SELECT DISTINCT ON (user_id) user_id, current_period_end, meta
           FROM subscriptions
           WHERE status = 'active'
           ORDER BY user_id, created_at DESC
         ) s ON s.user_id = u.id
         WHERE u.role='homeowner'
         ORDER BY u.created_at DESC`
      );

      const totalHomeowners = homeowners.length;
      const subscribedCount = homeowners.filter((h) => isPaidHomeCarePlan(h.plan_code)).length;
      const nonSubscribedCount = totalHomeowners - subscribedCount;

      const needle = q.toLowerCase();
      const digits = q.replace(/\D/g, '');

      const customers = homeowners
        .map(h => {
        let isTrial = false;
        let trialDaysLeft = 0;
        const now = new Date();
        const end = h.current_period_end ? new Date(h.current_period_end) : null;
        
        if (isPaidHomeCarePlan(h.plan_code) && end && end > now) {
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
          phone: h.phone || null,
          planCode: h.plan_code,
          accountStatus: h.is_blocked ? 'blocked' : 'active',
          createdAt: h.created_at,
          currentPeriodEnd: h.current_period_end,
          isTrial,
          trialDaysLeft,
        };
      })
        .filter((c) => {
          if (!needle && !digits) return true;
          const hay = `${c.id} ${c.name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
          if (needle && hay.includes(needle)) return true;
          if (digits && String(c.phone || '').replace(/\D/g, '').includes(digits)) return true;
          if (digits && String(c.id) === digits) return true;
          return false;
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

  app.get('/api/admin/homeowners/:userId/profile', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId)) {
        return res.status(400).json({ ok: false, message: 'Invalid customer id.' });
      }
      const { rows: users } = await pool.query(
        `SELECT id, name, email, phone, plan_code, created_at, is_blocked, role
         FROM users WHERE id=$1 AND role='homeowner'`,
        [userId]
      );
      if (!users[0]) {
        return res.status(404).json({ ok: false, message: 'Homeowner not found.' });
      }
      const u = users[0];

      const { rows: props } = await pool.query(
        `SELECT id, label, address_line1, address_line2, city, state, zip, property_type, created_at,
                postal_code_plus4, address_verified, address_verified_at, address_verification_provider
         FROM properties WHERE owner_user_id=$1 ORDER BY created_at ASC`,
        [userId]
      );

      const { rows: jobs } = await pool.query(
        `SELECT id, booking_id, title, category, status, full_address, city_state_zip,
                assigned_contractor_user_id, customer_retail_estimate_low, customer_retail_estimate_high,
                visit_fee_amount, created_at, updated_at, preferred_date, property_id
         FROM managed_jobs WHERE homeowner_user_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [userId]
      );

      const contractorIds = [...new Set(jobs.map((j) => j.assigned_contractor_user_id).filter(Boolean))];
      let contractorMap = {};
      if (contractorIds.length) {
        const { rows: contractors } = await pool.query(
          `SELECT id, name, company_name FROM users WHERE id = ANY($1::int[])`,
          [contractorIds]
        );
        contractorMap = Object.fromEntries(
          contractors.map((c) => [c.id, c.company_name || c.name || `Contractor #${c.id}`])
        );
      }

      const { rows: payments } = await pool.query(
        `SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
        [userId]
      );

      const { rows: subs } = await pool.query(
        `SELECT * FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [userId]
      );

      let referrals = [];
      try {
        const { rows: refRows } = await pool.query(
          `SELECT * FROM referral_relationships
           WHERE referrer_user_id=$1 OR referred_user_id=$1
           ORDER BY created_at DESC LIMIT 50`,
          [userId]
        );
        referrals = refRows.map((r) => ({
          id: Number(r.id),
          publicId: r.public_id,
          type: r.type,
          status: r.status,
          referralCode: r.referral_code,
          referrerRewardCents: r.referrer_reward_cents,
          referredRewardCents: r.referred_reward_cents,
          relatedJobId: r.related_job_id ? Number(r.related_job_id) : null,
          createdAt: r.created_at,
          qualifiedAt: r.qualified_at,
        }));
      } catch {
        referrals = [];
      }

      const serializePayment = (p) => {
        let meta = p.meta;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch {
            meta = {};
          }
        }
        const publicId = p.public_id || (p.id != null ? `TXN-${String(p.id).padStart(5, '0')}` : null);
        return {
          id: Number(p.id),
          transactionId: publicId,
          jobId: p.job_id != null ? Number(p.job_id) : null,
          paymentType: p.payment_type,
          amount: Number(p.amount),
          currency: p.currency || 'usd',
          status: p.status,
          provider: p.provider || 'stripe',
          stripeSessionId: p.stripe_session_id,
          stripePaymentIntent: p.stripe_payment_intent,
          stripeSubscriptionId: p.stripe_subscription_id,
          meta: meta || {},
          createdAt: p.created_at,
        };
      };

      let extras = {
        stats: {
          activeJobs: 0,
          totalJobs: jobs.length,
          openQuotes: 0,
          outstandingBalance: 0,
          totalPaid: 0,
          openTickets: 0,
          properties: props.length,
        },
        quotes: [],
        invoices: [],
        tickets: [],
        activity: [],
      };
      try {
        extras = await loadHomeownerProfileExtras(pool, userId);
      } catch (extraErr) {
        console.error('homeowner profile extras:', extraErr);
      }

      res.json({
        ok: true,
        customer: {
          id: Number(u.id),
          name: u.name,
          email: u.email,
          phone: u.phone || null,
          planCode: u.plan_code,
          accountStatus: u.is_blocked ? 'blocked' : 'active',
          joinedAt: u.created_at,
        },
        stats: extras.stats,
        homeCarePro: extras.homeCarePro || null,
        addresses: props.map((p, idx) => ({
          propertyId: Number(p.id),
          label: p.label || (idx === 0 ? 'Primary Property' : `Property ${idx + 1}`),
          isPrimary: idx === 0,
          addressLine1: p.address_line1,
          addressLine2: p.address_line2,
          city: p.city,
          state: p.state,
          zip: p.zip,
          postalCodePlus4: p.postal_code_plus4 || null,
          addressVerified: p.address_verified === true,
          addressVerificationProvider: p.address_verification_provider || null,
          propertyType: p.property_type || null,
          createdAt: p.created_at,
        })),
        serviceHistory: jobs.map((j) => ({
          id: Number(j.id),
          bookingId: j.booking_id,
          title: j.title,
          category: j.category,
          status: j.status,
          propertyId: j.property_id != null ? Number(j.property_id) : null,
          address: j.full_address || j.city_state_zip,
          contractor: j.assigned_contractor_user_id
            ? contractorMap[j.assigned_contractor_user_id] || null
            : null,
          amount:
            j.customer_retail_estimate_high != null
              ? Number(j.customer_retail_estimate_high)
              : j.customer_retail_estimate_low != null
                ? Number(j.customer_retail_estimate_low)
                : j.visit_fee_amount != null
                  ? Number(j.visit_fee_amount)
                  : null,
          createdAt: j.created_at,
          updatedAt: j.updated_at,
          scheduledDate: j.preferred_date || null,
          completedAt: null,
        })),
        quotes: extras.quotes,
        invoices: extras.invoices,
        tickets: extras.tickets,
        activity: extras.activity,
        payments: payments.map(serializePayment),
        transactions: payments.map(serializePayment),
        subscriptions: subs.map((s) => ({
          id: Number(s.id),
          planCode: s.plan_code,
          status: s.status,
          stripeSubscriptionId: s.stripe_subscription_id,
          currentPeriodEnd: s.current_period_end,
          createdAt: s.created_at,
        })),
        referrals,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error loading customer profile.' });
    }
  });

  app.get('/api/payments/mine', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [req.authUser.id]
      );
      // Backfill public_id for older rows
      for (const p of rows) {
        if (!p.public_id) {
          await pool.query(
            `UPDATE payments SET public_id='TXN-' || LPAD(id::text, 5, '0') WHERE id=$1 AND public_id IS NULL`,
            [p.id]
          );
          p.public_id = `TXN-${String(p.id).padStart(5, '0')}`;
        }
      }
      res.json({
        ok: true,
        transactions: rows.map((p) => {
          let meta = p.meta;
          if (typeof meta === 'string') {
            try {
              meta = JSON.parse(meta);
            } catch {
              meta = {};
            }
          }
          const planCode = meta?.planCode || null;
          let description = 'Payment';
          let typeLabel = p.payment_type;
          if (p.payment_type === 'subscription') {
            description = isPaidHomeCarePlan(planCode) ? 'HomeCare Pro' : planCode || 'Subscription';
            typeLabel = 'Subscription Payment';
          } else if (p.payment_type === 'dispatch_fee') {
            description = 'Dispatch / visit fee';
            typeLabel = 'Service Payment';
          } else if (p.payment_type === 'retail_payment' || p.payment_type === 'invoice_payment') {
            description = 'Service payment';
            typeLabel = 'Service Payment';
          } else if (p.payment_type === 'tip') {
            description = 'Tip';
            typeLabel = 'Tip';
          } else if (String(p.status).includes('refund')) {
            typeLabel = 'Refund';
          }
          return {
            id: Number(p.id),
            transactionId: p.public_id,
            paymentType: p.payment_type,
            typeLabel,
            description,
            amount: Number(p.amount),
            currency: (p.currency || 'usd').toUpperCase(),
            status: p.status,
            provider: p.provider || 'stripe',
            jobId: p.job_id != null ? Number(p.job_id) : null,
            stripeSessionId: p.stripe_session_id,
            stripePaymentIntent: p.stripe_payment_intent,
            stripeSubscriptionId: p.stripe_subscription_id,
            planCode,
            createdAt: p.created_at,
            receiptUrl: null,
          };
        }),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load transactions.' });
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

      const activePlan = isPaidHomeCarePlan(planCode) ? planCode : null;
      await pool.query(
        `UPDATE users SET plan_code=$1 WHERE id=$2 AND role='homeowner'`,
        [activePlan, homeownerUserId]
      );

      const meta = JSON.stringify({
        isLocalTrial: false,
        editedByStaffName: staffName.trim(),
        editedByStaffEmail: req.authUser.email,
        editedAt: new Date().toISOString(),
      });

      if (activePlan) {
        await pool.query(
          `UPDATE subscriptions SET status='canceled', meta=$1
           WHERE user_id=$2 AND status='active' AND plan_code = ANY($3::text[])`,
          [meta, homeownerUserId, ['pro_membership', 'homecare', PAID_HOME_CARE_PLAN_CODE]]
        );
        await pool.query(
          `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
           VALUES ($1, $2, $2, 'active', TRUE, NOW() + INTERVAL '1 year', $3)`,
          [homeownerUserId, activePlan, meta]
        );
      } else {
        await pool.query(
          `UPDATE subscriptions SET status='canceled', meta=$1
           WHERE user_id=$2 AND status='active' AND plan_code = ANY($3::text[])`,
          [meta, homeownerUserId, ['pro_membership', 'homecare', PAID_HOME_CARE_PLAN_CODE]]
        );
      }

      await writeAudit(pool, req.authUser.id, 'subscription_change_by_admin', 'user', homeownerUserId, {
        planCode,
        staffName: staffName.trim(),
        editedAt: new Date().toISOString(),
      });

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
      const proPrice = Number(
        rules.homecare_subscription_price != null
          ? rules.homecare_subscription_price
          : rules.pro_subscription_price != null
            ? rules.pro_subscription_price
            : 0
      );
      const plans = Object.entries(PLAN_CATALOG).map(([code, p]) => ({ code, ...p }));
      plans.push({
        code: PAID_HOME_CARE_PLAN_CODE,
        family: 'diy',
        label: 'HomeCare Pro',
        amount: proPrice,
        interval: 'month',
        trialDays: 7,
      });
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
      if (!planCode) return res.status(400).json({ ok: false, message: 'Plan code is required.' });
      const jobId = req.body?.jobId ? Number(req.body.jobId) : null;
      const pendingServiceRequestId = req.body?.pendingServiceRequestId ? Number(req.body.pendingServiceRequestId) : null;
      const returnTo = String(req.body?.returnTo || '').slice(0, 32);
      const origin = req.get('origin') || req.get('referer');
      const result = await startSubscriptionCheckout(pool, {
        userId: req.authUser.id,
        userEmail: req.authUser.email,
        planCode,
        jobId,
        returnTo,
        origin,
        pendingServiceRequestId,
        lookupManagedPlan,
        auditUserId: req.authUser.id,
      });
      if (result.alreadySubscribed) {
        return res.json({
          ok: true,
          alreadySubscribed: true,
          convertedPendingServiceRequest: Boolean(result.convertedPendingServiceRequest),
          managedJobId: result.managedJobId || null,
          plan: result.plan,
          status: result.status || 'active',
          subscription: result.subscription,
        });
      }
      if (result.url) return res.json({ ok: true, url: result.url });
      return res.status(502).json({ ok: false, message: 'Stripe checkout URL missing.' });
    } catch (e) {
      console.error(e);
      return res.status(e.status || 500).json({
        ok: false,
        code: e.code || undefined,
        message: e.message || 'Could not start subscription.',
      });
    }
  });

  /** Pre-sign-in checkout: create/login homeowner then redirect to Stripe. */
  app.post('/api/subscriptions/guest-checkout', async (req, res) => {
    try {
      const planCode = String(req.body?.planCode || '');
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      if (!planCode) return res.status(400).json({ ok: false, message: 'Plan code is required.' });
      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, message: 'A valid email is required.' });
      }

      const plan = await resolveSubscriptionPlan(pool, planCode, lookupManagedPlan);
      if (!plan) return res.status(400).json({ ok: false, message: 'Unknown plan.' });

      let userRow;
      let token = null;
      const { rows: existing } = await pool.query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1)`, [email]);
      if (existing[0]) {
        if (!password) {
          return res.status(400).json({ ok: false, message: 'Enter your password to continue to payment.' });
        }
        const ok = await bcrypt.compare(password, existing[0].password);
        if (!ok) return res.status(401).json({ ok: false, message: 'Incorrect password for this email.' });
        if (existing[0].role !== 'homeowner') {
          return res.status(403).json({ ok: false, message: 'This email belongs to a non-homeowner account.' });
        }
        userRow = existing[0];
      } else {
        if (!name) return res.status(400).json({ ok: false, message: 'Name is required to create your account.' });
        if (!password || password.length < 6) {
          return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters.' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const { rows: created } = await pool.query(
          `INSERT INTO users (role, name, email, password, compliance_status)
           VALUES ('homeowner', $1, $2, $3, 'approved') RETURNING *`,
          [name, email, hashed]
        );
        userRow = created[0];
      }

      if (typeof makeToken === 'function' && typeof rowToUser === 'function') {
        token = makeToken(rowToUser(userRow));
      }

      const origin = req.get('origin') || req.get('referer');
      const result = await startSubscriptionCheckout(pool, {
        userId: userRow.id,
        userEmail: userRow.email,
        planCode,
        jobId: null,
        origin,
        lookupManagedPlan,
        auditUserId: userRow.id,
      });

      if (result.url) {
        return res.json({ ok: true, url: result.url, token, user: rowToUser ? rowToUser(userRow) : undefined });
      }
      return res.status(502).json({ ok: false, message: 'Stripe checkout URL missing.' });
    } catch (e) {
      console.error('guest-checkout:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not start subscription.' });
    }
  });

  async function mutateHomeCareCancelFlag(req, res, cancelAtPeriodEnd) {
    const sub = await loadBestHomeCareSubscription(pool, req.authUser.id);
    if (!sub || !subscriptionGrantsProAccess(sub)) {
      return res.status(400).json({ ok: false, message: 'No active HomeCare subscription to update.' });
    }
    if (sub.stripe_subscription_id && stripeConfigured()) {
      const stripe = await getStripe();
      if (stripe) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: cancelAtPeriodEnd,
        });
      }
    }
    const meta = {
      ...parseSubscriptionMeta(sub.meta),
      cancelAtPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
    };
    await pool.query(`UPDATE subscriptions SET meta=$1::jsonb WHERE id=$2`, [JSON.stringify(meta), sub.id]);
    invalidateHomeCareEntitlementCache(req.authUser.id);
    const state = await syncUserHomeCareEntitlement(pool, req.authUser.id, { force: true });
    return res.json({ ok: true, subscription: toPublicHomeCareSubscriptionDto(state) });
  }

  app.post('/api/subscriptions/cancel', requireAuth, async (req, res) => {
    try {
      return await mutateHomeCareCancelFlag(req, res, true);
    } catch (e) {
      console.error('subscriptions/cancel:', e);
      return res.status(500).json({ ok: false, message: e.message || 'Could not cancel subscription.' });
    }
  });

  app.post('/api/subscriptions/resume', requireAuth, async (req, res) => {
    try {
      return await mutateHomeCareCancelFlag(req, res, false);
    } catch (e) {
      console.error('subscriptions/resume:', e);
      return res.status(500).json({ ok: false, message: e.message || 'Could not keep subscription.' });
    }
  });

  app.post('/api/subscriptions/billing-portal', requireAuth, async (req, res) => {
    try {
      const sub = await loadBestHomeCareSubscription(pool, req.authUser.id);
      if (!sub) return res.status(400).json({ ok: false, message: 'No HomeCare subscription found.' });
      const meta = parseSubscriptionMeta(sub.meta);
      const customerId = meta.stripeCustomerId || meta.stripe_customer_id || null;
      if (!customerId || !stripeConfigured()) {
        return res.status(400).json({ ok: false, message: 'Billing management is not available for this subscription yet.' });
      }
      const stripe = await getStripe();
      const origin = (req.get('origin') || req.get('referer') || '').replace(/\/$/, '');
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin || ''}/`,
      });
      return res.json({ ok: true, url: session.url });
    } catch (e) {
      console.error('subscriptions/billing-portal:', e);
      return res.status(500).json({ ok: false, message: e.message || 'Could not open billing portal.' });
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
        await writeAudit(pool, req.authUser.id, 'lead_unlocked', 'managed_job', jobId, { fee, simulated: true });
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

  app.put('/api/admin/managed/jobs/:id/mode', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const mode = String(req.body?.jobMode || '').toLowerCase();
      if (!['managed', 'direct'].includes(mode)) {
        return res.status(400).json({ ok: false, message: 'jobMode must be managed or direct.' });
      }
      await pool.query(`UPDATE managed_jobs SET job_mode=$1, updated_at=NOW() WHERE id=$2`, [mode, jobId]);
      await writeAudit(pool, req.authUser.id, 'job_mode_set', 'managed_job', jobId, { mode });
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
        `INSERT INTO change_orders (job_id, contractor_user_id, description, media_data_url, contractor_net, reason, status)
         VALUES ($1,$2,$3,$4,$5,$6,'submitted') RETURNING *`,
        [jobId, req.authUser.id, String(req.body.description).slice(0, 4000), req.body.mediaDataUrl || null, net, req.body.reason ? String(req.body.reason).slice(0, 500) : null]
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

  app.post('/api/admin/change-orders/:id/price', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
        `UPDATE change_orders SET retail_amount=$1, status='sent_to_homeowner'
         WHERE id=$2 AND status IN ('submitted','admin_reviewed') RETURNING *`,
        [retail, id]
      );
      if (!updated[0]) {
        return res.status(409).json({ ok: false, code: 'invalid_change_order_state', message: 'Change order cannot be priced in current state.' });
      }
      res.json({ ok: true, changeOrder: serializeChangeOrder(updated[0], req.authUser.role) });
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
      const { rows: coRows } = await pool.query(
        `SELECT * FROM change_orders WHERE id=$1 AND job_id=$2`,
        [coId, jobId]
      );
      if (!coRows[0]) return res.status(404).json({ ok: false, message: 'Change order not found.' });
      if (req.authUser.role !== 'admin') {
        const ackOk = await requireHomeownerAcknowledgment(pool, req, res, {
          jobId,
          changeOrderId: coId,
          actionKey: 'CHANGE_ORDER_APPROVAL',
          message: 'You must approve this additional scope and price.',
          snapshotData: {
            changeOrderId: coId,
            description: coRows[0].description,
            retailAmount: coRows[0].retail_amount,
            contractorNet: coRows[0].contractor_net,
          },
        });
        if (!ackOk) return;
      }
      const { rows } = await pool.query(
        `UPDATE change_orders SET status='approved', approved_at=NOW(),
           approved_snapshot=COALESCE(approved_snapshot, jsonb_build_object(
             'description', description,
             'contractor_net', contractor_net,
             'retail_amount', retail_amount,
             'line_items', COALESCE(line_items, '[]'::jsonb),
             'reason', reason,
             'approved_at', NOW()
           ))
         WHERE id=$1 AND job_id=$2 AND status IN ('awaiting_customer','sent_to_homeowner','admin_reviewed')
         RETURNING *`,
        [coId, jobId]
      );
      if (!rows[0]) {
        return res.status(409).json({
          ok: false,
          code: 'invalid_change_order_state',
          message: 'Change order cannot be approved in its current state.',
        });
      }
      if (typeof statusPush === 'function') {
        await statusPush(pool, jobId, 'change_order_pending', 'work_started', req.authUser.id, 'Change order approved');
      }
      res.json({ ok: true, changeOrder: serializeChangeOrder(rows[0], req.authUser.role) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not approve change order.' });
    }
  });

  app.get('/api/managed/jobs/:id/change-orders', requireAuth, async (req, res) => {
    try {
      const access = await assertManagedJobAccess(pool, req.params.id, req.authUser);
      if (access.status) return res.status(access.status).json({ ok: false, message: access.message });
      const { rows } = await pool.query(
        `SELECT * FROM change_orders WHERE job_id=$1 ORDER BY created_at DESC`,
        [access.job.id]
      );
      const role = req.authUser.role;
      res.json({ ok: true, changeOrders: rows.map((r) => serializeChangeOrder(r, role)) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Refunds / disputes / payout holds ────────────────────────────────────
  app.post('/api/admin/payments/:id/refund', requireAuth, requireAdmin, requireAdminWrite, need('payments.refund'), async (req, res) => {
    try {
      const paymentId = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM payments WHERE id=$1`, [paymentId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Payment not found.' });
      const amount = Number(req.body?.amount ?? rows[0].amount);
      const reason = String(req.body?.reason || 'admin_refund').slice(0, 500);
      const idempotencyKey =
        String(req.body?.idempotencyKey || req.body?.refundRequestId || '').trim() ||
        `refund-${paymentId}-${Math.round(amount * 100)}-${reason.slice(0, 40)}`;

      const existingRefund = await pool.query(
        `SELECT * FROM refunds WHERE idempotency_key=$1 LIMIT 1`,
        [idempotencyKey]
      );
      if (existingRefund.rows[0]) {
        return res.json({
          ok: true,
          alreadyRefunded: true,
          refund: existingRefund.rows[0],
          simulated: existingRefund.rows[0].simulated,
        });
      }
      const simulate = shouldSimulatePayment(true) || !rows[0].stripe_payment_intent;
      if (process.env.NODE_ENV === 'production' && !stripeConfigured()) {
        return res.status(503).json({
          ok: false,
          code: 'STRIPE_NOT_CONFIGURED',
          message: 'Refunds require Stripe in production.',
        });
      }
      if (process.env.NODE_ENV === 'production' && simulate) {
        return res.status(400).json({
          ok: false,
          code: 'REFUND_REQUIRES_STRIPE_INTENT',
          message: 'Cannot refund a payment that has no Stripe payment intent in production.',
        });
      }
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
        `INSERT INTO refunds (payment_id, job_id, amount, reason, status, simulated, created_by, stripe_refund_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          paymentId,
          rows[0].job_id,
          amount,
          reason,
          'succeeded',
          simulate,
          req.authUser.id,
          simulate ? `sim_re_${Date.now()}` : stripeRefundId,
          idempotencyKey,
        ]
      );
      await pool.query(`UPDATE payments SET status='refunded' WHERE id=$1`, [paymentId]);
      if (rows[0].job_id) {
        await reconcileRefundForJob(pool, rows[0].job_id, {
          refundAmountCents: Math.round(amount * 100),
          paymentId,
          refundId: refundRows[0].id,
          actorUserId: req.authUser.id,
          reason,
        });
        await recordFinancialEvent(pool, {
          eventType: FINANCIAL_EVENT.REFUND_SUCCEEDED,
          jobId: rows[0].job_id,
          paymentId,
          amountCents: Math.round(amount * 100),
          stripeObjectId: stripeRefundId,
          createdBy: req.authUser.id,
          metadata: { reason, simulate },
        });
      }
      if (rows[0].job_id && typeof statusPush === 'function') {
        const { rows: jobs } = await pool.query(`SELECT status FROM managed_jobs WHERE id=$1`, [rows[0].job_id]);
        await statusPush(pool, rows[0].job_id, jobs[0]?.status, 'refunded', req.authUser.id, reason);
      }
      await writeAudit(pool, req.authUser.id, 'payment_refunded', 'payment', paymentId, { amount, reason, simulate, stripeRefundId });
      notifyOps(`Refund ${simulate ? '(sim) ' : ''}$${amount} on payment #${paymentId}`);
      res.json({ ok: true, refund: refundRows[0], simulated: simulate });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: e instanceof Error ? e.message : 'Could not refund.' });
    }
  });

  // POST /api/admin/disputes — registered in disputes.js (payout hold + audit trail)

  app.post('/api/admin/transfers/:id/hold', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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

  app.post('/api/admin/transfers/:id/release', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM transfers WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Transfer not found.' });
      const amount = Number(req.body?.amount ?? rows[0].amount);
      if (process.env.NODE_ENV === 'production' && !stripeConfigured()) {
        return res.status(503).json({
          ok: false,
          code: 'STRIPE_NOT_CONFIGURED',
          message: 'Payout release requires Stripe in production.',
        });
      }
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

  app.post('/api/admin/transfers/:id/reverse', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
  app.put('/api/admin/managed/jobs/:id/payment-schedule', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
      const access = await assertManagedJobAccess(pool, req.params.id, req.authUser);
      if (access.status) return res.status(access.status).json({ ok: false, message: access.message });
      const { rows } = await pool.query(
        `SELECT id, job_id, label, amount, due_at, sort_order, status, payment_id, created_at
         FROM payment_schedules WHERE job_id=$1 ORDER BY sort_order ASC, id ASC`,
        [access.job.id]
      );
      res.json({
        ok: true,
        schedule: rows.map((r) => ({
          id: Number(r.id),
          jobId: Number(r.job_id),
          label: r.label,
          amount: Number(r.amount),
          dueAt: r.due_at,
          sortOrder: r.sort_order,
          status: r.status,
          paymentId: r.payment_id,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Coverage / matching / ops deadlines ──────────────────────────────────
  app.post('/api/admin/managed/jobs/:id/match', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const job = jobs[0];
      const { rows: contractors } = await pool.query(
        `SELECT id, name, email, trade, compliance_status, service_zips, is_blocked
         FROM users
         WHERE role='contractor' AND COALESCE(is_blocked,false)=false`
      );
      const { filterEligibleContractors, rankEligibleContractors } = await import('./contractor-matching.js');
      const eligible = filterEligibleContractors(contractors, job);
      const ranked = rankEligibleContractors(eligible, job);
      const coverage =
        eligible.length === 0 ? 'no_coverage' : eligible.length < 2 ? 'limited' : 'covered';
      const deadlineHours = Number(req.body?.responseHours || 4);
      await pool.query(
        `UPDATE managed_jobs SET coverage_state=$1, invite_deadline_at=NOW() + ($2 || ' hours')::interval, updated_at=NOW()
         WHERE id=$3`,
        [coverage, String(deadlineHours), jobId]
      );
      res.json({
        ok: true,
        coverageState: coverage,
        jobZip: job.zip || null,
        matches: ranked.map(({ contractor: m, score }) => ({
          id: Number(m.id),
          name: m.name,
          email: m.email,
          trade: m.trade,
          score,
        })),
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
      if (req.authUser.role === 'homeowner') {
        const ackOk = await requireHomeownerAcknowledgment(pool, req, res, {
          actionKey: 'DIY_START',
          message: 'You must accept the AI / DIY Safety Disclaimer before using Guided DIY.',
        });
        if (!ackOk) return;
        await pool.query(
          `UPDATE users SET diy_safety_accepted_version=$2 WHERE id=$1`,
          [req.authUser.id, '1.0']
        );
      }
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
      const propertyId = Number(req.params.id);
      const { rows: props } = await pool.query(`SELECT id, owner_user_id FROM properties WHERE id=$1`, [propertyId]);
      if (!props[0]) return res.status(404).json({ ok: false, message: 'Property not found.' });
      if (req.authUser.role !== 'admin' && Number(props[0].owner_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows } = await pool.query(
        `SELECT * FROM property_units WHERE property_id=$1 ORDER BY id ASC`,
        [propertyId]
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
      if (!PARTNER_JWT_SECRET) {
        return res.status(503).json({ ok: false, message: 'Partner auth is not configured.' });
      }
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
      const token = jwt.sign(
        {
          typ: 'partner',
          partnerUserId: Number(rows[0].id),
          partnerId: Number(rows[0].partner_id),
          code: String(rows[0].partner_code || '').toUpperCase(),
        },
        PARTNER_JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '7d' }
      );
      await writeAudit(pool, null, 'partner_login', 'partner_user', rows[0].id, { email });
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

  app.post('/api/admin/partners/:id/users', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const partnerId = Number(req.params.id);
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ ok: false, message: 'Email is required.' });
      }
      const password = String(req.body?.password || '').trim();
      if (!password || password.length < 12) {
        return res.status(400).json({
          ok: false,
          message: 'A secure password (minimum 12 characters) is required. Passwords are never auto-generated or returned by API.',
        });
      }
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO partner_users (partner_id, email, name, password_hash)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (partner_id, email) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=EXCLUDED.name
         RETURNING id, partner_id, email, name`,
        [partnerId, email, req.body?.name || email, hash]
      );
      res.json({ ok: true, user: rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not create partner user.' });
    }
  });

  app.get('/api/partner/:code/referrals', async (req, res) => {
    try {
      if (!PARTNER_JWT_SECRET) {
        return res.status(503).json({ ok: false, message: 'Partner auth is not configured.' });
      }
      const code = String(req.params.code || '').toUpperCase();
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, message: 'Partner authentication required.' });
      }
      let decoded;
      try {
        decoded = jwt.verify(authHeader.slice(7), PARTNER_JWT_SECRET, { algorithms: ['HS256'] });
      } catch {
        return res.status(401).json({ ok: false, message: 'Invalid or expired partner session.' });
      }
      if (decoded?.typ !== 'partner' || String(decoded.code || '').toUpperCase() !== code) {
        return res.status(403).json({ ok: false, message: 'Not allowed for this partner code.' });
      }
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
  function mapsApiKey() {
    return process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || '';
  }

  function parseGeocodeComponents(components = []) {
    const pick = (type, short = false) => {
      const c = components.find((x) => x.types?.includes(type));
      return short ? c?.short_name || '' : c?.long_name || '';
    };
    const streetNumber = pick('street_number');
    const route = pick('route');
    return {
      streetAddress: [streetNumber, route].filter(Boolean).join(' '),
      city:
        pick('locality') ||
        pick('sublocality') ||
        pick('postal_town') ||
        pick('administrative_area_level_3'),
      state: pick('administrative_area_level_1', true),
      county: pick('administrative_area_level_2'),
      zip: pick('postal_code').slice(0, 5),
    };
  }

  async function handlePlacesAutocomplete(req, res) {
    try {
      const key = mapsApiKey();
      const input = String(req.query.input || '').trim();
      if (!input) return res.status(400).json({ ok: false, message: 'input required' });
      if (!key) {
        return res.json({
          ok: true,
          simulated: true,
          predictions: [{ description: input, place_id: 'sim_place' }],
        });
      }
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&types=address&components=country:us`;
      const data = await fetch(url).then((r) => r.json());
      res.json({ ok: true, simulated: false, predictions: data.predictions || [] });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Places lookup failed.' });
    }
  }

  async function handleReverseGeocode(req, res) {
    try {
      const key = mapsApiKey();
      const address = String(req.query.address || '').trim();
      const lat = req.query.lat != null ? Number(req.query.lat) : null;
      const lng = req.query.lng != null ? Number(req.query.lng) : null;

      if (!key) {
        const fakeZip = address.match(/\b(\d{5})\b/)?.[1] || '10001';
        return res.json({
          ok: true,
          simulated: true,
          lat: 40.75,
          lng: -73.99,
          zip: fakeZip,
          city: 'New York',
          state: 'NY',
          county: 'New York County',
          streetAddress: address.split(',')[0]?.trim() || address,
          formattedAddress: address || null,
        });
      }

      let url;
      if (address) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}&components=country:US`;
      } else if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
      } else {
        return res.status(400).json({ ok: false, message: 'address or lat/lng required' });
      }

      const data = await fetch(url).then((r) => r.json());
      const result = data.results?.[0];
      if (!result) return res.json({ ok: false, message: 'No results' });

      const loc = result.geometry?.location;
      const parsed = parseGeocodeComponents(result.address_components || []);
      let timezone = null;
      if (loc?.lat != null && loc?.lng != null) {
        timezone = await lookupTimezoneFromCoordinates(loc.lat, loc.lng);
      }

      res.json({
        ok: true,
        simulated: false,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        zip: parsed.zip || null,
        city: parsed.city || null,
        state: parsed.state || null,
        county: parsed.county || null,
        streetAddress: parsed.streetAddress || null,
        formattedAddress: result.formatted_address || null,
        timezone: isValidIanaTimezone(timezone) ? timezone : null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Geocode failed.' });
    }
  }

  app.get('/api/places/autocomplete', requireAuth, handlePlacesAutocomplete);
  app.get('/api/public/places/autocomplete', handlePlacesAutocomplete);

  app.get('/api/places/reverse-geocode', requireAuth, handleReverseGeocode);
  app.get('/api/public/places/reverse-geocode', handleReverseGeocode);

  app.post('/api/places/scan-zips', requireAuth, async (req, res) => {
    try {
      const key = mapsApiKey();
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      const radiusMiles = Math.min(100, Math.max(5, Number(req.body?.radiusMiles) || 35));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ ok: false, message: 'lat and lng required' });
      }

      const latDeg = radiusMiles / 69;
      const lngScale = Math.cos((lat * Math.PI) / 180) || 1;
      const lngDeg = radiusMiles / (69 * lngScale);
      const points = [{ lat, lng }];
      for (let ring = 1; ring <= 2; ring += 1) {
        const frac = ring / 2;
        const count = ring === 1 ? 6 : 10;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * 2 * Math.PI;
          points.push({
            lat: lat + latDeg * frac * Math.sin(angle),
            lng: lng + lngDeg * frac * Math.cos(angle),
          });
        }
      }

      const zips = new Set();
      if (!key) {
        zips.add('10001');
        zips.add('11201');
        return res.json({ ok: true, simulated: true, zips: [...zips] });
      }

      await Promise.all(
        points.map(async (p) => {
          try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&key=${key}`;
            const data = await fetch(url).then((r) => r.json());
            const result = data.results?.[0];
            const zipComp = (result?.address_components || []).find((c) => c.types?.includes('postal_code'));
            const zip = zipComp?.long_name?.slice(0, 5) || zipComp?.short_name?.slice(0, 5);
            if (zip && /^\d{5}$/.test(zip)) zips.add(zip);
          } catch {
            /* ignore individual point failures */
          }
        })
      );

      res.json({ ok: true, simulated: false, zips: [...zips].sort() });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'ZIP scan failed.' });
    }
  });

  // ── Notifications ────────────────────────────────────────────────────────
  app.post('/api/notify/test', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const email = await sendEmailSafe({
        to: req.body?.email || req.authUser.email,
        template: 'generic_notification',
        data: {
          firstName: req.authUser.name,
          subject: `${brand.productName} notification test`,
          headline: 'Notification test',
          message: `This is a test email from ${brand.productName}.`,
        },
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
  async function ensureMfaSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mfa_challenges (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`);
  }

  app.post('/api/auth/mfa/start', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'admin' && !req.body?.force) {
        return res.status(403).json({ ok: false, message: 'Admin MFA only in pilot.' });
      }
      await ensureMfaSchema();

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const hash = await bcrypt.hash(code, 8);
      await pool.query(
        `INSERT INTO mfa_challenges (user_id, code_hash, expires_at) VALUES ($1,$2, NOW() + INTERVAL '10 minutes')`,
        [req.authUser.id, hash]
      );

      // Email is best-effort — never block admin login if Gmail is missing/misconfigured.
      const emailResult = await sendEmailSafe({
        to: req.authUser.email,
        template: 'admin_mfa_otp',
        data: {
          firstName: req.authUser.name,
          code,
        },
      });

      try {
        await pool.query(`UPDATE users SET mfa_enabled=true WHERE id=$1`, [req.authUser.id]);
      } catch (e) {
        console.warn('[MFA] mfa_enabled update skipped:', e.message);
      }

      // emailResult.simulated=true means Gmail is not configured — surface the code
      // in the API response so the admin is never locked out when email isn't set up.
      // Once GMAIL_USER + GMAIL_APP_PASSWORD are set, the code is hidden from the response.
      const emailDelivered = emailResult?.ok === true && !emailResult?.simulated;
      res.json({
        ok: true,
        sent: true,
        emailDelivered,
        emailConfigured: emailDelivered,
        // Show code when email wasn't actually sent (no Gmail config) so admin can still log in.
        // This disappears automatically once Gmail is configured.
        fallbackCode: emailDelivered ? undefined : code,
        // Legacy non-prod helper kept for local dev.
        demoCode: process.env.NODE_ENV !== 'production' ? code : undefined,
      });
    } catch (e) {
      console.error('[MFA start]', e);
      res.status(500).json({
        ok: false,
        message: 'Could not start MFA.',
        detail: process.env.NODE_ENV === 'production' ? undefined : String(e?.message || e),
      });
    }
  });

  app.post('/api/auth/mfa/verify', requireAuth, async (req, res) => {
    try {
      await ensureMfaSchema();
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
      let token = null;
      let user = null;
      if (typeof makeToken === 'function' && typeof rowToUser === 'function') {
        const { rows: userRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.authUser.id]);
        if (userRows[0]) {
          user = rowToUser(userRows[0]);
          token = makeToken(user, { authStage: 'complete' });
        }
      }
      res.json({ ok: true, verified: true, token, user });
    } catch (e) {
      console.error('[MFA verify]', e);
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
  app.put('/api/admin/managed/jobs/:id/commercial', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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

  // Immutable admin audit trail (includes payout audit events)
  app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));

      const { rows: platformRows } = await pool.query(
        `SELECT a.*, u.name AS actor_name, u.email AS actor_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC
         LIMIT $1`,
        [limit],
      );

      let payoutRows = [];
      try {
        const payoutRes = await pool.query(
          `SELECT p.*, u.name AS actor_name, u.email AS actor_email
           FROM payout_audit_logs p
           LEFT JOIN users u ON u.id = p.performed_by
           ORDER BY p.created_at DESC
           LIMIT $1`,
          [limit],
        );
        payoutRows = payoutRes.rows || [];
      } catch {
        payoutRows = [];
      }

      const merged = [
        ...platformRows.map((r) => ({
          id: Number(r.id),
          actorUserId: r.actor_user_id != null ? Number(r.actor_user_id) : null,
          actorName: r.actor_name || null,
          actorEmail: r.actor_email || null,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          detail: typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail,
          createdAt: r.created_at,
          source: 'platform',
        })),
        ...payoutRows.map((r) => ({
          id: Number(r.id) + 1_000_000_000,
          actorUserId: r.performed_by != null ? Number(r.performed_by) : null,
          actorName: r.actor_name || null,
          actorEmail: r.actor_email || null,
          action: `payout_${r.action}`,
          entityType: 'contractor_payout',
          entityId: r.payout_id != null ? String(r.payout_id) : null,
          detail: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
          createdAt: r.created_at,
          source: 'payout',
        })),
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      res.json({ ok: true, logs: merged });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load audit logs.' });
    }
  });

  app.get('/api/admin/work-queue', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT j.id, j.booking_id, j.title, j.category, j.status, j.work_queue_status, j.homeowner_user_id,
                j.assigned_contractor_user_id, j.city_state_zip, j.zip, j.updated_at, j.created_at,
                j.invite_deadline_at, j.ai_assessment, j.priority_tier, u.plan_code AS homeowner_plan_code
         FROM managed_jobs j
         LEFT JOIN users u ON u.id = j.homeowner_user_id
         WHERE j.status NOT IN ('closed','canceled','cancelled','refunded')
         ORDER BY
           CASE
             WHEN j.priority_tier = 'emergency' THEN 0
             WHEN j.priority_tier = 'homecare_pro_high' THEN 1
             WHEN j.priority_tier = 'homecare_pro' THEN 2
             ELSE 3
           END,
           j.updated_at DESC NULLS LAST
         LIMIT 500`
      );
      const { buildWorkQueueSections, WORK_QUEUE_SECTIONS } = await import('./work-queue.js');
      const sections = buildWorkQueueSections(rows);
      res.json({
        ok: true,
        sections: sections.map((s) => ({
          id: s.id,
          label: s.label,
          count: s.count,
          jobIds: s.jobs.map((j) => Number(j.id)),
        })),
        catalog: WORK_QUEUE_SECTIONS,
        endpoint: 'GET /api/admin/work-queue',
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load work queue.' });
    }
  });

  app.get('/api/comms/status', requireAuth, async (_req, res) => {
    const { mailStatus } = await import('./mail.js');
    const { smsConfigured } = await import('./notify.js');
    const { emailSystemStatus } = await import('./email/send-fixbridge-email.js');
    const { emailLogoUrl } = await import('./email/email-config.js');
    const { listEmailTemplates } = await import('./email/templates.js');
    const email = mailStatus();
    res.json({
      ok: true,
      emailConfigured: Boolean(email.configured),
      smsConfigured: smsConfigured(),
      emailBranding: {
        ...emailSystemStatus(),
        logoUrl: emailLogoUrl(),
        templateCount: listEmailTemplates().length,
      },
    });
  });
}

export { sendEmailSafe, sendSmsSafe, notifyOps } from './notify.js';
export { PLAN_CATALOG };
