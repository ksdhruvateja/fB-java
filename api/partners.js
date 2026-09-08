import { brand } from './brand.js';
import { sendFixBridgeEmail } from './email/send-fixbridge-email.js';
import { isPartnerSelfReferral, logSelfReferralBlocked } from './referral-self-guard.js';
import { auditReferral } from './referrals.js';

/** Partner-visible statuses only (never pricing, net bids, or payment details). */
export const PARTNER_VISIBLE_STATUSES = [
  'referral_received',
  'customer_contacted',
  'assessment_scheduled',
  'proposal_sent',
  'work_scheduled',
  'work_completed',
];

const JOB_TO_PARTNER_STATUS = {
  draft: 'referral_received',
  ai_review_complete: 'customer_contacted',
  awaiting_service_payment: 'customer_contacted',
  paid_for_dispatch: 'assessment_scheduled',
  awaiting_contractor: 'assessment_scheduled',
  contractor_invited: 'assessment_scheduled',
  contractor_accepted: 'assessment_scheduled',
  awaiting_bid: 'assessment_scheduled',
  bid_received: 'assessment_scheduled',
  proposal_sent: 'proposal_sent',
  awaiting_customer_approval: 'proposal_sent',
  approved: 'proposal_sent',
  scheduled: 'work_scheduled',
  contractor_en_route: 'work_scheduled',
  work_started: 'work_scheduled',
  change_order_pending: 'work_scheduled',
  work_completed: 'work_completed',
  customer_review_pending: 'work_completed',
  admin_review_pending: 'work_completed',
  payout_pending: 'work_completed',
  paid_out: 'work_completed',
  closed: 'work_completed',
};

export const PARTNER_STATUS_LABELS = {
  referral_received: 'Referral received',
  customer_contacted: 'Customer contacted',
  assessment_scheduled: 'Assessment scheduled',
  proposal_sent: 'Proposal sent',
  work_scheduled: 'Work scheduled',
  work_completed: 'Work completed',
};

export function mapJobStatusToPartnerStatus(jobStatus) {
  return JOB_TO_PARTNER_STATUS[jobStatus] || null;
}


export function normalizePartnerCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

export async function lookupPartnerByCode(pool, code) {
  if (!code || !String(code).trim()) return null;
  const { rows } = await pool.query(
    `SELECT id, code, name, company, email, phone, active, deleted_at
     FROM partners WHERE LOWER(code)=LOWER($1) LIMIT 1`,
    [String(code).trim()]
  );
  if (!rows[0] || rows[0].active === false || rows[0].deleted_at) return null;
  return rows[0];
}

export function publicPartnerView(partner) {
  if (!partner) return null;
  return {
    code: partner.code,
    name: partner.name,
    company: partner.company || null,
  };
}

async function logReferralEvent(pool, referralId, jobId, status, detail) {
  await pool.query(
    `INSERT INTO partner_referral_events (referral_id, job_id, status, detail)
     VALUES ($1,$2,$3,$4)`,
    [referralId || null, jobId || null, status, detail ? JSON.stringify(detail) : null]
  );
}

/**
 * Sync partner referral status from a managed job status change.
 * Emails the partner only when customer consent is on and status is partner-visible.
 */
