import { api } from "./platformApi";

export const COI_CERTIFICATE_HOLDER = "Liora Creations, Corp. d/b/a FixBridge";
export const COI_LEGAL_NOTICE_ADDRESS = "131 Continental Dr, Suite 305, Newark, DE 19713";

export type ComplianceDocType =
  | "W9"
  | "TRADE_LICENSE"
  | "GENERAL_LIABILITY_COI"
  | "AI_ONGOING_OPS"
  | "AI_COMPLETED_OPS"
  | "PRIMARY_NON_CONTRIBUTORY"
  | "GL_WAIVER_SUBROGATION"
  | "WORKERS_COMP"
  | "WC_WAIVER_SUBROGATION"
  | "COMMERCIAL_AUTO"
  | "UMBRELLA_EXCESS"
  | "SOLO_OWNER_ACK";

export type ComplianceDocStatus =
  | "MISSING"
  | "UPLOADED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "NOT_APPLICABLE";

export type ComplianceApplicability = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";

export type OverallComplianceStatus = "GREEN" | "YELLOW" | "RED";

export type MatrixDisplayStatus =
  | "VERIFIED"
  | "MISSING"
  | "RECOMMENDED"
  | "EXPIRED"
  | "NOT_APPLICABLE"
  | "SOLO_OWNER"
  | "UNDER_REVIEW"
  | "REJECTED";

export type ComplianceMatrixRow = {
  key: string;
  documentType: ComplianceDocType;
  label: string;
  dispatchRule: string;
  verifyNote?: string | null;
  applicability: ComplianceApplicability;
  matrixStatus: MatrixDisplayStatus;
  status: ComplianceDocStatus;
  expirationDate?: string | null;
  issueDate?: string | null;
  policyCarrier?: string | null;
  policyNumber?: string | null;
  hasFile?: boolean;
  verifiedAt?: string | null;
  verifiedBy?: number | null;
  daysUntilExpiration?: number | null;
  blocking?: boolean;
  needsReview?: boolean;
};

export type ComplianceTierEvaluation = {
  tier: string;
  tierLabel: string;
  overallStatus: OverallComplianceStatus;
  eligible: boolean;
  label: string;
  description: string;
  matrix: ComplianceMatrixRow[];
  requiredCount: number;
  verifiedCount: number;
  missingRequirements: string[];
  blockingItems: string[];
  reviewItems: string[];
};

export type ComplianceDocument = {
  documentType: ComplianceDocType;
  label: string;
  applicability: ComplianceApplicability;
  status: ComplianceDocStatus;
  uploadLater?: boolean;
  fileName?: string | null;
  hasFile?: boolean;
  issueDate?: string | null;
  expirationDate?: string | null;
  policyCarrier?: string | null;
  policyNumber?: string | null;
  uploadedAt?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: number | null;
  rejectionReason?: string | null;
  notes?: string | null;
  version?: number;
  id?: number | null;
};

export type ComplianceSummary = {
  applicationStatus: string;
  complianceStatus: string;
  overallComplianceStatus: OverallComplianceStatus;
  overallLabel: string;
  dispatchEligible: boolean;
  level1Eligible: boolean;
  level2Eligible: boolean;
  providerLevel?: string;
  level1: ComplianceTierEvaluation;
  level2: ComplianceTierEvaluation;
  documents: ComplianceDocument[];
  requiredCount: number;
  verifiedCount: number;
  missingRequirements: string[];
  certificateHolder: string;
  legalNoticeAddress: string;
  agreement?: {
    currentVersion: string;
    currentTitle: string;
    accepted: boolean;
    acceptedCurrent: boolean;
    acceptedAt: string | null;
    acceptedVersion: string | null;
    historical?: { version: string; acceptedAt: string; archived?: boolean }[];
    managedAddendum?: {
      required: boolean;
      accepted: boolean;
      acceptedAt: string | null;
      currentVersion: string;
    };
  };
  soloOwner?: {
    status: string;
    formVersion?: string;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    adminNotice?: string;
  };
};

export const COMPLIANCE_DOCUMENT_SPECS: { type: ComplianceDocType; label: string; insurance?: boolean }[] = [
  { type: "W9", label: "W-9" },
  { type: "TRADE_LICENSE", label: "Business / Home Improvement / Trade License" },
  { type: "GENERAL_LIABILITY_COI", label: "Certificate of Insurance (COI)", insurance: true },
  { type: "AI_ONGOING_OPS", label: "Additional Insured Endorsement — ongoing operations", insurance: true },
  { type: "AI_COMPLETED_OPS", label: "Additional Insured Endorsement — completed operations", insurance: true },
  { type: "PRIMARY_NON_CONTRIBUTORY", label: "Primary & Non-Contributory Endorsement", insurance: true },
  { type: "GL_WAIVER_SUBROGATION", label: "Waiver of Subrogation — General Liability", insurance: true },
  { type: "WORKERS_COMP", label: "Workers' Compensation proof", insurance: true },
  { type: "WC_WAIVER_SUBROGATION", label: "Workers' Compensation Waiver of Subrogation", insurance: true },
  { type: "COMMERCIAL_AUTO", label: "Commercial Auto proof", insurance: true },
  { type: "UMBRELLA_EXCESS", label: "Umbrella / Excess coverage", insurance: true },
  { type: "SOLO_OWNER_ACK", label: "Solo Owner / No Employees Acknowledgment" },
];

