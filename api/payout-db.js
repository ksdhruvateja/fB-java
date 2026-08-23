import { mergePricingRules } from './pricing.js';
import {
  amountsFromJobProposal,
  normalizePayoutSettings,
  PAYOUT_STATUS,
  estimateStandardPayoutDate,
  dollarsToCents,
} from './payout-service.js';
import {
  stripeConfigured,
  shouldSimulatePayment,
  createTransfer,
  createConnectPayout,
  retrieveConnectAccount,
  listConnectExternalAccounts,
  summarizeConnectAccount,
} from './stripe.js';

export async function loadPayoutSettings(pool) {
  const { rows } = await pool.query(`SELECT * FROM payout_settings WHERE id='default'`);
  return normalizePayoutSettings(rows[0] || {});
}

async function loadPricingRules(pool) {
  const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
  return mergePricingRules(rows[0]?.rules);
}

export async function logPayoutAudit(pool, { payoutId, action, previousStatus, newStatus, performedBy, metadata }) {
  await pool.query(
    `INSERT INTO payout_audit_logs (payout_id, action, previous_status, new_status, performed_by, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [payoutId, action, previousStatus || null, newStatus || null, performedBy || null, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function notifyContractorPayout(pool, { contractorId, jobId, type, title, message }) {
  await pool.query(
    `INSERT INTO notifications (user_id, job_id, type, title, message) VALUES ($1,$2,$3,$4,$5)`,
    [contractorId, jobId || null, type, title, message]
  );
}

export async function buildContractorPayoutAccountView(pool, contractorId) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [contractorId]);
  const user = rows[0];
  if (!user) return null;

  let external = { accounts: [] };
  let summary = {
    payoutsEnabled: user.stripe_payouts_enabled === true,
    verificationStatus: 'unverified',
    bankAccountStatus: 'missing',
    instantPayoutsEligible: false,
    requirementsDue: [],
    defaultDestination: null,
  };
  let accountStatus = user.stripe_onboarding_status || 'not_connected';

  if (user.stripe_account_id) {
    if (stripeConfigured()) {
      const { account } = await retrieveConnectAccount(user.stripe_account_id);
      external = await listConnectExternalAccounts(user.stripe_account_id);
      if (account) {
        summary = summarizeConnectAccount(account, external.accounts);
        accountStatus = account.details_submitted ? 'active' : 'pending';
        await pool.query(
          `UPDATE users SET stripe_onboarding_status=$1, stripe_payouts_enabled=$2 WHERE id=$3`,
          [account.details_submitted ? 'complete' : 'pending', summary.payoutsEnabled, contractorId]
        );
      }
    } else {
      external = await listConnectExternalAccounts(user.stripe_account_id);
      accountStatus = 'simulated';
      summary = {
        payoutsEnabled: true,
        verificationStatus: 'verified',
        bankAccountStatus: 'connected',
        instantPayoutsEligible: true,
        requirementsDue: [],
        defaultDestination: external.accounts[0] || null,
      };
    }
  }

  await pool.query(
    `INSERT INTO contractor_accounts
       (contractor_id, stripe_account_id, stripe_account_status, payouts_enabled,
        instant_payouts_eligible, bank_account_status, verification_status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (contractor_id) DO UPDATE SET
       stripe_account_id=EXCLUDED.stripe_account_id,
       stripe_account_status=EXCLUDED.stripe_account_status,
       payouts_enabled=EXCLUDED.payouts_enabled,
       instant_payouts_eligible=EXCLUDED.instant_payouts_eligible,
       bank_account_status=EXCLUDED.bank_account_status,
       verification_status=EXCLUDED.verification_status,
       updated_at=NOW()`,
    [
      contractorId,
      user.stripe_account_id || null,
      accountStatus,
      summary.payoutsEnabled,
      summary.instantPayoutsEligible,
      summary.bankAccountStatus,
      summary.verificationStatus,
    ]
  );

  const readyToReceive =
    Boolean(user.stripe_account_id) &&
    summary.payoutsEnabled &&
    summary.bankAccountStatus === 'connected' &&
    summary.verificationStatus === 'verified';

  return {
    connected: Boolean(user.stripe_account_id),
    stripeAccountId: user.stripe_account_id || null,
    onboardingStatus: accountStatus,
    payoutsEnabled: summary.payoutsEnabled,
    bankAccountStatus: summary.bankAccountStatus,
    instantPayoutsEligible: summary.instantPayoutsEligible,
    verificationStatus: summary.verificationStatus,
    requirementsDue: summary.requirementsDue,
    defaultDestination: summary.defaultDestination,
    bankAccounts: external.accounts,
    readyToReceivePayouts: readyToReceive,
    simulated: !stripeConfigured() && Boolean(user.stripe_account_id),
  };
}

export async function syncContractorAccountFromUser(pool, contractorId) {
  await buildContractorPayoutAccountView(pool, contractorId);
  const { rows } = await pool.query(`SELECT * FROM contractor_accounts WHERE contractor_id=$1`, [contractorId]);
  return rows[0] || null;
}

/**
 * Create or refresh contractor_payouts row for a job.
 * @param {object} opts
 * @param {import('pg').Pool} opts.pool
 * @param {number} opts.jobId
 * @param {string} [opts.initialStatus]
 * @param {number|null} [opts.actorUserId]
 */
export async function ensurePayoutRecordForJob(pool, jobId, { initialStatus, actorUserId } = {}) {
  const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  const job = jobs[0];
  if (!job?.assigned_contractor_user_id) return null;

  const { rows: existing } = await pool.query(`SELECT * FROM contractor_payouts WHERE job_id=$1`, [jobId]);
  if (existing[0]) return existing[0];

  const { rows: props } = await pool.query(
    `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [jobId]
  );
  const amounts = amountsFromJobProposal(job, props[0] || null);

  const customerLabel =
    [job.contact_name, job.city_state_zip || job.full_address].filter(Boolean).join(' · ') || 'Customer';

  const status =
    initialStatus ||
    (['work_completed', 'customer_review_pending', 'admin_review_pending', 'payout_pending'].includes(job.status)
      ? PAYOUT_STATUS.PENDING_APPROVAL
      : PAYOUT_STATUS.PENDING_JOB_COMPLETION);

  const { rows: inserted } = await pool.query(
    `INSERT INTO contractor_payouts
       (contractor_id, job_id, job_ref, customer_label, completion_date,
        gross_amount_cents, platform_fee_cents, adjustments_cents, net_amount_cents, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      job.assigned_contractor_user_id,
      jobId,
      job.booking_id || `FB-${jobId}`,
      customerLabel,
      job.updated_at || new Date(),
      amounts.grossAmountCents,
      amounts.platformFeeCents,
      amounts.otherAdjustmentsCents,
      amounts.netBeforeInstantCents,
      status,
    ]
  );

  const payout = inserted[0];
  await logPayoutAudit(pool, {
    payoutId: payout.id,
    action: 'created',
    previousStatus: null,
    newStatus: status,
    performedBy: actorUserId || null,
    metadata: { jobId, grossAmountCents: amounts.grossAmountCents },
  });

  await notifyContractorPayout(pool, {
    contractorId: job.assigned_contractor_user_id,
    jobId,
    type: 'payout_created',
    title: 'Payout record created',
    message: `A payout of $${(amounts.netBeforeInstantCents / 100).toFixed(2)} for ${job.booking_id || `Job #FB-${jobId}`} is pending admin approval.`,
  });

  return payout;
}

/**
 * Admin approves payout and initiates standard Stripe transfer.
 */
export async function approveAndReleasePayout(pool, payoutId, adminUserId, { adjustmentsCents = 0, note } = {}) {
  const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payoutId]);
  const payout = rows[0];
  if (!payout) return { ok: false, message: 'Payout not found.' };
  if (![PAYOUT_STATUS.PENDING_APPROVAL, PAYOUT_STATUS.PENDING_JOB_COMPLETION].includes(payout.status)) {
    return { ok: false, message: `Payout cannot be approved from status: ${payout.status}` };
  }

  const { rows: contractors } = await pool.query(`SELECT * FROM users WHERE id=$1`, [payout.contractor_id]);
  const contractor = contractors[0];
  if (!contractor) return { ok: false, message: 'Contractor not found.' };

  const simulate =
    shouldSimulatePayment(false) || (!contractor.stripe_account_id && !stripeConfigured());
  if (!simulate && !contractor.stripe_account_id) {
    return { ok: false, message: 'Contractor has not connected Stripe payouts yet.' };
  }

  const adj = Math.round(Number(adjustmentsCents || 0));
  const netAmountCents = Math.max(0, Number(payout.net_amount_cents) + adj);

  const payRules = await loadPricingRules(pool);
  const reservePct = Math.max(0, Math.min(100, Number(payRules.reserve_percentage ?? 10))) / 100;
  const reserveAmountCents = Math.round(netAmountCents * reservePct);
  const transferAmountCents = Math.max(0, netAmountCents - reserveAmountCents);

  const estimatedAt = estimateStandardPayoutDate(new Date());
  const prevStatus = payout.status;

  await pool.query(
    `UPDATE contractor_payouts SET
       adjustments_cents=$1,
       net_amount_cents=$2,
       reserve_amount_cents=$3,
       status=$4,
       approved_by=$5,
       approved_at=NOW(),
       estimated_payout_at=$6,
       payout_method='standard',
       updated_at=NOW()
     WHERE id=$7`,
    [adj, netAmountCents, reserveAmountCents, PAYOUT_STATUS.APPROVED, adminUserId, estimatedAt, payoutId]
  );

  await logPayoutAudit(pool, {
    payoutId,
    action: 'approved',
    previousStatus: prevStatus,
    newStatus: PAYOUT_STATUS.APPROVED,
    performedBy: adminUserId,
    metadata: { note, netAmountCents, reserveAmountCents },
  });

  let transferId = null;
  if (transferAmountCents > 0) {
    await pool.query(`UPDATE contractor_payouts SET status=$1, updated_at=NOW() WHERE id=$2`, [
      PAYOUT_STATUS.PROCESSING,
      payoutId,
    ]);

    if (simulate) {
      transferId = `sim_tr_${Date.now()}`;
    } else {
      const result = await createTransfer({
        amountCents: transferAmountCents,
        destinationAccountId: contractor.stripe_account_id,
        transferGroup: `job_${payout.job_id}`,
        metadata: { payoutId: String(payoutId), jobId: String(payout.job_id) },
      });
      transferId = result.transferId;
    }

    await pool.query(
      `UPDATE contractor_payouts SET stripe_transfer_id=$1, status=$2, updated_at=NOW() WHERE id=$3`,
      [transferId, PAYOUT_STATUS.PROCESSING, payoutId]
    );

    await pool.query(
      `INSERT INTO transfers (job_id, contractor_user_id, amount, status, stripe_transfer_id, simulated, created_by, reserve_amount, reserve_release_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        payout.job_id,
        payout.contractor_id,
        transferAmountCents / 100,
        'processing',
        transferId,
        simulate,
        adminUserId,
        reserveAmountCents / 100,
        new Date(Date.now() + (Number(payRules.reserve_hold_days ?? 7) * 86400000)),
      ]
    ).catch(() => {});

    await logPayoutAudit(pool, {
      payoutId,
      action: 'transfer_initiated',
      previousStatus: PAYOUT_STATUS.APPROVED,
      newStatus: PAYOUT_STATUS.PROCESSING,
      performedBy: adminUserId,
      metadata: { transferId, transferAmountCents },
    });
  }

  await notifyContractorPayout(pool, {
    contractorId: payout.contractor_id,
    jobId: payout.job_id,
    type: 'payout_approved',
    title: 'Payout approved',
    message: `Your $${(netAmountCents / 100).toFixed(2)} payout for ${payout.job_ref || `Job #FB-${payout.job_id}`} has been approved.`,
  });

  const { rows: fresh } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payoutId]);
  return { ok: true, payout: fresh[0], transferId, simulated: simulate };
}

