/**
 * Shared contractor compliance constants and pure evaluation helpers (no matrix import).
 */

export const COI_CERTIFICATE_HOLDER = 'Liora Creations, Corp. d/b/a FixBridge';
export const COI_LEGAL_NOTICE_ADDRESS = '131 Continental Dr, Suite 305, Newark, DE 19713';

export const DOCUMENT_TYPES = {
  W9: {
    code: 'W9',
    label: 'W-9',
    category: 'tax',
    hasExpiration: false,
    legacyField: 'w9',
  },
  TRADE_LICENSE: {
    code: 'TRADE_LICENSE',
    label: 'Business / Home Improvement / Trade License',
    category: 'license',
    hasExpiration: true,
    legacyField: 'license',
  },
  GENERAL_LIABILITY_COI: {
    code: 'GENERAL_LIABILITY_COI',
    label: 'Certificate of Insurance (COI)',
    category: 'insurance',
    hasExpiration: true,
    legacyField: 'insurance',
  },
  AI_ONGOING_OPS: {
    code: 'AI_ONGOING_OPS',
    label: 'Additional Insured Endorsement — ongoing operations',
    category: 'insurance',
    hasExpiration: true,
  },
  AI_COMPLETED_OPS: {
    code: 'AI_COMPLETED_OPS',
    label: 'Additional Insured Endorsement — completed operations',
    category: 'insurance',
    hasExpiration: true,
  },
  PRIMARY_NON_CONTRIBUTORY: {
    code: 'PRIMARY_NON_CONTRIBUTORY',
    label: 'Primary & Non-Contributory Endorsement',
    category: 'insurance',
    hasExpiration: true,
  },
  GL_WAIVER_SUBROGATION: {
    code: 'GL_WAIVER_SUBROGATION',
    label: 'Waiver of Subrogation — General Liability',
    category: 'insurance',
    hasExpiration: true,
  },
  WORKERS_COMP: {
    code: 'WORKERS_COMP',
    label: "Workers' Compensation proof",
    category: 'insurance',
    hasExpiration: true,
  },
  WC_WAIVER_SUBROGATION: {
    code: 'WC_WAIVER_SUBROGATION',
    label: "Workers' Compensation Waiver of Subrogation",
    category: 'insurance',
    hasExpiration: true,
  },
  COMMERCIAL_AUTO: {
    code: 'COMMERCIAL_AUTO',
    label: 'Commercial Auto proof',
    category: 'insurance',
    hasExpiration: true,
  },
  UMBRELLA_EXCESS: {
    code: 'UMBRELLA_EXCESS',
    label: 'Umbrella / Excess coverage',
    category: 'insurance',
    hasExpiration: true,
  },
  SOLO_OWNER_ACK: {
    code: 'SOLO_OWNER_ACK',
    label: 'Solo Owner / No Employees Acknowledgment',
    category: 'acknowledgment',
    hasExpiration: false,
  },
};

