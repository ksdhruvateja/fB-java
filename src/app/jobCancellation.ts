import type { ManagedJob } from "./managedJobs";
import { getStoredToken } from "./auth";
import { sanitizeApiErrorMessage } from "./apiErrors";

export type CancellationReasonCode =
  | "resolved"
  | "schedule_conflict"
  | "other_provider"
  | "price"
  | "change_request"
  | "provider_issue"
  | "created_by_mistake"
  | "other";

export const CANCELLATION_REASONS: {
  code: CancellationReasonCode;
  label: string;
}[] = [
  { code: "resolved", label: "Problem resolved / no longer need service" },
  { code: "schedule_conflict", label: "Schedule no longer works" },
  { code: "other_provider", label: "Found another provider" },
  { code: "price", label: "Price / quote is too high" },
  { code: "change_request", label: "Need to change the service request" },
  { code: "provider_issue", label: "Provider issue" },
  { code: "created_by_mistake", label: "Created by mistake" },
  { code: "other", label: "Other" },
];

const TERMINAL_STATUSES = new Set([
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
  "canceled",
  "refunded",
  "disputed",
]);

export function canHomeownerCancelJob(job: ManagedJob): boolean {
  if (!job?.status) return false;
  if (TERMINAL_STATUSES.has(String(job.status))) return false;
  return true;
}

export function cancelServiceLabel(job: ManagedJob): string {
  const active = [
    "work_started",
    "change_order_pending",
    "contractor_en_route",
    "scheduled",
    "approved",
    "contractor_accepted",
  ].includes(String(job.status));
  return active ? "Cancel Service" : "Cancel Service Request";
}

export function homeownerCancelledLabel(job: ManagedJob): string | null {
  if (String(job.status) !== "canceled") return null;
  if (job.cancelledBy === "homeowner") return "Cancelled by customer";
  if (job.cancelledBy === "admin") return "Cancelled by FixBridge";
  return "Cancelled";
}

export async function cancelHomeownerJob(
  jobId: number,
  payload: {
    reasonCode: CancellationReasonCode;
    notes?: string;
    details?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; message?: string; job?: ManagedJob; alreadyCancelled?: boolean }> {
  const token = getStoredToken();
  const res = await fetch(`/api/managed/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      reasonCode: payload.reasonCode,
      notes: payload.notes,
      details: payload.details,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    job?: ManagedJob;
    alreadyCancelled?: boolean;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, message: sanitizeApiErrorMessage(data.message || "", res.status) };
  }
  return { ok: true, job: data.job, alreadyCancelled: data.alreadyCancelled };
}
