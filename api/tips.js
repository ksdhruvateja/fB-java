/**
 * Tip lifecycle — stored separately from service revenue.
 *
 * A job can receive more than one tip (for example one with an upfront invoice and one with
 * the final invoice). Each paid tip is tied to the payment that collected it, and the
 * contractor is owed the sum of all paid tips for the job.
 */
import { dollarsToCents } from './financial-calculations.js';
import { writeAudit } from './audit.js';

/** Unique per Stripe payment so a retried webhook can never record the same tip twice. */
export async function ensureTipIndexes(pool) {
  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS job_tips_payment_intent_uq
         ON job_tips (stripe_payment_intent_id)
         WHERE stripe_payment_intent_id IS NOT NULL`
    );
  } catch (e) {
    // Existing duplicate rows (from before this fix) block the index; settlement still dedupes in code.
    console.warn('[tips] could not create job_tips_payment_intent_uq:', e.message);
  }
}

export async function getTipForJob(pool, jobId, { status } = {}) {
  const params = [jobId];
  let sql = `SELECT * FROM job_tips WHERE job_id=$1`;
  if (status) {
    sql += ` AND status=$2`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC, id DESC LIMIT 1`;
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

/** Total of every paid (not refunded) tip on the job. */
export async function getPaidTipAmountDollars(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM job_tips WHERE job_id=$1 AND status='paid'`,
    [jobId]
  );
  return Number(rows[0]?.total || 0);
}

/**
 * Record the tip a homeowner chose before checkout. Re-opening checkout updates the
 * still-pending tip instead of adding another one; a tip that was already paid is never touched.
 */
export async function recordPendingTip(pool, {
  jobId,
  homeownerUserId,
  contractorUserId,
  amountDollars,
  percentOfService = null,
  actorUserId = null,
}) {
  const amount = Math.max(0, Number(amountDollars || 0));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const pending = await getTipForJob(pool, jobId, { status: 'pending' });
  let row;
  if (pending) {
    ({ rows: [row] } = await pool.query(
      `UPDATE job_tips SET
         amount=$1,
         percent_of_service=$2,
         contractor_user_id=COALESCE($3, contractor_user_id)
       WHERE id=$4 AND status='pending'
       RETURNING *`,
      [amount, percentOfService, contractorUserId || null, pending.id]
    ));
  }
  if (!row) {
    ({ rows: [row] } = await pool.query(
      `INSERT INTO job_tips (job_id, homeowner_user_id, contractor_user_id, amount, percent_of_service, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING *`,
      [jobId, homeownerUserId, contractorUserId || null, amount, percentOfService]
    ));
  }

  await writeAudit(pool, actorUserId, 'tip_pending', 'managed_job', jobId, {
    amount,
    percentOfService,
  }).catch(() => {});

  return row;
}

/**
 * Mark the tip collected by one payment as paid. Call inside the settlement transaction
 * (with the job row locked). Idempotent per Stripe payment intent.
 */
export async function settleTipForPayment(client, {
  jobId,
  tipDollars,
  stripePaymentIntentId = null,
  homeownerUserId = null,
  contractorUserId = null,
}) {
  const amount = Math.max(0, Number(tipDollars || 0));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (stripePaymentIntentId) {
    const { rows } = await client.query(
      `SELECT * FROM job_tips WHERE stripe_payment_intent_id=$1 LIMIT 1`,
      [stripePaymentIntentId]
    );
    if (rows[0]) return rows[0];
  }

  const { rows: pending } = await client.query(
    `SELECT * FROM job_tips WHERE job_id=$1 AND status='pending' ORDER BY created_at DESC, id DESC LIMIT 1`,
    [jobId]
  );
  if (pending[0]) {
    const { rows } = await client.query(
      `UPDATE job_tips SET amount=$1, status='paid', paid_at=NOW(),
         stripe_payment_intent_id=COALESCE($2, stripe_payment_intent_id),
         contractor_user_id=COALESCE(contractor_user_id, $4)
       WHERE id=$3 AND status='pending' RETURNING *`,
      [amount, stripePaymentIntentId, pending[0].id, contractorUserId || null]
    );
    if (rows[0]) return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO job_tips (job_id, homeowner_user_id, contractor_user_id, amount, status, stripe_payment_intent_id, paid_at)
     VALUES ($1,$2,$3,$4,'paid',$5,NOW()) RETURNING *`,
    [jobId, homeownerUserId, contractorUserId || null, amount, stripePaymentIntentId]
  );
  return rows[0];
}

/** Payment refunded or disputed: every paid tip on the job follows the payment. */
export async function markTipRefunded(pool, jobId, { actorUserId = null, reason = 'payment_refunded' } = {}) {
  const { rows } = await pool.query(
    `UPDATE job_tips SET status='refunded' WHERE job_id=$1 AND status='paid' RETURNING *`,
    [jobId]
  );
  if (!rows.length) return null;
  const amount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  await writeAudit(pool, actorUserId, 'tip_refunded', 'managed_job', jobId, { reason, amount, tips: rows.length }).catch(
    () => {}
  );
  return rows[0];
}

export function tipAmountCentsFromMeta(metadata = {}) {
  if (metadata.tipAmountCents != null) return Math.max(0, Math.round(Number(metadata.tipAmountCents)));
  if (metadata.tipAmount != null) return dollarsToCents(metadata.tipAmount);
  return 0;
}