export const DOC_STATUS = {
  MISSING: 'MISSING',
  UPLOADED: 'UPLOADED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};

export const APPLICABILITY = {
  REQUIRED: 'REQUIRED',
  OPTIONAL: 'OPTIONAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function isExpired(dateStr) {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 10) < todayIso();
}

export function parseContractorApplication(user) {
  return parseJson(user?.contractor_application, {}) || {};
}

function hasEmployees(app, user) {
  const size = String(app.companySize || '').trim().toLowerCase();
  if (size === '0' || size === 'solo' || size === '1' || size.includes('solo') || size.includes('just me')) {
    return false;
  }
  const n = Number(size);
  if (Number.isFinite(n)) return n > 1;
  if (app.workersComp === 'yes') return true;
  return false;
}

function isSoloOwnerBusiness(app) {
  const bt = String(app.businessType || '').toLowerCase();
  if (bt.includes('sole')) return true;
  const size = String(app.companySize || '').trim().toLowerCase();
  return size === '0' || size === 'solo' || size === '1' || size.includes('solo') || size.includes('just me');
}

function requiresGl(app) {
  return String(app.generalLiability || '').toLowerCase() === 'yes';
}

function requiresTradeLicense(app, user) {
  if (String(user?.license_number || app.licenseNumber || '').trim()) return true;
  return true;
}

function requiresCommercialAuto(app) {
  return String(app.commercialAuto || app.usesCommercialVehicles || '').toLowerCase() === 'yes';
}

function requiresUmbrella(_app, options = {}) {
  return options.jobTier === 'level_2' || options.clientTier === 'level_2';
}

function isLegacyApprovedContractor(user) {
  return (
    String(user?.compliance_status || '').toLowerCase() === 'approved' &&
    Boolean(user?.w9_document_data) &&
    Boolean(user?.license_document_data) &&
    Boolean(user?.insurance_document_data)
  );
}

/** Determine applicability for each document type for a contractor profile. */
export function computeApplicability(user, options = {}) {
  const app = parseContractorApplication(user);
  const gl = requiresGl(app);
  const solo = isSoloOwnerBusiness(app);
  const employees = hasEmployees(app, user);

  const map = {};
  map.W9 = APPLICABILITY.REQUIRED;
  map.TRADE_LICENSE = requiresTradeLicense(app, user)
    ? APPLICABILITY.REQUIRED
    : APPLICABILITY.OPTIONAL;
  map.GENERAL_LIABILITY_COI = gl ? APPLICABILITY.REQUIRED : APPLICABILITY.NOT_APPLICABLE;
  map.AI_ONGOING_OPS = gl ? APPLICABILITY.REQUIRED : APPLICABILITY.NOT_APPLICABLE;
  map.AI_COMPLETED_OPS = gl ? APPLICABILITY.REQUIRED : APPLICABILITY.NOT_APPLICABLE;
  map.PRIMARY_NON_CONTRIBUTORY = gl ? APPLICABILITY.REQUIRED : APPLICABILITY.NOT_APPLICABLE;
  map.GL_WAIVER_SUBROGATION = gl ? APPLICABILITY.REQUIRED : APPLICABILITY.NOT_APPLICABLE;
  map.WORKERS_COMP =
    app.workersComp === 'yes' || employees
      ? APPLICABILITY.REQUIRED
      : solo
        ? APPLICABILITY.NOT_APPLICABLE
        : APPLICABILITY.OPTIONAL;
  map.WC_WAIVER_SUBROGATION =
    map.WORKERS_COMP === APPLICABILITY.REQUIRED ? APPLICABILITY.OPTIONAL : APPLICABILITY.NOT_APPLICABLE;
  map.SOLO_OWNER_ACK =
    solo && map.WORKERS_COMP === APPLICABILITY.NOT_APPLICABLE
      ? APPLICABILITY.REQUIRED
      : APPLICABILITY.NOT_APPLICABLE;
  map.COMMERCIAL_AUTO = requiresCommercialAuto(app)
    ? APPLICABILITY.REQUIRED
    : APPLICABILITY.OPTIONAL;
  map.UMBRELLA_EXCESS = requiresUmbrella(app, options)
    ? APPLICABILITY.REQUIRED
    : APPLICABILITY.NOT_APPLICABLE;

  if (isLegacyApprovedContractor(user) && !options.strictCompliance) {
    for (const key of [
      'AI_ONGOING_OPS',
      'AI_COMPLETED_OPS',
      'PRIMARY_NON_CONTRIBUTORY',
      'GL_WAIVER_SUBROGATION',
      'WC_WAIVER_SUBROGATION',
      'COMMERCIAL_AUTO',
      'UMBRELLA_EXCESS',
    ]) {
      if (map[key] === APPLICABILITY.REQUIRED) map[key] = APPLICABILITY.OPTIONAL;
    }
  }

  return map;
}

function deriveStatus(row, applicability) {
  if (applicability === APPLICABILITY.NOT_APPLICABLE) return DOC_STATUS.NOT_APPLICABLE;
  if (!row) return DOC_STATUS.MISSING;
  if (row.upload_later && !row.file_data) return DOC_STATUS.MISSING;
  if (row.status === DOC_STATUS.REJECTED) return DOC_STATUS.REJECTED;
  if (row.status === DOC_STATUS.VERIFIED) {
    if (row.expiration_date && isExpired(row.expiration_date)) return DOC_STATUS.EXPIRED;
    return DOC_STATUS.VERIFIED;
  }
  if (row.file_data) {
    if (row.status === DOC_STATUS.UNDER_REVIEW || row.status === DOC_STATUS.UPLOADED) {
      if (row.expiration_date && isExpired(row.expiration_date)) return DOC_STATUS.EXPIRED;
      return row.status;
    }
    if (row.expiration_date && isExpired(row.expiration_date)) return DOC_STATUS.EXPIRED;
    return DOC_STATUS.UNDER_REVIEW;
  }
  return DOC_STATUS.MISSING;
}

export function serializeComplianceDocument(row, applicability, documentTypeFallback = null) {
  const documentType = row?.document_type || documentTypeFallback;
  const meta = DOCUMENT_TYPES[documentType] || { label: documentType || 'Unknown' };
  const status = row ? deriveStatus(row, applicability) : DOC_STATUS.MISSING;
  return {
    documentType,
    label: meta.label,
    applicability,
    status,
    uploadLater: row?.upload_later === true,
    fileName: row?.file_name || null,
    hasFile: Boolean(row?.file_data),
    issueDate: row?.issue_date ? String(row.issue_date).slice(0, 10) : null,
    expirationDate: row?.expiration_date ? String(row.expiration_date).slice(0, 10) : null,
    policyCarrier: row?.policy_carrier || null,
    policyNumber: row?.policy_number || null,
    uploadedAt: row?.uploaded_at || null,
    verifiedAt: row?.verified_at || null,
    verifiedBy: row?.verified_by != null ? Number(row.verified_by) : null,
    rejectionReason: row?.rejection_reason || null,
    notes: row?.notes || null,
    version: row?.version != null ? Number(row.version) : 1,
    id: row?.id != null ? Number(row.id) : null,
  };
}

export function deriveComplianceStatus(row, applicability) {
  return deriveStatus(row, applicability);
}
