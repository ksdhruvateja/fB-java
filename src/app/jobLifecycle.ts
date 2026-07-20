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

// ── Async API ─────────────────────────────────────────────────────────────────

export async function getJobLifecycle(jobId: number): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}`);
  return res.json();
}

export async function getAllLifecycles(): Promise<JobLifecycle[]> {
  const res = await fetch("/api/lifecycle");
  return res.json();
}

export async function updateJobStatus(
  jobId: number,
  status: JobStatus,
  contractorName?: string,
  contractorEmail?: string,
): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, contractorName, contractorEmail }),
  });
  const updated: JobLifecycle = await res.json();
  broadcast();
  return updated;
}

export async function updateJobInvoice(
  jobId: number,
  amount: number,
  fileName: string,
): Promise<JobLifecycle> {
  const res = await fetch(`/api/lifecycle/${jobId}/invoice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, fileName }),
  });
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, review }),
  });
  const updated: JobLifecycle = await res.json();
  broadcast();
  return updated;
}
