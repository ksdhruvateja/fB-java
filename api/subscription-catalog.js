/** Launch subscription catalog — single source for API seeding and UI helpers. */

export const FREE_PLAN_CODE = 'free';
export const PAID_HOME_CARE_PLAN_CODE = 'homecare_pro';

/** Legacy paid codes still honored for existing subscribers. */
export const LEGACY_PAID_PLAN_CODES = ['pro_membership', 'homecare'];

export const PAID_HOME_CARE_PLAN_CODES = [PAID_HOME_CARE_PLAN_CODE, ...LEGACY_PAID_PLAN_CODES];

export function isPaidHomeCarePlan(code) {
  return PAID_HOME_CARE_PLAN_CODES.includes(String(code || '').trim());
}

export function isFreeTierPlan(code) {
  const c = String(code || '').trim();
  return !c || c === FREE_PLAN_CODE;
}

export const LAUNCH_SUBSCRIPTION_PLANS = [
  {
    code: FREE_PLAN_CODE,
    name: 'FixBridge Free',
    description: 'Use FixBridge when something breaks.',
    amount: 0,
    interval: 'month',
    theme: 'light',
    sortOrder: 1,
    highlight: false,
    unlocksDiy: true,
    trialDays: 0,
    ctaLabel: 'Included',
    features: [
      { label: 'AI assessment', included: true },
      { label: 'Safe DIY guidance', included: true },
      { label: 'Service requests', included: true },
      { label: 'Quotes & approvals', included: true },
      { label: 'Payments', included: true },
      { label: 'Job history', included: true },
      { label: 'Messages', included: true },
      { label: 'Basic home profile', included: true },
      { label: 'Property-aware AI', included: false },
      { label: 'Maintenance calendar', included: false },
      { label: 'Warranty & document vault', included: false },
      { label: 'Recurring cleaning & landscaping', included: false },
      { label: 'Priority request routing', included: false },
      { label: 'Reduced coordination fees', included: false },
      { label: 'AI quote second opinion', included: false },
      { label: 'Household sharing', included: false },
      { label: 'Annual AI Home Health Report', included: false },
    ],
  },
  {
    code: PAID_HOME_CARE_PLAN_CODE,
    name: 'HomeCare Pro',
    description: 'FixBridge helps manage the home all year.',
    amount: 29,
    interval: 'month',
    theme: 'blue',
    sortOrder: 2,
    highlight: true,
    unlocksDiy: true,
    trialDays: 7,
    ctaLabel: 'Upgrade to Pro',
    features: [
      { label: 'AI assessment', included: true },
      { label: 'Safe DIY guidance', included: true },
      { label: 'Service requests', included: true },
      { label: 'Quotes & approvals', included: true },
      { label: 'Payments', included: true },
      { label: 'Job history', included: true },
      { label: 'Messages', included: true },
      { label: 'Basic home profile', included: true },
      { label: 'Property-aware AI', included: true },
      { label: 'Maintenance calendar', included: true },
      { label: 'Warranty & document vault', included: true },
      { label: 'Recurring cleaning & landscaping', included: true },
      { label: 'Priority request routing', included: true },
      { label: 'Reduced coordination fees', included: true },
      { label: 'AI quote second opinion', included: true },
      { label: 'Household sharing', included: true },
      { label: 'Annual AI Home Health Report', included: true },
    ],
  },
];

export const PRO_SUBSCRIPTION_REQUIRED = 'PRO_SUBSCRIPTION_REQUIRED';
export { FEATURE_DISABLED } from './homecare-config.js';

export function proSubscriptionRequired(feature, message) {
  return {
    ok: false,
    code: PRO_SUBSCRIPTION_REQUIRED,
    feature: feature || null,
    message: message || 'HomeCare Pro is required for this feature.',
  };
}

/** @deprecated Use createRequireHomeCareFeature(pool) for entitlement + global disable checks. */
export function requirePaidHomeCarePlan(feature) {
  return (req, res, next) => {
    const planCode = req.authUser?.planCode ?? null;
    if (isPaidHomeCarePlan(planCode)) return next();
    return res.status(403).json(proSubscriptionRequired(feature));
  };
}

export const DEPRECATED_LAUNCH_PLAN_CODES = ['personal', 'pro_membership', 'homecare'];
