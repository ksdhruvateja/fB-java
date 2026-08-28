/**
 * Central HomeCare Pro configuration — single source for entitlements and product rules.
 * Security invariants (auth, ownership, IDOR) stay in route handlers; this module owns business rules.
 */
import { isPaidHomeCarePlan, FREE_PLAN_CODE, PAID_HOME_CARE_PLAN_CODE } from './subscription-catalog.js';

export const FEATURE_DISABLED = 'FEATURE_DISABLED';
export const PRO_SUBSCRIPTION_REQUIRED = 'PRO_SUBSCRIPTION_REQUIRED';

/** Stable feature IDs — add new Pro features here only. */
export const HOMECARE_FEATURE_IDS = [
  'ai_assessment',
  'diy_guidance',
  'service_requests',
  'quotes',
  'payments',
  'job_history',
  'messages',
  'basic_home_profile',
  'property_aware_ai',
  'maintenance_calendar',
  'document_vault',
  'recurring_cleaning',
  'recurring_landscaping',
  'priority_routing',
  'reduced_coordination_fees',
  'quote_second_opinion',
  'household_sharing',
  'annual_health_report',
];

const FREE_BASE_FEATURES = new Set([
  'ai_assessment',
  'diy_guidance',
  'service_requests',
  'quotes',
  'payments',
  'job_history',
  'messages',
  'basic_home_profile',
]);

const FEATURE_LABELS = {
  ai_assessment: 'AI Assessment',
  diy_guidance: 'DIY Guidance',
  service_requests: 'Service Requests',
  quotes: 'Quotes',
  payments: 'Payments',
  job_history: 'Job History',
  messages: 'Messages',
  basic_home_profile: 'Basic Home Profile',
  property_aware_ai: 'Property-Aware AI',
  maintenance_calendar: 'Maintenance Calendar',
  document_vault: 'Document Vault',
  recurring_cleaning: 'Recurring Cleaning',
  recurring_landscaping: 'Recurring Landscaping',
  priority_routing: 'Priority Routing',
  reduced_coordination_fees: 'Reduced Coordination Fee',
  quote_second_opinion: 'Quote Second Opinion',
  household_sharing: 'Household Sharing',
  annual_health_report: 'Annual Home Health Report',
};

function defaultFeatureEntitlements() {
  const features = {};
  for (const id of HOMECARE_FEATURE_IDS) {
    const isBase = FREE_BASE_FEATURES.has(id);
    features[id] = {
      enabled: true,
      free: isBase,
      pro: true,
      label: FEATURE_LABELS[id] || id,
    };
  }
  return features;
}

export const DEFAULT_HOMECARE_CONFIG = {
  configVersion: 1,
  features: defaultFeatureEntitlements(),
  priorityRouting: {
    enabled: true,
    level: 'elevated', // standard | elevated | high
    showWorkQueueBadge: true,
    showDispatchBadge: true,
  },
  recurring: {
    cleaningEnabled: true,
    landscapingEnabled: true,
    frequencies: {
      weekly: true,
      biweekly: true,
      monthly: true,
    },
    fulfillmentMode: 'manual',
    schedulerAvailable: false,
    leadTimeDays: 7,
    remindersEnabled: true,
    reminderLeadHours: 24,
  },
  maintenance: {
    enabled: true,
    remindersEnabled: false,
    reminderDaysBefore: 7,
    manualEntriesAllowed: true,
    recommendationsEnabled: true,
    reminderChannels: {
      inApp: true,
      email: false,
      sms: false,
    },
  },
  documents: {
    enabled: true,
    maxFileSizeMb: 4,
    maxDocumentsPerProperty: 100,
    aiScanEnabled: true,
    warrantyExtractionEnabled: true,
    /** Security allowlist enforced in upload handler — not admin-editable */
  },
  household: {
    enabled: true,
    maxMembersPerProperty: 5,
    inviteExpirationDays: 7,
    roles: {
      viewer: true,
      member: true,
      manager: true,
    },
  },
  homeHealthReport: {
    enabled: true,
    timingMode: 'rolling_12_months', // subscription_anniversary | calendar_year
    minDaysBetweenReports: 365,
    includeMaintenance: true,
    includeJobHistory: true,
    includeSystems: true,
    includeWarrantyAlerts: true,
    includeRecurringIssues: true,
    includeRecommendations: true,
  },
  quoteSecondOpinion: {
    enabled: true,
    maxPerQuote: 3,
    cacheResult: true,
  },
  propertyAwareAi: {
    enabled: true,
    includeProfile: true,
    includeSystems: true,
    includeJobHistory: true,
    includeMaintenance: true,
    includeWarrantyMetadata: true,
  },
  upgrade: {
    headline: 'Upgrade to HomeCare Pro',
    cta: 'Upgrade to HomeCare Pro',
    description: 'FixBridge helps manage the home all year.',
  },
  featureCopy: {},
};

