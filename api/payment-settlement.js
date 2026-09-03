/**
 * Central financial settlement — single authoritative payment processing path.
 */
import { writeAudit } from './audit.js';
import { PAYOUT_STATUS } from './payout-service.js';
import { ensurePayoutRecordForJob, logPayoutAudit } from './payout-db.js';
import { tipAmountCentsFromMeta } from './tips.js';
import { captureStripeProcessingFees, persistStripeProcessingFees } from './stripe.js';
import { FINANCIAL_EVENT, recordFinancialEvent } from './financial-ledger.js';
import { createInAppNotification } from './in-app-notifications.js';

export const HOLDABLE_PAYOUT_STATUSES = new Set([
  PAYOUT_STATUS.PENDING_JOB_COMPLETION,
  PAYOUT_STATUS.PENDING_APPROVAL,
  PAYOUT_STATUS.ELIGIBLE,
  PAYOUT_STATUS.APPROVED,
  'eligible',
  'on_hold',
]);

export async function holdPayoutsForJob(pool, jobId, { reason, relatedPaymentId = null, actorUserId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM contractor_payouts
     WHERE job_id=$1
       AND status = ANY($2::text[])
       AND COALESCE(stripe_transfer_id,'') = ''`,
    [jobId, [...HOLDABLE_PAYOUT_STATUSES]]
  );
  const held = [];
  for (const row of rows) {
    if (row.status === 'on_hold') {
      held.push(row);
      continue;
    }
    const prev = row.status;
    await pool.query(
      `UPDATE contractor_payouts SET
         status='on_hold',
         hold_reason=$1,
         hold_related_payment_id=$2,
         held_at=NOW(),
         updated_at=NOW()
       WHERE id=$3`,
      [reason || 'Payment risk hold', relatedPaymentId, row.id]
    );
    await logPayoutAudit(pool, {
      payoutId: row.id,
      action: 'held',
      previousStatus: prev,
      newStatus: 'on_hold',
      performedBy: actorUserId,
      metadata: { reason, relatedPaymentId },
    });
    held.push({ ...row, status: 'on_hold', hold_reason: reason });
  }
  return held;
}

export async function flagPaidPayoutsForReversal(pool, jobId, { reason, relatedPaymentId = null, actorUserId = null } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM contractor_payouts
     WHERE job_id=$1
       AND (
         status IN ('paid','processing')
         OR COALESCE(stripe_transfer_id,'') <> ''
       )`,
    [jobId]
  );
  const flagged = [];
  for (const row of rows) {
    const prev = row.status;
    const next = prev === 'paid' || row.stripe_transfer_id ? 'partially_reversed' : 'reversed';
    await pool.query(
      `UPDATE contractor_payouts SET
         status=$1,
         hold_reason=$2,
         hold_related_payment_id=$3,
         reversal_required=true,
         updated_at=NOW()
       WHERE id=$4`,
      [next, reason || 'Refund/dispute after payout', relatedPaymentId, row.id]
    );
    await logPayoutAudit(pool, {
      payoutId: row.id,
      action: 'reversal_required',
      previousStatus: prev,
      newStatus: next,
      performedBy: actorUserId,
      metadata: { reason, relatedPaymentId },
    });
    flagged.push({ id: row.id, previousStatus: prev, status: next });
  }
  if (flagged.length) {
    await writeAudit(pool, actorUserId, 'payout_reversal_required', 'managed_job', jobId, {
      reason,
      relatedPaymentId,
      payouts: flagged,
    });
  }
  return flagged;
}

export async function applyPaymentRiskToPayouts(pool, jobId, opts = {}) {
  const held = await holdPayoutsForJob(pool, jobId, opts);
  const flagged = await flagPaidPayoutsForReversal(pool, jobId, opts);
  try {
    const { markTipRefunded } = await import('./tips.js');
    await markTipRefunded(pool, jobId, { actorUserId: opts.actorUserId, reason: opts.reason });
  } catch {
    /* non-fatal */
  }
  return { held, flagged };
}

