import { getStoredToken } from "./auth";

const API = "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data as T;
}

export const DISPUTE_CATEGORIES = [
  { id: "work_incomplete", label: "Work incomplete" },
  { id: "problem_still_exists", label: "Problem still exists" },
  { id: "new_damage", label: "New damage" },
  { id: "incorrect_work", label: "Incorrect work" },
  { id: "billing_concern", label: "Billing concern" },
  { id: "contractor_conduct", label: "Contractor conduct" },
  { id: "other", label: "Other" },
] as const;

export type Dispute = {
  id: number;
  jobId: number | null;
  category: string | null;
  description?: string | null;
  preferredResolution?: string | null;
  status: string;
  reason?: string | null;
  createdAt?: string;
  payoutState?: { alreadyPaid?: boolean; held?: boolean; latestStatus?: string | null };
};

export async function reportJobProblem(
  jobId: number,
  payload: {
    category: string;
    description: string;
    preferredResolution?: string;
    attachments?: Array<{ fileName: string; mimeType: string; data: string }>;
  },
) {
  return api<{ ok: boolean; dispute: Dispute }>(`/api/managed/jobs/${jobId}/report-problem`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchJobDispute(jobId: number) {
  return api<{ ok: boolean; dispute: Dispute | null }>(`/api/managed/jobs/${jobId}/dispute`);
}

export async function fetchAdminDisputes(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ ok: boolean; disputes: Dispute[] }>(`/api/admin/disputes${q}`);
}

export async function fetchAdminDisputeDetail(id: number) {
  return api<{
    ok: boolean;
    dispute: Dispute & Record<string, unknown>;
    events: Array<Record<string, unknown>>;
    attachments: Array<Record<string, unknown>>;
    payoutState: Record<string, unknown>;
    quotes: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    timeline: Array<Record<string, unknown>>;
  }>(`/api/admin/disputes/${id}`);
}

export async function disputeAdminAction(id: number, action: string, reason?: string, status?: string) {
  return api<{ ok: boolean; dispute: Dispute }>(`/api/admin/disputes/${id}/actions`, {
    method: "POST",
    body: JSON.stringify({ action, reason, status }),
  });
}
