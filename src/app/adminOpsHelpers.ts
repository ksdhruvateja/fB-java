import type { ManagedJob } from "./managedJobs";

export type AttentionKind =
  | "emergency"
  | "unassigned"
  | "no_technician"
  | "quotes_waiting"
  | "quotes_ready"
  | "accepted"
  | "payments"
  | "payouts"
  | "disputes";

export type WorkQueueSectionId =
  | "new_requests"
  | "waiting_contractor_quote"
  | "needs_admin_pricing"
  | "quote_sent"
  | "homeowner_accepted"
  | "ready_to_dispatch"
  | "active"
  | "payment_pending"
  | "payout_ready"
  | "attention_required";

export type QueueFilter = "all" | "urgent" | "waiting" | "today" | AttentionKind | WorkQueueSectionId;

const SECTION_STATUS_MAP: Record<WorkQueueSectionId, string[]> = {
  new_requests: ["draft", "ai_review_complete", "awaiting_service_payment", "paid_for_dispatch", "awaiting_contractor"],
  waiting_contractor_quote: ["contractor_invited", "awaiting_bid", "contractor_accepted"],
  needs_admin_pricing: ["bid_received"],
  quote_sent: ["proposal_sent", "awaiting_customer_approval"],
  homeowner_accepted: ["approved"],
  ready_to_dispatch: ["scheduled"],
  active: ["contractor_en_route", "work_started", "change_order_pending", "diagnosing"],
  payment_pending: ["work_completed", "customer_review_pending"],
  payout_ready: ["admin_review_pending", "payout_pending"],
  attention_required: [],
};

export function jobWorkQueueSection(job: ManagedJob): WorkQueueSectionId | null {
  if (["closed", "canceled", "refunded", "paid_out"].includes(job.status)) return null;
  if (job.workQueueStatus === "PAID_NEEDS_REVIEW") return "new_requests";
  for (const [section, statuses] of Object.entries(SECTION_STATUS_MAP) as [WorkQueueSectionId, string[]][]) {
    if (statuses.includes(job.status)) return section;
  }
  if (isEmergencyJob(job)) return "attention_required";
  return "attention_required";
}

export const WORK_QUEUE_SECTION_LABELS: Record<WorkQueueSectionId, string> = {
  new_requests: "New Requests",
  waiting_contractor_quote: "Waiting Contractor Quote",
  needs_admin_pricing: "Needs Admin Pricing",
  quote_sent: "Quote Sent",
  homeowner_accepted: "Homeowner Accepted",
  ready_to_dispatch: "Ready to Dispatch",
  active: "Active Jobs",
  payment_pending: "Payment Pending",
  payout_ready: "Payout Ready",
  attention_required: "Attention Required",
};

export type LifecycleStep = {
  id: string;
  label: string;
  state: "done" | "current" | "todo";
};

const EMERGENCY_STATUSES = new Set([
  "draft",
  "ai_review_complete",
  "awaiting_service_payment",
  "paid_for_dispatch",
  "awaiting_contractor",
]);

export function jobBookingLabel(job: ManagedJob) {
  return job.bookingId || `FB-${job.id}`;
}

export function jobUrgency(job: ManagedJob): string {
  const a = job.aiAssessment as { urgency?: string } | null | undefined;
  return String(a?.urgency || "").toLowerCase();
}

export function isEmergencyJob(job: ManagedJob) {
  return jobUrgency(job).includes("emerg") || jobUrgency(job) === "critical";
}

export function jobDotTone(job: ManagedJob): string {
  if (isEmergencyJob(job) && EMERGENCY_STATUSES.has(job.status)) return "bg-red-500";
  if (["bid_received", "awaiting_bid", "contractor_invited"].includes(job.status)) return "bg-amber-500";
  if (["proposal_sent", "awaiting_customer_approval"].includes(job.status)) return "bg-yellow-400";
  if (["approved", "scheduled", "contractor_en_route", "work_started"].includes(job.status)) return "bg-emerald-500";
  if (["work_completed", "customer_review_pending", "admin_review_pending"].includes(job.status)) return "bg-sky-500";
  if (["payout_pending", "paid_out"].includes(job.status)) return "bg-violet-500";
  return "bg-slate-400";
}

