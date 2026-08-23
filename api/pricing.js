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
  // Payout reserve-hold (spec §9): hold back N% of payout for M days
  reserve_percentage: 10,   // percent of contractor payout held in reserve
  reserve_hold_days: 7,     // days before reserve is eligible for release
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
  pro_subscription_price: 0,
  /**
   * Stage A — applied to AI-generated recommended retail before homeowner sees it.
   * Homeowners never see the raw AI amount or this markup; only the final estimate.
   */
  customer_display_adjustment: {
    type: 'percentage', // percentage | fixed
    value: 15,
    min_dollars: 25,
    max_dollars: null,
  },
  /** Optional overrides — more specific wins: contractor → zip → trade → global */
  pricing_overrides: {
    by_trade: {},
    by_zip_prefix: {},
  },
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

export function getLocationFactorByZip(zip) {
  if (!zip) return null;
  const z = String(zip).trim();
  if (/^(100|101|102|103|104|111|112|113|114|116)/.test(z)) {
    // New York City / Brooklyn / Queens
    return 1.25;
  }
  if (/^(940|941|942|943|944|945|946)/.test(z)) {
    // San Francisco Bay Area
    return 1.30;
  }
  if (/^(900|901|902|903|904|905)/.test(z)) {
    // Los Angeles Area
    return 1.20;
  }
  if (/^(606|607|608)/.test(z)) {
    // Chicago Area
    return 1.15;
  }
  if (/^(331|332|333)/.test(z)) {
    // Miami Area
    return 1.12;
  }
  if (/^(750|751|752|770|771|772)/.test(z)) {
    // Texas Metro Areas
    return 1.05;
  }
  return 1.0;
}

export function getZipMarketLabel(zip) {
  const factor = getLocationFactorByZip(zip);
  const z = String(zip || '').trim();
  if (/^(100|101|102|103|104|111|112|113|114|116)/.test(z)) return 'New York City metro';
  if (/^(940|941|942|943|944|945|946)/.test(z)) return 'San Francisco Bay Area';
  if (/^(900|901|902|903|904|905)/.test(z)) return 'Los Angeles metro';
  if (/^(606|607|608)/.test(z)) return 'Chicago metro';
  if (/^(331|332|333)/.test(z)) return 'Miami metro';
  if (/^(750|751|752)/.test(z)) return 'Dallas–Fort Worth metro';
  if (/^(770|771|772)/.test(z)) return 'Houston metro';
  if (factor && factor !== 1) return 'Regional metro';
  return 'National baseline';
}

/** Resolve display adjustment with hierarchy: ZIP prefix → trade → global. */
export function resolveCustomerDisplayAdjustment(rules = DEFAULT_PRICING_RULES, opts = {}) {
  const global = rules.customer_display_adjustment || {
    type: 'percentage',
    value: 0,
    min_dollars: 0,
    max_dollars: null,
  };
  const overrides = rules.pricing_overrides || {};
  const trade = normalizeCategory(opts.trade || opts.category || '');
  const zip = String(opts.zip || '').trim();
  const zipPrefix = zip.slice(0, 3);

  let resolved = { ...global, source: 'global' };
  const byTrade = overrides.by_trade?.[trade];
  if (byTrade && byTrade.value != null) {
    resolved = {
      type: byTrade.type || global.type || 'percentage',
      value: num(byTrade.value, global.value),
      min_dollars: byTrade.min_dollars != null ? num(byTrade.min_dollars) : global.min_dollars,
      max_dollars: byTrade.max_dollars != null ? num(byTrade.max_dollars) : global.max_dollars,
      source: `trade:${trade}`,
    };
  }
  const byZip = overrides.by_zip_prefix?.[zipPrefix];
  if (zipPrefix && byZip && byZip.value != null) {
    resolved = {
      type: byZip.type || resolved.type || 'percentage',
      value: num(byZip.value, resolved.value),
      min_dollars: byZip.min_dollars != null ? num(byZip.min_dollars) : resolved.min_dollars,
      max_dollars: byZip.max_dollars != null ? num(byZip.max_dollars) : resolved.max_dollars,
      source: `zip:${zipPrefix}`,
    };
  }
  return resolved;
}