/**
 * Contractor requests instant payout on an approved balance.
 */
export async function requestInstantPayout(pool, payoutId, contractorUserId) {
  const settings = await loadPayoutSettings(pool);
  if (!settings.instant_payout_enabled) {
    return { ok: false, message: 'Instant payouts are disabled.' };
  }

  const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payoutId]);
  const payout = rows[0];
  if (!payout) return { ok: false, message: 'Payout not found.' };
  if (Number(payout.contractor_id) !== Number(contractorUserId)) {
    return { ok: false, message: 'Not allowed.' };
  }
  if (payout.status !== PAYOUT_STATUS.APPROVED) {
    return { ok: false, message: 'Instant payout is only available for approved payouts.' };
  }

  const netCents = Number(payout.net_amount_cents);
  if (netCents < settings.minimum_instant_payout_cents) {
    return { ok: false, message: 'Payout amount is below the minimum for instant payout.' };
  }
  if (netCents > settings.maximum_instant_payout_cents) {
    return { ok: false, message: 'Payout amount exceeds the maximum for instant payout.' };
  }

  const account = await syncContractorAccountFromUser(pool, contractorUserId);
  if (!account?.instant_payouts_eligible && stripeConfigured()) {
    return { ok: false, message: 'Your Stripe account is not eligible for instant payouts yet.' };
  }

  const { rows: contractors } = await pool.query(`SELECT * FROM users WHERE id=$1`, [contractorUserId]);
  const contractor = contractors[0];
  const simulate = shouldSimulatePayment(false) || !stripeConfigured();

  const instantFee = settings.fixbridge_absorbs_fee
    ? 0
    : Math.min(
        settings.maximum_instant_fee_cents || Infinity,
        Math.max(
          settings.minimum_instant_fee_cents || 0,
          (() => {
            let fee = 0;
            const t = settings.instant_fee_type;
            if (t === 'percentage' || t === 'percentage_plus_fixed') {
              fee += Math.round((netCents * settings.instant_fee_percentage_bps) / 10000);
            }
            if (t === 'fixed' || t === 'percentage_plus_fixed') {
              fee += settings.instant_fee_fixed_cents;
            }
            return fee;
          })()
        )
      );

  const payoutToContractorCents = Math.max(0, netCents - instantFee);
  const prevStatus = payout.status;

  await pool.query(
    `UPDATE contractor_payouts SET
       instant_payout_fee_cents=$1,
       net_amount_cents=$2,
       payout_method='instant',
       status=$3,
       updated_at=NOW()
     WHERE id=$4`,
    [instantFee, payoutToContractorCents, PAYOUT_STATUS.PROCESSING, payoutId]
  );

  let transferId = null;
  let stripePayoutId = null;

  if (simulate) {
    transferId = `sim_tr_instant_${Date.now()}`;
    stripePayoutId = `sim_po_instant_${Date.now()}`;
    await pool.query(
      `UPDATE contractor_payouts SET stripe_transfer_id=$1, stripe_payout_id=$2, status=$3, paid_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [transferId, stripePayoutId, PAYOUT_STATUS.PAID, payoutId]
    );
  } else {
    const result = await createConnectPayout({
      amountCents: payoutToContractorCents,
      destinationAccountId: contractor.stripe_account_id,
      transferGroup: `job_${payout.job_id}`,
      metadata: { payoutId: String(payoutId), instant: 'true' },
      method: 'instant',
    });
    transferId = result.transferId;
    stripePayoutId = result.payoutId;

    await pool.query(
      `UPDATE contractor_payouts SET stripe_transfer_id=$1, stripe_payout_id=$2, updated_at=NOW() WHERE id=$3`,
      [transferId, stripePayoutId, payoutId]
    );
  }

  await logPayoutAudit(pool, {
    payoutId,
    action: 'instant_payout_requested',
    previousStatus: prevStatus,
    newStatus: simulate ? PAYOUT_STATUS.PAID : PAYOUT_STATUS.PROCESSING,
    performedBy: contractorUserId,
    metadata: { instantFee, payoutToContractorCents, transferId, stripePayoutId },
  });

  await notifyContractorPayout(pool, {
    contractorId: contractorUserId,
    jobId: payout.job_id,
    type: simulate ? 'instant_payout_completed' : 'instant_payout_processing',
    title: simulate ? 'Instant payout completed' : 'Instant payout processing',
    message: simulate
      ? `Your instant payout of $${(payoutToContractorCents / 100).toFixed(2)} for ${payout.job_ref} has been sent.`
      : `Your instant payout of $${(payoutToContractorCents / 100).toFixed(2)} for ${payout.job_ref} is processing.`,
  });

  const { rows: fresh } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payoutId]);
  return {
    ok: true,
    payout: fresh[0],
    instantFeeCents: instantFee,
    netPayoutCents: payoutToContractorCents,
    simulated: simulate,
  };
}

export async function handlePayoutWebhookUpdate(pool, event) {
  const obj = event.data?.object;
  if (!obj) return;

  if (event.type === 'payout.paid') {
    const stripePayoutId = obj.id;
    const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE stripe_payout_id=$1`, [stripePayoutId]);
    if (rows[0]) {
      const prev = rows[0].status;
      await pool.query(
        `UPDATE contractor_payouts SET status=$1, paid_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [PAYOUT_STATUS.PAID, rows[0].id]
      );
      await logPayoutAudit(pool, {
        payoutId: rows[0].id,
        action: 'webhook_payout_paid',
        previousStatus: prev,
        newStatus: PAYOUT_STATUS.PAID,
        performedBy: null,
        metadata: { stripePayoutId },
      });
      await notifyContractorPayout(pool, {
        contractorId: rows[0].contractor_id,
        jobId: rows[0].job_id,
        type: 'payout_completed',
        title: 'Payout completed',
        message: `Your payout for ${rows[0].job_ref || `Job #FB-${rows[0].job_id}`} has been deposited.`,
      });
    }
  }

  if (event.type === 'payout.failed') {
    const stripePayoutId = obj.id;
    const reason = obj.failure_message || obj.failure_code || 'Payout failed';
    const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE stripe_payout_id=$1`, [stripePayoutId]);
    if (rows[0]) {
      const prev = rows[0].status;
      await pool.query(
        `UPDATE contractor_payouts SET status=$1, failure_reason=$2, updated_at=NOW() WHERE id=$3`,
        [PAYOUT_STATUS.FAILED, reason, rows[0].id]
      );
      await logPayoutAudit(pool, {
        payoutId: rows[0].id,
        action: 'webhook_payout_failed',
        previousStatus: prev,
        newStatus: PAYOUT_STATUS.FAILED,
        performedBy: null,
        metadata: { stripePayoutId, reason },
      });
      await notifyContractorPayout(pool, {
        contractorId: rows[0].contractor_id,
        jobId: rows[0].job_id,
        type: 'payout_failed',
        title: 'Payout failed',
        message: `Your payout for ${rows[0].job_ref} failed: ${reason}. Please update your Stripe account.`,
      });
    }
  }

  if (event.type === 'transfer.created') {
    const transferId = obj.id;
    await pool.query(
      `UPDATE contractor_payouts SET status=$1, updated_at=NOW()
       WHERE stripe_transfer_id=$2 AND status IN ('approved', 'processing')`,
      [PAYOUT_STATUS.PROCESSING, transferId]
    ).catch(() => {});
  }
}

export { dollarsToCents };