export function jobQueueHeadline(job: ManagedJob): string {
  switch (job.status) {
    case "paid_for_dispatch":
    case "awaiting_contractor":
      return "PAID — NEEDS REVIEW";
    case "contractor_invited":
    case "awaiting_bid":
      return "Waiting on contractor quote";
    case "bid_received":
      return "Contractor quote received · needs pricing";
    case "proposal_sent":
    case "awaiting_customer_approval":
      return "Quote sent · awaiting homeowner";
    case "approved":
    case "scheduled":
      return "Homeowner accepted · ready to dispatch";
    case "contractor_en_route":
    case "work_started":
    case "diagnosing":
      return "Job in progress";
    case "work_completed":
    case "customer_review_pending":
      return "Work complete · payment pending";
    case "admin_review_pending":
    case "payout_pending":
      return "Payment received · payout ready";
    default:
      return job.status.replace(/_/g, " ");
  }
}

export function computeAttention(jobs: ManagedJob[]) {
  const terminal = new Set(["closed", "canceled", "refunded", "paid_out"]);
  const active = jobs.filter((j) => !terminal.has(j.status));

  const emergency = active.filter((j) => isEmergencyJob(j));
  const unassigned = active.filter(
    (j) =>
      !j.assignedContractorUserId &&
      ["paid_for_dispatch", "awaiting_contractor", "ai_review_complete", "awaiting_service_payment"].includes(j.status),
  );
  const noTechnician = active.filter(
    (j) =>
      Boolean(j.assignedContractorUserId) &&
      !j.assignedEmployeeId &&
      ["approved", "scheduled", "contractor_en_route"].includes(j.status),
  );
  const quotesWaiting = active.filter((j) =>
    ["contractor_invited", "awaiting_bid", "contractor_accepted"].includes(j.status),
  );
  const quotesReady = active.filter((j) => j.status === "bid_received");
  const accepted = active.filter((j) => ["approved", "scheduled"].includes(j.status));
  const payments = active.filter((j) =>
    ["work_completed", "customer_review_pending", "admin_review_pending"].includes(j.status),
  );
  const payouts = active.filter((j) => j.status === "payout_pending");
  const disputes = active.filter((j) => j.status === "disputed");

  return {
    emergency,
    unassigned,
    no_technician: noTechnician,
    quotes_waiting: quotesWaiting,
    quotes_ready: quotesReady,
    accepted,
    payments,
    payouts,
    disputes,
  } as Record<AttentionKind, ManagedJob[]>;
}

export function todayStats(jobs: ManagedJob[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const isToday = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= start;
  };

  const todayJobs = jobs.filter((j) => isToday(j.createdAt) || isToday(j.updatedAt));
  const requests = todayJobs.length;
  const quotes = jobs.filter((j) =>
    ["bid_received", "proposal_sent", "awaiting_customer_approval", "approved"].includes(j.status),
  ).length;
  const accepted = jobs.filter((j) => ["approved", "scheduled", "contractor_en_route", "work_started"].includes(j.status)).length;
  const active = jobs.filter((j) =>
    ["approved", "scheduled", "contractor_en_route", "diagnosing", "work_started", "change_order_pending"].includes(
      j.status,
    ),
  ).length;
  const completed = jobs.filter((j) =>
    ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
      j.status,
    ),
  ).length;

  const paymentsSum = jobs.reduce((sum, j) => {
    if (["admin_review_pending", "payout_pending", "paid_out", "closed"].includes(j.status)) {
      return sum + (Number(j.customerRetailEstimateHigh) || Number(j.customerRetailEstimateLow) || 0);
    }
    return sum;
  }, 0);

  return { requests, quotes, accepted, active, completed, paymentsSum };
}

