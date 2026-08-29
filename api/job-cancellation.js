import { brand } from './brand.js';
import { sendEmailSafe, notifyOps } from './notify.js';
import { cancelPaymentIntent } from './stripe.js';
import { cancelServiceReminderForJob, TERMINAL_JOB_STATUSES } from './service-reminders.js';

export const CANCELLATION_REASON_LABELS = {
  resolved: 'Problem resolved / no longer need service',
  schedule_conflict: 'Schedule no longer works',
  other_provider: 'Found another provider',
  price: 'Price / quote is too high',
  change_request: 'Need to change the service request',
  provider_issue: 'Provider issue',
  created_by_mistake: 'Created by mistake',
  other: 'Other',
};

export const HOMEOWNER_CANCELABLE_STATUSES = new Set([
  'draft',
  'ai_review_complete',
  'awaiting_service_payment',
  'paid_for_dispatch',
  'awaiting_contractor',
  'contractor_invited',
  'contractor_accepted',
  'matching',
  'bids_open',
  'awaiting_bid',
  'diagnosing',
  'bid_received',
  'proposal_sent',
  'awaiting_customer_approval',
  'approved',
  'scheduled',
  'contractor_en_route',
  'work_started',
  'change_order_pending',
]);

const INVITATION_WITHDRAW_STATUSES = new Set(['invited', 'pending', 'sent']);

function reasonLabel(code, fallback) {
  return CANCELLATION_REASON_LABELS[code] || fallback || 'Other';
}

function appBaseUrl() {
  return (
    process.env.APP_URL?.trim() ||
    process.env.URL?.trim() ||
    brand.domain?.replace(/\/$/, '') ||
    'https://fixbridge.netlify.app'
  );
}

async function hasSucceededPayment(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM payments
     WHERE job_id=$1 AND status IN ('succeeded','paid','captured')
       AND payment_type IN ('dispatch_fee','retail_payment','service_payment')
     LIMIT 1`,
    [jobId]
  );
  return rows.length > 0;
}

async function hasProcessedPayout(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM contractor_payouts
     WHERE job_id=$1 AND status IN ('paid','succeeded','processing','approved')
     LIMIT 1`,
    [jobId]
  );
  return rows.length > 0;
}

export async function releaseVisitFeeHoldIfNeeded(pool, jobId, actorUserId, pushStatus) {
  const { rows: freshJobs } = await pool.query(
    `SELECT visit_fee_authorized, visit_fee_captured, stripe_payment_intent_id FROM managed_jobs WHERE id=$1`,
    [jobId]
  );
  const fJob = freshJobs[0];
  if (!fJob?.visit_fee_authorized || fJob.visit_fee_captured) return;

  const { rows: pmts } = await pool.query(
    `SELECT * FROM payments WHERE job_id=$1 AND payment_type='dispatch_fee' AND status IN ('authorized','pending') ORDER BY id DESC LIMIT 1`,
    [jobId]
  );
  if (!pmts[0]) return;

  const pmt = pmts[0];
  if (pmt.simulated) {
    await pool.query(`UPDATE payments SET status='canceled' WHERE id=$1`, [pmt.id]);
    await pool.query(`UPDATE managed_jobs SET visit_fee_authorized=false WHERE id=$1`, [jobId]);
    if (pushStatus) {
      await pushStatus(pool, jobId, 'canceled', 'canceled', actorUserId, 'Pre-authorization hold released (simulated)');
    }
    return;
  }

  const intentId = fJob.stripe_payment_intent_id || pmt.stripe_payment_intent;
  if (!intentId) return;

  const rel = await cancelPaymentIntent(intentId);
  if (rel.ok || rel.simulated) {
    await pool.query(`UPDATE payments SET status='canceled' WHERE id=$1`, [pmt.id]);
    await pool.query(`UPDATE managed_jobs SET visit_fee_authorized=false WHERE id=$1`, [jobId]);
    if (pushStatus) {
      await pushStatus(pool, jobId, 'canceled', 'canceled', actorUserId, 'Pre-authorization hold released (Stripe)');
    }
  }
}