let cachedConfig = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

function clampInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function clampNum(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function sanitizeText(s, maxLen = 500) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function deepMergeFeatures(defaults, incoming) {
  const out = { ...defaults };
  if (!incoming || typeof incoming !== 'object') return out;
  for (const id of HOMECARE_FEATURE_IDS) {
    const base = defaults[id] || { enabled: true, free: false, pro: true, label: FEATURE_LABELS[id] };
    const patch = incoming[id];
    if (!patch || typeof patch !== 'object') {
      out[id] = { ...base };
      continue;
    }
    out[id] = {
      enabled: patch.enabled !== false,
      free: Boolean(patch.free),
      pro: patch.pro !== false,
      label: sanitizeText(patch.label || base.label, 120) || base.label,
      benefit: patch.benefit != null ? sanitizeText(patch.benefit, 400) : base.benefit,
    };
  }
  return out;
}

export function mergeHomeCareConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_HOMECARE_CONFIG;
  const pr = src.priorityRouting || {};
  const rec = src.recurring || {};
  const maint = src.maintenance || {};
  const docs = src.documents || {};
  const hh = src.household || {};
  const report = src.homeHealthReport || {};
  const qso = src.quoteSecondOpinion || {};
  const pai = src.propertyAwareAi || {};
  const up = src.upgrade || {};

  return {
    configVersion: clampInt(src.configVersion, 1, 9999, d.configVersion),
    features: deepMergeFeatures(d.features, src.features),
    priorityRouting: {
      enabled: pr.enabled !== false,
      level: ['standard', 'elevated', 'high'].includes(pr.level) ? pr.level : d.priorityRouting.level,
      showWorkQueueBadge: pr.showWorkQueueBadge !== false,
      showDispatchBadge: pr.showDispatchBadge !== false,
    },
    recurring: {
      cleaningEnabled: rec.cleaningEnabled !== false,
      landscapingEnabled: rec.landscapingEnabled !== false,
      frequencies: {
        weekly: rec.frequencies?.weekly !== false,
        biweekly: rec.frequencies?.biweekly !== false,
        monthly: rec.frequencies?.monthly !== false,
      },
      fulfillmentMode: rec.fulfillmentMode === 'automatic' && rec.schedulerAvailable ? 'automatic' : 'manual',
      schedulerAvailable: Boolean(rec.schedulerAvailable),
      leadTimeDays: clampInt(rec.leadTimeDays, 1, 90, d.recurring.leadTimeDays),
      remindersEnabled: rec.remindersEnabled !== false,
      reminderLeadHours: clampInt(rec.reminderLeadHours, 1, 168, d.recurring.reminderLeadHours),
    },
    maintenance: {
      enabled: maint.enabled !== false,
      remindersEnabled: Boolean(maint.remindersEnabled),
      reminderDaysBefore: clampInt(maint.reminderDaysBefore, 1, 60, d.maintenance.reminderDaysBefore),
      manualEntriesAllowed: maint.manualEntriesAllowed !== false,
      recommendationsEnabled: maint.recommendationsEnabled !== false,
      reminderChannels: {
        inApp: maint.reminderChannels?.inApp !== false,
        email: Boolean(maint.reminderChannels?.email),
        sms: Boolean(maint.reminderChannels?.sms),
      },
    },
    documents: {
      enabled: docs.enabled !== false,
      maxFileSizeMb: clampInt(docs.maxFileSizeMb, 1, 25, d.documents.maxFileSizeMb),
      maxDocumentsPerProperty: clampInt(docs.maxDocumentsPerProperty, 1, 500, d.documents.maxDocumentsPerProperty),
      aiScanEnabled: docs.aiScanEnabled !== false,
      warrantyExtractionEnabled: docs.warrantyExtractionEnabled !== false,
    },
    household: {
      enabled: hh.enabled !== false,
      maxMembersPerProperty: clampInt(hh.maxMembersPerProperty, 1, 20, d.household.maxMembersPerProperty),
      inviteExpirationDays: clampInt(hh.inviteExpirationDays, 1, 30, d.household.inviteExpirationDays),
      roles: {
        viewer: hh.roles?.viewer !== false,
        member: hh.roles?.member !== false,
        manager: hh.roles?.manager !== false,
      },
    },
    homeHealthReport: {
      enabled: report.enabled !== false,
      timingMode: ['rolling_12_months', 'subscription_anniversary', 'calendar_year'].includes(report.timingMode)
        ? report.timingMode
        : d.homeHealthReport.timingMode,
      minDaysBetweenReports: clampInt(report.minDaysBetweenReports, 30, 730, d.homeHealthReport.minDaysBetweenReports),
      includeMaintenance: report.includeMaintenance !== false,
      includeJobHistory: report.includeJobHistory !== false,
      includeSystems: report.includeSystems !== false,
      includeWarrantyAlerts: report.includeWarrantyAlerts !== false,
      includeRecurringIssues: report.includeRecurringIssues !== false,
      includeRecommendations: report.includeRecommendations !== false,
    },
    quoteSecondOpinion: {
      enabled: qso.enabled !== false,
      maxPerQuote: clampInt(qso.maxPerQuote, 1, 10, d.quoteSecondOpinion.maxPerQuote),
      cacheResult: qso.cacheResult !== false,
    },
    propertyAwareAi: {
      enabled: pai.enabled !== false,
      includeProfile: pai.includeProfile !== false,
      includeSystems: pai.includeSystems !== false,
      includeJobHistory: pai.includeJobHistory !== false,
      includeMaintenance: pai.includeMaintenance !== false,
      includeWarrantyMetadata: pai.includeWarrantyMetadata !== false,
    },
    upgrade: {
      headline: sanitizeText(up.headline || d.upgrade.headline, 120) || d.upgrade.headline,
      cta: sanitizeText(up.cta || d.upgrade.cta, 80) || d.upgrade.cta,
      description: sanitizeText(up.description || d.upgrade.description, 400) || d.upgrade.description,
    },
    featureCopy: typeof src.featureCopy === 'object' && src.featureCopy ? src.featureCopy : {},
  };
}

