import type { InAppNotification } from "./notificationsApi";

export type NotificationNavTarget =
  | { kind: "homeowner_job"; jobId: number }
  | { kind: "homeowner_quote"; jobId?: number; quoteNumber?: string }
  | { kind: "homeowner_invoice"; jobId: number }
  | { kind: "homeowner_tracking"; jobId: number }
  | { kind: "admin_comms"; conversationId?: number }
  | { kind: "admin_job"; jobId: number }
  | { kind: "admin_dispute"; disputeId: number }
  | { kind: "contractor_payout"; payoutId?: number; jobId?: number }
  | { kind: "stale" }
  | { kind: "none" };

export function resolveNotificationTarget(
  n: Pick<InAppNotification, "type" | "actionUrl" | "jobId" | "entityType" | "entityId">,
  role: "homeowner" | "contractor" | "admin",
): NotificationNavTarget {
  const type = String(n.type || "").toLowerCase();
  const url = String(n.actionUrl || "");

  if (type === "dispute_opened" || type === "dispute_update") {
    if (role === "admin" && n.entityId) return { kind: "admin_dispute", disputeId: Number(n.entityId) };
    if (n.jobId) return { kind: "homeowner_job", jobId: Number(n.jobId) };
  }

  if (type === "quote_ready" || type.includes("quote")) {
    if (role === "homeowner" && n.jobId) return { kind: "homeowner_quote", jobId: Number(n.jobId) };
  }

  if (type === "invoice_created" && n.jobId) {
    return { kind: "homeowner_invoice", jobId: Number(n.jobId) };
  }

  if (type === "contractor_dispatched" && n.jobId) {
    return { kind: "homeowner_tracking", jobId: Number(n.jobId) };
  }

  if (
    (type === "new_homeowner_message" || type === "new_contractor_message" || type === "admin_message") &&
    role === "admin"
  ) {
    return { kind: "admin_comms", conversationId: n.entityType === "conversation" ? Number(n.entityId) : undefined };
  }

  if (type === "payout_released" && role === "contractor") {
    return { kind: "contractor_payout", payoutId: n.entityId ? Number(n.entityId) : undefined, jobId: n.jobId ? Number(n.jobId) : undefined };
  }

  const jobMatch = url.match(/job[=\/](\d+)/i);
  const disputeMatch = url.match(/dispute[=\/](\d+)/i);
  const convMatch = url.match(/conversation[=\/](\d+)/i);

  if (disputeMatch && role === "admin") return { kind: "admin_dispute", disputeId: Number(disputeMatch[1]) };
  if (convMatch && role === "admin") return { kind: "admin_comms", conversationId: Number(convMatch[1]) };
  if (jobMatch) {
    const jobId = Number(jobMatch[1]);
    if (role === "admin") return { kind: "admin_job", jobId };
    if (role === "homeowner") return { kind: "homeowner_job", jobId };
  }

  if (n.jobId && role === "homeowner") return { kind: "homeowner_job", jobId: Number(n.jobId) };
  if (n.jobId && role === "admin") return { kind: "admin_job", jobId: Number(n.jobId) };

  return { kind: "none" };
}

export const STALE_CONTENT_MESSAGE = "This item is no longer available.";
