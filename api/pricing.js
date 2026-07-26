/**
 * Server-side retail pricing engine.
 * AI must never invent prices — this module owns customer retail ranges.
 */

export const DEFAULT_PRICING_RULES = {
  id: 'default',
  // Pilot dispatch fees (customer) and contractor visit payouts
  dispatch_fees: {
    weekday: { customer: 149, contractor: 100 },
    same_day: { customer: 229, contractor: 150 },
    evening_weekend: { customer: 299, contractor: 200 },
    commercial_scheduled: { customer: 225, contractor: 150 },
    commercial_emergency: { customer: 350, contractor: 225 },
  },
  // Trade baseline expected contractor net (labor hours × rate style)
  trade_baselines: {
    plumbing: { trip: 95, hourly: 125, materials_allowance: 80 },
    electrical: { trip: 95, hourly: 135, materials_allowance: 60 },
    hvac: { trip: 110, hourly: 145, materials_allowance: 100 },
    painting: { trip: 75, hourly: 85, materials_allowance: 120 },
    roofing: { trip: 125, hourly: 110, materials_allowance: 200 },
    flooring: { trip: 90, hourly: 95, materials_allowance: 150 },
    carpentry: { trip: 90, hourly: 100, materials_allowance: 90 },
    others: { trip: 85, hourly: 95, materials_allowance: 70 },
  },
  fixed_platform_cost: 75,
  risk_reserve: 50,
  variable_payment_fee_rate: 0.029,
  fixed_payment_fee: 0.3,
  target_gross_margin: 0.25,
  minimum_gross_profit: 75,
  location_factor: 1.08, // NYC/LI pilot
  urgency_surcharges: {
    low: 0,
    medium: 0.05,
    high: 0.12,
    emergency: 0.2,
  },
  after_hours_surcharge: 0.15,
  subscription_discount: 0,
  assessment_credit: 0,
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeCategory(category = '') {
  const c = String(category).toLowerCase().trim();
  if (c.includes('plumb')) return 'plumbing';
  if (c.includes('electr')) return 'electrical';
  if (c.includes('hvac') || c.includes('heat') || c.includes('cool')) return 'hvac';
  if (c.includes('paint')) return 'painting';
  if (c.includes('roof')) return 'roofing';
  if (c.includes('floor')) return 'flooring';
  if (c.includes('carp') || c.includes('wood')) return 'carpentry';
  return 'others';
}

export function normalizeUrgency(urgency = '') {
  const u = String(urgency).toLowerCase();
  if (u.includes('emerg') || u.includes('critical')) return 'emergency';
  if (u.includes('high')) return 'high';
  if (u.includes('med')) return 'medium';
  return 'low';
}

/**
 * Estimate expected contractor net from AI labor hours + trade baselines.
 */
export function estimateContractorNet(assessment, rules = DEFAULT_PRICING_RULES) {
  const cat = normalizeCategory(assessment?.category || assessment?.recommended_trade);
  const baseline = rules.trade_baselines[cat] || rules.trade_baselines.others;
  const hoursMin = Math.max(0.5, num(assessment?.estimated_labor_hours_min, 1));
  const hoursMax = Math.max(hoursMin, num(assessment?.estimated_labor_hours_max, hoursMin + 1));
  const materials = num(baseline.materials_allowance, 70);
  const trip = num(baseline.trip, 85);
  const hourly = num(baseline.hourly, 100);
  const low = Math.round(trip + hoursMin * hourly + materials * 0.6);
  const high = Math.round(trip + hoursMax * hourly + materials * 1.2);
  return { low, high, category: cat };
}

/**
 * Retail price from target gross margin formula (§9.4):
 * Retail = (net + fixed_platform + risk + fixed_payment) / (1 - margin - fee_rate)
 * Also enforce minimum gross profit.
 */
export function retailFromNet(contractorNet, rules = DEFAULT_PRICING_RULES, opts = {}) {
  const net = num(contractorNet);
  const fixedPlatform = num(opts.fixedPlatformCost, rules.fixed_platform_cost);
  const risk = num(opts.riskReserve, rules.risk_reserve);
  const fixedPay = num(opts.fixedPaymentFee, rules.fixed_payment_fee);
  const margin = clamp(num(opts.targetGrossMargin, rules.target_gross_margin), 0.05, 0.6);
  const feeRate = clamp(num(opts.variablePaymentFeeRate, rules.variable_payment_fee_rate), 0, 0.15);
  const locationFactor = num(opts.locationFactor, rules.location_factor) || 1;
  const urgencyKey = normalizeUrgency(opts.urgency);
  const urgencyPct = num(rules.urgency_surcharges?.[urgencyKey], 0);
  const afterHours = opts.afterHours ? num(rules.after_hours_surcharge, 0) : 0;
  const discount = num(opts.subscriptionDiscount, rules.subscription_discount);
  const assessmentCredit = num(opts.assessmentCredit, rules.assessment_credit);
  const minProfit = num(opts.minimumGrossProfit, rules.minimum_gross_profit);

  const subtotal = (net + fixedPlatform + risk + fixedPay) * locationFactor;
  const denom = 1 - margin - feeRate;
  let retail = denom > 0.2 ? subtotal / denom : subtotal * 1.4;
  retail *= 1 + urgencyPct + afterHours;
  retail -= discount + assessmentCredit;

  const profitAtRetail = retail - net - fixedPlatform - risk - fixedPay - retail * feeRate;
  if (profitAtRetail < minProfit) {
    // Solve for retail that yields minProfit approximately
    retail = (net + fixedPlatform + risk + fixedPay + minProfit) / (1 - feeRate);
    retail *= locationFactor * (1 + urgencyPct + afterHours);
  }

  retail = Math.max(0, Math.round(retail));
  const processing = Math.round(retail * feeRate + fixedPay);
  const gross = Math.round(retail - net - processing - fixedPlatform - risk);

  return {
    retail,
    processing_cost: processing,
    platform_gross_profit: gross,
    fixed_platform_cost: fixedPlatform,
    risk_reserve: risk,
    target_gross_margin: margin,
    variable_payment_fee_rate: feeRate,
    location_factor: locationFactor,
    urgency_surcharge: urgencyPct,
    after_hours_surcharge: afterHours,
  };
}

/**
 * Full preliminary customer retail range from AI assessment (no invented AI prices).
 */
export function computePreliminaryRetail(assessment, rules = DEFAULT_PRICING_RULES, opts = {}) {
  const confidence = num(assessment?.confidence, 0.5);
  const professionalRequired = assessment?.professional_required !== false;
  const blockedPrice =
    confidence < 0.45 ||
    assessment?.safe_diy_allowed === false && confidence < 0.55 && /structur|gas|electr|flood|sewage|asbestos|hazard|fire|carbon/i.test(
      `${assessment?.summary || ''} ${(assessment?.visual_findings || []).join(' ')}`
    ) ||
    opts.forceOnSite;

  if (blockedPrice && opts.allowBlocked !== true) {
    return {
      show_price: false,
      message: 'On-site assessment required before pricing.',
      customer_retail_estimate_low: null,
      customer_retail_estimate_high: null,
      estimated_contractor_net_low: null,
      estimated_contractor_net_high: null,
      internal: null,
    };
  }

  const net = estimateContractorNet(assessment, rules);
  const lowCalc = retailFromNet(net.low, rules, {
    ...opts,
    urgency: assessment?.urgency,
  });
  const highCalc = retailFromNet(net.high, rules, {
    ...opts,
    urgency: assessment?.urgency,
  });

  // Widen range slightly for preliminary estimates
  const low = Math.round(lowCalc.retail * 0.92);
  const high = Math.round(highCalc.retail * 1.08);

  return {
    show_price: true,
    message: null,
    customer_retail_estimate_low: low,
    customer_retail_estimate_high: Math.max(low, high),
    estimated_contractor_net_low: net.low,
    estimated_contractor_net_high: net.high,
    internal: {
      low: lowCalc,
      high: highCalc,
      category: net.category,
    },
    disclaimer:
      'Estimated service range includes coordination, administration, payment handling and subcontracted delivery. Not a binding quote until a proposal is approved.',
  };
}

/**
 * Apply a promo/discount code after engine retail is calculated.
 * Re-exported convenience — prefer discounts.js applyDiscountToPricing in routes.
 */
export { applyDiscountToPricing } from './discounts.js';

/**
 * Apply admin price adjustments after the engine calculates a retail range.
 * Modes:
 *  - markup_percent: add X% to both ends of the range
 *  - markup_amount: add $X to both ends
 *  - set_range: set exact low/high the customer will see
 *  - hide: force on-site assessment (no price shown)
 */
export function applyAdminPriceAdjustment(pricing, adjustment = {}) {
  if (!pricing) return pricing;
  const mode = String(adjustment.mode || '').toLowerCase();

  if (mode === 'hide' || adjustment.hidePrice === true) {
    return {
      ...pricing,
      show_price: false,
      message: 'On-site assessment required before pricing.',
      customer_retail_estimate_low: null,
      customer_retail_estimate_high: null,
      admin_adjustment: { mode: 'hide' },
    };
  }

  let low = pricing.customer_retail_estimate_low;
  let high = pricing.customer_retail_estimate_high;
  if (low == null || high == null) return pricing;

  if (mode === 'markup_percent') {
    const pct = num(adjustment.percent, 0) / 100;
    low = Math.round(low * (1 + pct));
    high = Math.round(high * (1 + pct));
  } else if (mode === 'markup_amount') {
    const dollars = num(adjustment.amount, 0);
    low = Math.round(low + dollars);
    high = Math.round(high + dollars);
  } else if (mode === 'set_range') {
    low = Math.round(num(adjustment.low, low));
    high = Math.round(num(adjustment.high, high));
  } else {
    return pricing;
  }

  if (high < low) high = low;

  return {
    ...pricing,
    show_price: true,
    message: null,
    customer_retail_estimate_low: Math.max(0, low),
    customer_retail_estimate_high: Math.max(0, high),
    admin_adjustment: {
      mode,
      percent: adjustment.percent != null ? num(adjustment.percent) : undefined,
      amount: adjustment.amount != null ? num(adjustment.amount) : undefined,
      low: adjustment.low != null ? num(adjustment.low) : undefined,
      high: adjustment.high != null ? num(adjustment.high) : undefined,
    },
  };
}

/**
 * Build customer retail proposal from confidential contractor net bid.
 */
export function retailFromBid(netTotal, rules = DEFAULT_PRICING_RULES, opts = {}) {
  const calc = retailFromNet(netTotal, rules, opts);
  return {
    customer_final_retail_amount: calc.retail,
    contractor_final_net_amount: Math.round(num(netTotal)),
    processing_cost: calc.processing_cost,
    platform_gross_profit: calc.platform_gross_profit,
    breakdown: calc,
  };
}

export function getDispatchFee(serviceTiming, rules = DEFAULT_PRICING_RULES) {
  const fees = rules.dispatch_fees || DEFAULT_PRICING_RULES.dispatch_fees;
  const t = String(serviceTiming || '').toLowerCase();
  if (t.includes('commercial') && t.includes('emerg')) return fees.commercial_emergency;
  if (t.includes('commercial')) return fees.commercial_scheduled;
  if (t.includes('evening') || t.includes('weekend') || t.includes('7-9') || t.includes('5-7')) {
    return fees.evening_weekend;
  }
  if (t.includes('same') || t.includes('priority') || t.includes('same-day')) return fees.same_day;
  return fees.weekday;
}

export function mergePricingRules(stored) {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PRICING_RULES };
  return {
    ...DEFAULT_PRICING_RULES,
    ...stored,
    dispatch_fees: { ...DEFAULT_PRICING_RULES.dispatch_fees, ...(stored.dispatch_fees || {}) },
    trade_baselines: { ...DEFAULT_PRICING_RULES.trade_baselines, ...(stored.trade_baselines || {}) },
    urgency_surcharges: {
      ...DEFAULT_PRICING_RULES.urgency_surcharges,
      ...(stored.urgency_surcharges || {}),
    },
  };
}
