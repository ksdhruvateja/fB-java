/**
 * Append-only financial ledger for payment → payout audit trail.
 */
export const FINANCIAL_EVENT = {
  HOMEOWNER_PAYMENT_SUCCEEDED: 'HOMEOWNER_PAYMENT_SUCCEEDED',
  STRIPE_PROCESSING_FEE_CAPTURED: 'STRIPE_PROCESSING_FEE_CAPTURED',
  CHANGE_ORDER_APPROVED: 'CHANGE_ORDER_APPROVED',
  CONTRACTOR_PAYABLE_CREATED: 'CONTRACTOR_PAYABLE_CREATED',
  CONTRACTOR_PAYABLE_ADJUSTED: 'CONTRACTOR_PAYABLE_ADJUSTED',
  CONTRACTOR_PAYOUT_APPROVED: 'CONTRACTOR_PAYOUT_APPROVED',
  CONTRACTOR_TRANSFER_CREATED: 'CONTRACTOR_TRANSFER_CREATED',
  INSTANT_PAYOUT_FEE_APPLIED: 'INSTANT_PAYOUT_FEE_APPLIED',
  REFUND_SUCCEEDED: 'REFUND_SUCCEEDED',
  REFUND_RECONCILIATION_REQUIRED: 'REFUND_RECONCILIATION_REQUIRED',
};

export async function recordFinancialEvent(pool, {
  eventType,
  jobId = null,
  paymentId = null,
  payoutId = null,
  contractorId = null,
  amountCents = null,
  currency = 'usd',
  stripeObjectId = null,
  createdBy = null,
  metadata = null,
} = {}) {
  if (!eventType) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO financial_ledger_events
         (event_type, job_id, payment_id, payout_id, contractor_id, amount_cents, currency, stripe_object_id, created_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        eventType,
        jobId,
        paymentId,
        payoutId,
        contractorId,
        amountCents != null ? Math.round(Number(amountCents)) : null,
        currency,
        stripeObjectId,
        createdBy,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return rows[0];
  } catch (e) {
    console.error('[financial-ledger]', eventType, e.message);
    return null;
  }
}

export async function listFinancialEventsForJob(pool, jobId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT * FROM financial_ledger_events WHERE job_id=$1 ORDER BY created_at ASC LIMIT $2`,
    [jobId, limit]
  );
  return rows;
}
