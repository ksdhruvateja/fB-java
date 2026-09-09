/**
 * Automatic local market intelligence for homeowner AI estimates.
 * Runs in the backend — not an admin-facing tool.
 */

import {
  DEFAULT_PRICING_RULES,
  getLocationFactorByZip,
  getZipMarketLabel,
  normalizeCategory,
  retailFromNet,
} from './pricing.js';
import { lookupZipPlace } from './zip-market.js';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const marketProfileCache = new Map();

/** Service-type cost multipliers vs standard repair baseline. */
export const SERVICE_TYPE_MULTIPLIERS = {
  diagnostic: 0.55,
  maintenance: 0.65,
  minor_repair: 0.85,
  standard_repair: 1.0,
  major_repair: 1.45,
  emergency: 1.35,
  installation: 1.75,
  replacement: 2.4,
};

export function normalizeServiceType(raw) {
  const key = String(raw || 'standard_repair')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (SERVICE_TYPE_MULTIPLIERS[key] != null) return key;
  if (/replac|install|new unit|full system/i.test(key)) return 'replacement';
  if (/diagnos|inspect|troubleshoot/i.test(key)) return 'diagnostic';
  if (/maint|tune|clean/i.test(key)) return 'maintenance';
  if (/minor|small|quick/i.test(key)) return 'minor_repair';
  if (/major|extensive|rebuild/i.test(key)) return 'major_repair';
  if (/emerg|same.?day|urgent/i.test(key)) return 'emergency';
  return 'standard_repair';
}

export function serviceTypeMultiplier(serviceType) {
  return SERVICE_TYPE_MULTIPLIERS[normalizeServiceType(serviceType)] ?? 1;
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

/** IQR-based outlier filter — returns trimmed values. */
export function filterOutliers(values, { minSamples = 4 } = {}) {
  const nums = (values || []).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (nums.length < minSamples) return nums;
  const q1 = percentile(nums, 25);
  const q3 = percentile(nums, 75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const trimmed = nums.filter((n) => n >= lower && n <= upper);
  return trimmed.length >= 2 ? trimmed : nums;
}

/** Recency weight: 0–1 based on age in days. */
function recencyWeight(createdAt, halfLifeDays = 45) {
  if (!createdAt) return 0.35;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / halfLifeDays);
}

function weightedMedian(items) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return median(sorted.map((i) => i.value));
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= total / 2) return Math.round(item.value);
  }
  return Math.round(sorted[sorted.length - 1].value);
}

function trendFromWindows(recent, prior) {
  const rMed = median(recent);
  const pMed = median(prior);
  if (rMed == null || pMed == null || pMed <= 0) return { direction: 'stable', pct: 0 };
  const pct = Math.round(((rMed - pMed) / pMed) * 1000) / 10;
  let direction = 'stable';
  if (pct >= 8) direction = 'increasing_rapidly';
  else if (pct >= 3) direction = 'increasing';
  else if (pct <= -5) direction = 'falling';
  return { direction, pct };
}

function seasonalDemandFactor(month = new Date().getMonth()) {
  // Northern hemisphere seasonal HVAC/plumbing demand heuristic
  if (month >= 5 && month <= 8) return { level: 'high', factor: 1.06 };
  if (month === 11 || month <= 1) return { level: 'elevated', factor: 1.03 };
  return { level: 'normal', factor: 1.0 };
}

function cacheKey({ zip, trade, serviceType, periodKey }) {
  return `${String(zip || '').slice(0, 5)}|${normalizeCategory(trade)}|${normalizeServiceType(serviceType)}|${periodKey || 'current'}`;
}

function geographicTier(zip, jobZip) {
  const z = String(zip || '').trim();
  const j = String(jobZip || '').trim();
  if (!z || !j) return 'regional';
  if (z === j) return 'exact_zip';
  if (z.slice(0, 3) === j.slice(0, 3)) return 'nearby_zip';
  if (z.slice(0, 2) === j.slice(0, 2)) return 'state_region';
  return 'regional';
}

function extractJobMid(row) {
  const low = Number(row.customer_retail_estimate_low ?? row.customerRetailEstimateLow);
  const high = Number(row.customer_retail_estimate_high ?? row.customerRetailEstimateHigh);
  if (Number.isFinite(low) && Number.isFinite(high) && high > 0) {
    return Math.round((low + high) / 2);
  }
  const completed = Number(row.completed_amount ?? row.customer_final_payment ?? row.retail_amount);
  if (Number.isFinite(completed) && completed > 0) return Math.round(completed);
  return null;
}