export function filterWorkQueue(
  jobs: ManagedJob[],
  filter: QueueFilter,
  search: string,
  attention: Record<AttentionKind, ManagedJob[]>,
): ManagedJob[] {
  let list = [...jobs];

  if (filter === "urgent") {
    list = list.filter((j) => isEmergencyJob(j) || ["bid_received", "approved", "payout_pending"].includes(j.status));
  } else if (filter === "waiting") {
    list = list.filter((j) =>
      [
        "awaiting_service_payment",
        "paid_for_dispatch",
        "awaiting_contractor",
        "contractor_invited",
        "awaiting_bid",
        "proposal_sent",
        "awaiting_customer_approval",
      ].includes(j.status),
    );
  } else if (filter === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    list = list.filter((j) => {
      const t = j.updatedAt || j.createdAt;
      return t ? new Date(t) >= start : false;
    });
  } else if (
    filter !== "all" &&
    filter !== "urgent" &&
    filter !== "waiting" &&
    filter !== "today" &&
    WORK_QUEUE_SECTION_LABELS[filter as WorkQueueSectionId]
  ) {
    list = list.filter((j) => jobWorkQueueSection(j) === filter);
  } else if (filter !== "all" && attention[filter as AttentionKind]) {
    const ids = new Set(attention[filter as AttentionKind].map((j) => j.id));
    list = list.filter((j) => ids.has(j.id));
  }

  // Exclude terminal idle noise from default "all" unless searching
  if (filter === "all" && !search.trim()) {
    list = list.filter((j) => !["closed", "canceled", "refunded"].includes(j.status));
  }

  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((j) =>
      `${j.bookingId} ${j.id} ${j.title} ${j.status} ${j.category} ${j.fullAddress} ${j.cityStateZip} ${j.contactName} ${j.contactPhone}`
        .toLowerCase()
        .includes(q),
    );
  }

  return list.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function lifecycleForJob(job: ManagedJob): LifecycleStep[] {
  const status = job.status;
  const order = [
    { id: "request", label: "Request", match: () => true },
    {
      id: "ai",
      label: "AI Estimate",
      match: () =>
        ![
          "draft",
        ].includes(status),
    },
    {
      id: "dispatch_req",
      label: "Dispatch Requested",
      match: () =>
        ![
          "draft",
          "ai_review_complete",
          "awaiting_service_payment",
        ].includes(status),
    },
    {
      id: "contractor_quote",
      label: "Contractor Quote",
      match: () =>
        [
          "bid_received",
          "proposal_sent",
          "awaiting_customer_approval",
          "approved",
          "scheduled",
          "contractor_en_route",
          "diagnosing",
          "work_started",
          "change_order_pending",
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
        ].includes(status),
    },
    {
      id: "admin_pricing",
      label: "Admin Pricing",
      match: () =>
        [
          "proposal_sent",
          "awaiting_customer_approval",
          "approved",
          "scheduled",
          "contractor_en_route",
          "diagnosing",
          "work_started",
          "change_order_pending",
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
        ].includes(status),
    },
    {
      id: "homeowner",
      label: "Homeowner Approval",
      match: () =>
        [
          "approved",
          "scheduled",
          "contractor_en_route",
          "diagnosing",
          "work_started",
          "change_order_pending",
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
        ].includes(status),
    },
    {
      id: "dispatch",
      label: "Dispatch",
      match: () =>
        [
          "scheduled",
          "contractor_en_route",
          "diagnosing",
          "work_started",
          "change_order_pending",
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
        ].includes(status),
    },
    {
      id: "work",
      label: "Work",
      match: () =>
        [
          "work_started",
          "change_order_pending",
          "work_completed",
          "customer_review_pending",
          "admin_review_pending",
          "payout_pending",
          "paid_out",
          "closed",
        ].includes(status),
    },
    {
      id: "payment",
      label: "Payment",
      match: () =>
        ["admin_review_pending", "payout_pending", "paid_out", "closed"].includes(status) ||
        (status === "customer_review_pending" && false),
    },
    {
      id: "payout",
      label: "Payout",
      match: () => ["paid_out", "closed"].includes(status),
    },
  ];

  // Current step heuristic
  let currentId = "request";
  if (status === "bid_received") currentId = "admin_pricing";
  else if (["proposal_sent", "awaiting_customer_approval"].includes(status)) currentId = "homeowner";
  else if (["approved"].includes(status)) currentId = "dispatch";
  else if (["scheduled", "contractor_en_route", "diagnosing"].includes(status)) currentId = "dispatch";
  else if (["work_started", "change_order_pending"].includes(status)) currentId = "work";
  else if (["work_completed", "customer_review_pending"].includes(status)) currentId = "payment";
  else if (["admin_review_pending", "payout_pending"].includes(status)) currentId = "payout";
  else if (["contractor_invited", "awaiting_bid", "contractor_accepted"].includes(status)) currentId = "contractor_quote";
  else if (["paid_for_dispatch", "awaiting_contractor"].includes(status)) currentId = "contractor_quote";
  else if (["ai_review_complete", "awaiting_service_payment"].includes(status)) currentId = "dispatch_req";
  else if (status === "draft") currentId = "request";
  else if (["paid_out", "closed"].includes(status)) currentId = "payout";

  return order.map((step) => {
    if (step.id === currentId) return { id: step.id, label: step.label, state: "current" as const };
    if (step.match()) return { id: step.id, label: step.label, state: "done" as const };
    return { id: step.id, label: step.label, state: "todo" as const };
  });
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
