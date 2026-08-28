/**
 * Contractor payout calculation — all money in integer cents.
 */

export const PAYOUT_STATUS = {
  PENDING_JOB_COMPLETION: 'pending_job_completion',
  PENDING_APPROVAL: 'pending_approval',
  ELIGIBLE: 'eligible',
  ON_HOLD: 'on_hold',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  REVERSED: 'reversed',
  PARTIALLY_REVERSED: 'partially_reversed',
};

export const PAYOUT_STATUS_LABELS = {
  pending_job_completion: 'Pending Job Completion',
  pending_approval: 'Pending Admin Approval',
  eligible: 'Eligible',
  on_hold: 'On Hold',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded / Adjusted',
  reversed: 'Reversed',
  partially_reversed: 'Partially Reversed',
};

/** @param {number|string} dollars */
export function dollarsToCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** @param {number} cents */
export function centsToDollars(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

/** @param {number} cents */
export function formatCents(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(centsToDollars(cents));
}

export const DEFAULT_PAYOUT_SETTINGS = {
  instant_payout_enabled: true,
  instant_fee_type: 'percentage_plus_fixed',
  instant_fee_percentage_bps: 200,
  instant_fee_fixed_cents: 150,
  minimum_instant_fee_cents: 50,
  maximum_instant_fee_cents: 2500,
  minimum_instant_payout_cents: 1000,
  maximum_instant_payout_cents: 1000000,
  contractor_absorbs_fee: true,
  fixbridge_absorbs_fee: false,
};

export function normalizePayoutSettings(row = {}) {
  return {
    instant_payout_enabled: row.instant_payout_enabled !== false,
    instant_fee_type: row.instant_fee_type || DEFAULT_PAYOUT_SETTINGS.instant_fee_type,
    instant_fee_percentage_bps:
      row.instant_fee_percentage_bps != null
        ? Number(row.instant_fee_percentage_bps)
        : DEFAULT_PAYOUT_SETTINGS.instant_fee_percentage_bps,
    instant_fee_fixed_cents:
      row.instant_fee_fixed_cents != null
        ? Number(row.instant_fee_fixed_cents)
        : DEFAULT_PAYOUT_SETTINGS.instant_fee_fixed_cents,
    minimum_instant_fee_cents:
      row.minimum_instant_fee_cents != null
        ? Number(row.minimum_instant_fee_cents)
        : DEFAULT_PAYOUT_SETTINGS.minimum_instant_fee_cents,
    maximum_instant_fee_cents:
      row.maximum_instant_fee_cents != null
        ? Number(row.maximum_instant_fee_cents)
        : DEFAULT_PAYOUT_SETTINGS.maximum_instant_fee_cents,
    minimum_instant_payout_cents:
      row.minimum_instant_payout_cents != null
        ? Number(row.minimum_instant_payout_cents)
        : DEFAULT_PAYOUT_SETTINGS.minimum_instant_payout_cents,
    maximum_instant_payout_cents:
      row.maximum_instant_payout_cents != null
        ? Number(row.maximum_instant_payout_cents)
        : DEFAULT_PAYOUT_SETTINGS.maximum_instant_payout_cents,
    contractor_absorbs_fee: row.contractor_absorbs_fee !== false,
    fixbridge_absorbs_fee: row.fixbridge_absorbs_fee === true,
  };
}

export function calculateInstantPayoutFee(netAmountCents, settings) {
  if (!settings.instant_payout_enabled || netAmountCents <= 0) return 0;

  const type = settings.instant_fee_type;
  let fee = 0;

  if (type === 'percentage' || type === 'percentage_plus_fixed') {
    fee += Math.round((netAmountCents * settings.instant_fee_percentage_bps) / 10000);
  }
  if (type === 'fixed' || type === 'percentage_plus_fixed') {
    fee += settings.instant_fee_fixed_cents;
  }

  if (settings.minimum_instant_fee_cents > 0) {
    fee = Math.max(fee, settings.minimum_instant_fee_cents);
  }
  if (settings.maximum_instant_fee_cents > 0) {
    fee = Math.min(fee, settings.maximum_instant_fee_cents);
  }

  return Math.max(0, fee);
}

export function calculateContractorPayout(input) {
  const jobTotalCents = Math.max(0, Math.round(Number(input.jobTotalCents || 0)));
  const adjustmentsCents = Math.round(Number(input.adjustmentsCents || 0));
  let platformFeeCents =
    input.platformFeeCents != null
      ? Math.max(0, Math.round(Number(input.platformFeeCents)))
      : Math.max(0, jobTotalCents - Math.round(Number(input.contractorNetCents || 0)));

  if (input.contractorNetCents != null && input.platformFeeCents == null) {
    platformFeeCents = Math.max(0, jobTotalCents - Math.round(Number(input.contractorNetCents)));
  }

  const grossAmountCents = jobTotalCents;
  const netBeforeInstantCents = Math.max(0, grossAmountCents - platformFeeCents + adjustmentsCents);

  const settings = normalizePayoutSettings(input.instantPayoutSettings || {});
  let instantPayoutFeeCents = 0;
  let netPayoutCents = netBeforeInstantCents;

  if (input.instantPayoutRequested) {
    instantPayoutFeeCents = calculateInstantPayoutFee(netBeforeInstantCents, settings);
    if (settings.fixbridge_absorbs_fee) {
      netPayoutCents = netBeforeInstantCents;
    } else {
      netPayoutCents = Math.max(0, netBeforeInstantCents - instantPayoutFeeCents);
    }
  }

  return {
    grossAmountCents,
    platformFeeCents,
    instantPayoutFeeCents,
    otherAdjustmentsCents: adjustmentsCents,
    netBeforeInstantCents,
    netPayoutCents,
  };
}

export function estimateStandardPayoutDate(from = new Date()) {
  const d = new Date(from);
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

export function amountsFromJobProposal(job, proposal) {
  const retailCents =
    proposal?.retail_amount != null
      ? dollarsToCents(proposal.retail_amount)
      : job?.customer_retail_estimate_high != null
        ? dollarsToCents(job.customer_retail_estimate_high)
        : 0;

  const contractorNetCents =
    proposal?.contractor_net != null
      ? dollarsToCents(proposal.contractor_net)
      : job?.estimated_contractor_net_high != null
        ? dollarsToCents(job.estimated_contractor_net_high)
        : job?.estimated_contractor_net_low != null
          ? dollarsToCents(job.estimated_contractor_net_low)
          : 0;

  const platformFeeCents = Math.max(0, retailCents - contractorNetCents);

  return calculateContractorPayout({
    jobTotalCents: retailCents,
    platformFeeCents,
    contractorNetCents,
    adjustmentsCents: 0,
  });
}

export function serializePayout(row, extras = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    contractorId: Number(row.contractor_id),
    jobId: Number(row.job_id),
    jobRef: row.job_ref || `FB-${row.job_id}`,
    customerLabel: row.customer_label || null,
    completionDate: row.completion_date || null,
    grossAmountCents: Number(row.gross_amount_cents || 0),
    platformFeeCents: Number(row.platform_fee_cents || 0),
    instantPayoutFeeCents: Number(row.instant_payout_fee_cents || 0),
    adjustmentsCents: Number(row.adjustments_cents || 0),
    netAmountCents: Number(row.net_amount_cents || 0),
    reserveAmountCents: Number(row.reserve_amount_cents || 0),
    serviceContractorNetCents: Number(row.service_amount_cents || 0),
    tipAmountCents: Number(row.tip_amount_cents || 0),
    payoutMethod: row.payout_method || 'standard',
    status: row.status,
    statusLabel: PAYOUT_STATUS_LABELS[row.status] || row.status,
    stripeTransferId: row.stripe_transfer_id || null,
    stripePayoutId: row.stripe_payout_id || null,
    approvedBy: row.approved_by ? Number(row.approved_by) : null,
    approvedAt: row.approved_at || null,
    paidAt: row.paid_at || null,
    estimatedPayoutAt: row.estimated_payout_at || null,
    failureReason: row.failure_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
  };
}

/** Contractor-safe payout DTO — no FixBridge margin or reserve internals. */
export function serializePayoutForContractor(row, extras = {}) {
  const full = serializePayout(row, extras);
  if (!full) return null;
  const {
    platformFeeCents: _platformFee,
    reserveAmountCents: _reserve,
    serviceContractorNetCents: _svc,
    ...safe
  } = full;
  return {
    ...safe,
    earningsAmountCents: full.grossAmountCents,
  };
}

/** Admin economics DTO — includes margin and service/tip breakdown. */
export function serializePayoutAdmin(row, extras = {}) {
  const base = serializePayout(row, extras);
  if (!base) return null;
  const contractorOriginalCents =
    Math.max(0, Number(row.net_amount_cents || 0) - Number(row.adjustments_cents || 0));
  return {
    ...base,
    contractorOriginalAmountCents: contractorOriginalCents,
    contractorFinalAmountCents: Number(row.net_amount_cents || 0),
    fixbridgeGrossMarginCents: Number(row.platform_fee_cents || 0),
    contractorPayableNowCents: Number(row.net_amount_cents || 0),
    alreadyReleasedCents: row.stripe_transfer_id ? Number(row.net_amount_cents || 0) : 0,
    locked: Boolean(row.stripe_transfer_id),
  };
}