export function complianceStatusLabel(status: ComplianceDocStatus | MatrixDisplayStatus): string {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "RECOMMENDED":
      return "Recommended — not provided";
    case "SOLO_OWNER":
      return "Solo Owner";
    case "UNDER_REVIEW":
      return "Under review";
    case "UPLOADED":
      return "Uploaded";
    case "REJECTED":
      return "Rejected";
    case "EXPIRED":
      return "Expired";
    case "NOT_APPLICABLE":
      return "N/A";
    default:
      return "Missing";
  }
}

export function complianceStatusIcon(status: ComplianceDocStatus | MatrixDisplayStatus): string {
  if (status === "VERIFIED" || status === "SOLO_OWNER") return "✓";
  if (status === "RECOMMENDED") return "○";
  if (status === "UNDER_REVIEW" || status === "UPLOADED") return "⚠";
  if (status === "NOT_APPLICABLE") return "—";
  return "✕";
}

export function matrixStatusTone(status: MatrixDisplayStatus): string {
  if (status === "VERIFIED" || status === "SOLO_OWNER") return "text-emerald-700";
  if (status === "RECOMMENDED") return "text-sky-700 dark:text-sky-300";
  if (status === "UNDER_REVIEW") return "text-amber-800";
  if (status === "NOT_APPLICABLE") return "text-muted-foreground";
  return "text-red-700";
}

export function overallStatusLabel(status: OverallComplianceStatus): string {
  switch (status) {
    case "GREEN":
      return "✓ GREEN — Dispatch Eligible";
    case "YELLOW":
      return "⚠ YELLOW — Admin Review Required";
    default:
      return "✕ RED — No Dispatch";
  }
}

export function overallStatusTone(status: OverallComplianceStatus): string {
  switch (status) {
    case "GREEN":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "YELLOW":
      return "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100";
    default:
      return "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-100";
  }
}

export async function acceptContractorAgreementV4() {
  return api<{ ok: boolean; status?: ComplianceSummary["agreement"]; summary?: ComplianceSummary; message?: string }>(
    "/api/contractor/agreement/accept",
    { method: "POST", body: "{}" }
  );
}

export async function fetchContractorComplianceSummary() {
  return api<{ ok: boolean; summary?: ComplianceSummary; message?: string }>(
    "/api/contractor/compliance/summary"
  );
}

export async function uploadComplianceDocument(
  type: ComplianceDocType,
  body: {
    fileName?: string;
    fileData?: string;
    issueDate?: string;
    expirationDate?: string;
    uploadLater?: boolean;
  }
) {
  return api<{ ok: boolean; summary?: ComplianceSummary; message?: string }>(
    `/api/contractor/compliance/documents/${type}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function fetchAdminContractorAgreement(contractorId: number) {
  return api<{
    ok: boolean;
    agreement?: ComplianceSummary["agreement"];
    history?: { document_key: string; document_version: string; accepted_at: string }[];
    soloOwner?: ComplianceSummary["soloOwner"];
    providerLevel?: string;
    message?: string;
  }>(`/api/admin/contractors/${contractorId}/agreement`);
}

export async function fetchAdminContractorCompliance(contractorId: number) {
  return api<{
    ok: boolean;
    summary?: ComplianceSummary;
    certificateHolder?: string;
    legalNoticeAddress?: string;
    message?: string;
  }>(`/api/admin/contractors/${contractorId}/compliance`);
}

export async function fetchAdminComplianceDocumentFile(
  contractorId: number,
  type: ComplianceDocType,
  version?: number
) {
  const q = version != null ? `?version=${version}` : "";
  return api<{ ok: boolean; fileName?: string; fileData?: string; message?: string }>(
    `/api/admin/contractors/${contractorId}/compliance/documents/${type}/file${q}`
  );
}

export async function fetchAdminComplianceHistory(contractorId: number, type: ComplianceDocType) {
  return api<{ ok: boolean; history?: Record<string, unknown>[]; message?: string }>(
    `/api/admin/contractors/${contractorId}/compliance/documents/${type}/history`
  );
}

export async function verifyAdminComplianceDocument(
  contractorId: number,
  type: ComplianceDocType,
  body?: {
    notes?: string;
    expirationDate?: string;
    issueDate?: string;
    policyCarrier?: string;
    policyNumber?: string;
  }
) {
  return api<{ ok: boolean; summary?: ComplianceSummary; message?: string }>(
    `/api/admin/contractors/${contractorId}/compliance/documents/${type}/verify`,
    { method: "POST", body: JSON.stringify(body || {}) }
  );
}

export async function rejectAdminComplianceDocument(
  contractorId: number,
  type: ComplianceDocType,
  reason: string
) {
  return api<{ ok: boolean; summary?: ComplianceSummary; message?: string }>(
    `/api/admin/contractors/${contractorId}/compliance/documents/${type}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export async function setAdminDocumentApplicability(
  contractorId: number,
  type: ComplianceDocType,
  applicability: ComplianceApplicability
) {
  return api<{ ok: boolean; summary?: ComplianceSummary; message?: string }>(
    `/api/admin/contractors/${contractorId}/compliance/documents/${type}/applicability`,
    { method: "PUT", body: JSON.stringify({ applicability }) }
  );
}

export async function fetchAdminDispatchChecklist(contractorId: number, jobTier?: "level_1" | "level_2") {
  const q = jobTier ? `?jobTier=${jobTier}` : "";
  return api<{
    ok: boolean;
    eligible?: boolean;
    tier?: string;
    overallStatus?: OverallComplianceStatus;
    summary?: ComplianceSummary;
    message?: string;
  }>(`/api/admin/contractors/${contractorId}/compliance/dispatch-checklist${q}`);
}
