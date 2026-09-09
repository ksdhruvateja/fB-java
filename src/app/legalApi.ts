import { api } from "./platformApi";
import type { LegalDocumentKey } from "./legalDocuments";

export type LegalDocumentRecord = {
  key: string;
  title: string;
  version: string;
  effectiveDate?: string;
  route?: string;
  status?: string;
  content?: { heading: string; sections: { title: string; body: string }[] };
};

export type HomeownerLegalDocStatus = LegalDocumentRecord & {
  accepted: boolean;
  acceptedCurrentVersion: boolean;
  acceptedAt: string | null;
  acceptedVersion: string | null;
};

export async function fetchPublicLegalDocument(key: LegalDocumentKey | string) {
  return api<{ ok: boolean; document?: LegalDocumentRecord }>(`/api/legal/documents/${key}`);
}

export async function fetchHomeownerLegalStatus() {
  return api<{ ok: boolean; documents?: HomeownerLegalDocStatus[] }>("/api/homeowner/legal/status");
}

export async function fetchAdminLegalDocuments() {
  return api<{ ok: boolean; documents?: LegalDocumentRecord[] }>("/api/admin/legal/documents");
}

export async function fetchAdminLegalVersions(key: string) {
  return api<{ ok: boolean; versions?: LegalDocumentRecord[] }>(
    `/api/admin/legal/documents/${encodeURIComponent(key)}/versions`
  );
}

export async function publishAdminLegalVersion(
  key: string,
  body: {
    version: string;
    title?: string;
    effectiveDate?: string;
    content?: LegalDocumentRecord["content"];
  }
) {
  return api<{ ok: boolean; document?: LegalDocumentRecord }>(
    `/api/admin/legal/documents/${encodeURIComponent(key)}/publish`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export type JobEvidencePackage = {
  jobId: number;
  bookingId?: string;
  homeownerUserId: number;
  assignedContractorUserId: number | null;
  homeownerAcceptances: Array<{
    id: number;
    acceptanceType: string;
    documentKey: string | null;
    documentVersion: string;
    documentTitle: string | null;
    acceptedAt: string;
    snapshotId: number | null;
  }>;
  professionalDispatchSnapshots: Array<{
    id: number;
    authorizedNowCents: number;
    currency: string;
    createdAt: string;
    lines: unknown;
  }>;
  quoteSnapshots: Array<{
    id: number;
    quoteNumber: string | null;
    versionNumber: number;
    total: number | null;
    acceptedAt: string;
    lineItems: unknown;
  }>;
  paymentAuthorizations: Array<{
    id: number;
    authorizedAmountCents: number;
    stripePaymentIntentId: string | null;
    createdAt: string;
  }>;
  changeOrders: Array<{
    id: number;
    status: string;
    description: string | null;
    retailAmount: number | null;
    approvedAt: string | null;
    approvedSnapshot: unknown;
  }>;
  dispatchEvidence: {
    complianceDocumentIds: number[];
    complianceStatus: string | null;
    dispatchAt: string | null;
  } | null;
  contractorCompliance: {
    documents: Array<{
      id: number;
      documentType: string;
      status: string;
      expirationDate: string | null;
      verifiedAt: string | null;
      isCurrent: boolean;
    }>;
  } | null;
  completion: {
    status: string;
    customerConfirmedAt: string | null;
    completionReport: unknown;
  };
};

export async function fetchAdminJobEvidence(jobId: number) {
  return api<{ ok: boolean; evidence?: JobEvidencePackage }>(`/api/admin/jobs/${jobId}/evidence`);
}
