/**
 * Authoritative HomeCare Pro subscription → entitlement resolution.
 * Stripe subscription rows in `subscriptions` are the billing source of truth;
 * `users.plan_code` is a denormalized effective plan kept in sync here.
 */
import {
  FREE_PLAN_CODE,
  PAID_HOME_CARE_PLAN_CODE,
  PAID_HOME_CARE_PLAN_CODES,
  isPaidHomeCarePlan,
} from './subscription-catalog.js';

/** Designated QA/demo accounts only. Never matches a real customer address. */
export function isQaGuidedDiyDemoEmail(email) {
  return /^demo\.homeowner\.[a-z0-9._-]+@example\.com$/i.test(String(email || '').trim());
}

/**
 * Complimentary Guided DIY access for a designated demo homeowner.
 * Creates a simulated subscription only. Does not touch Stripe or pricing_rules.
 */
export async function ensureQaGuidedDiyEntitlement(pool, userId, email) {
  if (!isQaGuidedDiyDemoEmail(email)) return false;
  const { rows } = await pool.query(
    `SELECT id, stripe_subscription_id, simulated, status
     FROM subscriptions
     WHERE user_id=$1 AND plan_code = ANY($2::text[])
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, PAID_HOME_CARE_PLAN_CODES]
  );
  const existing = rows[0];
  if (existing?.stripe_subscription_id) return false;
  const meta = JSON.stringify({
    source: 'qa_guided_diy',
    purpose: 'guided_diy_qa',
    grantedAt: new Date().toISOString(),
    note: 'Complimentary QA access for a designated demo homeowner. Not a customer payment.',
  });
  if (existing && String(existing.status || '').toLowerCase() === 'active' && existing.simulated === true) {
    return true;
  }
  if (existing) {
    await pool.query(
      `UPDATE subscriptions
       SET plan_code=$2, plan_family=$2, status='active', simulated=true,
           current_period_end=NOW() + INTERVAL '30 days', meta=$3
       WHERE id=$1`,
      [existing.id, PAID_HOME_CARE_PLAN_CODE, meta]
    );
    return true;
  }
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, simulated, current_period_end, meta)
     VALUES ($1, $2, $2, 'active', TRUE, NOW() + INTERVAL '30 days', $3)`,
    [userId, PAID_HOME_CARE_PLAN_CODE, meta]
  );
  return true;
}

/** Stripe statuses that may grant Pro when period is still valid. */
export const PRO_GRANTING_STATUSES = new Set(['active', 'trialing']);

/**
 * Product rule: no grace period — past_due suspends Pro immediately.
 * Change only here if billing policy changes.
 */
export const PAST_DUE_GRANTS_PRO = false;

export function parseSubscriptionMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  try {
    return JSON.parse(meta);
  } catch {
    return {};
  }
}

export function isPeriodValid(currentPeriodEnd, now = new Date()) {
  if (!currentPeriodEnd) return true;
  const end = currentPeriodEnd instanceof Date ? currentPeriodEnd : new Date(currentPeriodEnd);
  if (Number.isNaN(end.getTime())) return true;
  return now <= end;
}

/**
 * Whether a subscription row currently grants HomeCare Pro access.
 */
export function subscriptionGrantsProAccess(subscription, now = new Date()) {
  if (!subscription) return false;
  const planCode = subscription.plan_code;
  if (!isPaidHomeCarePlan(planCode)) return false;

  const status = String(subscription.status || '').toLowerCase();

  if (status === 'past_due') return PAST_DUE_GRANTS_PRO;
  if (status === 'canceled' || status === 'cancelled' || status === 'expired') return false;
  if (status === 'unpaid' || status === 'incomplete' || status === 'incomplete_expired') return false;
  if (status === 'paused') return false;

  if (!PRO_GRANTING_STATUSES.has(status)) return false;

  return isPeriodValid(subscription.current_period_end, now);
}

export function resolveHomeCareSubscriptionState({ subscription, userPlanCode, now = new Date() }) {
  const grantsPro = subscriptionGrantsProAccess(subscription, now);
  const meta = parseSubscriptionMeta(subscription?.meta);
  const status = subscription ? String(subscription.status || '').toLowerCase() : null;
  const cancelAtPeriodEnd = Boolean(
    meta.cancelAtPeriodEnd ?? meta.cancel_at_period_end ?? subscription?.cancel_at_period_end
  );
  const paymentIssue = status === 'past_due' || status === 'unpaid' || status === 'incomplete';

  const effectivePlanCode = grantsPro
    ? subscription?.plan_code || userPlanCode || PAID_HOME_CARE_PLAN_CODE
    : FREE_PLAN_CODE;

  return {
    effectivePlanCode: grantsPro ? effectivePlanCode : null,
    isPro: grantsPro,
    planCode: subscription?.plan_code || userPlanCode || null,
    status,
    stripeSubscriptionId: subscription?.stripe_subscription_id || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    cancelAtPeriodEnd,
    paymentIssue,
    simulated: subscription?.simulated === true,
    showMemberBadge: grantsPro,
    memberLabel: grantsPro ? 'HomeCare Pro Member' : null,
  };
}

