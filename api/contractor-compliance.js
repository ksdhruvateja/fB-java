/**
 * Contractor compliance & dispatch eligibility.
 * Application may be submitted with missing docs; live dispatch requires verified applicable docs.
 */

import { buildComplianceEvaluation, assertDispatchEligibleForJob, getJobComplianceTier } from './contractor-compliance-matrix.js';
import { getContractorAgreementStatus } from './contractor-agreement.js';
import { getSoloOwnerStatus } from './solo-owner.js';

export {
  COI_CERTIFICATE_HOLDER,
  COI_LEGAL_NOTICE_ADDRESS,
  DOCUMENT_TYPES,
  DOC_STATUS,
  APPLICABILITY,
  parseContractorApplication,
  computeApplicability,
  serializeComplianceDocument,
  isExpired,
} from './contractor-compliance-shared.js';

export { buildComplianceEvaluation, assertDispatchEligibleForJob, getJobComplianceTier, COMPLIANCE_TIER, OVERALL_STATUS, MATRIX_REQUIREMENTS } from './contractor-compliance-matrix.js';

import {
  APPLICABILITY,
  DOC_STATUS,
  DOCUMENT_TYPES,
  computeApplicability,
  deriveComplianceStatus,
  parseContractorApplication,
} from './contractor-compliance-shared.js';

const LEGACY_MAP = {
  W9: { name: 'w9_document_name', data: 'w9_document_data' },
  TRADE_LICENSE: { name: 'license_document_name', data: 'license_document_data' },
  GENERAL_LIABILITY_COI: { name: 'insurance_document_name', data: 'insurance_document_data' },
};

export function evaluateCompliance(user, documentRows = [], options = {}) {
  return buildComplianceEvaluation(user, documentRows, options);
}

async function complianceOptionsForUser(pool, user, options = {}) {
  if (options.agreement) return options;
  const agreementStatus = await getContractorAgreementStatus(pool, user.id);
  const providerLevel = String(user.provider_level || 'level_1').toLowerCase();
  const soloOwner = await getSoloOwnerStatus(pool, user.id);
  return {
    ...options,
    agreement: {
      currentVersion: agreementStatus.currentVersion,
      acceptedCurrent: agreementStatus.acceptedCurrent,
      acceptedVersion: agreementStatus.acceptedVersion,
      acceptedAt: agreementStatus.acceptedAt,
      managedAddendumRequired: providerLevel === 'level_2' || providerLevel === 'level2',
      managedAddendumAccepted: agreementStatus.managedAddendum?.accepted === true,
    },
    soloOwner,
  };
}

export function assertContractorDispatchEligible(user, documentRows = [], options = {}) {
  const job = options.job || null;
  const gate = assertDispatchEligibleForJob(user, documentRows, job, options);
  if (gate.ok) return { ok: true, summary: gate.evaluation };
  return {
    ok: false,
    code: gate.code || 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE',
    message: gate.message,
    missingRequirements: gate.missingRequirements,
    complianceStatus: gate.complianceStatus,
    overallStatus: gate.overallStatus,
    tier: gate.tier,
    blockingItems: gate.blockingItems,
    reviewItems: gate.reviewItems,
    summary: gate.evaluation,
  };
}