function resolveConfidenceLevel({ sampleCount, geoTier, aiConfidence, hasQuotes }) {
  const ai = num(aiConfidence, 0.5);
  if (sampleCount >= 5 && geoTier === 'exact_zip' && ai >= 0.65) return 'HIGH';
  if (sampleCount >= 2 || hasQuotes || ai >= 0.55) return 'MEDIUM';
  return 'LOW';
}

/**
 * Build a local market profile from FixBridge history + regional baselines.
 * Cached per ZIP + trade + service type.
 */
export async function buildLocalMarketProfile({
  zip,
  trade,
  serviceType = 'standard_repair',
  rules = DEFAULT_PRICING_RULES,
  jobs = [],
  bids = [],
  completedPayments = [],
  zipPlace = null,
  city = null,
  state = null,
  assessment = null,
  skipCache = false,
} = {}) {
  const cat = normalizeCategory(trade || assessment?.category);
  const svc = normalizeServiceType(serviceType || assessment?.service_type);
  const periodKey = `${new Date().getFullYear()}-${new Date().getMonth()}`;
  const key = cacheKey({ zip, trade: cat, serviceType: svc, periodKey });

  if (!skipCache && marketProfileCache.has(key)) {
    const cached = marketProfileCache.get(key);
    if (Date.now() - cached.at < CACHE_TTL_MS) return cached.profile;
  }

  const z = String(zip || '').trim().slice(0, 5);
  const prefix3 = z.slice(0, 3);
  const factor = getLocationFactorByZip(z) || Number(rules.location_factor) || 1;
  const market = getZipMarketLabel(z);
  const baseline = rules.trade_baselines?.[cat] || rules.trade_baselines.others;
  const svcMult = serviceTypeMultiplier(svc);

  const now = Date.now();
  const day30 = now - 30 * 24 * 60 * 60 * 1000;
  const day90 = now - 90 * 24 * 60 * 60 * 1000;
  const day180 = now - 180 * 24 * 60 * 60 * 1000;

  const relevantJobs = (jobs || []).filter((j) => {
    const jCat = normalizeCategory(j.category || j.title || '');
    const jZip = String(j.zip || '').trim();
    const tradeMatch = !cat || jCat === cat;
    const geoMatch =
      !z ||
      jZip === z ||
      jZip.startsWith(prefix3) ||
      jZip.slice(0, 2) === z.slice(0, 2);
    return tradeMatch && geoMatch && j.status !== 'draft' && j.status !== 'canceled';
  });

  const weightedJobMids = [];
  for (const j of relevantJobs) {
    const mid = extractJobMid(j);
    if (mid == null) continue;
    const tier = geographicTier(z, j.zip);
    const tierWeight =
      tier === 'exact_zip' ? 1.0 : tier === 'nearby_zip' ? 0.75 : tier === 'state_region' ? 0.45 : 0.25;
    weightedJobMids.push({
      value: mid,
      weight: recencyWeight(j.created_at || j.updated_at) * tierWeight,
      tier,
      createdAt: j.created_at,
    });
  }

  const jobMidsRaw = weightedJobMids.map((w) => w.value);
  const jobMids = filterOutliers(jobMidsRaw);
  const weightedJobFiltered = weightedJobMids.filter((w) => jobMids.includes(w.value));

  const quoteAmountsRaw = (bids || [])
    .map((b) => Number(b.net_total || b.netTotal))
    .filter((n) => Number.isFinite(n) && n > 0);
  const quoteAmounts = filterOutliers(quoteAmountsRaw);

  const completedRaw = (completedPayments || [])
    .map((p) => Number(p.amount))
    .filter((n) => Number.isFinite(n) && n > 0);
  const completedAmounts = filterOutliers(completedRaw);

  const recent30 = weightedJobFiltered
    .filter((w) => w.createdAt && new Date(w.createdAt).getTime() >= day30)
    .map((w) => w.value);
  const recent90 = weightedJobFiltered
    .filter((w) => w.createdAt && new Date(w.createdAt).getTime() >= day90)
    .map((w) => w.value);
  const prior90 = weightedJobFiltered
    .filter((w) => {
      const t = w.createdAt ? new Date(w.createdAt).getTime() : 0;
      return t >= day180 && t < day90;
    })
    .map((w) => w.value);

  const priceTrend = trendFromWindows(recent90.length ? recent90 : recent30, prior90);
  const seasonal = seasonalDemandFactor();

  const localMedian = weightedMedian(weightedJobFiltered);
  const quoteMedian = median(quoteAmounts);
  const completedMedian = median(completedAmounts);

  // Engine baseline from trade + ZIP + service type
  const complexity = String(assessment?.complexity || 'medium').toLowerCase();
  const complexityMult = complexity === 'high' ? 1.25 : complexity === 'low' ? 0.88 : 1.0;
  const hoursMid =
    ((num(assessment?.estimated_labor_hours_min, 1.5) + num(assessment?.estimated_labor_hours_max, 3)) / 2) ||
    2.5;
  const syntheticNet = Math.round(
    ((Number(baseline.trip) || 90) +
      hoursMid * (Number(baseline.hourly) || 100) +
      (Number(baseline.materials_allowance) || 80)) *
      svcMult *
      complexityMult
  );
  const engineRetail = retailFromNet(syntheticNet, rules, {
    zip: z,
    urgency: assessment?.urgency || 'medium',
  }).retail;

  // Blend sources with recency-weighted priority
  const sources = [];
  if (completedMedian != null) sources.push({ value: completedMedian, weight: 0.35 });
  if (quoteMedian != null) sources.push({ value: quoteMedian, weight: 0.28 });
  if (localMedian != null) sources.push({ value: localMedian, weight: 0.22 });
  sources.push({ value: engineRetail, weight: sources.length ? 0.15 : 1.0 });

  const totalW = sources.reduce((s, x) => s + x.weight, 0);
  const recommended = Math.round(sources.reduce((s, x) => s + x.value * (x.weight / totalW), 0));

  const spreadPct =
    resolveConfidenceLevel({
      sampleCount: jobMids.length,
      geoTier: relevantJobs.some((j) => String(j.zip) === z) ? 'exact_zip' : 'nearby_zip',
      aiConfidence: assessment?.confidence,
      hasQuotes: quoteAmounts.length > 0,
    }) === 'LOW'
      ? 0.28
      : resolveConfidenceLevel({
          sampleCount: jobMids.length,
          geoTier: 'exact_zip',
          aiConfidence: assessment?.confidence,
          hasQuotes: quoteAmounts.length > 0,
        }) === 'HIGH'
        ? 0.12
        : 0.18;

  const trendAdj = priceTrend.direction === 'increasing_rapidly' ? 1.04 : priceTrend.direction === 'increasing' ? 1.02 : priceTrend.direction === 'falling' ? 0.98 : 1;
  const adjustedRec = Math.round(recommended * seasonal.factor * trendAdj);
  const halfSpread = Math.max(50, Math.round(adjustedRec * spreadPct));
  const aiLow = Math.max(0, adjustedRec - halfSpread);
  const aiHigh = adjustedRec + halfSpread;

  const geoTierUsed =
    relevantJobs.some((j) => String(j.zip) === z)
      ? 'exact_zip'
      : relevantJobs.some((j) => String(j.zip || '').startsWith(prefix3))
        ? 'nearby_zip'
        : z
          ? 'regional'
          : 'national';

  const confidenceLevel = resolveConfidenceLevel({
    sampleCount: jobMids.length,
    geoTier: geoTierUsed,
    aiConfidence: assessment?.confidence,
    hasQuotes: quoteAmounts.length > 0,
  });

  const profile = {
    id: null,
    zip: z || null,
    city: city || zipPlace?.place || null,
    state: state || zipPlace?.state || null,
    county: null,
    market,
    trade: cat,
    serviceCategory: cat,
    serviceSubcategory: assessment?.service_subcategory || assessment?.problem_classification || null,
    serviceType: svc,
    problemClassification: assessment?.problem_classification || null,
    locationFactor: factor,
    geoTier: geoTierUsed,
    jobsAnalyzed: relevantJobs.length,
    quotesAnalyzed: quoteAmounts.length,
    completedJobsAnalyzed: completedAmounts.length,
    typicalRange: { low: aiLow, high: aiHigh },
    localMedian: localMedian ?? adjustedRec,
    medianContractorQuote: quoteMedian,
    medianCustomerEstimate: localMedian,
    medianCompletedAmount: completedMedian,
    aiEstimateLow: aiLow,
    aiEstimateHigh: aiHigh,
    aiRecommendedValue: adjustedRec,
    aiConfidence: confidenceLevel,
    seasonalDemand: seasonal.level,
    priceTrend: priceTrend.direction,
    priceTrendPct: priceTrend.pct,
    recentQuotes: quoteAmounts.slice(-8).reverse(),
    engineBaseline: engineRetail,
    serviceTypeMultiplier: svcMult,
    complexityMultiplier: complexityMult,
    dataSources: {
      fixbridgeJobs: jobMids.length,
      contractorQuotes: quoteAmounts.length,
      completedPayments: completedAmounts.length,
      engineBaseline: true,
    },
    basedOn:
      jobMids.length >= 2
        ? `Based on ${jobMids.length} comparable FixBridge job(s) near ZIP ${z || 'your area'} plus current ${market} market factors.`
        : quoteAmounts.length >= 1
          ? `Based on recent contractor quotes near ZIP ${z || 'your area'} and ${market} pricing factors.`
          : `Based on ${market} pricing factors for ${cat} services near ZIP ${z || 'your area'}.`,
    generatedAt: new Date().toISOString(),
    cacheKey: key,
  };

  marketProfileCache.set(key, { at: Date.now(), profile });
  return profile;
}