/** Apply Stage A display adjustment to a raw AI/engine retail amount. */
export function applyCustomerDisplayAdjustment(rawAmount, rules = DEFAULT_PRICING_RULES, opts = {}) {
  const raw = Math.max(0, Math.round(num(rawAmount)));
  const adj = resolveCustomerDisplayAdjustment(rules, opts);
  let delta = 0;
  if (String(adj.type).toLowerCase() === 'fixed') {
    delta = num(adj.value, 0);
  } else {
    delta = Math.round(raw * (num(adj.value, 0) / 100));
  }
  const minD = num(adj.min_dollars, 0);
  const maxD = adj.max_dollars != null && adj.max_dollars !== '' ? num(adj.max_dollars) : null;
  if (minD > 0) delta = Math.max(delta, minD);
  if (maxD != null && Number.isFinite(maxD)) delta = Math.min(delta, maxD);
  const customer = Math.max(0, Math.round(raw + delta));
  return {
    raw,
    delta,
    customer,
    adjustment: adj,
  };
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

  // Compute location factor dynamically based on pincode / zip if present
  const zip = opts.pincode || opts.zip || opts.zipcode;
  let locationFactor = num(opts.locationFactor, rules.location_factor) || 1;
  if (zip) {
    locationFactor = getLocationFactorByZip(zip);
  }

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
  const blockedPrice = opts.forceOnSite;

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

  // Widen range slightly for preliminary estimates (engine / AI-recommended retail)
  const rawLow = Math.round(lowCalc.retail * 0.92);
  const rawHigh = Math.round(highCalc.retail * 1.08);
  const rawRecommended = Math.round((rawLow + rawHigh) / 2);

  const adjOpts = {
    zip: opts.zip || opts.pincode || opts.zipcode,
    trade: net.category,
    category: net.category,
  };
  const lowAdj = applyCustomerDisplayAdjustment(rawLow, rules, adjOpts);
  const highAdj = applyCustomerDisplayAdjustment(rawHigh, rules, adjOpts);
  const recAdj = applyCustomerDisplayAdjustment(rawRecommended, rules, adjOpts);

  const low = Math.min(lowAdj.customer, highAdj.customer);
  const high = Math.max(lowAdj.customer, highAdj.customer);

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
      ai_recommended_raw: rawRecommended,
      ai_range_raw: { low: rawLow, high: rawHigh },
      display_adjustment: recAdj.adjustment,
      display_adjustment_amount: recAdj.delta,
      customer_recommended: recAdj.customer,
      zip_market: getZipMarketLabel(adjOpts.zip),
      location_factor: lowCalc.location_factor,
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

/**
 * Admin quote builder — derive customer quote from contractor net + adjustments.
 */
export function computeCustomerQuoteFromBid(contractorNet, rules = DEFAULT_PRICING_RULES, opts = {}) {
  const priced = retailFromBid(contractorNet, rules, opts);
  const baseRetail = priced.customer_final_retail_amount;
  const serviceCharge = num(opts.serviceCharge, 25);

  let adjustmentTotal = 0;
  for (const adj of opts.adjustments || []) {
    const amt = num(adj.amount, 0);
    if (String(adj.calculation || 'fixed').toLowerCase() === 'percent') {
      adjustmentTotal += Math.round(baseRetail * (amt / 100));
    } else {
      adjustmentTotal += amt;
    }
  }

  const subtotal = baseRetail + adjustmentTotal + serviceCharge;

  let adminDiscount = 0;
  if (opts.adminDiscount) {
    const d = num(opts.adminDiscount.amount, 0);
    if (String(opts.adminDiscount.type || 'fixed').toLowerCase() === 'percent') {
      adminDiscount = Math.round(subtotal * (d / 100));
    } else {
      adminDiscount = d;
    }
  }

  const couponAmount = num(opts.couponAmount, 0);
  const customerQuote = Math.max(0, Math.round(subtotal - adminDiscount - couponAmount));
  const feeRate = num(rules.variable_payment_fee_rate, 0.029);
  const fixedPay = num(rules.fixed_payment_fee, 0.3);
  const processing = Math.round(customerQuote * feeRate + fixedPay);
  const fixedPlatform = num(rules.fixed_platform_cost, 75);
  const grossDiff = customerQuote - priced.contractor_final_net_amount;
  const netContribution = grossDiff - processing - fixedPlatform;
  const marginPct = customerQuote > 0 ? (netContribution / customerQuote) * 100 : 0;

  return {
    contractorNet: priced.contractor_final_net_amount,
    baseRetail,
    pricingAdjustment: adjustmentTotal,
    serviceCharge,
    adminDiscount,
    couponAmount,
    customerQuote,
    processingCost: processing,
    grossDifference: grossDiff,
    netContribution,
    expectedMarginPct: Math.round(marginPct * 100) / 100,
    priced,
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
    customer_display_adjustment: {
      ...DEFAULT_PRICING_RULES.customer_display_adjustment,
      ...(stored.customer_display_adjustment || {}),
    },
    pricing_overrides: {
      by_trade: {
        ...(DEFAULT_PRICING_RULES.pricing_overrides?.by_trade || {}),
        ...(stored.pricing_overrides?.by_trade || {}),
      },
      by_zip_prefix: {
        ...(DEFAULT_PRICING_RULES.pricing_overrides?.by_zip_prefix || {}),
        ...(stored.pricing_overrides?.by_zip_prefix || {}),
      },
    },
  };
}

/**
 * ZIP + trade market intelligence snapshot for Admin (Stage A context).
 * Uses live FixBridge jobs when rows are provided; otherwise returns factor-based guidance.
 */
export function buildZipMarketProfile({
  zip,
  trade,
  rules = DEFAULT_PRICING_RULES,
  jobs = [],
  bids = [],
} = {}) {
  const cat = normalizeCategory(trade);
  const factor = getLocationFactorByZip(zip) || Number(rules.location_factor) || 1;
  const market = getZipMarketLabel(zip);
  const baseline = rules.trade_baselines?.[cat] || rules.trade_baselines.others;

  const relevantJobs = (jobs || []).filter((j) => {
    const jZip = String(j.zip || '').trim();
    const jCat = normalizeCategory(j.category || j.title || '');
    return (!zip || jZip.startsWith(String(zip).slice(0, 3)) || jZip === String(zip)) && (!trade || jCat === cat);
  });

  const quoteAmounts = (bids || [])
    .map((b) => Number(b.net_total || b.netTotal))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const completedRetail = relevantJobs
    .map((j) => {
      const low = Number(j.customer_retail_estimate_low ?? j.customerRetailEstimateLow);
      const high = Number(j.customer_retail_estimate_high ?? j.customerRetailEstimateHigh);
      if (Number.isFinite(low) && Number.isFinite(high) && high > 0) return Math.round((low + high) / 2);
      return null;
    })
    .filter((n) => n != null)
    .sort((a, b) => a - b);

  const median = (arr) => {
    if (!arr.length) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  };

  const syntheticNet = Math.round(
    (Number(baseline.trip) || 90) + 2.5 * (Number(baseline.hourly) || 100) + (Number(baseline.materials_allowance) || 80)
  );
  const rawRetail = retailFromNet(syntheticNet, rules, { zip, urgency: 'medium' }).retail;
  const display = applyCustomerDisplayAdjustment(rawRetail, rules, { zip, trade: cat });

  const rangeLow =
    completedRetail.length >= 2
      ? completedRetail[0]
      : Math.round(display.customer * 0.85);
  const rangeHigh =
    completedRetail.length >= 2
      ? completedRetail[completedRetail.length - 1]
      : Math.round(display.customer * 1.12);

  return {
    zip: String(zip || '').trim() || null,
    market,
    trade: cat,
    locationFactor: factor,
    jobsAnalyzed: relevantJobs.length,
    quotesAnalyzed: quoteAmounts.length,
    typicalRange: { low: rangeLow, high: Math.max(rangeLow, rangeHigh) },
    medianContractorQuote: median(quoteAmounts),
    medianCustomerEstimate: median(completedRetail),
    averageLaborHourly: Number(baseline.hourly) || null,
    averageTripFee: Number(baseline.trip) || null,
    recentQuotes: quoteAmounts.slice(-8).reverse(),
    aiRecommendedRaw: display.raw,
    customerDisplayedEstimate: display.customer,
    displayAdjustment: display.adjustment,
    displayAdjustmentAmount: display.delta,
    basedOn: relevantJobs.length
      ? `Based on ${relevantJobs.length} FixBridge job(s) near ${zip || 'this area'} plus ${market} pricing factors.`
      : `Based on ${market} pricing factors and ${cat} trade baselines (limited local FixBridge history yet).`,
  };
}