/**
 * Centralized cancellation side-effects (idempotent when job already canceled).
 */
export async function notifyJobCancelled(pool, {
  job,
  homeowner,
  reasonCode,
  reasonLabel: reasonText,
  details,
  actorUserId,
  alreadyCancelled = false,
}) {
  if (!job?.id) return;

  const jobId = Number(job.id);
  const bookingId = job.booking_id || `FB-${jobId}`;
  const serviceTitle = job.title || job.category || 'Service request';
  const reason = reasonText || reasonLabel(reasonCode, job.cancellation_reason);
  const area = [job.city, job.state].filter(Boolean).join(', ') || job.city_state_zip || 'Service area';
  const visitDate = job.preferred_date ? String(job.preferred_date).slice(0, 10) : null;
  const visitLabel = visitDate
    ? new Date(`${visitDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  if (!alreadyCancelled) {
    try {
      await cancelServiceReminderForJob(pool, jobId);
    } catch (_e) {
      /* non-fatal */
    }

    const { rows: pendingInvites } = await pool.query(
      `SELECT DISTINCT contractor_user_id FROM job_invitations
       WHERE job_id=$1 AND status = ANY($2::text[])
         AND contractor_user_id IS NOT NULL`,
      [jobId, Array.from(INVITATION_WITHDRAW_STATUSES)]
    );

    await pool.query(
      `UPDATE job_invitations
       SET status='withdrawn', responded_at=COALESCE(responded_at, NOW())
       WHERE job_id=$1 AND status = ANY($2::text[])`,
      [jobId, Array.from(INVITATION_WITHDRAW_STATUSES)]
    );

    for (const row of pendingInvites) {
      const contractorUserId = Number(row.contractor_user_id);
      if (!contractorUserId || contractorUserId === assignedId) continue;
      try {
        await pool.query(
          `INSERT INTO notifications (user_id, job_id, type, title, message)
           VALUES ($1,$2,'job_withdrawn',$3,$4)`,
          [
            contractorUserId,
            jobId,
            'Job no longer available',
            `${bookingId} · ${serviceTitle} is no longer available.`,
          ]
        );
      } catch (_e) {
        /* non-fatal */
      }
    }
  }

  const assignedId = job.assigned_contractor_user_id ? Number(job.assigned_contractor_user_id) : null;
  const homeownerName = homeowner?.name || 'Homeowner';

  const adminTitle = 'Service Request Cancelled';
  const adminMessage =
    `${homeownerName} cancelled ${job.category || 'service'} request ${bookingId}.` +
    (reason ? ` Reason: ${reason}.` : '');

  notifyOps(
    `${brand.productName}: ${homeownerName} cancelled ${bookingId} (${serviceTitle}).` +
      (reason ? ` Reason: ${reason}.` : '')
  );

  try {
    const { rows: admins } = await pool.query(
      `SELECT id, email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
    );
    for (const admin of admins) {
      await pool.query(
        `INSERT INTO notifications (user_id, job_id, type, title, message)
         VALUES ($1,$2,'job_cancelled',$3,$4)`,
        [admin.id, jobId, adminTitle, adminMessage]
      );
      if (admin.email) {
        await sendEmailSafe({
          to: admin.email,
          subject: `${brand.productName} — Service cancelled ${bookingId}`,
          html:
            `<p><strong>${adminTitle}</strong></p>` +
            `<p>${bookingId} · ${serviceTitle}<br/>Property area: ${area}<br/>` +
            `Cancelled by: ${homeownerName}<br/>Reason: ${reason || '—'}</p>` +
            `<p>Open <strong>Admin → Work Queue</strong> to review.</p>`,
        });
      }
    }
  } catch (e) {
    console.error('notifyJobCancelled admins:', e.message);
  }

  const paid = await hasSucceededPayment(pool, jobId);
  const payoutProcessed = await hasProcessedPayout(pool, jobId);
  if (paid || payoutProcessed) {
    const financeTitle = 'Cancelled paid job requires review';
    const financeMessage = `${bookingId} was cancelled by the homeowner after payment activity. Review refund/payout handling.`;
    try {
      const { rows: admins } = await pool.query(
        `SELECT id FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
      );
      for (const admin of admins) {
        await pool.query(
          `INSERT INTO notifications (user_id, job_id, type, title, message)
           VALUES ($1,$2,'finance_review',$3,$4)`,
          [admin.id, jobId, financeTitle, financeMessage]
        );
      }
      notifyOps(`${brand.productName} FINANCE: ${financeMessage}`);
    } catch (e) {
      console.error('notifyJobCancelled finance:', e.message);
    }
  }

  if (assignedId) {
    const contractorTitle = 'Job Cancelled';
    const contractorMessage = visitLabel
      ? `The homeowner cancelled the ${job.category || 'service'} scheduled for ${visitLabel}.`
      : `The homeowner cancelled ${serviceTitle}.`;
    const contractorSecondary =
      reason && reasonCode !== 'provider_issue' ? `Reason: ${reason}` : reasonCode === 'provider_issue' ? 'Reason: Provider issue' : '';

    try {
      await pool.query(
        `INSERT INTO notifications (user_id, job_id, type, title, message)
         VALUES ($1,$2,'job_cancelled',$3,$4)`,
        [assignedId, jobId, contractorTitle, contractorSecondary ? `${contractorMessage} ${contractorSecondary}` : contractorMessage]
      );

      const { rows: contractors } = await pool.query(`SELECT email, name FROM users WHERE id=$1`, [assignedId]);
      if (contractors[0]?.email) {
        await sendEmailSafe({
          to: contractors[0].email,
          subject: `${brand.productName} Service Cancelled — ${bookingId}`,
          html:
            `<p>Hi ${contractors[0].name || 'there'},</p>` +
            `<p>The homeowner cancelled <strong>${serviceTitle}</strong> (${bookingId}).</p>` +
            (visitLabel ? `<p>Scheduled date: ${visitLabel}</p>` : '') +
            (area ? `<p>Area: ${area}</p>` : '') +
            (contractorSecondary ? `<p>${contractorSecondary}</p>` : '') +
            `<p><a href="${appBaseUrl()}/?job=${jobId}">View job</a></p>`,
        });
      }
    } catch (e) {
      console.error('notifyJobCancelled contractor:', e.message);
    }
  }

  if (Number(job.homeowner_user_id) === Number(actorUserId)) {
    const assignedNote = assignedId
      ? "We've notified FixBridge and your assigned provider."
      : 'Your service request has been cancelled.';
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, job_id, type, title, message)
         VALUES ($1,$2,'job_cancelled',$3,$4)`,
        [job.homeowner_user_id, jobId, 'Service cancelled', assignedNote]
      );
    } catch (_e) {
      /* non-fatal */
    }
  }
}

export function isHomeownerCancellableStatus(status) {
  const s = String(status || '');
  if (TERMINAL_JOB_STATUSES.has(s)) return false;
  return HOMEOWNER_CANCELABLE_STATUSES.has(s);
}

export function normalizeCancellationPayload(body = {}) {
  const reasonCode = String(body.reasonCode || body.cancellationReasonCode || '').trim();
  if (!CANCELLATION_REASON_LABELS[reasonCode]) {
    return { ok: false, message: 'Please select a valid cancellation reason.' };
  }
  const details =
    body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {};
  const reasonLabelText = reasonLabel(reasonCode, body.reasonLabel);
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) : '';
  if (notes) details.notes = notes;
  return {
    ok: true,
    reasonCode,
    reasonLabel: reasonLabelText,
    details,
    cancellationReason: notes ? `${reasonLabelText} — ${notes}` : reasonLabelText,
  };
}
