/**
 * Tip lifecycle — stored separately from service revenue.
 */
import { dollarsToCents } from './financial-calculations.js';
import { writeAudit } from './audit.js';

export async function getTipForJob(pool, jobId, { status } = {}) {
  const params = [jobId];
  let sql = `SELECT * FROM job_tips WHERE job_id=$1`;
  if (status) {
    sql += ` AND status=$2`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

export async function getPaidTipAmountDollars(pool, jobId) {
  const tip = await getTipForJob(pool, jobId, { status: 'paid' });
  return tip ? Number(tip.amount) : 0;
}

/** Upsert pending tip before checkout. */
export async function recordPendingTip(pool, {
  jobId,
  homeownerUserId,
  contractorUserId,
  amountDollars,
  percentOfService = null,
  actorUserId = null,
}) {
  const amount = Math.max(0, Number(amountDollars || 0));
  if (amount <= 0) return null;

  const existing = await getTipForJob(pool, jobId);
  if (existing?.status === 'paid') return existing;

  if (existing) {
    const { rows } = await pool.query(
      `UPDATE job_tips SET
         amount=$1,
         percent_of_service=$2,
         contractor_user_id=COALESCE($3, contractor_user_id),
         status='pending'
       WHERE id=$4
       RETURNING *`,
      [amount, percentOfService, contractorUserId || null, existing.id]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO job_tips (job_id, homeowner_user_id, contractor_user_id, amount, percent_of_service, status)
     VALUES ($1,$2,$3,$4,$5,'pending')
     RETURNING *`,
    [jobId, homeownerUserId, contractorUserId || null, amount, percentOfService]
  );

  await writeAudit(pool, actorUserId, 'tip_pending', 'managed_job', jobId, {
    amount,
    percentOfService,
  }).catch(() => {});

  return rows[0];
}

/** Mark tip paid after successful homeowner payment (idempotent). */
export async function markTipPaidFromPayment(pool, {
  jobId,
  tipAmountDollars,
  paymentIntentId = null,
  sessionId = null,
  actorUserId = null,
}) {
  const amount = Math.max(0, Number(tipAmountDollars || 0));
  if (amount <= 0) return null;

  const existing = await getTipForJob(pool, jobId, { status: 'paid' });
  if (existing) return existing;

  const pending = await getTipForJob(pool, jobId);
  if (pending) {
    const { rows } = await pool.query(
      `UPDATE job_tips SET
         amount=$1,
         status='paid',
         paid_at=NOW(),
         stripe_payment_intent_id=COALESCE($2, stripe_payment_intent_id)
       WHERE id=$3 AND status <> 'paid'
       RETURNING *`,
      [amount, paymentIntentId || null, pending.id]
    );
    if (rows[0]) {
      await writeAudit(pool, actorUserId, 'tip_paid', 'managed_job', jobId, {
        amount,
        paymentIntentId,
        sessionId,
      }).catch(() => {});
      return rows[0];
    }
  }

  const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  const job = jobs[0];
  if (!job) return null;

  const { rows } = await pool.query(
    `INSERT INTO job_tips (job_id, homeowner_user_id, contractor_user_id, amount, status, stripe_payment_intent_id, paid_at)
     VALUES ($1,$2,$3,$4,'paid',$5,NOW())
     RETURNING *`,
    [
      jobId,
      job.homeowner_user_id,
      job.assigned_contractor_user_id || null,
      amount,
      paymentIntentId || null,
    ]
  );

  await writeAudit(pool, actorUserId, 'tip_paid', 'managed_job', jobId, {
    amount,
    paymentIntentId,
    sessionId,
  }).catch(() => {});

  return rows[0];
}

/** Refund/reversal — tip follows payment refund rules. */
export async function markTipRefunded(pool, jobId, { actorUserId = null, reason = 'payment_refunded' } = {}) {
  const tip = await getTipForJob(pool, jobId, { status: 'paid' });
  if (!tip) return null;
  const { rows } = await pool.query(
    `UPDATE job_tips SET status='refunded' WHERE id=$1 RETURNING *`,
    [tip.id]
  );
  await writeAudit(pool, actorUserId, 'tip_refunded', 'managed_job', jobId, { reason, amount: tip.amount }).catch(
    () => {}
  );
  return rows[0] || null;
}

export function tipAmountCentsFromMeta(metadata = {}) {
  if (metadata.tipAmountCents != null) return Math.max(0, Math.round(Number(metadata.tipAmountCents)));
  if (metadata.tipAmount != null) return dollarsToCents(metadata.tipAmount);
  return 0;
}
