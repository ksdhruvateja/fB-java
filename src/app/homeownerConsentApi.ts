import { api } from "./platformApi";
import type { AcceptanceType } from "./legalDocuments";

export async function fetchHomeownerConsentStatus() {
  return api<{
    ok: boolean;
    diySafetyAccepted?: boolean;
    marketingConsent?: boolean;
    message?: string;
  }>("/api/homeowner/consent/status");
}

export async function recordConsentAction(body: {
  actionKey: string;
  consents: Record<string, boolean>;
  jobId?: number;
}) {
  return api<{
    ok: boolean;
    recorded?: string[];
    code?: string;
    missingAcceptanceTypes?: string[];
    message?: string;
  }>("/api/homeowner/consent/action", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listAdminHomeownerAcceptances(params?: {
  userId?: number;
  jobId?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.userId != null) q.set("userId", String(params.userId));
  if (params?.jobId != null) q.set("jobId", String(params.jobId));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q}` : "";
  return api<{
    ok: boolean;
    acceptances?: Array<{
      id: number;
      userId: number;
      userName?: string;
      userEmail?: string;
      jobId?: number | null;
      quoteId?: number | null;
      changeOrderId?: number | null;
      paymentId?: number | null;
      acceptanceType: AcceptanceType | string;
      documentKey?: string | null;
      documentVersion?: string;
      documentTitle?: string;
      acceptedAt: string;
      snapshotId?: number | null;
      actionCompleted?: boolean;
      sourceRoute?: string | null;
    }>;
    message?: string;
  }>(`/api/admin/homeowner-acceptances${suffix}`);
}