/** Load comparable FixBridge data for a ZIP + trade from the database. */
export async function loadMarketData(pool, { zip, trade, jobId = null, limit = 120 } = {}) {
  const z = String(zip || '').trim().slice(0, 5);
  const prefix3 = z.slice(0, 3);
  const cat = normalizeCategory(trade);

  if (!z) {
    return { jobs: [], bids: [], completedPayments: [], zipPlace: null };
  }

  const zipPlace = await lookupZipPlace(z);

  const { rows: jobs } = await pool.query(
    `SELECT id, zip, city, state, category, title, status, created_at, updated_at,
            customer_retail_estimate_low, customer_retail_estimate_high, ai_assessment
     FROM managed_jobs
     WHERE zip IS NOT NULL
       AND ($1::bigint IS NULL OR id <> $1)
       AND (zip = $2 OR zip LIKE $3 OR LEFT(zip, 2) = LEFT($2, 2))
       AND status NOT IN ('draft', 'canceled')
     ORDER BY created_at DESC
     LIMIT $4`,
    [jobId, z, `${prefix3}%`, limit]
  );

  const filtered = cat
    ? jobs.filter((j) => normalizeCategory(j.category || j.title || '') === cat)
    : jobs;

  const jobIds = filtered.map((j) => j.id);
  let bids = [];
  let completedPayments = [];

  if (jobIds.length) {
    const { rows: bidRows } = await pool.query(
      `SELECT job_id, net_total, labor, materials, travel_diagnostic, created_at
       FROM bids WHERE job_id = ANY($1::bigint[]) ORDER BY created_at DESC LIMIT 80`,
      [jobIds]
    );
    bids = bidRows;

    const { rows: payRows } = await pool.query(
      `SELECT job_id, amount, status, payment_type, created_at
       FROM payments
       WHERE job_id = ANY($1::bigint[]) AND status = 'succeeded'
       ORDER BY created_at DESC LIMIT 80`,
      [jobIds]
    );
    completedPayments = payRows.filter(
      (p) => String(p.payment_type || '').includes('retail') || String(p.payment_type || '').includes('service')
    );
  }

  return { jobs: filtered.length ? filtered : jobs, bids, completedPayments, zipPlace };
}