export function invalidateHomeCareConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

export async function getHomeCareConfig(pool, { fresh = false } = {}) {
  if (!fresh && cachedConfig && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  let row = null;
  try {
    const { rows } = await pool.query(
      `SELECT config, updated_at, config_version FROM homecare_settings WHERE id='default'`
    );
    row = rows[0] || null;
  } catch {
    row = null;
  }
  const merged = mergeHomeCareConfig(row?.config);
  cachedConfig = {
    ...merged,
    updatedAt: row?.updated_at || null,
    configVersion: row?.config_version ?? merged.configVersion,
  };
  cachedAt = Date.now();
  return cachedConfig;
}

export function priorityTierForConfig(config, planCode) {
  if (!config?.priorityRouting?.enabled) return 'standard';
  if (!isPaidHomeCarePlan(planCode)) return 'standard';
  const feat = config.features?.priority_routing;
  if (!feat?.enabled || !feat.pro) return 'standard';
  const level = config.priorityRouting.level;
  if (level === 'high') return 'homecare_pro_high';
  if (level === 'elevated') return 'homecare_pro';
  return 'standard';
}

export function prioritySortWeight(tier) {
  if (tier === 'emergency') return 0;
  if (tier === 'homecare_pro_high') return 1;
  if (tier === 'homecare_pro') return 2;
  return 3;
}

export function isRecurrenceAllowed(config, recurrence) {
  const key = String(recurrence || '').trim();
  return Boolean(config?.recurring?.frequencies?.[key]);
}

export function isRecurringServiceTypeAllowed(config, serviceType) {
  if (serviceType === 'recurring_cleaning') return Boolean(config?.recurring?.cleaningEnabled);
  if (serviceType === 'recurring_landscaping') return Boolean(config?.recurring?.landscapingEnabled);
  return false;
}

export function reportEligibilityMs(config) {
  const days = config?.homeHealthReport?.minDaysBetweenReports ?? 365;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Resolve whether a user may access a feature.
 * Does NOT replace property ownership checks — call those separately in routes.
 */
export async function resolveFeatureEntitlement(pool, { user, feature, planCode: planOverride }) {
  const featureId = String(feature || '').trim();
  if (!HOMECARE_FEATURE_IDS.includes(featureId)) {
    return { allowed: false, reason: 'UNKNOWN_FEATURE', feature: featureId, plan: null };
  }
  const config = await getHomeCareConfig(pool);
  const feat = config.features[featureId];
  if (!feat?.enabled) {
    return {
      allowed: false,
      reason: FEATURE_DISABLED,
      feature: featureId,
      plan: user?.planCode ?? planOverride ?? null,
      message: `${feat?.label || featureId} is currently unavailable.`,
    };
  }
  const planCode = planOverride ?? user?.planCode ?? FREE_PLAN_CODE;
  const isPro = isPaidHomeCarePlan(planCode);
  const planAllows = isPro ? feat.pro : feat.free;
  if (!planAllows) {
    return {
      allowed: false,
      reason: PRO_SUBSCRIPTION_REQUIRED,
      feature: featureId,
      plan: planCode,
      message: 'HomeCare Pro is required for this feature.',
    };
  }
  return { allowed: true, reason: 'OK', feature: featureId, plan: planCode };
}

export function entitlementDeniedPayload(result) {
  if (result.reason === FEATURE_DISABLED) {
    return {
      ok: false,
      code: FEATURE_DISABLED,
      feature: result.feature,
      message: result.message || 'This feature is currently unavailable.',
    };
  }
  if (result.reason === PRO_SUBSCRIPTION_REQUIRED) {
    return {
      ok: false,
      code: PRO_SUBSCRIPTION_REQUIRED,
      feature: result.feature,
      message: result.message || 'HomeCare Pro is required for this feature.',
    };
  }
  return { ok: false, code: result.reason || 'FORBIDDEN', feature: result.feature };
}

export function createRequireHomeCareFeature(pool) {
  return function requireHomeCareFeature(feature) {
    return async (req, res, next) => {
      try {
        const result = await resolveFeatureEntitlement(pool, { user: req.authUser, feature });
        if (result.allowed) return next();
        const status = result.reason === FEATURE_DISABLED ? 403 : 403;
        return res.status(status).json(entitlementDeniedPayload(result));
      } catch (e) {
        console.error('requireHomeCareFeature:', e);
        return res.status(500).json({ ok: false, message: 'Could not verify feature access.' });
      }
    };
  };
}

/** Sanitized DTO for homeowner-facing clients — no internal ops weights or secrets. */
export function toPublicHomeCareConfig(config, { planCode } = {}) {
  const isPro = isPaidHomeCarePlan(planCode);
  const features = {};
  for (const id of HOMECARE_FEATURE_IDS) {
    const f = config.features[id];
    if (!f) continue;
    const entitled = f.enabled && (isPro ? f.pro : f.free);
    features[id] = {
      enabled: f.enabled,
      entitled,
      label: f.label,
      requiresPro: f.enabled && !f.free && f.pro,
    };
  }
  return {
    configVersion: config.configVersion,
    updatedAt: config.updatedAt || null,
    planCodes: { free: FREE_PLAN_CODE, pro: PAID_HOME_CARE_PLAN_CODE },
    features,
    upgrade: config.upgrade,
    recurring: {
      cleaningEnabled: config.recurring.cleaningEnabled,
      landscapingEnabled: config.recurring.landscapingEnabled,
      frequencies: config.recurring.frequencies,
      fulfillmentMode: config.recurring.fulfillmentMode,
      schedulerAvailable: config.recurring.schedulerAvailable,
      remindersEnabled: config.recurring.remindersEnabled,
      reminderLeadHours: config.recurring.reminderLeadHours,
    },
    maintenance: { enabled: config.maintenance.enabled },
    documents: {
      enabled: config.documents.enabled,
      maxFileSizeMb: config.documents.maxFileSizeMb,
      maxDocumentsPerProperty: config.documents.maxDocumentsPerProperty,
    },
    household: {
      enabled: config.household.enabled,
      maxMembersPerProperty: config.household.maxMembersPerProperty,
    },
    homeHealthReport: {
      enabled: config.homeHealthReport.enabled,
      minDaysBetweenReports: config.homeHealthReport.minDaysBetweenReports,
    },
  };
}

/** Detect disruptive entitlement changes for admin confirmation. */
export function detectEntitlementWarnings(prev, next) {
  const warnings = [];
  for (const id of HOMECARE_FEATURE_IDS) {
    const was = prev.features[id];
    const now = next.features[id];
    if (!was || !now) continue;
    if (was.free && !now.free && now.pro) {
      warnings.push(`${was.label}: moved from Free to Pro-only — existing Free users lose access.`);
    }
    if (was.enabled && !now.enabled) {
      warnings.push(`${was.label}: globally disabled — all users lose access.`);
    }
  }
  return warnings;
}

export function patchHomeCareConfig(current, patch) {
  const base = mergeHomeCareConfig(current);
  const merged = mergeHomeCareConfig({ ...base, ...patch, features: { ...base.features, ...(patch.features || {}) } });
  return merged;
}
