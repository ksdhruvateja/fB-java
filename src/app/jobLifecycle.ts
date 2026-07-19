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

const STORAGE_KEY = "fixbridge-job-lifecycle";

function canUseStorage() {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readAll(): Record<string, JobLifecycle> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, JobLifecycle>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, JobLifecycle>) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function broadcast() {
  // Trigger storage event so other tabs/components react
  try {
    window.dispatchEvent(new Event("fixbridge-lifecycle-update"));
  } catch {
    // ignore
  }
}

export function getJobLifecycle(jobId: number): JobLifecycle {
  const all = readAll();
  return all[String(jobId)] ?? { jobId, status: "open" };
}

export function getAllLifecycles(): JobLifecycle[] {
  return Object.values(readAll());
}

export function updateJobStatus(
  jobId: number,
  status: JobStatus,
  contractorName?: string,
  contractorEmail?: string,
): void {
  const all = readAll();
  const key = String(jobId);
  const existing = all[key] ?? { jobId, status: "open" };
  all[key] = {
    ...existing,
    jobId,
    status,
    ...(contractorName !== undefined && { contractorName }),
    ...(contractorEmail !== undefined && { contractorEmail }),
    ...(status === "accepted" && !existing.acceptedAt
      ? { acceptedAt: new Date().toISOString() }
      : {}),
    ...(status === "completed" && !existing.completedAt
      ? { completedAt: new Date().toISOString() }
      : {}),
  };
  writeAll(all);
  broadcast();
}

export function updateJobInvoice(
  jobId: number,
  amount: number,
  fileName: string,
): void {
  const all = readAll();
  const key = String(jobId);
  all[key] = {
    ...(all[key] ?? { jobId, status: "completed" }),
    invoiceAmount: amount,
    invoiceFileName: fileName,
  };
  writeAll(all);
  broadcast();
}

export function updateJobRating(
  jobId: number,
  rating: number,
  review: string,
): void {
  const all = readAll();
  const key = String(jobId);
  all[key] = {
    ...(all[key] ?? { jobId, status: "completed" }),
    rating,
    review,
  };
  writeAll(all);
  broadcast();
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  "on-the-way": "On the Way",
  arrived: "Arrived",
  "work-started": "Work Started",
  completed: "Completed",
};

export const STATUS_NEXT: Partial<Record<JobStatus, JobStatus>> = {
  accepted: "on-the-way",
  "on-the-way": "arrived",
  arrived: "work-started",
  "work-started": "completed",
};

export const STATUS_NEXT_LABEL: Partial<Record<JobStatus, string>> = {
  accepted: "I'm On the Way",
  "on-the-way": "I've Arrived",
  arrived: "Work Started",
  "work-started": "Mark Work Complete",
};