/** Capture Stripe balance-transaction fees for a settled payment (async-safe). */
export async function capturePaymentStripeFees(pool, paymentRow, { actorUserId = null } = {}) {
  if (!paymentRow?.id || !paymentRow?.stripe_payment_intent) return { ok: false, skipped: true };
  if (paymentRow.stripe_processing_fee_cents != null && Number(paymentRow.stripe_processing_fee_cents) > 0) {
    return { ok: true, alreadyCaptured: true };
  }
  const feeData = await captureStripeProcessingFees(paymentRow.stripe_payment_intent);
  if (!feeData.ok) return feeData;
  const updated = await persistStripeProcessingFees(pool, paymentRow.id, feeData);
  await recordFinancialEvent(pool, {
    eventType: FINANCIAL_EVENT.STRIPE_PROCESSING_FEE_CAPTURED,
    jobId: paymentRow.job_id,
    paymentId: paymentRow.id,
    amountCents: feeData.feeCents,
    stripeObjectId: feeData.balanceTransactionId,
    createdBy: actorUserId,
    metadata: {
      chargeId: feeData.chargeId,
      grossCents: feeData.grossCents,
      netCents: feeData.netCents,
    },
  });
  return { ok: true, payment: updated, feeCents: feeData.feeCents };
}

/**
 * Refund reconciliation — hold or flag payouts; never rewrite completed transfers.
 */
