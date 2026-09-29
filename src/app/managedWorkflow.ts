import type { ManagedJob } from "./managedJobs";

/** Canonical client-side lifecycle guards. Backend remains authoritative. */
export const WORKFLOW_STATUS = {
  PAID_FOR_DISPATCH: "paid_for_dispatch",
  APPROVED: "approved",
  SCHEDULED: "scheduled",
  EN_ROUTE: "contractor_en_route",
  ARRIVED: "contractor_arrived",
  WORK_STARTED: "work_started",
  CHANGE_ORDER_PENDING: "change_order_pending",
  WORK_COMPLETED: "work_completed",
  CUSTOMER_REVIEW_PENDING: "customer_review_pending",
  PAYOUT_PENDING: "payout_pending",
  PAID_OUT: "paid_out",
  CLOSED: "closed",
} as const;

export function hasAssignedContractor(job: Pick<ManagedJob, "assignedContractorUserId"> | null | undefined) {
  return Number(job?.assignedContractorUserId || 0) > 0;
}

export function hasSuccessfulInitialPayment(job: Pick<ManagedJob, "invoiceInitialPaymentCompleted" | "invoicePaid"> | null | undefined) {
  return job?.invoiceInitialPaymentCompleted === true;
}

export function canAssignContractor(job: ManagedJob | null | undefined) {
  if (!job) return false;
  return hasSuccessfulInitialPayment(job) && !hasAssignedContractor(job);
}

export function canDispatchJob(job: ManagedJob | null | undefined) {
  if (!job) return false;
  return hasAssignedContractor(job) &&
    hasSuccessfulInitialPayment(job) &&
    [WORKFLOW_STATUS.PAID_FOR_DISPATCH, WORKFLOW_STATUS.APPROVED, WORKFLOW_STATUS.SCHEDULED].includes(job.status as any);
}

export function canStartWork(job: ManagedJob | null | undefined) {
  if (!job || !hasAssignedContractor(job)) return false;
  return [WORKFLOW_STATUS.ARRIVED].includes(job.status as any);
}

export function canMarkComplete(job: ManagedJob | null | undefined) {
  if (!job || !hasAssignedContractor(job)) return false;
  return [WORKFLOW_STATUS.WORK_STARTED, WORKFLOW_STATUS.CHANGE_ORDER_PENDING].includes(job.status as any);
}

export function canPayFinalBalance(job: ManagedJob | null | undefined) {
  if (!job) return false;
  return job.status === WORKFLOW_STATUS.CUSTOMER_REVIEW_PENDING && Number(job.invoiceAmountDue || 0) > 0;
}

export function lifecycleLabel(job: ManagedJob | null | undefined) {
  if (!job) return "—";
  if (job.status === WORKFLOW_STATUS.PAID_FOR_DISPATCH && !hasAssignedContractor(job)) return "Initial payment received · waiting for assignment";
  if (hasAssignedContractor(job) && job.status === WORKFLOW_STATUS.PAID_FOR_DISPATCH) return "Contractor assigned · waiting for dispatch";
  if (job.status === WORKFLOW_STATUS.EN_ROUTE) return "Contractor en route";
  if (job.status === WORKFLOW_STATUS.ARRIVED) return "Contractor reached location";
  if (job.status === WORKFLOW_STATUS.WORK_STARTED) return "Work in progress";
  if (job.status === WORKFLOW_STATUS.WORK_COMPLETED || job.status === WORKFLOW_STATUS.CUSTOMER_REVIEW_PENDING) return "Work completed · final payment";
  if (job.status === WORKFLOW_STATUS.PAYOUT_PENDING || job.status === WORKFLOW_STATUS.PAID_OUT || job.status === WORKFLOW_STATUS.CLOSED) return "Completed · payout processing";
  return job.status;
}
