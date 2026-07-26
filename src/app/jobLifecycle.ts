import { getStoredToken } from "./auth";

export type JobStatus =
  | "open"
  | "accepted"
  | "on-the-way"
  | "arrived"
  | "work-started"
  | "completed";

export type JobLifecycle = {
  jobId: number;
  status: JobStatus;
  contractorName?: string;
  contractorEmail?: string;
  invoiceAmount?: number;
  invoiceFileName?: string;
  invoiceFileData?: string;
  rating?: number;
  review?: string;
  acceptedAt?: string;
  completedAt?: string;
};

// ── Sync constants ────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<JobStatus, string> = {
  open:           "Open",
  accepted:       "Accepted",
  "on-the-way":   "On the Way",
  arrived:        "Arrived",
  "work-started": "Work Started",
  completed:      "Completed",
};

export const STATUS_NEXT: Partial<Record<JobStatus, JobStatus>> = {
  accepted:       "on-the-way",
  "on-the-way":   "arrived",
  arrived:        "work-started",
  "work-started": "completed",
};

export const STATUS_NEXT_LABEL: Partial<Record<JobStatus, string>> = {
  accepted:       "I'm On the Way",
  "on-the-way":   "I've Arrived",
  arrived:        "Work Started",
  "work-started": "Mark Work Complete",
};

// ── Broadcast helper ──────────────────────────────────────────────────────────

function broadcast() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fixbridge-lifecycle-update"));
  }
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ── Async API ─────────────────────────────────────────────────────────────────

export async function getJobLifecycle(jobId: number): Promise<JobLifecycle> {
  try {
    const res = await fetch(`/api/lifecycle/${jobId}`, { headers: authHeaders() });
    if (!res.ok) return { jobId, status: "open" };
    const data = await res.json();
    if (!data || typeof data !== "object" || !data.status) {
      return { jobId, status: "open" };
    }
    return data as JobLifecycle;
  } catch {
    return { jobId, status: "open" };
  }
}

export async function getAllLifecycles(): Promise<JobLifecycle[]> {
  try {
    const res = await fetch("/api/lifecycle", { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as JobLifecycle[]) : [];
  } catch {
    return [];
  }
}

export async function updateJobStatus(
  jobId: number,
  status: JobStatus,
  contractorName?: string,
  contractorEmail?: string,
): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}/status`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ status, contractorName, contractorEmail }),
  });
  if (!res.ok) {
    throw new Error("Could not update job status.");
  }
  const updated: JobLifecycle = await res.json();
  broadcast();
  return updated;
}

export async function updateJobInvoice(
  jobId: number,
  amount: number,
  fileName: string,
  fileData?: string,
): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}/invoice`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ amount, fileName, ...(fileData ? { fileData } : {}) }),
  });
  if (!res.ok) {
    throw new Error("Could not save invoice to the database.");
  }
  const updated: JobLifecycle = await res.json();
  broadcast();
  return updated;
}

export async function updateJobRating(
  jobId: number,
  rating: number,
  review: string,
): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}/rating`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ rating, review }),
  });
  if (!res.ok) {
    throw new Error("Could not save rating.");
  }
  const updated: JobLifecycle = await res.json();
  broadcast();
  return updated;
}