export async function syncPartnerReferralFromJob(pool, jobId, jobStatus) {
  const partnerStatus = mapJobStatusToPartnerStatus(jobStatus);
  if (!partnerStatus || !PARTNER_VISIBLE_STATUSES.includes(partnerStatus)) return null;

  const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
  const job = jobs[0];
  if (!job?.partner_id && !job?.partner_code) return null;

  if (job.homeowner_user_id && job.partner_id) {
    const { rows: partners } = await pool.query(`SELECT * FROM partners WHERE id=$1`, [job.partner_id]);
    const { rows: homeowners } = await pool.query(`SELECT id, email, phone FROM users WHERE id=$1`, [
      job.homeowner_user_id,
    ]);
    const partner = partners[0];
    const homeowner = homeowners[0];
    const identity = isPartnerSelfReferral(partner, homeowner);
    if (identity.blocked) {
      await logSelfReferralBlocked(pool, auditReferral, {
        referredUserId: job.homeowner_user_id,
        partnerId: job.partner_id,
        reason: identity.reason,
        via: 'syncPartnerReferralFromJob',
      });
      await pool.query(
        `UPDATE managed_jobs SET partner_id=NULL, partner_code=NULL, referral_status=NULL WHERE id=$1`,
        [jobId]
      );
      return { blocked: true, reason: identity.reason };
    }
  }

  let referral;
  const existing = await pool.query(
    `SELECT * FROM partner_referrals WHERE job_id=$1 ORDER BY id DESC LIMIT 1`,
    [jobId]
  );
  if (existing.rows[0]) {
    referral = existing.rows[0];
    if (referral.status !== partnerStatus) {
      await pool.query(
        `UPDATE partner_referrals SET status=$1 WHERE id=$2`,
        [partnerStatus, referral.id]
      );
      referral = { ...referral, status: partnerStatus };
    }
  } else {
    const inserted = await pool.query(
      `INSERT INTO partner_referrals (partner_id, partner_code, job_id, homeowner_user_id, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [job.partner_id || null, job.partner_code || null, jobId, job.homeowner_user_id, partnerStatus]
    );
    referral = inserted.rows[0];
  }

  await pool.query(`UPDATE managed_jobs SET referral_status=$1 WHERE id=$2`, [partnerStatus, jobId]);
  await logReferralEvent(pool, referral.id, jobId, partnerStatus, { jobStatus });

  // Status emails only with customer consent (phase one)
  if (job.customer_partner_status_consent === true) {
    await emailPartnerStatusUpdate(pool, job, partnerStatus);
  }

  return { referral, partnerStatus };
}

async function emailPartnerStatusUpdate(pool, job, partnerStatus) {
  const { rows: partners } = await pool.query(`SELECT * FROM partners WHERE id=$1`, [job.partner_id]);
  const partner = partners[0];
  if (!partner?.email) {
    console.log(
      `[Partner referral] No partner email for job ${job.id} → ${partnerStatus} (${PARTNER_STATUS_LABELS[partnerStatus]})`
    );
    return;
  }

  const label = PARTNER_STATUS_LABELS[partnerStatus] || partnerStatus;
  const booking = job.booking_id || `JOB-${job.id}`;
  const subject = `${brand.productName} referral update: ${label}`;
  const bodyText = [
    `Hello ${partner.name},`,
    ``,
    `A referral update is available for partner code ${partner.code}.`,
    ``,
    `Status: ${label}`,
    `Reference: ${booking}`,
    job.category ? `Category: ${job.category}` : null,
    job.city_state_zip ? `Area: ${job.city_state_zip}` : null,
    ``,
    `Pricing, contractor bids, payment details and personal financial information are not shared.`,
    ``,
    `— ${brand.productName}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    const mailed = await sendFixBridgeEmail({
      to: partner.email,
      template: 'partner_referral_update',
      data: {
        firstName: partner.name,
        status: label,
        message: `A referral update is available for partner code ${partner.code}. Pricing, contractor bids, payment details and personal financial information are not shared.`,
        customerName: booking,
        jobNumber: booking,
      },
    });
    if (!mailed.ok) {
      console.log(`[Partner referral email — logged]\nTo: ${partner.email}\nSubject: ${subject}\n${bodyText}`);
    }
  } catch (e) {
    console.error('[Partner referral email failed]', e.message);
  }
}

export async function attachPartnerToJob(pool, jobId, partner, homeownerUserId, { actorId = null } = {}) {
  if (!partner || !jobId) return { ok: false, message: 'Partner or job missing.' };
  if (homeownerUserId) {
    const { rows: homeowners } = await pool.query(`SELECT id, email, phone FROM users WHERE id=$1`, [
      homeownerUserId,
    ]);
    const identity = isPartnerSelfReferral(partner, homeowners[0]);
    if (identity.blocked) {
      await logSelfReferralBlocked(pool, auditReferral, {
        referredUserId: homeownerUserId,
        partnerId: partner.id,
        reason: identity.reason,
        actorId,
        via: 'attachPartnerToJob',
      });
      return { ok: false, blocked: true, code: 'SELF_REFERRAL_NOT_ALLOWED', reason: identity.reason };
    }
  }
  await pool.query(
    `UPDATE managed_jobs SET
       partner_id=$1,
       partner_code=$2,
       referral_source=COALESCE(referral_source, 'partner_link'),
       referring_name=COALESCE(NULLIF(referring_name,''), $3),
       referring_company=COALESCE(NULLIF(referring_company,''), $4),
       referring_email=COALESCE(NULLIF(referring_email,''), $5),
       referring_phone=COALESCE(NULLIF(referring_phone,''), $6),
       referral_status='referral_received'
     WHERE id=$7`,
    [
      partner.id,
      partner.code,
      partner.name,
      partner.company || null,
      partner.email || null,
      partner.phone || null,
      jobId,
    ]
  );
  return { ok: true, partner };
}

export function intakeShareUrl(code, appUrl) {
  const base = (appUrl || brand.domain || 'http://localhost:5000').replace(/\/$/, '');
  const origin = base.startsWith('http') ? base : `https://${base}`;
  return `${origin}/start?partner=${encodeURIComponent(code)}`;
}