/** Persist immutable market snapshot used for an estimate. */
export async function saveMarketSnapshot(pool, {
  jobId,
  profile,
  pricing,
  rulesVersion = 'default',
  propertyZip,
  city,
  state,
  serviceCategory,
  serviceSubcategory,
} = {}) {
  if (!pool || !profile) return null;

  const internal = pricing?.internal || {};
  const raw = internal.ai_range_raw || {};
  const customerLow = pricing?.customer_retail_estimate_low;
  const customerHigh = pricing?.customer_retail_estimate_high;

  const { rows } = await pool.query(
    `INSERT INTO market_snapshots (
       job_id, property_zip, city, state, service_category, service_subcategory,
       market_profile, ai_estimate_low, ai_estimate_high, ai_recommended_value, ai_confidence,
       customer_estimate_low, customer_estimate_high, customer_recommended_value,
       pricing_rule_id, pricing_rule_version, generated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     RETURNING id`,
    [
      jobId || null,
      propertyZip || profile.zip || null,
      city || profile.city || null,
      state || profile.state || null,
      serviceCategory || profile.trade || null,
      serviceSubcategory || profile.serviceSubcategory || null,
      JSON.stringify(profile),
      profile.aiEstimateLow ?? raw.low ?? null,
      profile.aiEstimateHigh ?? raw.high ?? null,
      profile.aiRecommendedValue ?? internal.ai_recommended_raw ?? null,
      profile.aiConfidence || null,
      customerLow ?? null,
      customerHigh ?? null,
      internal.customer_recommended ?? null,
      rulesVersion,
      rulesVersion,
    ]
  );

  const snapshotId = rows[0]?.id ?? null;
  if (snapshotId && jobId) {
    await pool.query(
      `UPDATE managed_jobs SET market_snapshot_id=$1, similar_jobs_count=$2 WHERE id=$3`,
      [snapshotId, profile.jobsAnalyzed || 0, jobId]
    );
  }
  return snapshotId;
}

/** Backward-compatible wrapper for older imports. */
export function buildZipMarketProfile(opts = {}) {
  return buildLocalMarketProfile(opts);
}

export function clearMarketProfileCache() {
  marketProfileCache.clear();
}
