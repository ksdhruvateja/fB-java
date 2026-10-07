/**
 * Admin-controlled professional dispatch pricing — multi-line breakdown, server-authoritative totals.
 * All amounts are integer cents internally; format to dollars only for display.
 */

import { applyDiscountToAmount } from './discounts.js';
import { getDispatchFee, resolveBookingFeeCents } from './pricing.js';

export const DEFAULT_PROFESSIONAL_DISPATCH_LINES = [{ key: 'professional_booking', label: 'Professional booking / dispatch fee', amount_cents: 12500, enabled: true, line_type: 'charge' }];

export function bookingServiceId(job = {}) {
  const category = String(job.category || job.serviceCategory || '').toLowerCase();
  const aliases = { hvac: 'hvac_heating_cooling', roofing: 'roofing_gutters', snow_removal: 'snow_removal', appliance_repair: 'appliances' };
  return aliases[category] || category.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function validateServiceBookingPricing(config = {}) {
  const centsValid = value => Number.isSafeInteger(value) && value >= 0 && value <= 99999999;
  const serviceValid = id => /^[a-z0-9][a-z0-9_]{0,99}$/.test(id);
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { ok:false, message:'Invalid service pricing configuration.' };
  if (config.by_service != null && (!config.by_service || typeof config.by_service !== 'object' || Array.isArray(config.by_service))) return { ok:false, message:'Service fees must be keyed by service.' };
  for (const [id, value] of Object.entries(config.by_service || {})) {
    if (!serviceValid(id) || !centsValid(value)) return { ok:false, message:'Service fees must be nonnegative integer USD cents, up to $999,999.99.' };
  }
  if (config.additional_charges != null && (!Array.isArray(config.additional_charges) || config.additional_charges.length > 30)) return { ok:false, message:'Use up to 30 additional charges.' };
  const keys = new Set();
  for (const line of config.additional_charges || []) {
    if (!line || !serviceValid(line.key || '') || keys.has(line.key) || line.key === 'professional_booking' || typeof line.label !== 'string' || !line.label.trim() || line.label.length > 100 || !centsValid(line.amount_cents) || line.basis !== 'flat' || !['always','weekday','same-day','evening-weekend'].includes(line.applies_when) || !Array.isArray(line.service_ids) || !line.service_ids.every(serviceValid)) return { ok:false, message:'Every additional charge needs a unique key, name, valid amount, flat-per-booking basis, service scope and timing condition.' };
    keys.add(line.key);
  }
  return { ok:true };
}

export function resolveProfessionalDispatchConfig(rules = {}, job = {}) {
  const config = rules.professional_dispatch_pricing || {};
  const id = bookingServiceId(job);
  const override = config.by_service?.[id];
  const base = Number.isSafeInteger(override) && override >= 0 ? override : resolveBookingFeeCents(rules);
  const extra = (Array.isArray(config.additional_charges) ? config.additional_charges : []).filter(line => line.enabled !== false &&
    (Array.isArray(line.service_ids) && (line.service_ids.length === 0 || line.service_ids.includes(id))) &&
    (line.applies_when === 'always' || line.applies_when === String(job.service_timing || 'weekday')));
  return {
    version: String(config.version || '1'), effective_from: config.effective_from || null,
    lines: [{ ...DEFAULT_PROFESSIONAL_DISPATCH_LINES[0], amount_cents: base }, ...extra.map(line => ({ ...line, line_type: 'charge', enabled:true, label: `${line.label} (${line.applies_when === 'always' ? 'per booking' : line.applies_when.replace(/-/g,' ')})` }))],
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
 * Core line-item pricing from configured lines (integer cents).
 * Discount lines are stored positive in config and emitted as negative amounts in `lines`.
 */
export function computeProfessionalDispatchLinePricing(configLines, { visitDiagnosticCents = null } = {}) {
  const displayLines = [];
  let chargesCents = 0;
  let lineDiscountCents = 0;

  for (const line of configLines) {
    if (!line.enabled || !line.key) continue;
    let amountCents = line.amount_cents;
    if (line.key === 'visit_diagnostic' && line.timing_adjustable && visitDiagnosticCents != null) {
      amountCents = visitDiagnosticCents;
    }
    if (line.line_type === 'discount') {
      lineDiscountCents += amountCents;
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

  const pricingLineSumCents = displayLines.reduce((sum, line) => sum + line.amount_cents, 0);

  if (pricingLineSumCents < 0) {
    return {
      ok: false,
      code: 'PRICING_INVALID_CONFIGURATION',
      message: 'Discount cannot exceed the eligible current charge for professional dispatch pricing.',
      lines: displayLines,
      chargesCents,
      lineDiscountCents,
      subtotalCents: chargesCents,
      discountCents: lineDiscountCents,
      pricingLineSumCents,
    };
  }

  return {
    ok: true,
    lines: displayLines,
    chargesCents,
    lineDiscountCents,
    subtotalCents: chargesCents,
    discountCents: lineDiscountCents,
    pricingLineSumCents,
  };
}

export function validateProfessionalDispatchPricingConfig(lines = []) {
  if (!Array.isArray(lines) || !lines.length) {
    return { ok: false, code: 'PRICING_INVALID_CONFIGURATION', message: 'At least one pricing line is required.' };
  }
  const normalized = lines.map((line) => ({
    key: String(line.key || ''),
    label: String(line.label || line.key || 'Fee'),
    amount_cents: Math.max(0, Math.round(Number(line.amount_cents) || 0)),
    enabled: line.enabled !== false,
    line_type: line.line_type === 'discount' ? 'discount' : 'charge',
    timing_adjustable: line.timing_adjustable === true,
  }));
  for (const line of normalized) {
    if (!line.key) {
      return { ok: false, code: 'PRICING_INVALID_CONFIGURATION', message: 'Each pricing line must have a key.' };
    }
    if (!Number.isFinite(line.amount_cents)) {
      return { ok: false, code: 'PRICING_INVALID_CONFIGURATION', message: 'Pricing amounts must be valid integer cents.' };
    }
  }
  const keys = normalized.filter((l) => l.enabled).map((l) => l.key);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, code: 'PRICING_INVALID_CONFIGURATION', message: 'Duplicate active pricing line keys are not allowed.' };
  }
  const computed = computeProfessionalDispatchLinePricing(normalized);
  if (!computed.ok) return computed;
  return { ok: true, preview: computed };
}

export function assertProfessionalDispatchPricingIntegrity(breakdown) {
  if (!breakdown || !Array.isArray(breakdown.lines)) {
    return { ok: false, code: 'PRICING_CALCULATION_MISMATCH', message: 'Pricing breakdown is missing line items.' };
  }
  const lineSum = breakdown.lines.reduce((sum, line) => sum + Number(line.amount_cents || 0), 0);
  const expectedBeforeCoupon = Number(breakdown.pricingLineSumCents ?? lineSum);
  if (lineSum !== expectedBeforeCoupon) {
    return {
      ok: false,
      code: 'PRICING_CALCULATION_MISMATCH',
      message: 'Pricing line totals do not match the stored pricing sum.',
    };
  }
  const couponDiscountCents = Number(breakdown.couponDiscountCents || 0);
  const expectedAuthorized = expectedBeforeCoupon - couponDiscountCents;
  if (expectedAuthorized < 0) {
    return {
      ok: false,
      code: 'PRICING_INVALID_CONFIGURATION',
      message: 'Coupon discount exceeds the current dispatch authorization amount.',
    };
  }
  if (Number(breakdown.authorizedNowCents) !== expectedAuthorized) {
    return {
      ok: false,
      code: 'PRICING_CALCULATION_MISMATCH',
      message: 'AUTHORIZED NOW does not match the pricing line calculation.',
    };
  }
  return { ok: true };
}

/**
 * Build homeowner-facing dispatch pricing breakdown (integer cents internally).
 */
export function buildProfessionalDispatchBreakdown(job, rules = {}, discount = null) {
  const config = resolveProfessionalDispatchConfig(rules, job);
  const visitOverride =
    config.lines.some((l) => l.key === 'visit_diagnostic' || l.key === 'professional_booking' && l.timing_adjustable)
      ? visitAmountCentsForTiming(job, rules, config.lines.find((l) => l.key === 'visit_diagnostic')?.amount_cents || 0)
      : null;

  const linePricing = computeProfessionalDispatchLinePricing(config.lines, {
    visitDiagnosticCents: visitOverride,
  });
  if (!linePricing.ok) {
    return {
      ok: false,
      pricingInvalid: true,
      code: linePricing.code,
      message: linePricing.message,
      lines: linePricing.lines || [],
      chargesCents: linePricing.chargesCents || 0,
      lineDiscountCents: linePricing.lineDiscountCents || 0,
      subtotalCents: linePricing.subtotalCents || 0,
      discountCents: linePricing.discountCents || 0,
      pricingLineSumCents: linePricing.pricingLineSumCents || 0,
      couponDiscountCents: 0,
      authorizedNowCents: 0,
      authorizedNow: 0,
      currency: 'usd',
      pricingVersion: config.version,
      pricingEffectiveFrom: config.effective_from,
      repairWorkIncluded: false,
      repairWorkNote:
        'Any repair or additional work will require a separate estimate/quote and your approval before work proceeds.',
      serviceFee: 0,
      couponDiscount: 0,
      finalAmount: 0,
    };
  }

  let couponDiscountCents = 0;
  let couponCode = null;
  let couponId = null;
  let couponLabel = null;
  // Booking fees have no plan, beta or coupon discount.

  const authorizedNowCents = linePricing.pricingLineSumCents - couponDiscountCents;
  if (authorizedNowCents < 0) {
    return {
      ok: false,
      pricingInvalid: true,
      code: 'PRICING_INVALID_CONFIGURATION',
      message: 'Coupon discount exceeds the current dispatch authorization amount.',
      lines: linePricing.lines,
      chargesCents: linePricing.chargesCents,
      lineDiscountCents: linePricing.lineDiscountCents,
      subtotalCents: linePricing.subtotalCents,
      discountCents: linePricing.lineDiscountCents + couponDiscountCents,
      pricingLineSumCents: linePricing.pricingLineSumCents,
      couponDiscountCents,
      couponCode,
      couponId,
      couponLabel,
      authorizedNowCents: 0,
      authorizedNow: 0,
      currency: 'usd',
      pricingVersion: config.version,
      pricingEffectiveFrom: config.effective_from,
      repairWorkIncluded: false,
      repairWorkNote:
        'Any repair or additional work will require a separate estimate/quote and your approval before work proceeds.',
      serviceFee: linePricing.pricingLineSumCents / 100,
      couponDiscount: couponDiscountCents / 100,
      finalAmount: 0,
    };
  }

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

  const breakdown = {
    ok: true,
    lines: linePricing.lines,
    chargesCents: linePricing.chargesCents,
    lineDiscountCents: linePricing.lineDiscountCents,
    subtotalCents: linePricing.subtotalCents,
    discountCents: linePricing.lineDiscountCents + couponDiscountCents,
    pricingLineSumCents: linePricing.pricingLineSumCents,
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
    // Legacy checkout fields — serviceFee is pre-coupon line sum
    serviceFee: linePricing.pricingLineSumCents / 100,
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

  const integrity = assertProfessionalDispatchPricingIntegrity(breakdown);
  if (!integrity.ok) {
    return {
      ...breakdown,
      ok: false,
      pricingInvalid: true,
      code: integrity.code,
      message: integrity.message,
    };
  }

  return breakdown;
}

export function visitDiagnosticAmountCents(breakdown) {
  const line = breakdown?.lines?.find((l) => l.key === 'visit_diagnostic');
  return line?.amount_cents ?? null;
}

export function buildProfessionalRequestBetaSnapshot(breakdown, job = null) {
  const visitCents = visitDiagnosticAmountCents(breakdown);
  return {
    documentVersion: 'homeowner_professional_request_beta_v1',
    authorizedAmountCents: breakdown?.authorizedNowCents ?? null,
    visitDiagnosticAmountCents: visitCents,
    visitDiagnosticAmount: visitCents != null ? visitCents / 100 : null,
    authorizedAmount: breakdown?.authorizedNow ?? null,
    breakdown,
    contractorUserId: job?.assigned_contractor_user_id ?? job?.contractor_user_id ?? null,
    bookingId: breakdown?.bookingId ?? null,
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
