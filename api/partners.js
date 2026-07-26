import { Resend } from 'resend';
import { brand } from './brand.js';

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

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? new Resend(key) : null;
}

export async function lookupPartnerByCode(pool, code) {
  if (!code || !String(code).trim()) return null;
  const { rows } = await pool.query(
    `SELECT id, code, name, company, email, phone, active
     FROM partners WHERE LOWER(code)=LOWER($1) LIMIT 1`,
    [String(code).trim()]
  );
  if (!rows[0] || rows[0].active === false) return null;
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

  const resend = getResend();
  const from = process.env.FROM_EMAIL?.trim() || `${brand.productName} <onboarding@resend.dev>`;

  if (!resend) {
    console.log(`[Partner referral email — logged only]\nTo: ${partner.email}\nSubject: ${subject}\n${bodyText}`);
    return;
  }

  try {
    await resend.emails.send({
      from,
      to: partner.email,
      subject,
      text: bodyText,
    });
  } catch (e) {
    console.error('[Partner referral email failed]', e.message);
  }
}

export function intakeShareUrl(code, appUrl) {
  const base = (appUrl || brand.domain || 'http://localhost:5000').replace(/\/$/, '');
  const origin = base.startsWith('http') ? base : `https://${base}`;
  return `${origin}/start?partner=${encodeURIComponent(code)}`;
}
