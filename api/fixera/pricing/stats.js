/**
 * Deterministic pricing statistics. Never ask a model to do this arithmetic.
 * Recommendations are decision support only — they do not write customer prices.
 */

const TEST_EMAIL = /^(smoke|test|qa)[.+_-]|demo\.homeowner\.[a-z0-9._-]+@example\.com$/i;
const TEST_EMAIL_LOOSE = /@(example\.com|mailinator\.com)$/i;

export function extractZip(value) {
  const match = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

export function isTestOrDemoRecord(row) {
  const email = String(row?.email || '').trim().toLowerCase();
  const title = String(row?.title || '');
  const notes = String(row?.internal_notes || '');
  if (!email && /\[(smoke|qa|test)\]/i.test(`${title} ${notes}`)) return true;
  if (TEST_EMAIL.test(email) || TEST_EMAIL_LOOSE.test(email)) return true;
  if (/smoke|demo homeowner|payment simulation/i.test(`${title} ${notes}`)) return true;
  return false;
}

export function isUsableQuoteAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 && n < 50000;
}

export function median(values) {
  const nums = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round(((nums[mid - 1] + nums[mid]) / 2) * 100) / 100;
}

export function percentile(values, p) {
  const nums = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1));
  return nums[idx];
}

/** Flag statistical outliers. Does not delete source rows. */
export function partitionOutliers(values) {
  const nums = values.filter((n) => isUsableQuoteAmount(n)).sort((a, b) => a - b);
  if (nums.length < 4) return { kept: nums, excluded: [], reason: nums.length ? null : 'insufficient_sample' };
  const q1 = percentile(nums, 25);
  const q3 = percentile(nums, 75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  const kept = nums.filter((n) => n >= lower && n <= upper);
  const excluded = nums.filter((n) => n < lower || n > upper);
  return {
    kept: kept.length >= 3 ? kept : nums,
    excluded: kept.length >= 3 ? excluded : [],
    reason: excluded.length && kept.length >= 3 ? 'iqr_outlier' : null,
  };
}

export function confidenceFromSample(sampleSize, level) {
  if (level !== 'zip' || sampleSize < 8) return 'LOW';
  if (sampleSize >= 20) return 'HIGH';
  return 'MEDIUM';
}

export function summarizeAmounts(values) {
  const { kept, excluded, reason } = partitionOutliers(values);
  if (!kept.length) {
    return {
      sampleSize: 0,
      median: null,
      mean: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      excludedCount: excluded.length,
      exclusionReason: reason,
    };
  }
  const sum = kept.reduce((a, b) => a + b, 0);
  return {
    sampleSize: kept.length,
    median: median(kept),
    mean: Math.round((sum / kept.length) * 100) / 100,
    p25: percentile(kept, 25),
    p75: percentile(kept, 75),
    min: kept[0],
    max: kept[kept.length - 1],
    excludedCount: excluded.length,
    exclusionReason: reason,
  };
}

export function classifyQuoteVsRange(amount, stats) {
  const quote = Number(amount);
  if (!stats?.sampleSize || stats.median == null || !Number.isFinite(quote)) {
    return { signal: 'insufficient_historical_data', differencePct: null };
  }
  const diff = ((quote - stats.median) / stats.median) * 100;
  const rounded = Math.round(diff * 10) / 10;
  if (stats.p25 != null && stats.p75 != null) {
    if (quote < stats.p25 * 0.7) return { signal: 'significant_outlier_low', differencePct: rounded };
    if (quote > stats.p75 * 1.35) return { signal: 'significant_outlier_high', differencePct: rounded };
    if (quote < stats.p25) return { signal: 'below_range', differencePct: rounded };
    if (quote > stats.p75) return { signal: 'above_range', differencePct: rounded };
    return { signal: 'within_expected_range', differencePct: rounded };
  }
  return { signal: 'insufficient_historical_data', differencePct: rounded };
}

export function acceptanceBands(rows) {
  const bands = [
    { label: 'under_median', accepted: 0, total: 0 },
    { label: 'around_median', accepted: 0, total: 0 },
    { label: 'above_median', accepted: 0, total: 0 },
  ];
  const amounts = rows.map((r) => Number(r.amount)).filter(isUsableQuoteAmount);
  const mid = median(amounts);
  if (mid == null || rows.length < 8) return { available: false, reason: 'insufficient_sample', bands: [] };
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!isUsableQuoteAmount(amount)) continue;
    const idx = amount < mid * 0.9 ? 0 : amount <= mid * 1.1 ? 1 : 2;
    bands[idx].total += 1;
    if (row.accepted) bands[idx].accepted += 1;
  }
  return {
    available: true,
    bands: bands.map((b) => ({
      ...b,
      rate: b.total ? Math.round((b.accepted / b.total) * 1000) / 10 : null,
    })),
  };
}
