/**
 * Compliance matrix, tier evaluation (Level 1 / Level 2), and GREEN/YELLOW/RED status.
 */

import {
  APPLICABILITY,
  DOC_STATUS,
  DOCUMENT_TYPES,
  COI_CERTIFICATE_HOLDER,
  COI_LEGAL_NOTICE_ADDRESS,
  computeApplicability,
  parseContractorApplication,
  serializeComplianceDocument,
} from './contractor-compliance-shared.js';
import { requireFixbridgeAdditionalInsured } from './compliance-settings.js';

export const COMPLIANCE_TIER = {
  LEVEL_1: 'level_1',
  LEVEL_2: 'level_2',
};

export const OVERALL_STATUS = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
};

/** Dispatch-relevant matrix rows shown in admin UI. */
export const MATRIX_REQUIREMENTS = [
  {
    key: 'TRADE_LICENSE',
    documentType: 'TRADE_LICENSE',
    label: 'Trade / Business License',
    dispatchRule: 'Required by trade/location when applicable',
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'GENERAL_LIABILITY_COI',
    documentType: 'GENERAL_LIABILITY_COI',
    label: 'General Liability',
    dispatchRule: 'Required — certificate of insurance',
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'AI_ONGOING_OPS',
    documentType: 'AI_ONGOING_OPS',
    label: 'FixBridge Additional Insured',
    dispatchRule: requireFixbridgeAdditionalInsured()
      ? 'Verify ACTUAL endorsement naming FixBridge'
      : 'Optional but recommended — verify ACTUAL endorsement naming FixBridge',
    verifyNote: `Must name: ${COI_CERTIFICATE_HOLDER}`,
    recommended: !requireFixbridgeAdditionalInsured(),
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'AI_COMPLETED_OPS',
    documentType: 'AI_COMPLETED_OPS',
    label: 'Completed Operations Endorsement',
    dispatchRule: 'Required for repair/trade work when applicable',
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'PRIMARY_NON_CONTRIBUTORY',
    documentType: 'PRIMARY_NON_CONTRIBUTORY',
    label: 'Primary & Non-Contributory',
    dispatchRule: 'Required for Level 2 / client agreements when applicable',
    tiers: [COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'GL_WAIVER_SUBROGATION',
    documentType: 'GL_WAIVER_SUBROGATION',
    label: 'Waiver of Subrogation — CGL',
    dispatchRule: 'Required for Level 2 when applicable',
    tiers: [COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'WC_WAIVER_SUBROGATION',
    documentType: 'WC_WAIVER_SUBROGATION',
    label: 'Waiver of Subrogation — WC',
    dispatchRule: 'Does NOT replace Workers\' Compensation',
    tiers: [COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'WORKERS_COMP',
    documentType: 'WORKERS_COMP',
    label: "Workers' Compensation",
    dispatchRule: 'Required unless valid solo-owner case',
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'COMMERCIAL_AUTO',
    documentType: 'COMMERCIAL_AUTO',
    label: 'Commercial Auto',
    dispatchRule: 'When vehicles/job/client require it',
    tiers: [COMPLIANCE_TIER.LEVEL_1, COMPLIANCE_TIER.LEVEL_2],
  },
  {
    key: 'UMBRELLA_EXCESS',
    documentType: 'UMBRELLA_EXCESS',
    label: 'Umbrella / Excess',
    dispatchRule: 'Required for Level 2 managed/facility/emergency',
    tiers: [COMPLIANCE_TIER.LEVEL_2],
  },
];

const BLOCKING_STATUSES = new Set([DOC_STATUS.MISSING, DOC_STATUS.EXPIRED, DOC_STATUS.REJECTED]);
const REVIEW_STATUSES = new Set([DOC_STATUS.UPLOADED, DOC_STATUS.UNDER_REVIEW]);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(String(dateStr).slice(0, 10));
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

/** Infer job compliance tier from job metadata. */
export function getJobComplianceTier(job = {}) {
  const tier = String(job.compliance_tier || job.complianceTier || '').toLowerCase();
  if (tier === 'level_2' || tier === 'level2') return COMPLIANCE_TIER.LEVEL_2;

  const priority = String(job.priority_tier || job.priorityTier || 'standard').toLowerCase();
  if (['emergency', 'homecare_pro', 'homecare_pro_high', 'facility', 'managed'].includes(priority)) {
    return COMPLIANCE_TIER.LEVEL_2;
  }

  const purpose = String(job.property_purpose || job.propertyPurpose || '').toLowerCase();
  const stage = String(job.transaction_stage || job.transactionStage || '').toLowerCase();
  if (
    purpose.includes('facility') ||
    purpose.includes('commercial') ||
    stage.includes('facility') ||
    stage.includes('managed')
  ) {
    return COMPLIANCE_TIER.LEVEL_2;
  }

  const mode = String(job.job_mode || job.jobMode || '').toLowerCase();
  if (mode === 'facility' || mode === 'emergency') return COMPLIANCE_TIER.LEVEL_2;

  return COMPLIANCE_TIER.LEVEL_1;
}

function computeApplicabilityForTier(user, tier) {
  const jobTier = tier === COMPLIANCE_TIER.LEVEL_2 ? 'level_2' : 'level_1';
  const base = computeApplicability(user, { jobTier, strictCompliance: tier === COMPLIANCE_TIER.LEVEL_2 });

  if (tier === COMPLIANCE_TIER.LEVEL_2) {
    const app = parseContractorApplication(user);
    if (String(app.generalLiability || '').toLowerCase() === 'yes') {
      base.PRIMARY_NON_CONTRIBUTORY = APPLICABILITY.REQUIRED;
      base.GL_WAIVER_SUBROGATION = APPLICABILITY.REQUIRED;
      base.AI_ONGOING_OPS = requireFixbridgeAdditionalInsured()
        ? APPLICABILITY.REQUIRED
        : APPLICABILITY.OPTIONAL;
      base.AI_COMPLETED_OPS = APPLICABILITY.REQUIRED;
    }
    base.UMBRELLA_EXCESS = APPLICABILITY.REQUIRED;
    if (String(app.commercialAuto || app.usesCommercialVehicles || '').toLowerCase() === 'yes') {
      base.COMMERCIAL_AUTO = APPLICABILITY.REQUIRED;
    }
  }

  return base;
}

function matrixDisplayStatus(doc, row, documentsByType, applicability, user, tier) {
  if (row.key === 'WORKERS_COMP') {
    const soloStatus = String(user?.solo_owner_status || '').toLowerCase();
    const soloApp = computeApplicabilityForTier(user, tier).SOLO_OWNER_ACK;
    if (applicability === APPLICABILITY.NOT_APPLICABLE) {
      if (soloApp === APPLICABILITY.REQUIRED && soloStatus === 'approved') {
        return 'SOLO_OWNER';
      }
      const soloDoc = documentsByType.get('SOLO_OWNER_ACK');
      if (soloApp === APPLICABILITY.REQUIRED && soloDoc?.status === DOC_STATUS.VERIFIED) {
        return 'SOLO_OWNER';
      }
      return 'NOT_APPLICABLE';
    }
  }

  if (applicability === APPLICABILITY.NOT_APPLICABLE) return 'NOT_APPLICABLE';
  if (!doc) {
    if (applicability === APPLICABILITY.OPTIONAL) return 'RECOMMENDED';
    return 'MISSING';
  }
  if (doc.status === DOC_STATUS.VERIFIED) return 'VERIFIED';
  if (doc.status === DOC_STATUS.EXPIRED) return 'EXPIRED';
  if (doc.status === DOC_STATUS.REJECTED) return 'REJECTED';
  if (doc.status === DOC_STATUS.UNDER_REVIEW || doc.status === DOC_STATUS.UPLOADED) return 'UNDER_REVIEW';
  return 'MISSING';
}

function evaluateTierStatus(user, documentRows, tier) {
  const applicability = computeApplicabilityForTier(user, tier);
  const byType = new Map((documentRows || []).map((r) => [r.document_type, r]));
  const documents = Object.keys(DOCUMENT_TYPES).map((type) =>
    serializeComplianceDocument(byType.get(type) || null, applicability[type] || APPLICABILITY.OPTIONAL, type)
  );
  const docMap = new Map(documents.map((d) => [d.documentType, d]));

  const matrix = MATRIX_REQUIREMENTS.filter((row) => row.tiers.includes(tier)).map((row) => {
    const doc = docMap.get(row.documentType);
    const app = applicability[row.documentType] || APPLICABILITY.OPTIONAL;
    const matrixStatus = matrixDisplayStatus(doc, row, docMap, app, user, tier);
    const blocking = app === APPLICABILITY.REQUIRED && BLOCKING_STATUSES.has(matrixStatus);
    const needsReview =
      app === APPLICABILITY.REQUIRED &&
      (REVIEW_STATUSES.has(doc?.status || '') || matrixStatus === 'UNDER_REVIEW');

    return {
      key: row.key,
      documentType: row.documentType,
      label: row.label,
      dispatchRule: row.dispatchRule,
      verifyNote: row.verifyNote || null,
      recommended: row.recommended === true || app === APPLICABILITY.OPTIONAL,
      applicability: app,
      matrixStatus,
      status: doc?.status || DOC_STATUS.MISSING,
      expirationDate: doc?.expirationDate || null,
      issueDate: doc?.issueDate || null,
      policyCarrier: doc?.policyCarrier || null,
      policyNumber: doc?.policyNumber || null,
      hasFile: doc?.hasFile || false,
      verifiedAt: doc?.verifiedAt || null,
      verifiedBy: doc?.verifiedBy || null,
      daysUntilExpiration: doc?.expirationDate ? daysUntil(doc.expirationDate) : null,
      blocking,
      needsReview,
    };
  });

  const required = matrix.filter((m) => m.applicability === APPLICABILITY.REQUIRED);
  const missingBlocking = required.filter((m) => BLOCKING_STATUSES.has(m.matrixStatus));
  const reviewBlocking = required.filter((m) => m.needsReview || m.matrixStatus === 'UNDER_REVIEW');

  let overallStatus = OVERALL_STATUS.GREEN;
  let eligible = true;
  let label = 'Dispatch Eligible';
  let description = 'Live dispatch allowed';

  if (missingBlocking.length > 0) {
    overallStatus = OVERALL_STATUS.RED;
    eligible = false;
    label = 'No Dispatch';
    description = 'Required compliance items missing, expired, or rejected';
  } else if (reviewBlocking.length > 0) {
    overallStatus = OVERALL_STATUS.YELLOW;
    eligible = false;
    label = 'Admin Review Required';
    description = 'Documents uploaded but require admin verification before dispatch';
  }

  const missingRequirements = required
    .filter((m) => m.matrixStatus !== 'VERIFIED' && m.matrixStatus !== 'SOLO_OWNER' && m.matrixStatus !== 'NOT_APPLICABLE')
    .map((m) => m.documentType);

  return {
    tier,
    tierLabel:
      tier === COMPLIANCE_TIER.LEVEL_2
        ? 'Level 2 — Managed / Emergency / Facility'
        : 'Level 1 — Residential / Network',
    overallStatus,
    eligible,
    label,
    description,
    matrix,
    requiredCount: required.length,
    verifiedCount: required.filter((m) => m.matrixStatus === 'VERIFIED' || m.matrixStatus === 'SOLO_OWNER').length,
    missingRequirements,
    blockingItems: missingBlocking.map((m) => m.label),
    reviewItems: reviewBlocking.map((m) => m.label),
  };
}

export function buildComplianceEvaluation(user, documentRows = [], options = {}) {
  const level1 = evaluateTierStatus(user, documentRows, COMPLIANCE_TIER.LEVEL_1);
  const level2 = evaluateTierStatus(user, documentRows, COMPLIANCE_TIER.LEVEL_2);

  const applicability = computeApplicability(user, options);
  const byType = new Map((documentRows || []).map((r) => [r.document_type, r]));
  const documents = Object.keys(DOCUMENT_TYPES).map((type) =>
    serializeComplianceDocument(
      byType.get(type) || null,
      applicability[type] || APPLICABILITY.OPTIONAL,
      type
    )
  );

  // Enrich documents with policy metadata from DB rows.
  for (const doc of documents) {
    const row = byType.get(doc.documentType);
    if (row) {
      doc.policyCarrier = row.policy_carrier || null;
      doc.policyNumber = row.policy_number || null;
    }
  }

  const complianceRaw = String(user?.compliance_status || 'draft').toLowerCase();

  const applicationStatus = (() => {
    if (complianceRaw === 'approved') return 'APPROVED';
    if (['under_review', 'pending'].includes(complianceRaw)) return 'PENDING';
    if (['suspended', 'rejected', 'blocked'].includes(complianceRaw)) {
      return complianceRaw.toUpperCase();
    }
    if (user?.contractor_application) return 'PENDING';
    return 'DRAFT';
  })();

  const blockedAccount =
    user?.is_blocked === true ||
    ['suspended', 'rejected', 'blocked'].includes(complianceRaw);

  // un comment this line to force Level 2 compliance for all contractors file name contractor-compliance-matrix.js and contractor-compliance-shared.js
  // Contractor Agreement remains part of the compliance system.
  // Level 1 dispatch is temporarily allowed without blocking on Agreement acceptance.
  // Level 2 continues to enforce the current Contractor Agreement.
  const agreement = options.agreement || null;

  // Previous implementation:
  // const agreementBlocksDispatch = agreement && agreement.acceptedCurrent !== true;

  // Current temporary business rule:
  // Do not block Level 1 residential/network dispatch because of Agreement acceptance.
  // Agreement acceptance remains enforced for Level 2 managed/facility/emergency dispatch.
  const agreementBlocksDispatchLevel1 = false;

  const agreementBlocksDispatchLevel2 =
    agreement && agreement.acceptedCurrent !== true;

  const managedAddendumBlocksL2 =
    agreement?.managedAddendumRequired === true &&
    agreement.managedAddendumAccepted !== true;

  let level1Eligible =
    !blockedAccount &&
    level1.eligible &&
    !agreementBlocksDispatchLevel1;

  let level2Eligible =
    !blockedAccount &&
    level2.eligible &&
    !agreementBlocksDispatchLevel2 &&
    !managedAddendumBlocksL2;

  let missingRequirements = [...level1.missingRequirements];

  // Agreement is intentionally not added to Level 1 missing requirements
  // because Level 1 dispatch is temporarily allowed without Agreement acceptance.
  if (agreementBlocksDispatchLevel2) {
    level2.missingRequirements = [
      ...level2.missingRequirements,
      `FixBridge Contractor Agreement Package v${agreement?.currentVersion || '4'}`,
    ];
  }

  if (managedAddendumBlocksL2) {
    level2.missingRequirements = [
      ...level2.missingRequirements,
      'Managed Services Addendum',
    ];
  }

  const providerLevel = String(user?.provider_level || 'level_1').toLowerCase();

  const overallComplianceStatus = (() => {
    if (blockedAccount || level1.overallStatus === OVERALL_STATUS.RED) {
      return OVERALL_STATUS.RED;
    }

    if (
      level1.overallStatus === OVERALL_STATUS.YELLOW ||
      level2.overallStatus !== OVERALL_STATUS.GREEN
    ) {
      return level2.overallStatus === OVERALL_STATUS.RED
        ? OVERALL_STATUS.YELLOW
        : level1.overallStatus === OVERALL_STATUS.YELLOW
          ? OVERALL_STATUS.YELLOW
          : level2.overallStatus;
    }

    return OVERALL_STATUS.GREEN;
  })();

  const complianceStatus = (() => {
    if (level1Eligible) return 'VERIFIED';
    if (level1.overallStatus === OVERALL_STATUS.YELLOW) return 'UNDER_REVIEW';
    return 'INCOMPLETE';
  })();

  return {
    applicationStatus,
    complianceStatus,
    overallComplianceStatus,

    overallLabel:
      overallComplianceStatus === OVERALL_STATUS.GREEN
        ? '✓ GREEN — Dispatch Eligible'
        : overallComplianceStatus === OVERALL_STATUS.YELLOW
          ? '⚠ YELLOW — Admin Review Required'
          : '✕ RED — No Dispatch',

    dispatchEligible: level1Eligible,
    level1Eligible,
    level2Eligible,

    level1,
    level2,

    documents,

    requiredCount: level1.requiredCount,
    verifiedCount: level1.verifiedCount,

    missingRequirements,

    providerLevel:
      providerLevel === 'level_2' || providerLevel === 'level2'
        ? 'level_2'
        : 'level_1',

    agreement: agreement || undefined,

    certificateHolder: COI_CERTIFICATE_HOLDER,
    legalNoticeAddress: COI_LEGAL_NOTICE_ADDRESS,
  };
}


export function assertDispatchEligibleForJob(user, documentRows, job = null, options = {}) {
  const tier = getJobComplianceTier(job || {});
  const evaluation = buildComplianceEvaluation(user, documentRows, options);
  const tierEval = tier === COMPLIANCE_TIER.LEVEL_2 ? evaluation.level2 : evaluation.level1;
  const eligible = tier === COMPLIANCE_TIER.LEVEL_2 ? evaluation.level2Eligible : evaluation.level1Eligible;

  if (eligible) {
    return { ok: true, tier, evaluation, tierEval };
  }

  return {
    ok: false,
    code: 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE',
    message:
      tier === COMPLIANCE_TIER.LEVEL_2
        ? 'Contractor is not eligible for Level 2 (managed/facility/emergency) dispatch.'
        : 'Contractor is not eligible for live dispatch.',
    tier,
    missingRequirements: tierEval.missingRequirements,
    overallStatus: tierEval.overallStatus,
    complianceStatus: evaluation.complianceStatus,
    blockingItems: tierEval.blockingItems,
    reviewItems: tierEval.reviewItems,
    evaluation,
  };
}
