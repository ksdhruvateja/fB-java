/**
 * Fixera Pricing Intelligence.
 * Uses real contractor quotes and accepted outcomes only.
 * Never treats a Fixera recommendation as market evidence.
 * Does not change production pricing rules.
 */

import {
  acceptanceBands,
  classifyQuoteVsRange,
  confidenceFromSample,
  extractZip,
  isTestOrDemoRecord,
  isUsableQuoteAmount,
  summarizeAmounts,
} from './stats.js';

const ACCEPTED = new Set(['approved', 'accepted', 'converted', 'paid', 'completed']);

export function quoteRowFromProposal(row) {
  const amount = row.contractor_quote_amount != null
    ? Number(row.contractor_quote_amount)
    : row.contractor_net != null
      ? Number(row.contractor_net)
      : null;
  return {
    proposalId: row.id,
    jobId: row.job_id,
    amount,
    finalAmount: row.retail_amount != null ? Number(row.retail_amount) : null,
    status: row.status,
    accepted: ACCEPTED.has(String(row.status || '').toLowerCase()) || Boolean(row.approved_at),
    category: row.category || null,
    subcategory: row.service_subcategory || null,
    zip: extractZip(row.city_state_zip),
    email: row.email || null,
    title: row.title || null,
    contractorUserId: row.contractor_user_id || null,
  };
}

export function selectComparableQuotes(rows, { zip, category, subcategory } = {}) {
  const usable = (rows || [])
    .map(quoteRowFromProposal)
    .filter((row) => isUsableQuoteAmount(row.amount) && !isTestOrDemoRecord(row));

  const cat = String(category || '').trim().toLowerCase();
  const sub = String(subcategory || '').trim().toLowerCase();
  const zip5 = extractZip(zip);

  const byCategory = (list) => {
    if (!cat) return list;
    const exact = list.filter((r) => String(r.category || '').toLowerCase() === cat);
    return exact.length ? exact : list.filter((r) => String(r.category || '').toLowerCase().includes(cat));
  };

  const scoped = byCategory(usable);
  const zipMatches = zip5 ? scoped.filter((r) => r.zip === zip5) : [];
  const zip3 = zip5 ? zip5.slice(0, 3) : null;
  const nearby = zip3
    ? scoped.filter((r) => r.zip && r.zip.slice(0, 3) === zip3 && r.zip !== zip5)
    : [];

  let level = 'none';
  let selected = [];
  if (zipMatches.length >= 3) {
    level = 'zip';
    selected = zipMatches;
  } else if (zipMatches.length + nearby.length >= 3) {
    level = 'nearby_zip';
    selected = [...zipMatches, ...nearby];
  } else if (scoped.length >= 3) {
    level = 'regional_category';
    selected = scoped;
  } else {
    level = scoped.length ? 'insufficient' : 'none';
    selected = scoped;
  }

  if (sub) {
    const subMatches = selected.filter((r) => String(r.subcategory || '').toLowerCase() === sub);
    if (subMatches.length >= 3) selected = subMatches;
  }

  const stats = summarizeAmounts(selected.map((r) => r.amount));
  const confidence = confidenceFromSample(stats.sampleSize, level === 'zip' ? 'zip' : 'broader');
  return {
    level,
    confidence,
    stats,
    sampleJobIds: selected.slice(0, 12).map((r) => r.jobId),
    acceptance: acceptanceBands(selected.map((r) => ({ amount: r.amount, accepted: r.accepted }))),
    excludedTestRecords: (rows || []).filter((r) => isTestOrDemoRecord(quoteRowFromProposal(r))).length,
  };
}

export function evaluateCurrentQuote(amount, comparison) {
  const classified = classifyQuoteVsRange(amount, comparison.stats);
  const reasons = [];
  if (comparison.level === 'nearby_zip') reasons.push('Exact ZIP sample was sparse; nearby ZIP codes were included.');
  if (comparison.level === 'regional_category') reasons.push('Regional category comparison used because local sample is small.');
  if (comparison.confidence === 'LOW') reasons.push('Do not treat this as precise ZIP intelligence.');
  if (classified.signal === 'above_range') reasons.push('Quote is above the typical historical range. Review before sending. This is not an automatic price change.');
  if (classified.signal === 'significant_outlier_high') reasons.push('Quote is a high outlier versus historical contractor quotes. Admin review recommended.');
  return {
    currentQuote: Number.isFinite(Number(amount)) ? Number(amount) : null,
    signal: classified.signal,
    differencePct: classified.differencePct,
    recommendedAction: classified.signal === 'within_expected_range' || classified.signal === 'insufficient_historical_data'
      ? 'no_automatic_change'
      : 'review_quote_before_sending',
    authority: 'admin_pricing_rules_remain_authoritative',
    fact: comparison.stats.sampleSize
      ? `Comparable contractor quotes: ${comparison.stats.sampleSize}. Median $${comparison.stats.median}.`
      : 'Not enough comparable contractor quotes to calculate a market range.',
    interpretation: reasons,
  };
}

export async function loadContractorQuoteRows(pool, { limit = 400 } = {}) {
  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.job_id,
       p.contractor_quote_amount,
       p.contractor_net,
       p.retail_amount,
       p.status,
       p.approved_at,
       j.category,
       j.service_subcategory,
       j.city_state_zip,
       j.title,
       j.assigned_contractor_user_id AS contractor_user_id,
       u.email
     FROM proposals p
     JOIN managed_jobs j ON j.id = p.job_id
     LEFT JOIN users u ON u.id = j.homeowner_user_id
     WHERE COALESCE(p.contractor_quote_amount, p.contractor_net) > 0
       AND COALESCE(p.status, '') NOT IN ('cancelled', 'void', 'draft')
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [Math.min(1000, Math.max(1, limit))]
  );
  return rows;
}

export async function getPricingIntelligence(pool, filters = {}) {
  const rows = await loadContractorQuoteRows(pool, { limit: filters.limit || 400 });
  const comparison = selectComparableQuotes(rows, filters);
  const evaluation = filters.currentQuote != null
    ? evaluateCurrentQuote(filters.currentQuote, comparison)
    : null;
  return {
    assistant: 'Fixera',
    kind: 'pricing_intelligence',
    authority: 'Admin and backend pricing rules remain authoritative. Fixera does not change customer prices.',
    antiFeedbackLoop: 'Only stored contractor quotes and accepted outcomes are used. Fixera recommendations are not written back as market evidence.',
    zip: extractZip(filters.zip),
    category: filters.category || null,
    subcategory: filters.subcategory || null,
    comparisonLevel: comparison.level,
    confidence: comparison.confidence,
    typicalRange: comparison.stats.p25 != null && comparison.stats.p75 != null
      ? { low: comparison.stats.p25, high: comparison.stats.p75 }
      : null,
    median: comparison.stats.median,
    sampleSize: comparison.stats.sampleSize,
    mean: comparison.stats.mean,
    excludedOutliers: comparison.stats.excludedCount,
    exclusionReason: comparison.stats.exclusionReason,
    acceptance: comparison.acceptance,
    similarJobIds: comparison.sampleJobIds,
    excludedTestRecords: comparison.excludedTestRecords,
    evaluation,
    homeownerSafeSummary: comparison.stats.sampleSize >= 8 && comparison.stats.p25 != null
      ? `Estimated local range $${comparison.stats.p25}–$${comparison.stats.p75}`
      : null,
  };
}
