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
        // A checkout.session.completed webhook can update the pre-created
        // pending payment row to succeeded before this central settlement
        // function runs. That row is NOT proof that invoice settlement was
        // completed; payment_settlements is the idempotency source of truth.
        // Reuse the existing Stripe payment row and continue settlement so the
        // homeowner invoice is actually updated.
        const dup = await client.query(
          `SELECT * FROM payments WHERE stripe_session_id=$1 AND status IN ('succeeded','paid') LIMIT 1`,
          [stripeSessionId]
        );
        if (dup.rows[0]) {
          paymentRow = dup.rows[0];
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
        if (!paymentRow) {
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
        } else {
          const { rows: payUpd } = await client.query(
            `UPDATE payments SET
               job_id=COALESCE(job_id,$1),
               user_id=COALESCE(user_id,$2),
               payment_type=COALESCE(payment_type,$3),
               amount=COALESCE($4, amount),
               currency=COALESCE(currency,'usd'),
               status='succeeded',
               stripe_payment_intent=COALESCE($5, stripe_payment_intent),
               simulated=$6,
               meta=COALESCE(meta,'{}'::jsonb) || $7::jsonb,
               service_amount=COALESCE($8, service_amount),
               tip_amount=COALESCE($9, tip_amount)
             WHERE id=$10
             RETURNING *`,
            [
              jobId,
              homeownerUserId || job.homeowner_user_id,
              paymentType,
              paidTotal ?? serviceDollars ?? 0,
              stripePaymentIntentId,
              simulated,
              JSON.stringify(payMeta),
              serviceDollars,
              tipDollars,
              paymentRow.id,
            ]
          );
          paymentRow = payUpd[0] || paymentRow;
        }

        if (invoiceId) {
          const { rows: invRows } = await client.query(`SELECT * FROM homeowner_invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
          const inv = invRows[0];
          if (inv && String(inv.status).toLowerCase() !== 'paid') {
            const invTotal = Number(inv.total || inv.amount_due) || 0;
            const existingPaid = Math.max(0, Number(inv.paid) || 0);

            // Rebuild the received amount from successful payment records for
            // this invoice instead of blindly adding the current checkout to
            // homeowner_invoices.paid. This makes the result idempotent when
            // Stripe sends payment_intent.succeeded before or after
            // checkout.session.completed, and preserves any prior dispatch-fee
            // credit already carried by the invoice.
            const { rows: paidRows } = await client.query(
              `SELECT COALESCE(SUM(
                 CASE
                   WHEN payment_type IN ('dispatch_fee','professional_fee','pending_professional_fee')
                     THEN COALESCE(service_amount, amount, 0)
                   WHEN payment_type IN ('invoice_payment','invoice_manual')
                     AND (meta->>'invoiceId') = $2
                     THEN COALESCE(service_amount, amount, 0)
                   ELSE 0
                 END
               ),0) AS paid
                 FROM payments
                WHERE job_id=$1
                  AND status IN ('succeeded','paid','captured','completed')`,
              [jobId, String(invoiceId)]
            );
            const successfulPaymentsPaid = Math.max(0, Number(paidRows[0]?.paid) || 0);
            const cumulativePaid = Math.min(
              invTotal,
              roundMoney(Math.max(existingPaid, successfulPaymentsPaid))
            );
            const remainingDue = Math.max(0, roundMoney(invTotal - cumulativePaid));
            const nextStatus = remainingDue <= 0.009 ? 'paid' : 'partially_paid';
            await client.query(
              `UPDATE homeowner_invoices SET
                 status=$1,
                 paid=$2,
                 amount_due=$3,
                 paid_at=NOW(),
                 payment_method=$4,
                 stripe_payment_intent=COALESCE($5, stripe_payment_intent),
                 stripe_session_id=COALESCE($6, stripe_session_id),
                 locked_at=CASE WHEN $1='paid' THEN COALESCE(locked_at, NOW()) ELSE locked_at END
               WHERE id=$7`,
              [nextStatus, cumulativePaid, remainingDue, paymentMethod, stripePaymentIntentId, stripeSessionId, invoiceId]
            );
            invoiceRow = { ...inv, status: nextStatus, paid: cumulativePaid, amount_due: remainingDue };
            console.log('[INVOICE SETTLEMENT]', {
              invoiceId,
              jobId,
              previousPaid: existingPaid,
              cumulativePaid,
              total: invTotal,
              amountDue: remainingDue,
              paymentType,
              paymentStage: stripeMetadata?.paymentStage || null,
            });
            const propId = proposalId || inv.proposal_id;
            if (propId && nextStatus === 'paid') {
              await client.query(`UPDATE proposals SET status='paid' WHERE id=$1`, [propId]);
            }
          } else {
            invoiceRow = inv;
          }
        }

        const paymentStage = String(stripeMetadata?.paymentStage || (paymentType === 'retail_payment' ? 'final' : 'final')).toLowerCase();
        const invoiceFullyPaid = invoiceRow
          ? Number(invoiceRow.amount_due || 0) <= 0.009
          : paymentStage === 'final';
        if (paymentStage === 'initial') {
          const initialPercent = Number(stripeMetadata?.paymentPercent || 0);
          const initialAmount = Number(stripeMetadata?.targetAmount || 0) || null;
          await client.query(
            `UPDATE managed_jobs SET
               initial_payment_percent=COALESCE($2, initial_payment_percent),
               initial_payment_amount=COALESCE($3, initial_payment_amount),
               initial_payment_completed_at=NOW(),
               payment_completed_at=COALESCE(payment_completed_at, NOW()),
               updated_at=NOW()
             WHERE id=$1`,
            [jobId, Number.isFinite(initialPercent) && initialPercent > 0 ? initialPercent : null, initialAmount]
          );

          // The invoice is the source of truth used by both the homeowner and
          // Admin screens. Mark the initial payment on the invoice itself so
          // the Admin Invoice/Dispatch tabs immediately know that the one-time
          // 50/75/100% payment has succeeded.
          if (invoiceId) {
            await client.query(
              `UPDATE homeowner_invoices SET
                 payment_plan_percent=COALESCE($2, payment_plan_percent),
                 initial_payment_amount=COALESCE($3, initial_payment_amount),
                 initial_payment_completed=true,
                 updated_at=NOW()
               WHERE id=$1`,
              [
                invoiceId,
                Number.isFinite(initialPercent) && initialPercent > 0 ? initialPercent : null,
                initialAmount,
              ]
            );
            invoiceRow = {
              ...(invoiceRow || {}),
              initial_payment_completed: true,
              payment_plan_percent: Number.isFinite(initialPercent) && initialPercent > 0 ? initialPercent : invoiceRow?.payment_plan_percent,
              initial_payment_amount: initialAmount || invoiceRow?.initial_payment_amount,
            };
          }
          if (['approved','awaiting_customer_approval'].includes(String(job.status))) {
            await client.query(`UPDATE managed_jobs SET status='paid_for_dispatch', updated_at=NOW() WHERE id=$1`, [jobId]);
            try {
              await client.query(
                `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
                 VALUES ($1,$2,'paid_for_dispatch',$3,$4)`,
                [jobId, job.status, actorUserId, `Initial payment settled (${initialPercent || '?'}%)`]
              );
            } catch {}
          }
        } else if (invoiceFullyPaid && ['work_completed','customer_review_pending','admin_review_pending'].includes(String(job.status))) {
          await client.query(
            `UPDATE managed_jobs SET payment_completed_at=COALESCE(payment_completed_at,NOW()), final_customer_amount=COALESCE($2::numeric, final_customer_amount), work_queue_status=COALESCE(work_queue_status,'PAID_NEEDS_REVIEW'), updated_at=NOW() WHERE id=$1`,
            [jobId, paidTotal ?? (serviceDollars != null ? serviceDollars + tipDollars : null)]
          );
          await client.query(`UPDATE managed_jobs SET status='payout_pending', updated_at=NOW() WHERE id=$1`, [jobId]);
          try {
            await client.query(
              `INSERT INTO job_status_history (job_id, from_status, to_status, actor_user_id, note)
               VALUES ($1,$2,'payout_pending',$3,$4)`,
              [jobId, job.status, actorUserId, `Final payment settled (${paymentType}/${source})`]
            );
          } catch {}
        } else {
          await client.query(
            `UPDATE managed_jobs SET final_customer_amount=COALESCE($2::numeric, final_customer_amount), updated_at=NOW() WHERE id=$1`,
            [jobId, paidTotal ?? (serviceDollars != null ? serviceDollars + tipDollars : null)]
          );
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
