import type { InAppNotification } from "./notificationsApi";

export type NotificationNavTarget =
  | { kind: "homeowner_job"; jobId: number; focus?: "quote" | "invoice" | "tracking" | "completion" | "dispute" }
  | { kind: "homeowner_messages"; conversationId?: number }
  | { kind: "homeowner_assessment"; jobId: number }
  | { kind: "contractor_job"; jobId: number }
  | { kind: "contractor_invite"; jobId: number }
  | { kind: "contractor_messages"; conversationId?: number }
  | { kind: "contractor_payout"; payoutId?: number; jobId?: number; failed?: boolean }
  | { kind: "contractor_compliance" }
  | { kind: "admin_comms"; conversationId?: number }
  | { kind: "admin_job"; jobId: number }
  | { kind: "admin_dispute"; disputeId: number }
  | { kind: "admin_payout"; payoutId?: number; jobId?: number; failed?: boolean }
  | { kind: "admin_compliance"; contractorId?: number; jobId?: number }
  | { kind: "stale" }
  | { kind: "none" };

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function queryParam(url: string, key: string): string | null {
  const m = url.match(new RegExp(`[?&]${key}=([^&]+)`, "i"));
  return m ? decodeURIComponent(m[1]) : null;
}

export function resolveNotificationTarget(
  n: Pick<InAppNotification, "type" | "actionUrl" | "jobId" | "entityType" | "entityId" | "metadata">,
  role: "homeowner" | "contractor" | "admin",
): NotificationNavTarget {
  const type = String(n.type || "").toLowerCase();
  const url = String(n.actionUrl || "");
  const entityType = String(n.entityType || "").toLowerCase();
  const entityId = num(n.entityId);
  const jobId = num(n.jobId) || num(queryParam(url, "job"));
  const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : {};
  const metaJobId = num((meta as { jobId?: unknown }).jobId);
  const jid = jobId || metaJobId;

  if (entityType === "conversation" && entityId) {
    if (role === "admin") return { kind: "admin_comms", conversationId: entityId };
    if (role === "contractor") return { kind: "contractor_messages", conversationId: entityId };
    return { kind: "homeowner_messages", conversationId: entityId };
  }

  if (entityType === "dispute" && entityId) {
    if (role === "admin") return { kind: "admin_dispute", disputeId: entityId };
    if (jid) return { kind: "homeowner_job", jobId: jid, focus: "dispute" };
  }

  if (entityType === "payout" && (entityId || jid)) {
    const failed = type.includes("fail");
    if (role === "admin") return { kind: "admin_payout", payoutId: entityId || undefined, jobId: jid || undefined, failed };
    if (role === "contractor") {
      return { kind: "contractor_payout", payoutId: entityId || undefined, jobId: jid || undefined, failed };
    }
  }

  if (type === "dispute_opened" || type === "dispute_update" || type.includes("dispute")) {
    if (role === "admin" && entityId) return { kind: "admin_dispute", disputeId: entityId };
    if (jid) return { kind: "homeowner_job", jobId: jid, focus: "dispute" };
  }

  if (
    type === "admin_message" ||
    type === "homeowner_message" ||
    type === "contractor_message" ||
    type === "new_homeowner_message" ||
    type === "new_contractor_message"
  ) {
    const convId = entityType === "conversation" ? entityId : num(queryParam(url, "conversation"));
    if (role === "admin") return { kind: "admin_comms", conversationId: convId || undefined };
    if (role === "contractor") return { kind: "contractor_messages", conversationId: convId || undefined };
    return { kind: "homeowner_messages", conversationId: convId || undefined };
  }

  if (type.includes("compliance")) {
    if (role === "contractor") return { kind: "contractor_compliance" };
    if (role === "admin") {
      return {
        kind: "admin_compliance",
        contractorId: num((meta as { contractorId?: unknown }).contractorId) || undefined,
        jobId: jid || undefined,
      };
    }
  }

  if (type.includes("invite") && role === "contractor" && jid) {
    return { kind: "contractor_invite", jobId: jid };
  }

  if (type.includes("payout")) {
    const failed = type.includes("fail");
    if (role === "admin") return { kind: "admin_payout", payoutId: entityId || undefined, jobId: jid || undefined, failed };
    if (role === "contractor") {
      return { kind: "contractor_payout", payoutId: entityId || undefined, jobId: jid || undefined, failed };
    }
  }

  if (
    type === "ai_assessment_ready" ||
    type.includes("assessment")
  ) {
    if (role === "homeowner" && jid) return { kind: "homeowner_assessment", jobId: jid };
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
  }

  if (type === "quote_ready" || type === "quote_revised" || type.includes("quote")) {
    if (role === "homeowner" && jid) return { kind: "homeowner_job", jobId: jid, focus: "quote" };
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
    if (role === "contractor" && jid) return { kind: "contractor_job", jobId: jid };
  }

  if (type === "invoice_created" || type.includes("invoice") || type === "payment_received" || type.includes("payment")) {
    if (role === "homeowner" && jid) return { kind: "homeowner_job", jobId: jid, focus: "invoice" };
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
  }

  if (
    type === "contractor_dispatched" ||
    type === "technician_assigned" ||
    type === "technician_arrived" ||
    type === "contractor_assigned" ||
    type.includes("dispatch") ||
    type.includes("arriv") ||
    type.includes("travel")
  ) {
    if (role === "homeowner" && jid) return { kind: "homeowner_job", jobId: jid, focus: "tracking" };
    if (role === "contractor" && jid) return { kind: "contractor_job", jobId: jid };
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
  }

  if (type === "job_completed" || type.includes("complete")) {
    if (role === "homeowner" && jid) return { kind: "homeowner_job", jobId: jid, focus: "completion" };
    if (role === "contractor" && jid) return { kind: "contractor_job", jobId: jid };
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
  }

  if (type === "job_invitation" || type === "job_assigned") {
    if (role === "contractor" && jid) {
      return { kind: type.includes("invite") ? "contractor_invite" : "contractor_job", jobId: jid };
    }
    if (role === "admin" && jid) return { kind: "admin_job", jobId: jid };
    if (role === "homeowner" && jid) return { kind: "homeowner_job", jobId: jid, focus: "tracking" };
  }

  if (type === "new_service_request" && role === "admin" && jid) {
    return { kind: "admin_job", jobId: jid };
  }

  const convMatch = url.match(/conversation[=/](\d+)/i);
  const disputeMatch = url.match(/dispute[=/](\d+)/i);
  const payoutMatch = url.match(/payout[=/](\d+)/i);
  const jobMatch = url.match(/job[=/](\d+)/i);

  if (disputeMatch && role === "admin") return { kind: "admin_dispute", disputeId: Number(disputeMatch[1]) };
  if (convMatch) {
    const cid = Number(convMatch[1]);
    if (role === "admin") return { kind: "admin_comms", conversationId: cid };
    if (role === "contractor") return { kind: "contractor_messages", conversationId: cid };
    return { kind: "homeowner_messages", conversationId: cid };
  }
  if (payoutMatch) {
    const pid = Number(payoutMatch[1]);
    if (role === "admin") return { kind: "admin_payout", payoutId: pid, jobId: jid || undefined };
    if (role === "contractor") return { kind: "contractor_payout", payoutId: pid, jobId: jid || undefined };
  }
  if (jobMatch) {
    const id = Number(jobMatch[1]);
    if (role === "admin") return { kind: "admin_job", jobId: id };
    if (role === "contractor") return { kind: "contractor_job", jobId: id };
    return { kind: "homeowner_job", jobId: id };
  }

  if (jid) {
    if (role === "admin") return { kind: "admin_job", jobId: jid };
    if (role === "contractor") return { kind: "contractor_job", jobId: jid };
    return { kind: "homeowner_job", jobId: jid };
  }

  return { kind: "none" };
}

export const STALE_CONTENT_MESSAGE = "This item is no longer available.";
