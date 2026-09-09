/**
 * Solo Owner / No Employees acknowledgment — admin-approved status only.
 */

import { SOLO_OWNER_ACKNOWLEDGMENTS } from './contractor-agreement-content.js';
import { recalculateDispatchEligible } from './contractor-compliance.js';

export const SOLO_OWNER_FORM_VERSION = '4';

export async function getSoloOwnerStatus(pool, contractorUserId) {
  const { rows: users } = await pool.query(
    `SELECT solo_owner_status FROM users WHERE id=$1 AND role='contractor'`,
    [contractorUserId]
  );
  const { rows } = await pool.query(
    `SELECT * FROM solo_owner_acknowledgments
     WHERE contractor_user_id=$1
     ORDER BY created_at DESC LIMIT 1`,
    [contractorUserId]
  );
  const latest = rows[0] || null;
  return {
    status: users[0]?.solo_owner_status || 'not_applicable',
    latest,
    formVersion: SOLO_OWNER_FORM_VERSION,
    acknowledgments: SOLO_OWNER_ACKNOWLEDGMENTS,
  };
}

export async function submitSoloOwnerAcknowledgment(pool, contractorUserId, body, req) {
  const requiredChecks = SOLO_OWNER_ACKNOWLEDGMENTS.length;
  const checks = body?.acknowledgments || body?.checks || [];
  if (!Array.isArray(checks) || checks.filter(Boolean).length < requiredChecks) {
    return { ok: false, message: 'All solo owner acknowledgments must be accepted.' };
  }

  const ip =
    (typeof req?.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) || req?.socket?.remoteAddress || null;

  const { rows } = await pool.query(
    `INSERT INTO solo_owner_acknowledgments (
       contractor_user_id, form_version, provider_legal_name, owner_name, fein_tax_id,
       trades, service_area, gl_carrier, gl_policy, gl_expiration,
       acknowledgments, status, ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'under_review',$12,$13)
     RETURNING *`,
    [
      contractorUserId,
      SOLO_OWNER_FORM_VERSION,
      String(body.providerLegalName || body.provider_legal_name || '').trim() || null,
      String(body.ownerName || body.owner_name || '').trim() || null,
      String(body.feinTaxId || body.fein_tax_id || '').trim() || null,
      String(body.trades || '').trim() || null,
      String(body.serviceArea || body.service_area || '').trim() || null,
      String(body.glCarrier || body.gl_carrier || '').trim() || null,
      String(body.glPolicy || body.gl_policy || '').trim() || null,
      body.glExpiration || body.gl_expiration || null,
      JSON.stringify(checks),
      ip,
      req?.headers?.['user-agent'] || null,
    ]
  );

  await pool.query(
    `UPDATE users SET solo_owner_status='under_review', updated_at=NOW() WHERE id=$1`,
    [contractorUserId]
  );

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, acknowledgment: rows[0], summary };
}

export async function reviewSoloOwnerAcknowledgment(pool, contractorUserId, adminUserId, { action, reason }) {
  const status = await getSoloOwnerStatus(pool, contractorUserId);
  if (!status.latest) {
    return { ok: false, message: 'No solo owner acknowledgment on file.' };
  }

  const next =
    action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!next) {
    return { ok: false, message: 'action must be approve or reject.' };
  }

  await pool.query(
    `UPDATE solo_owner_acknowledgments
     SET status=$2, reviewed_by=$3, reviewed_at=NOW(), rejection_reason=$4
     WHERE id=$1`,
    [status.latest.id, next, adminUserId, reason || null]
  );

  await pool.query(
    `UPDATE users SET solo_owner_status=$2, updated_at=NOW() WHERE id=$1`,
    [contractorUserId, next === 'approve' ? 'approved' : 'rejected']
  );

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, status: next === 'approve' ? 'approved' : 'rejected', summary };
}

export async function reportSoloOwnerWorkforceChange(pool, contractorUserId, body) {
  const usesWorkers = body?.usesWorkers === true || body?.uses_workers === true;
  if (!usesWorkers) {
    return { ok: false, message: 'No workforce change reported.' };
  }

  await pool.query(
    `UPDATE users SET solo_owner_status='workforce_change_reported', updated_at=NOW() WHERE id=$1`,
    [contractorUserId]
  );

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, summary, message: 'Workforce change recorded. Workers\' Compensation requirements re-evaluated.' };
}