export async function reconcileRefundForJob(pool, jobId, {
  refundAmountCents,
  paymentId = null,
  refundId = null,
  actorUserId = null,
  reason = 'Refund',
} = {}) {
  const refundCents = Math.max(0, Math.round(Number(refundAmountCents || 0)));
  const { rows: payouts } = await pool.query(`SELECT * FROM contractor_payouts WHERE job_id=$1`, [jobId]);
  const payout = payouts[0];
  const hasTransfer = Boolean(payout?.stripe_transfer_id);

  const risk = await applyPaymentRiskToPayouts(pool, jobId, {
    reason,
    relatedPaymentId: paymentId,
    actorUserId,
  });

  let reconciliation = null;
  if (hasTransfer && payout) {
    const exposure = Math.max(0, refundCents);
    const { rows: rec } = await pool.query(
      `INSERT INTO refund_reconciliations
         (job_id, payment_id, refund_id, contractor_payout_id, refund_amount_cents, platform_exposure_cents, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'requires_reconciliation',$7)
       RETURNING *`,
      [jobId, paymentId, refundId, payout.id, refundCents, exposure, reason]
    );
    reconciliation = rec[0];
    await recordFinancialEvent(pool, {
      eventType: FINANCIAL_EVENT.REFUND_RECONCILIATION_REQUIRED,
      jobId,
      paymentId,
      payoutId: payout.id,
      amountCents: refundCents,
      createdBy: actorUserId,
      metadata: { platformExposureCents: exposure, transferId: payout.stripe_transfer_id },
    });
  } else if (payout && !hasTransfer) {
    await recordFinancialEvent(pool, {
      eventType: FINANCIAL_EVENT.REFUND_SUCCEEDED,
      jobId,
      paymentId,
      payoutId: payout.id,
      amountCents: refundCents,
      createdBy: actorUserId,
      metadata: { heldPayouts: risk.held?.length || 0 },
    });
  }

  return { risk, reconciliation };
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Single authoritative successful payment processor.
 * Internal DB writes are atomic; payout ledger refresh runs after COMMIT.
 */
export async function processSuccessfulPayment(pool, {
  source = 'webhook',
  jobId,
  invoiceId = null,
  proposalId = null,
  homeownerUserId = null,
  paymentType = 'retail_payment',
  customerTotal = null,
  serviceAmount = null,
  tipAmount = 0,
  couponAmount = 0,
  taxAmount = 0,
  stripeSessionId = null,
  stripePaymentIntentId = null,
  paymentMethod = 'card',
  actorUserId = null,
  idempotencyKey = null,
  stripeMetadata = {},
  simulated = false,
  skipPayoutLedger = false,
  manualReference = null,
} = {}) {
  if (!jobId) return { ok: false, message: 'Missing jobId' };

  const tipDollars = Math.max(
    0,
    tipAmount != null ? Number(tipAmount) : tipAmountCentsFromMeta(stripeMetadata) / 100
  );
  const paidTotal =
    customerTotal != null ? roundMoney(customerTotal) : serviceAmount != null ? roundMoney(Number(serviceAmount) + tipDollars) : null;
  const serviceDollars =
    serviceAmount != null
      ? roundMoney(serviceAmount)
      : paidTotal != null
        ? roundMoney(Math.max(0, paidTotal - tipDollars))
        : null;

  const settleKey =
    idempotencyKey ||
    (stripeSessionId ? `stripe-session-${stripeSessionId}` : null) ||
    (stripePaymentIntentId ? `stripe-pi-${stripePaymentIntentId}` : null);

  const client = await pool.connect();
  let paymentRow = null;
  let invoiceRow = null;
  let tipRow = null;
  let alreadySettled = false;

  try {
    await client.query('BEGIN');

    if (settleKey) {
      const existing = await client.query(
        `SELECT ps.*, p.id AS payment_id FROM payment_settlements ps
         LEFT JOIN payments p ON p.id = ps.payment_id
         WHERE ps.idempotency_key = $1`,
        [settleKey]
      );
      if (existing.rows[0]?.status === 'completed') {
        alreadySettled = true;
        paymentRow = existing.rows[0].payment_id
          ? (await client.query(`SELECT * FROM payments WHERE id=$1`, [existing.rows[0].payment_id])).rows[0]
          : null;
        if (invoiceId) {
          invoiceRow = (await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1`, [invoiceId])).rows[0];
        }
        if (tipDollars > 0) {
          tipRow = (
            await client.query(`SELECT * FROM job_tips WHERE job_id=$1 AND status='paid' ORDER BY id DESC LIMIT 1`, [jobId])
          ).rows[0];
        }
        await client.query('COMMIT');
      }
    }

    if (!alreadySettled) {
      const { rows: jobs } = await client.query(`SELECT * FROM managed_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
      const job = jobs[0];
      if (!job) {
        await client.query('ROLLBACK');
        return { ok: false, message: 'Job not found' };
      }

      if (stripeSessionId) {
        const dup = await client.query(
          `SELECT * FROM payments WHERE stripe_session_id=$1 AND status IN ('succeeded','paid') LIMIT 1`,
          [stripeSessionId]
        );
        if (dup.rows[0]) {
          paymentRow = dup.rows[0];
          alreadySettled = true;
        }
      }

      if (!alreadySettled) {
        const payMeta = {
          invoiceId,
          proposalId,
          serviceAmount: serviceDollars,
          tipAmount: tipDollars,
          couponAmount,
          taxAmount,
          source,
          paymentMethod,
          manualReference,
        };
        const { rows: payIns } = await client.query(
          `INSERT INTO payments
             (job_id, user_id, payment_type, amount, currency, status, stripe_session_id, stripe_payment_intent, simulated, meta, service_amount, tip_amount)
           VALUES ($1,$2,$3,$4,'usd','succeeded',$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            jobId,
            homeownerUserId || job.homeowner_user_id,
            paymentType,
            paidTotal ?? serviceDollars ?? 0,
            stripeSessionId,
            stripePaymentIntentId,
            simulated,
            JSON.stringify(payMeta),
            serviceDollars,
            tipDollars,
          ]
        );
        paymentRow = payIns[0];

        if (invoiceId) {
          const { rows: invRows } = await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
          const inv = invRows[0];
          if (inv && String(inv.status).toLowerCase() !== 'paid') {
            const invTotal = Number(inv.total || inv.amount_due) || 0;
            const servicePaid = serviceDollars != null ? serviceDollars : invTotal;
            await client.query(
              `UPDATE homeowner_invoices SET
                 status='paid',
                 paid=$1,
                 amount_due=0,
                 paid_at=NOW(),
                 payment_method=$2,
                 stripe_payment_intent=COALESCE($3, stripe_payment_intent),
                 stripe_session_id=COALESCE($4, stripe_session_id),
                 locked_at=COALESCE(locked_at, NOW())
               WHERE id=$5`,
              [servicePaid, paymentMethod, stripePaymentIntentId, stripeSessionId, invoiceId]
            );
            invoiceRow = { ...inv, status: 'paid', paid: servicePaid, amount_due: 0 };
            const propId = proposalId || inv.proposal_id;
            if (propId) {
              await client.query(`UPDATE proposals SET status='paid' WHERE id=$1`, [propId]);
            }
          } else {
            invoiceRow = inv;
          }
        }

        await client.query(
          `UPDATE managed_jobs SET
             payment_completed_at = COALESCE(payment_completed_at, NOW()),
             final_customer_amount = COALESCE($2::numeric, final_customer_amount),
             work_queue_status = COALESCE(work_queue_status, 'PAID_NEEDS_REVIEW'),
             updated_at = NOW()
           WHERE id=$1`,
          [jobId, paidTotal ?? (serviceDollars != null ? serviceDollars + tipDollars : null)]
        );

        const terminal = new Set(['payout_pending', 'paid_out', 'closed', 'canceled', 'refunded']);
        if (!terminal.has(String(job.status))) {
          await client.query(`UPDATE managed_jobs SET status='payout_pending', updated_at=NOW() WHERE id=$1`, [jobId]);
          try {
            await client.query(
              `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
               VALUES ($1,$2,'payout_pending',$3,$4)`,
              [jobId, job.status, actorUserId, `Payment settled (${paymentType}/${source})`]
            );
          } catch {
            /* optional */
          }
        }

        if (tipDollars > 0) {
          const existingTip = await client.query(
            `SELECT * FROM job_tips WHERE job_id=$1 AND status='paid' LIMIT 1`,
            [jobId]
          );
          if (existingTip.rows[0]) {
            tipRow = existingTip.rows[0];
          } else {
            const pending = await client.query(
              `SELECT * FROM job_tips WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
              [jobId]
            );
            if (pending.rows[0]) {
              const { rows: tipUpd } = await client.query(
                `UPDATE job_tips SET amount=$1, status='paid', paid_at=NOW(), stripe_payment_intent_id=COALESCE($2, stripe_payment_intent_id)
                 WHERE id=$3 RETURNING *`,
                [tipDollars, stripePaymentIntentId, pending.rows[0].id]
              );
              tipRow = tipUpd[0];
            } else {
              const { rows: tipIns } = await client.query(
                `INSERT INTO job_tips (job_id, homeowner_user_id, contractor_user_id, amount, status, stripe_payment_intent_id, paid_at)
                 VALUES ($1,$2,$3,$4,'paid',$5,NOW()) RETURNING *`,
                [jobId, homeownerUserId || job.homeowner_user_id, job.assigned_contractor_user_id, tipDollars, stripePaymentIntentId]
              );
              tipRow = tipIns[0];
            }
          }
        }

        if (serviceDollars != null || tipDollars > 0) {
          try {
            await client.query(
              `INSERT INTO job_financial_snapshots (
                 job_id, snapshot_type, customer_service_total, tip_amount, customer_final_payment,
                 coupon_amount, metadata, created_by
               ) VALUES ($1,'payment_settled',$2,$3,$4,$5,$6,$7)`,
              [
                jobId,
                serviceDollars,
                tipDollars,
                paidTotal,
                couponAmount,
                JSON.stringify({ paymentType, source, paymentId: paymentRow?.id, stripeSessionId }),
                actorUserId,
              ]
            );
          } catch {
            /* non-fatal */
          }
        }

        if (settleKey) {
          await client.query(
            `INSERT INTO payment_settlements (idempotency_key, job_id, invoice_id, payment_id, status, detail)
             VALUES ($1,$2,$3,$4,'completed',$5)
             ON CONFLICT (idempotency_key) DO UPDATE SET
               status='completed',
               payment_id=COALESCE(payment_settlements.payment_id, EXCLUDED.payment_id),
               updated_at=NOW()`,
            [
              settleKey,
              jobId,
              invoiceId,
              paymentRow?.id,
              JSON.stringify({ source, paymentType, serviceDollars, tipDollars }),
            ]
          );
        }

        await writeAudit(pool, actorUserId, 'payment_settled', 'managed_job', jobId, {
          paymentId: paymentRow?.id,
          invoiceId,
          paymentType,
          customerTotal: paidTotal,
          serviceAmount: serviceDollars,
          tipAmount: tipDollars,
          source,
          idempotencyKey: settleKey,
        });
      }

      await client.query('COMMIT');
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }

  let payout = null;
  if (!skipPayoutLedger && !alreadySettled) {
    try {
      payout = await ensurePayoutRecordForJob(pool, jobId, {
        initialStatus: PAYOUT_STATUS.PENDING_APPROVAL,
        actorUserId,
      });
    } catch (e) {
      console.warn('[settlement] ensurePayoutRecordForJob:', e.message);
    }
  } else if (!skipPayoutLedger) {
    try {
      payout = await ensurePayoutRecordForJob(pool, jobId, { actorUserId });
    } catch {
      /* ignore */
    }
  }

  if (paymentRow?.id && paymentRow.stripe_payment_intent && !alreadySettled) {
    try {
      await capturePaymentStripeFees(pool, paymentRow, { actorUserId });
      await recordFinancialEvent(pool, {
        eventType: FINANCIAL_EVENT.HOMEOWNER_PAYMENT_SUCCEEDED,
        jobId,
        paymentId: paymentRow.id,
        amountCents: Math.round(Number(paidTotal || 0) * 100),
        stripeObjectId: paymentRow.stripe_payment_intent,
        createdBy: actorUserId,
        metadata: { paymentType, serviceDollars, tipDollars },
      });
      if (payout?.id) {
        await recordFinancialEvent(pool, {
          eventType: FINANCIAL_EVENT.CONTRACTOR_PAYABLE_CREATED,
          jobId,
          payoutId: payout.id,
          contractorId: payout.contractor_id,
          amountCents: Number(payout.net_amount_cents || 0),
          createdBy: actorUserId,
          metadata: { fromPaymentId: paymentRow.id },
        });
      }
    } catch (e) {
      console.warn('[settlement] fee capture:', e.message);
    }
  }

  if (!alreadySettled) {
    try {
      let uid = homeownerUserId;
      if (!uid) {
        const { rows: jobRows } = await pool.query(`SELECT homeowner_user_id FROM managed_jobs WHERE id=$1`, [jobId]);
        uid = jobRows[0]?.homeowner_user_id;
      }
      if (uid) {
        await createInAppNotification(pool, {
          userId: uid,
          userRole: 'homeowner',
          jobId,
          type: 'payment_received',
          title: 'Payment received',
          message: 'Your payment was received. Thank you.',
          entityType: 'invoice',
          entityId: invoiceId,
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  return {
    ok: true,
    alreadySettled,
    payment: paymentRow,
    invoice: invoiceRow,
    tip: tipRow,
    payout,
    tipAmount: tipDollars,
    serviceAmount: serviceDollars,
    customerTotal: paidTotal,
  };
}
export async function settleSuccessfulJobPayment(pool, opts = {}) {
  return processSuccessfulPayment(pool, {
    source: opts.source || 'webhook',
    jobId: opts.jobId,
    paymentType: opts.paymentType || 'retail_payment',
    customerTotal: opts.amount,
    serviceAmount: opts.serviceAmount,
    tipAmount: opts.tipAmount,
    stripePaymentIntentId: opts.paymentIntentId,
    stripeSessionId: opts.sessionId,
    actorUserId: opts.actorUserId,
    stripeMetadata: opts.stripeMetadata || {},
    invoiceId: opts.paymentId && opts.paymentType === 'invoice_payment' ? opts.paymentId : null,
    idempotencyKey: opts.sessionId ? `stripe-session-${opts.sessionId}` : undefined,
  });
}

export async function claimWebhookEvent(pool, { provider = 'stripe', eventId, eventType, payload }) {
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'received'`).catch(() => {});
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});

  const existing = await pool.query(
    `SELECT * FROM webhook_events WHERE provider=$1 AND event_id=$2`,
    [provider, eventId]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const status = row.processing_status || (row.processed ? 'processed' : 'received');
    if (status === 'processed') {
      return { alreadyProcessed: true, claim: false, eventRow: row };
    }
    await pool.query(
      `UPDATE webhook_events SET
         processing_status='processing',
         attempt_count=COALESCE(attempt_count,0)+1,
         last_error=NULL,
         updated_at=NOW()
       WHERE id=$1 AND COALESCE(processing_status,'received') <> 'processed'`,
      [row.id]
    );
    return { alreadyProcessed: false, claim: true, eventRow: row, retry: true };
  }

  const inserted = await pool.query(
    `INSERT INTO webhook_events
       (provider, event_id, type, processed, payload, processing_status, attempt_count, updated_at)
     VALUES ($1,$2,$3,false,$4,'processing',1,NOW())
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING *`,
    [provider, eventId, eventType, JSON.stringify(payload || {})]
  );
  if (inserted.rows[0]) {
    return { alreadyProcessed: false, claim: true, eventRow: inserted.rows[0] };
  }
  return claimWebhookEvent(pool, { provider, eventId, eventType, payload });
}

export async function markWebhookProcessed(pool, eventId, provider = 'stripe') {
  await pool.query(
    `UPDATE webhook_events SET
       processed=true,
       processing_status='processed',
       processed_at=NOW(),
       last_error=NULL,
       updated_at=NOW()
     WHERE provider=$1 AND event_id=$2`,
    [provider, eventId]
  );
}

export async function markWebhookFailed(pool, eventId, errorMessage, provider = 'stripe') {
  await pool.query(
    `UPDATE webhook_events SET
       processing_status='failed',
       last_error=$3,
       updated_at=NOW()
     WHERE provider=$1 AND event_id=$2`,
    [provider, eventId, String(errorMessage || 'unknown').slice(0, 2000)]
  );
}
