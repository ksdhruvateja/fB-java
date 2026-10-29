/**
 * Immutable financial snapshots per job — never rely on a single job.total field.
 */

export async function recordFinancialSnapshot(pool, {
  jobId,
  snapshotType,
  createdBy = null,
  data = {},
}) {
  const d = data || {};
  const { rows } = await pool.query(
    `INSERT INTO job_financial_snapshots (
      job_id, snapshot_type,
      ai_estimate_low, ai_estimate_high, ai_confidence,
      contractor_original_quote, contractor_change_orders, contractor_total_due,
      internal_price_adjustment, additional_charges, discounts, coupon_amount, coupon_funded_by,
      customer_approved_quote, customer_change_orders, customer_service_total,
      tip_amount, customer_final_payment,
      processing_cost, ai_cost, other_direct_cost,
      fixbridge_gross_difference, fixbridge_net_contribution,
      contractor_payout, contractor_payout_fee, contractor_net_payout,
      line_items, metadata, created_by
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
    ) RETURNING *`,
    [
      jobId,
      snapshotType,
      d.aiEstimateLow ?? null,
      d.aiEstimateHigh ?? null,
      d.aiConfidence ?? null,
      d.contractorOriginalQuote ?? null,
      d.contractorChangeOrders ?? 0,
      d.contractorTotalDue ?? null,
      d.internalPriceAdjustment ?? 0,
      d.additionalCharges ?? 0,
      d.discounts ?? 0,
      d.couponAmount ?? 0,
      d.couponFundedBy ?? null,
      d.customerApprovedQuote ?? null,
      d.customerChangeOrders ?? 0,
      d.customerServiceTotal ?? null,
      d.tipAmount ?? 0,
      d.customerFinalPayment ?? null,
      d.processingCost ?? null,
      d.aiCost ?? 0,
      d.otherDirectCost ?? 0,
      d.fixbridgeGrossDifference ?? null,
      d.fixbridgeNetContribution ?? null,
      d.contractorPayout ?? null,
      d.contractorPayoutFee ?? 0,
      d.contractorNetPayout ?? null,
      d.lineItems ? JSON.stringify(d.lineItems) : null,
      d.metadata ? JSON.stringify(d.metadata) : null,
      createdBy,
    ],
  );
  return rows[0];
}

export function serializeFinancialSnapshot(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    snapshotType: row.snapshot_type,
    aiEstimateLow: row.ai_estimate_low != null ? Number(row.ai_estimate_low) : null,
    aiEstimateHigh: row.ai_estimate_high != null ? Number(row.ai_estimate_high) : null,
    aiConfidence: row.ai_confidence,
    contractorOriginalQuote: row.contractor_original_quote != null ? Number(row.contractor_original_quote) : null,
    contractorChangeOrders: Number(row.contractor_change_orders || 0),
    contractorTotalDue: row.contractor_total_due != null ? Number(row.contractor_total_due) : null,
    internalPriceAdjustment: Number(row.internal_price_adjustment || 0),
    additionalCharges: Number(row.additional_charges || 0),
    discounts: Number(row.discounts || 0),
    couponAmount: Number(row.coupon_amount || 0),
    couponFundedBy: row.coupon_funded_by,
    customerApprovedQuote: row.customer_approved_quote != null ? Number(row.customer_approved_quote) : null,
    customerChangeOrders: Number(row.customer_change_orders || 0),
    customerServiceTotal: row.customer_service_total != null ? Number(row.customer_service_total) : null,
    tipAmount: Number(row.tip_amount || 0),
    customerFinalPayment: row.customer_final_payment != null ? Number(row.customer_final_payment) : null,
    processingCost: row.processing_cost != null ? Number(row.processing_cost) : null,
    aiCost: Number(row.ai_cost || 0),
    otherDirectCost: Number(row.other_direct_cost || 0),
    fixbridgeGrossDifference: row.fixbridge_gross_difference != null ? Number(row.fixbridge_gross_difference) : null,
    fixbridgeNetContribution: row.fixbridge_net_contribution != null ? Number(row.fixbridge_net_contribution) : null,
    contractorPayout: row.contractor_payout != null ? Number(row.contractor_payout) : null,
    contractorPayoutFee: Number(row.contractor_payout_fee || 0),
    contractorNetPayout: row.contractor_net_payout != null ? Number(row.contractor_net_payout) : null,
    lineItems: row.line_items,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function confidenceLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'MEDIUM';
  if (n >= 0.75) return 'HIGH';
  if (n >= 0.45) return 'MEDIUM';
  return 'LOW';
}