export function toPublicHomeCareSubscriptionDto(state) {
  if (!state) {
    return {
      isPro: false,
      planCode: FREE_PLAN_CODE,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      paymentIssue: false,
      memberLabel: null,
    };
  }
  return {
    isPro: state.isPro,
    planCode: state.isPro ? state.effectivePlanCode : FREE_PLAN_CODE,
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    paymentIssue: state.paymentIssue,
    memberLabel: state.showMemberBadge ? state.memberLabel : null,
    stripeSubscriptionId: state.stripeSubscriptionId || undefined,
    simulated: state.simulated || false,
  };
}

/**
 * Best HomeCare subscription row for a homeowner (paid plan families only).
 */
export async function loadBestHomeCareSubscription(pool, userId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM subscriptions
     WHERE user_id = $1
       AND plan_code = ANY($2::text[])
     ORDER BY
       CASE
         WHEN status IN ('active', 'trialing') THEN 0
         WHEN status = 'past_due' THEN 1
         ELSE 2
       END,
       created_at DESC
     LIMIT 1`,
    [userId, PAID_HOME_CARE_PLAN_CODES]
  );
  return rows[0] || null;
}

/**
 * Sync users.plan_code from authoritative subscription state.
 * Returns resolved state for API responses.
 */
const entitlementCache = new Map();
const ENTITLEMENT_TTL_MS = 15_000;

export function invalidateHomeCareEntitlementCache(userId) {
  if (userId == null) entitlementCache.clear();
  else entitlementCache.delete(Number(userId));
}

export async function syncUserHomeCareEntitlement(pool, userId, { now = new Date(), force = false } = {}) {
  const cached = entitlementCache.get(Number(userId));
  if (!force && cached && Date.now() - cached.at < ENTITLEMENT_TTL_MS) {
    return cached.state;
  }
  const { rows: userRows } = await pool.query(`SELECT plan_code, email FROM users WHERE id=$1`, [userId]);
  if (await ensureQaGuidedDiyEntitlement(pool, userId, userRows[0]?.email)) {
    invalidateHomeCareEntitlementCache(userId);
  }
  const subscription = await loadBestHomeCareSubscription(pool, userId);
  const storedPlanCode = userRows[0]?.plan_code || null;

  const state = resolveHomeCareSubscriptionState({
    subscription,
    userPlanCode: storedPlanCode,
    now,
  });

  const nextPlanCode = state.isPro ? state.effectivePlanCode : null;
  if (storedPlanCode !== nextPlanCode) {
    await pool.query(`UPDATE users SET plan_code=$1 WHERE id=$2`, [nextPlanCode, userId]);
  }

  // Expire subscription rows whose paid period has ended
  if (
    subscription &&
    subscription.current_period_end &&
    !isPeriodValid(subscription.current_period_end, now) &&
    ['active', 'trialing'].includes(String(subscription.status || '').toLowerCase())
  ) {
    await pool.query(`UPDATE subscriptions SET status='expired' WHERE id=$1`, [subscription.id]);
    if (nextPlanCode) {
      await pool.query(`UPDATE users SET plan_code=NULL WHERE id=$1`, [userId]);
      state.isPro = false;
      state.effectivePlanCode = null;
      state.showMemberBadge = false;
      state.memberLabel = null;
    }
  }

  entitlementCache.set(Number(userId), { at: Date.now(), state });
  return state;
}

export async function syncEntitlementForStripeSubscriptionId(pool, stripeSubscriptionId, stripeSub = null) {
  if (!stripeSubscriptionId) return null;
  const { rows } = await pool.query(
    `SELECT user_id FROM subscriptions WHERE stripe_subscription_id=$1 LIMIT 1`,
    [stripeSubscriptionId]
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  invalidateHomeCareEntitlementCache(userId);
  return syncUserHomeCareEntitlement(pool, userId, { force: true });
}

/**
 * Apply Stripe subscription object fields to our subscriptions row, then sync user entitlement.
 */
export async function applyStripeSubscriptionObject(pool, stripeSub) {
  if (!stripeSub?.id) return null;

  const status =
    stripeSub.status === 'canceled' || stripeSub.status === 'cancelled'
      ? 'canceled'
      : stripeSub.status || 'active';

  const metaPatch = {
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end === true,
    cancel_at_period_end: stripeSub.cancel_at_period_end === true,
    stripeStatus: stripeSub.status,
    updatedFromStripeAt: new Date().toISOString(),
  };

  const { rows: existing } = await pool.query(
    `SELECT id, user_id, meta FROM subscriptions WHERE stripe_subscription_id=$1 LIMIT 1`,
    [stripeSub.id]
  );

  if (existing[0]) {
    const mergedMeta = { ...parseSubscriptionMeta(existing[0].meta), ...metaPatch };
    await pool.query(
      `UPDATE subscriptions
       SET status=$1,
           current_period_end=to_timestamp($2),
           meta=$3::jsonb
       WHERE id=$4`,
      [
        status,
        stripeSub.current_period_end || null,
        JSON.stringify(mergedMeta),
        existing[0].id,
      ]
    );
    return syncUserHomeCareEntitlement(pool, existing[0].user_id);
  }

  return null;
}

export async function applyInvoiceSubscriptionStatus(pool, stripeSubscriptionId, invoiceStatus) {
  if (!stripeSubscriptionId) return null;
  const nextStatus = invoiceStatus === 'paid' ? 'active' : 'past_due';
  const { rows } = await pool.query(
    `UPDATE subscriptions SET status=$1 WHERE stripe_subscription_id=$2 RETURNING user_id`,
    [nextStatus, stripeSubscriptionId]
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  invalidateHomeCareEntitlementCache(userId);
  return syncUserHomeCareEntitlement(pool, userId, { force: true });
}

export async function userHasActivePaidSubscription(pool, userId) {
  const sub = await loadBestHomeCareSubscription(pool, userId);
  return subscriptionGrantsProAccess(sub);
}

/** One normalized entitlement shape for API and feature gates. */
export async function getHomeCareEntitlement(pool, userId) {
  const state = await syncUserHomeCareEntitlement(pool, userId);
  const dto = toPublicHomeCareSubscriptionDto(state);
  return {
    plan: dto.planCode,
    status: dto.status,
    hasAccess: dto.isPro === true,
    cancelAtPeriodEnd: Boolean(dto.cancelAtPeriodEnd),
    currentPeriodEnd: dto.currentPeriodEnd,
    paymentIssue: Boolean(dto.paymentIssue),
    subscription: dto,
  };
}

export async function activateSubscriptionFromCheckout(pool, {
  userId,
  planCode,
  stripeSubscriptionId,
  stripeCustomerId,
  currentPeriodEnd,
  checkoutSessionId,
  meta = {},
}) {
  if (!userId || !planCode) return null;

  const family = String(planCode).includes('contractor')
    ? 'contractor'
    : String(planCode).includes('property') ||
        String(planCode).includes('portfolio') ||
        String(planCode).includes('brokerage')
      ? 'property'
      : 'diy';

  const periodEnd =
    currentPeriodEnd ||
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const subMeta = {
    planCode,
    checkoutSessionId: checkoutSessionId || null,
    stripeCustomerId: stripeCustomerId || null,
    activatedAt: new Date().toISOString(),
    ...meta,
  };

  if (stripeSubscriptionId) {
    const { rows: byStripe } = await pool.query(
      `SELECT id FROM subscriptions WHERE stripe_subscription_id=$1 LIMIT 1`,
      [stripeSubscriptionId]
    );
    if (byStripe[0]) {
      await pool.query(
        `UPDATE subscriptions
         SET plan_code=$1, plan_family=$2, status='active', current_period_end=$3,
             simulated=false, meta=COALESCE(meta, '{}'::jsonb) || $4::jsonb
         WHERE id=$5`,
        [planCode, family, periodEnd, JSON.stringify(subMeta), byStripe[0].id]
      );
    } else {
      await pool.query(
        `UPDATE subscriptions SET status='canceled'
         WHERE user_id=$1 AND status IN ('active', 'trialing', 'past_due')
           AND plan_code = ANY($2::text[])
           AND (stripe_subscription_id IS NULL OR stripe_subscription_id <> $3)`,
        [userId, PAID_HOME_CARE_PLAN_CODES, stripeSubscriptionId]
      );
      await pool.query(
        `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, stripe_subscription_id, simulated, current_period_end, meta)
         VALUES ($1,$2,$3,'active',$4,false,$5,$6)`,
        [userId, planCode, family, stripeSubscriptionId, periodEnd, JSON.stringify(subMeta)]
      );
    }
  } else {
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, stripe_subscription_id, simulated, current_period_end, meta)
       VALUES ($1,$2,$3,'active',$4,false,$5,$6)`,
      [userId, planCode, family, null, periodEnd, JSON.stringify(subMeta)]
    );
  }

  invalidateHomeCareEntitlementCache(userId);
  return syncUserHomeCareEntitlement(pool, userId, { force: true });
}
