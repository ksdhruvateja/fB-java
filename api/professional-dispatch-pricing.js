/**
 * Admin-controlled professional dispatch pricing — multi-line breakdown, server-authoritative totals.
 */

import { applyDiscountToAmount } from './discounts.js';
import { getDispatchFee } from './pricing.js';

export const DEFAULT_PROFESSIONAL_DISPATCH_LINES = [
  {
    key: 'assessment_coordination',
    label: 'FixBridge Assessment / Coordination',
    amount_cents: 14900,
    enabled: true,
    line_type: 'charge',
  },
  {
    key: 'visit_diagnostic',
    label: 'Contractor Visit / Diagnostic',
    amount_cents: 9500,
    enabled: true,
    line_type: 'charge',
    timing_adjustable: true,
  },
  {
    key: 'beta_discount',
    label: 'Beta Discount',
    amount_cents: 14900,
    enabled: true,
    line_type: 'discount',
  },
];

export function resolveProfessionalDispatchConfig(rules = {}) {
  const cfg = rules?.professional_dispatch_pricing || {};
  const lines = Array.isArray(cfg.lines) && cfg.lines.length
    ? cfg.lines
    : DEFAULT_PROFESSIONAL_DISPATCH_LINES;
  return {
    version: cfg.version != null ? String(cfg.version) : '1',
    effective_from: cfg.effective_from || null,
    lines: lines.map((line) => ({
      key: String(line.key || ''),
      label: String(line.label || line.key || 'Fee'),
      amount_cents: Math.max(0, Math.round(Number(line.amount_cents) || 0)),
      enabled: line.enabled !== false,
      line_type: line.line_type === 'discount' ? 'discount' : 'charge',
      timing_adjustable: line.timing_adjustable === true,
    })),
  };
}

function visitAmountCentsForTiming(job, rules, baseCents) {
  const timing = String(job?.service_timing || 'weekday').toLowerCase();
  if (!timing || timing === 'weekday') return baseCents;
  const fee = getDispatchFee(job.service_timing, rules);
  const customer = Number(fee?.customer);
  if (Number.isFinite(customer) && customer > 0) {
    return Math.round(customer * 100);
  }
  return baseCents;
}

/**
 * Build homeowner-facing dispatch pricing breakdown (integer cents internally).
 */
export function buildProfessionalDispatchBreakdown(job, rules = {}, discount = null) {
  const config = resolveProfessionalDispatchConfig(rules);
  const displayLines = [];

  let chargesCents = 0;
  let discountsCents = 0;

  for (const line of config.lines) {
    if (!line.enabled || !line.key) continue;
    let amountCents = line.amount_cents;
    if (line.key === 'visit_diagnostic' && line.timing_adjustable) {
      amountCents = visitAmountCentsForTiming(job, rules, amountCents);
    }
    if (line.line_type === 'discount') {
      discountsCents += amountCents;
      displayLines.push({
        key: line.key,
        label: line.label,
        amount_cents: -amountCents,
        line_type: 'discount',
      });
    } else {
      chargesCents += amountCents;
      displayLines.push({
        key: line.key,
        label: line.label,
        amount_cents: amountCents,
        line_type: 'charge',
      });
    }
  }

  let subtotalCents = Math.max(0, chargesCents - discountsCents);

  let couponDiscountCents = 0;
  let couponCode = null;
  let couponId = null;
  let couponLabel = null;
  if (discount) {
    const applied = applyDiscountToAmount(subtotalCents / 100, discount);
    couponDiscountCents = Math.round(applied.discountAmount * 100);
    couponCode = discount.code || null;
    couponId = discount.id || null;
    couponLabel = discount.label || null;
  }

  const authorizedNowCents = Math.max(0, subtotalCents - couponDiscountCents);

  const estLow = job?.customer_retail_estimate_low != null ? Number(job.customer_retail_estimate_low) : null;
  const estHigh = job?.customer_retail_estimate_high != null ? Number(job.customer_retail_estimate_high) : null;
  const serviceAmount =
    estLow != null && estHigh != null
      ? Math.round(((estLow + estHigh) / 2) * 100) / 100
      : estLow != null
        ? estLow
        : estHigh != null
          ? estHigh
          : null;

  return {
    lines: displayLines,
    chargesCents,
    discountsCents,
    subtotalCents,
    couponDiscountCents,
    couponCode,
    couponId,
    couponLabel,
    authorizedNowCents,
    authorizedNow: authorizedNowCents / 100,
    currency: 'usd',
    pricingVersion: config.version,
    pricingEffectiveFrom: config.effective_from,
    repairWorkIncluded: false,
    repairWorkNote:
      'Any repair or additional work will require a separate estimate/quote and your approval before work proceeds.',
    // Legacy checkout fields
    serviceFee: subtotalCents / 100,
    couponDiscount: couponDiscountCents / 100,
    finalAmount: authorizedNowCents / 100,
    serviceAmount,
    serviceAmountLow: estLow,
    serviceAmountHigh: estHigh,
    customerId: job?.homeowner_user_id ? Number(job.homeowner_user_id) : null,
    propertyId: job?.property_id ? Number(job.property_id) : null,
    serviceRequestId: job?.id != null ? Number(job.id) : null,
    bookingId: job?.booking_id || (job?.id != null ? `FB-${job.id}` : null),
    serviceTitle: job?.title || job?.category || 'Service request',
    serviceCategory: job?.category || null,
    preferredDate: job?.preferred_date || null,
    preferredTimeSlot: job?.preferred_time_slot || null,
    serviceTiming: job?.service_timing || null,
    address: job?.full_address || job?.city_state_zip || null,
    createdAt: new Date().toISOString(),
  };
}

export async function saveProfessionalDispatchSnapshot(pool, {
  jobId,
  userId,
  breakdown,
  paymentId = null,
}) {
  if (!pool || !jobId || !breakdown) return null;
  const { rows } = await pool.query(
    `INSERT INTO professional_dispatch_snapshots (
       job_id, user_id, payment_id, pricing_version, lines,
       authorized_now_cents, currency, coupon_code, coupon_discount_cents, snapshot_data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      jobId,
      userId,
      paymentId,
      breakdown.pricingVersion || '1',
      JSON.stringify(breakdown.lines || []),
      breakdown.authorizedNowCents,
      breakdown.currency || 'usd',
      breakdown.couponCode,
      breakdown.couponDiscountCents || 0,
      JSON.stringify(breakdown),
    ]
  );
  return rows[0]?.id || null;
}