export async function recordComplianceEvent(pool, {
  contractorUserId,
  documentType = null,
  action,
  actorUserId = null,
  metadata = null,
}) {
  await pool.query(
    `INSERT INTO contractor_compliance_events (contractor_user_id, document_type, action, actor_user_id, metadata)
     VALUES ($1,$2,$3,$4,$5)`,
    [contractorUserId, documentType, action, actorUserId, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function loadCurrentComplianceDocuments(pool, contractorUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND is_current=true
     ORDER BY document_type ASC`,
    [contractorUserId]
  );
  return rows;
}

export async function loadComplianceHistory(pool, contractorUserId, documentType) {
  const { rows } = await pool.query(
    `SELECT id, document_type, status, file_name, issue_date, expiration_date,
            uploaded_at, verified_at, verified_by, rejected_at, rejected_by,
            rejection_reason, version, is_current, notes, created_at
     FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND document_type=$2
     ORDER BY version DESC, created_at DESC`,
    [contractorUserId, documentType]
  );
  return rows;
}

async function upsertLegacyUserDocument(pool, contractorUserId, documentType, fileName, fileData, expirationDate) {
  const legacy = LEGACY_MAP[documentType];
  if (!legacy) return;
  const sets = [`${legacy.name}=$2`, `${legacy.data}=$3`];
  const params = [contractorUserId, fileName, fileData];
  if (documentType === 'TRADE_LICENSE' && expirationDate) {
    sets.push('license_expires_at=$4');
    params.push(expirationDate);
  }
  if (documentType === 'GENERAL_LIABILITY_COI' && expirationDate) {
    sets.push('insurance_expires_at=$4');
    params.push(expirationDate);
  }
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$1`, params);
}

/** Seed compliance rows from legacy user columns when missing. */
export async function ensureComplianceDocuments(pool, contractorUserId) {
  const { rows: users } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [
    contractorUserId,
  ]);
  if (!users[0]) return [];
  const user = users[0];
  const applicability = computeApplicability(user);

  for (const [type, legacy] of Object.entries(LEGACY_MAP)) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM contractor_compliance_documents
       WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
      [contractorUserId, type]
    );
    if (existing[0]) continue;

    const fileName = user[legacy.name];
    const fileData = user[legacy.data];
    const app = parseContractorApplication(user);
    const expirationDate =
      type === 'TRADE_LICENSE'
        ? user.license_expires_at || app.licenseExpiration || null
        : type === 'GENERAL_LIABILITY_COI'
          ? user.insurance_expires_at || app.insuranceExpiration || null
          : null;

    const hasFile = Boolean(fileData);
    const status =
      applicability[type] === APPLICABILITY.NOT_APPLICABLE
        ? DOC_STATUS.NOT_APPLICABLE
        : hasFile
          ? user.compliance_status === 'approved'
            ? DOC_STATUS.VERIFIED
            : DOC_STATUS.UNDER_REVIEW
          : DOC_STATUS.MISSING;

    await pool.query(
      `INSERT INTO contractor_compliance_documents (
         contractor_user_id, document_type, applicability, status, file_name, file_data,
         expiration_date, uploaded_at, verified_at, is_current, version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,1)`,
      [
        contractorUserId,
        type,
        applicability[type],
        status,
        fileName || null,
        fileData || null,
        expirationDate,
        hasFile ? user.updated_at || new Date() : null,
        status === DOC_STATUS.VERIFIED ? user.updated_at || new Date() : null,
      ]
    );
  }

  for (const type of Object.keys(DOCUMENT_TYPES)) {
    if (LEGACY_MAP[type]) continue;
    const { rows: existing } = await pool.query(
      `SELECT id FROM contractor_compliance_documents
       WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
      [contractorUserId, type]
    );
    if (existing[0]) continue;
    await pool.query(
      `INSERT INTO contractor_compliance_documents (
         contractor_user_id, document_type, applicability, status, is_current, version
       ) VALUES ($1,$2,$3,$4,true,1)`,
      [contractorUserId, type, applicability[type], DOC_STATUS.MISSING]
    );
  }

  return loadCurrentComplianceDocuments(pool, contractorUserId);
}

export async function recalculateDispatchEligible(pool, contractorUserId) {
  const { rows: users } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [
    contractorUserId,
  ]);
  if (!users[0]) return null;
  const docs = await ensureComplianceDocuments(pool, contractorUserId);

  for (const row of docs) {
    const applicability = computeApplicability(users[0])[row.document_type];
    const nextStatus = deriveComplianceStatus(row, applicability);
    if (row.applicability !== applicability || row.status !== nextStatus) {
      await pool.query(
        `UPDATE contractor_compliance_documents
         SET applicability=$3, status=$4, updated_at=NOW()
         WHERE id=$1 AND contractor_user_id=$2`,
        [row.id, contractorUserId, applicability, nextStatus]
      );
      row.applicability = applicability;
      row.status = nextStatus;
    }
  }

  const summary = evaluateCompliance(users[0], docs, await complianceOptionsForUser(pool, users[0]));
  const prev = users[0].dispatch_eligible === true;
  await pool.query(
    `UPDATE users SET
       dispatch_eligible=$2,
       level1_eligible=$3,
       level2_eligible=$4,
       overall_compliance_status=$5
     WHERE id=$1`,
    [
      contractorUserId,
      summary.dispatchEligible,
      summary.level1Eligible === true,
      summary.level2Eligible === true,
      summary.overallComplianceStatus || 'RED',
    ]
  );
  if (prev !== summary.dispatchEligible) {
    await recordComplianceEvent(pool, {
      contractorUserId,
      action: 'CONTRACTOR_DISPATCH_ELIGIBILITY_CHANGED',
      metadata: {
        from: prev,
        to: summary.dispatchEligible,
        missingRequirements: summary.missingRequirements,
      },
    });
  }
  return summary;
}

export async function uploadComplianceDocument(pool, {
  contractorUserId,
  documentType,
  fileName,
  fileData,
  issueDate = null,
  expirationDate = null,
  uploadLater = false,
  actorUserId = null,
}) {
  if (!DOCUMENT_TYPES[documentType]) {
    return { ok: false, message: 'Unknown document type.' };
  }

  const { rows: users } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [
    contractorUserId,
  ]);
  if (!users[0]) return { ok: false, message: 'Contractor not found.' };

  if (uploadLater && !fileData) {
    const { rows: cur } = await pool.query(
      `SELECT * FROM contractor_compliance_documents
       WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
      [contractorUserId, documentType]
    );
    if (cur[0]) {
      await pool.query(
        `UPDATE contractor_compliance_documents
         SET upload_later=true, status=$2, updated_at=NOW()
         WHERE id=$1`,
        [cur[0].id, DOC_STATUS.MISSING]
      );
    } else {
      const applicability = computeApplicability(users[0])[documentType];
      await pool.query(
        `INSERT INTO contractor_compliance_documents (
           contractor_user_id, document_type, applicability, status, upload_later, is_current, version
         ) VALUES ($1,$2,$3,$4,true,true,1)`,
        [contractorUserId, documentType, applicability, DOC_STATUS.MISSING]
      );
    }
    await recordComplianceEvent(pool, {
      contractorUserId,
      documentType,
      action: 'CONTRACTOR_DOCUMENT_UPLOAD_LATER',
      actorUserId,
    });
    const summary = await recalculateDispatchEligible(pool, contractorUserId);
    return { ok: true, summary };
  }

  if (!fileData) return { ok: false, message: 'File is required.' };

  const applicability = computeApplicability(users[0])[documentType];
  const { rows: cur } = await pool.query(
    `SELECT * FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
    [contractorUserId, documentType]
  );

  let version = 1;
  if (cur[0]) {
    version = Number(cur[0].version || 1) + 1;
    await pool.query(`UPDATE contractor_compliance_documents SET is_current=false WHERE id=$1`, [cur[0].id]);
  }

  const { rows: inserted } = await pool.query(
    `INSERT INTO contractor_compliance_documents (
       contractor_user_id, document_type, applicability, status, file_name, file_data,
       issue_date, expiration_date, upload_later, uploaded_at, is_current, version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,NOW(),true,$9)
     RETURNING *`,
    [
      contractorUserId,
      documentType,
      applicability,
      DOC_STATUS.UNDER_REVIEW,
      fileName,
      fileData,
      issueDate,
      expirationDate,
      version,
    ]
  );

  await upsertLegacyUserDocument(pool, contractorUserId, documentType, fileName, fileData, expirationDate);

  if (String(users[0].compliance_status || 'draft') === 'draft') {
    await pool.query(`UPDATE users SET compliance_status='under_review' WHERE id=$1`, [contractorUserId]);
  }

  await recordComplianceEvent(pool, {
    contractorUserId,
    documentType,
    action: 'CONTRACTOR_DOCUMENT_UPLOADED',
    actorUserId,
    metadata: { fileName, version },
  });

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, document: inserted[0], summary };
}

export async function verifyComplianceDocument(pool, {
  contractorUserId,
  documentType,
  adminUserId,
  notes = null,
  expirationDate = null,
  issueDate = null,
  policyCarrier = null,
  policyNumber = null,
}) {
  // Each document type is verified independently — never auto-verify endorsements when COI is verified.
  const { rows: cur } = await pool.query(
    `SELECT * FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
    [contractorUserId, documentType]
  );
  if (!cur[0] || !cur[0].file_data) {
    return { ok: false, message: 'No uploaded document to verify.' };
  }

  await pool.query(
    `UPDATE contractor_compliance_documents
     SET status=$2, verified_at=NOW(), verified_by=$3, rejected_at=NULL, rejected_by=NULL,
         rejection_reason=NULL, notes=COALESCE($4, notes),
         expiration_date=COALESCE($5, expiration_date),
         issue_date=COALESCE($6, issue_date),
         policy_carrier=COALESCE($7, policy_carrier),
         policy_number=COALESCE($8, policy_number),
         updated_at=NOW()
     WHERE id=$1`,
    [
      cur[0].id,
      DOC_STATUS.VERIFIED,
      adminUserId,
      notes,
      expirationDate,
      issueDate,
      policyCarrier,
      policyNumber,
    ]
  );

  await recordComplianceEvent(pool, {
    contractorUserId,
    documentType,
    action: 'CONTRACTOR_DOCUMENT_VERIFIED',
    actorUserId: adminUserId,
    metadata: { notes },
  });

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, summary };
}

