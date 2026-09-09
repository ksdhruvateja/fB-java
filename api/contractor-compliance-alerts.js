/**
 * Expiration alerts for contractor compliance documents.
 * Idempotent: one alert per (contractor, document, alert_type, expiration_date).
 */

import { sendEmailSafe } from './notify.js';
import { DOCUMENT_TYPES, DOC_STATUS } from './contractor-compliance.js';
import { recalculateDispatchEligible } from './contractor-compliance.js';

const ALERT_THRESHOLDS = [
  { type: 'expire_30d', days: 30 },
  { type: 'expire_14d', days: 14 },
  { type: 'expire_7d', days: 7 },
  { type: 'expired', days: 0 },
];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(String(dateStr).slice(0, 10));
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

function toDateIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function alertAlreadySent(pool, contractorUserId, documentType, alertType, expirationDate) {
  const { rows } = await pool.query(
    `SELECT id FROM contractor_compliance_alerts
     WHERE contractor_user_id=$1 AND document_type=$2 AND alert_type=$3 AND expiration_date=$4 LIMIT 1`,
    [contractorUserId, documentType, alertType, expirationDate]
  );
  return Boolean(rows[0]);
}

async function recordAlert(pool, {
  contractorUserId,
  documentType,
  alertType,
  expirationDate,
  recipientRole,
  recipientEmail,
}) {
  await pool.query(
    `INSERT INTO contractor_compliance_alerts (
       contractor_user_id, document_type, alert_type, expiration_date, recipient_role, recipient_email
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (contractor_user_id, document_type, alert_type, expiration_date) DO NOTHING`,
    [contractorUserId, documentType, alertType, expirationDate, recipientRole, recipientEmail]
  );
}

/** Sweep all contractors for expiring/expired documents; send alerts and recalculate eligibility. */
export async function processComplianceExpirationAlerts(pool) {
  const { rows: docs } = await pool.query(
    `SELECT d.*, u.email AS contractor_email, u.name AS contractor_name
     FROM contractor_compliance_documents d
     JOIN users u ON u.id = d.contractor_user_id
     WHERE d.is_current = true
       AND d.expiration_date IS NOT NULL
       AND u.role = 'contractor'
       AND COALESCE(u.is_blocked, false) = false`
  );

  let alertsSent = 0;
  let recalculated = new Set();

  for (const doc of docs) {
    const expStr = toDateIso(doc.expiration_date);
    if (!expStr) continue;
    const remaining = daysUntil(expStr);
    if (remaining == null) continue;

    const meta = DOCUMENT_TYPES[doc.document_type] || { label: doc.document_type };

    for (const threshold of ALERT_THRESHOLDS) {
      const match =
        threshold.type === 'expired'
          ? remaining < 0
          : remaining === threshold.days;
      if (!match) continue;

      const already = await alertAlreadySent(
        pool,
        doc.contractor_user_id,
        doc.document_type,
        threshold.type,
        expStr
      );
      if (already) continue;

      const subject =
        threshold.type === 'expired'
          ? `FixBridge: ${meta.label} has expired`
          : `FixBridge: ${meta.label} expires in ${threshold.days} days`;

      const body =
        threshold.type === 'expired'
          ? `<p>Your <strong>${meta.label}</strong> expired on ${expStr}. Live dispatch is blocked until renewal is uploaded and verified.</p>`
          : `<p>Your <strong>${meta.label}</strong> expires on ${expStr} (${threshold.days} days). Please upload renewal documentation in your Compliance dashboard.</p>`;

      if (doc.contractor_email) {
        await sendEmailSafe({
          to: doc.contractor_email,
          template:
            threshold.type === 'expired'
              ? 'contractor_compliance_expiring'
              : 'contractor_compliance_expiring',
          data: {
            firstName: doc.contractor_name,
            documentName: meta.label,
            expiresAt: expStr,
          },
        });
      }

      await recordAlert(pool, {
        contractorUserId: doc.contractor_user_id,
        documentType: doc.document_type,
        alertType: threshold.type,
        expirationDate: expStr,
        recipientRole: 'contractor',
        recipientEmail: doc.contractor_email,
      });
      alertsSent += 1;

      if (threshold.type === 'expired' && doc.status === DOC_STATUS.VERIFIED) {
        await pool.query(
          `UPDATE contractor_compliance_documents SET status=$2, updated_at=NOW() WHERE id=$1`,
          [doc.id, DOC_STATUS.EXPIRED]
        );
        recalculated.add(doc.contractor_user_id);
      }
    }
  }

  for (const contractorUserId of recalculated) {
    await recalculateDispatchEligible(pool, contractorUserId);
  }

  return { alertsSent, recalculated: recalculated.size };
}