export async function rejectComplianceDocument(pool, {
  contractorUserId,
  documentType,
  adminUserId,
  reason,
}) {
  const { rows: cur } = await pool.query(
    `SELECT * FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
    [contractorUserId, documentType]
  );
  if (!cur[0]) return { ok: false, message: 'Document not found.' };

  await pool.query(
    `UPDATE contractor_compliance_documents
     SET status=$2, rejected_at=NOW(), rejected_by=$3, rejection_reason=$4,
         verified_at=NULL, verified_by=NULL, updated_at=NOW()
     WHERE id=$1`,
    [cur[0].id, DOC_STATUS.REJECTED, adminUserId, reason || 'Rejected by admin']
  );

  await recordComplianceEvent(pool, {
    contractorUserId,
    documentType,
    action: 'CONTRACTOR_DOCUMENT_REJECTED',
    actorUserId: adminUserId,
    metadata: { reason },
  });

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, summary };
}

export async function setDocumentApplicability(pool, {
  contractorUserId,
  documentType,
  applicability,
  adminUserId,
}) {
  if (!Object.values(APPLICABILITY).includes(applicability)) {
    return { ok: false, message: 'Invalid applicability.' };
  }
  const { rows: cur } = await pool.query(
    `SELECT * FROM contractor_compliance_documents
     WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
    [contractorUserId, documentType]
  );
  if (!cur[0]) return { ok: false, message: 'Document not found.' };

  const nextStatus =
    applicability === APPLICABILITY.NOT_APPLICABLE
      ? DOC_STATUS.NOT_APPLICABLE
      : deriveStatus(cur[0], applicability);

  await pool.query(
    `UPDATE contractor_compliance_documents SET applicability=$2, status=$3, updated_at=NOW() WHERE id=$1`,
    [cur[0].id, applicability, nextStatus]
  );

  await recordComplianceEvent(pool, {
    contractorUserId,
    documentType,
    action: 'CONTRACTOR_DOCUMENT_APPLICABILITY_CHANGED',
    actorUserId: adminUserId,
    metadata: { applicability },
  });

  const summary = await recalculateDispatchEligible(pool, contractorUserId);
  return { ok: true, summary };
}

export async function getContractorComplianceSummary(pool, contractorUserId, options = {}) {
  const docs = await ensureComplianceDocuments(pool, contractorUserId);
  const { rows: users } = await pool.query(`SELECT * FROM users WHERE id=$1`, [contractorUserId]);
  if (!users[0]) return null;
  const enriched = await complianceOptionsForUser(pool, users[0], options);
  const summary = evaluateCompliance(users[0], docs, enriched);
  const agreementStatus = await getContractorAgreementStatus(pool, contractorUserId);
  const soloOwner = enriched.soloOwner || (await getSoloOwnerStatus(pool, contractorUserId));
  return {
    ...summary,
    agreement: agreementStatus,
    soloOwner: {
      status: soloOwner.status,
      formVersion: soloOwner.formVersion,
      submittedAt: soloOwner.latest?.accepted_at || soloOwner.latest?.created_at || null,
      reviewedAt: soloOwner.latest?.reviewed_at || null,
      adminNotice:
        'Solo Owner / No Employees status is NOT a substitute for Workers\' Compensation where coverage is legally required.',
    },
    managedPricingGuidance: true,
  };
}
