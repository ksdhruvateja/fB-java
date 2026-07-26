import { getStoredToken } from "./auth";
import { brand } from "../config/brand";

export type ManagedJobStatus =
  | "draft"
  | "ai_review_complete"
  | "awaiting_service_payment"
  | "paid_for_dispatch"
  | "awaiting_contractor"
  | "contractor_invited"
  | "contractor_accepted"
  | "awaiting_bid"
  | "bid_received"
  | "proposal_sent"
  | "awaiting_customer_approval"
  | "approved"
  | "scheduled"
  | "contractor_en_route"
  | "work_started"
  | "change_order_pending"
  | "work_completed"
  | "customer_review_pending"
  | "admin_review_pending"
  | "payout_pending"
  | "paid_out"
  | "closed"
  | "canceled"
  | "refunded"
  | "disputed";

export type StructuredAssessment = {
  category: string;
  summary: string;
  urgency: string;
  confidence: number;
  recommended_trade: string;
  professional_required: boolean;
  safe_diy_allowed: boolean;
  immediate_safety_steps: string[];
  visual_findings: string[];
  estimated_labor_hours_min: number;
  estimated_labor_hours_max: number;
  complexity: string;
  questions_needed: string[];
  diy_difficulty?: string;
  tools_required?: string[];
  materials_needed?: string[];
  diy_steps?: string[];
  stop_conditions?: string[];
  disclaimer?: string;
};

export type ManagedJob = {
  id: number;
  bookingId?: string | null;
  jobMode?: string;
  status: ManagedJobStatus | string;
  category?: string;
  title?: string;
  description?: string;
  mediaDataUrl?: string | null;
  mediaType?: string | null;
  preferredDate?: string | null;
  preferredTimeSlot?: string | null;
  serviceTiming?: string | null;
  cityStateZip?: string | null;
  fullAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  propertyId?: number | null;
  aiAssessment?: StructuredAssessment | null;
  showRetailPrice?: boolean;
  customerRetailEstimateLow?: number | null;
  customerRetailEstimateHigh?: number | null;
  estimatedContractorNetLow?: number | null;
  estimatedContractorNetHigh?: number | null;
  pricingDisclaimer?: string;
  preferredTimeNote?: string;
  assignedContractorUserId?: number | null;
  activeProposalId?: number | null;
  completionReport?: Record<string, unknown> | null;
  partnerCode?: string | null;
  discountCode?: string | null;
  discountLabel?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  discountSummary?: string | null;
  discountAmountLow?: number | null;
  discountAmountHigh?: number | null;
  propertyPurpose?: string | null;
  transactionStage?: string | null;
  createdAt?: string;
};

export type Property = {
  id: number;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  propertyType?: string | null;
  accessNotes?: string | null;
  propertyPurpose?: string | null;
  transactionStage?: string | null;
};

export type Proposal = {
  id: number;
  jobId: number;
  scopeSummary?: string;
  retailAmount?: number;
  depositAmount?: number | null;
  timeline?: string | null;
  warranty?: string | null;
  exclusions?: string | null;
  status: string;
  contractorNet?: number;
  platformGross?: number;
};

export type Bid = {
  id: number;
  jobId: number;
  contractorUserId: number;
  labor: number;
  materials: number;
  equipment: number;
  travelDiagnostic: number;
  permitCost: number;
  disposal: number;
  netTotal: number;
  durationHours?: number | null;
  earliestStart?: string | null;
  warranty?: string | null;
  exclusions?: string | null;
  notes?: string | null;
  status: string;
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ai_review_complete: "Assessment ready",
  awaiting_service_payment: "Pay assessment fee",
  paid_for_dispatch: "Fee paid",
  awaiting_contractor: "Finding professional",
  contractor_invited: "Contractor invited",
  contractor_accepted: "Contractor accepted",
  awaiting_bid: "Awaiting bid",
  bid_received: "Bid received",
  proposal_sent: "Proposal ready",
  awaiting_customer_approval: "Approve proposal",
  approved: "Approved",
  scheduled: "Scheduled",
  contractor_en_route: "En route",
  work_started: "Work in progress",
  change_order_pending: "Change order pending",
  work_completed: "Work completed",
  customer_review_pending: "Confirm completion",
  admin_review_pending: "Admin review",
  payout_pending: "Payout pending",
  paid_out: "Contractor paid",
  closed: "Closed",
  canceled: "Canceled",
  refunded: "Refunded",
  disputed: "Disputed",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(path, { ...init, headers });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return { ok: false, message: text || res.statusText || "Request failed." } as T;
    }
  } catch {
    return { ok: false, message: "Network error. Is the API running?" } as T;
  }
}

export async function listProperties() {
  return api<{ ok: boolean; properties: Property[] }>("/api/properties");
}

export async function createProperty(body: Partial<Property> & { addressLine1: string }) {
  return api<{ ok: boolean; property: Property; message?: string }>("/api/properties", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createManagedJob(body: Record<string, unknown>) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>("/api/managed/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function assessManagedJob(jobId: number) {
  return api<{
    ok: boolean;
    job?: ManagedJob;
    assessment?: StructuredAssessment;
    pricing?: {
      showPrice: boolean;
      message?: string | null;
      customerRetailEstimateLow?: number | null;
      customerRetailEstimateHigh?: number | null;
      disclaimer?: string;
    };
    message?: string;
  }>(`/api/managed/jobs/${jobId}/assess`, { method: "POST", body: "{}" });
}

export async function listMyManagedJobs() {
  return api<{ ok: boolean; jobs: ManagedJob[] }>("/api/managed/jobs/my");
}

export async function getManagedJob(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob }>("/api/managed/jobs/" + jobId);
}

export async function payDispatchFee(jobId: number) {
  return api<{ ok: boolean; simulated?: boolean; url?: string; amount?: number; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/pay-dispatch`,
    { method: "POST", body: "{}" }
  );
}

export async function getProposal(jobId: number) {
  return api<{ ok: boolean; proposal: Proposal | null }>(`/api/managed/jobs/${jobId}/proposal`);
}

export async function approveProposal(jobId: number) {
  return api<{ ok: boolean; proposal?: Proposal; message?: string }>(
    `/api/managed/jobs/${jobId}/approve-proposal`,
    { method: "POST", body: "{}" }
  );
}

export async function payRetail(jobId: number) {
  return api<{ ok: boolean; simulated?: boolean; url?: string; amount?: number; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/pay-retail`,
    { method: "POST", body: "{}" }
  );
}

export async function confirmCompletion(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob }>(`/api/managed/jobs/${jobId}/confirm-completion`, {
    method: "POST",
    body: "{}",
  });
}

export async function listInvitations() {
  return api<{ ok: boolean; invitations: Array<Record<string, unknown>> }>("/api/contractor/invitations");
}

export async function respondInvitation(id: number, action: "accept" | "decline") {
  return api<{ ok: boolean; status?: string }>(`/api/contractor/invitations/${id}/respond`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function submitBid(body: Record<string, unknown>) {
  return api<{ ok: boolean; bid?: Bid; message?: string }>("/api/contractor/bids", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listBids(jobId: number) {
  return api<{ ok: boolean; bids: Bid[] }>(`/api/managed/jobs/${jobId}/bids`);
}

export async function updateJobStatus(jobId: number, status: string, note?: string) {
  return api<{ ok: boolean; job?: ManagedJob }>(`/api/managed/jobs/${jobId}/status`, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
}

export async function completeJob(jobId: number, body: Record<string, unknown>) {
  return api<{ ok: boolean; job?: ManagedJob }>(`/api/managed/jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listContractorPayouts() {
  return api<{ ok: boolean; payouts: Array<{ id: number; jobId: number; amount: number; status: string; simulated?: boolean }> }>(
    "/api/contractor/payouts"
  );
}

export async function startStripeOnboarding() {
  return api<{ ok: boolean; simulated?: boolean; url?: string; accountId?: string }>("/api/contractor/stripe/onboard", {
    method: "POST",
    body: "{}",
  });
}

export async function updateCompliance(body: Record<string, unknown>) {
  return api<{ ok: boolean }>("/api/contractor/compliance", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function adminListJobs() {
  return api<{ ok: boolean; jobs: ManagedJob[] }>("/api/admin/managed/jobs");
}

export async function adminInvite(jobId: number, contractorUserId: number, message?: string) {
  return api<{ ok: boolean; message?: string; job?: ManagedJob }>(`/api/admin/managed/jobs/${jobId}/invite`, {
    method: "POST",
    body: JSON.stringify({ contractorUserId, message }),
  });
}

export async function adminAssign(jobId: number, contractorUserId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(`/api/admin/managed/jobs/${jobId}/assign`, {
    method: "POST",
    body: JSON.stringify({ contractorUserId }),
  });
}

export async function adminCreateProposal(jobId: number, bidId: number, extras?: Record<string, unknown>) {
  return api<{ ok: boolean; proposal?: Proposal; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/proposal`,
    { method: "POST", body: JSON.stringify({ bidId, ...extras }) }
  );
}

export async function adminPayout(jobId: number, amount?: number) {
  return api<{
    ok: boolean;
    job?: ManagedJob;
    amount?: number;
    simulated?: boolean;
    message?: string;
  }>(`/api/admin/managed/jobs/${jobId}/payout`, {
    method: "POST",
    body: JSON.stringify({ ...(amount != null ? { amount } : {}) }),
  });
}

export async function adminPricingRules() {
  return api<{ ok: boolean; rules: Record<string, unknown> }>("/api/pricing/rules");
}

export async function adminSavePricingRules(rules: Record<string, unknown>) {
  return api<{ ok: boolean; rules: Record<string, unknown> }>("/api/pricing/rules", {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
}

export async function adminPayments() {
  return api<{ ok: boolean; payments: unknown[]; transfers: unknown[] }>("/api/admin/payments");
}

export async function adminReporting() {
  return api<{
    ok: boolean;
    revenueCollected: number;
    contractorPaidOut: number;
    grossEstimate: number;
    jobsByStatus: Record<string, number>;
    kpis?: {
      totalJobs: number;
      activeJobs: number;
      awaitingDispatch: number;
      availableContractors: number;
      avgRetailEstimate: number;
      partnersCount: number;
      jobsThisMonth: number;
    };
    trendByMonth?: Array<{ label: string; open: number; completed: number; total: number }>;
    byCategory?: Array<{ category: string; count: number }>;
    byUrgency?: Array<{ name: string; value: number }>;
    byHour?: Array<{ hour: number; label: string; count: number }>;
    byDayThisMonth?: Array<{ label: string; count: number }>;
    diySplit?: { diyOk: number; proRequired: number; pendingAi: number; diyPct: number };
    message?: string;
  }>("/api/admin/reporting/summary");
}

export async function lookupPartner(code: string) {
  const q = encodeURIComponent(code.trim());
  return api<{ ok: boolean; partner: { code: string; name: string; company?: string | null } | null }>(
    `/api/partners/lookup?code=${q}`
  );
}

export async function lookupDiscount(code: string) {
  const q = encodeURIComponent(code.trim());
  return api<{
    ok: boolean;
    discount: {
      code: string;
      label?: string | null;
      discountType: "percent" | "amount";
      value: number;
      summary: string;
    } | null;
    message?: string;
  }>(`/api/discounts/lookup?code=${q}`);
}

export type AdminDiscount = {
  id: number;
  code: string;
  label?: string | null;
  discountType: string;
  value: number;
  active: boolean;
  maxUses?: number | null;
  usesCount: number;
  expiresAt?: string | null;
  createdAt?: string;
};

export async function adminDiscounts() {
  return api<{ ok: boolean; discounts: AdminDiscount[] }>("/api/admin/discounts");
}

export async function adminCreateDiscount(body: {
  code: string;
  label?: string;
  discountType: "percent" | "amount";
  value: number;
  maxUses?: number | null;
  expiresAt?: string | null;
}) {
  return api<{ ok: boolean; discount?: AdminDiscount; message?: string }>("/api/admin/discounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adminUpdateDiscount(
  id: number,
  body: Partial<{ active: boolean; label: string; discountType: string; value: number; maxUses: number | null }>
) {
  return api<{ ok: boolean; message?: string }>(`/api/admin/discounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function adminPartnerReferrals() {
  return api<{
    ok: boolean;
    referrals: Array<{
      id: number;
      partnerCode: string;
      partnerName?: string;
      partnerCompany?: string;
      partnerEmail?: string;
      status: string;
      statusLabel: string;
      jobId?: number | null;
      bookingId?: string;
      jobStatus?: string;
      category?: string;
      area?: string;
      consent: boolean;
      createdAt?: string;
    }>;
  }>("/api/admin/partner-referrals");
}

export async function adminPartners() {
  return api<{
    ok: boolean;
    partners: Array<{
      id: number;
      code: string;
      name: string;
      company?: string;
      email?: string;
      phone?: string;
      intakeUrl?: string;
    }>;
  }>("/api/admin/partners");
}

export async function adminCreatePartner(body: Record<string, unknown>) {
  return api<{
    ok: boolean;
    partner?: { id: number; code: string; name: string; email?: string; intakeUrl?: string };
  }>("/api/admin/partners", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adminSetCompliance(userId: number, complianceStatus: string) {
  return api<{ ok: boolean }>(`/api/admin/contractors/${userId}/compliance`, {
    method: "PUT",
    body: JSON.stringify({ complianceStatus }),
  });
}

export async function adminAiOverride(
  jobId: number,
  body: Record<string, unknown>
) {
  return api<{ ok: boolean; job?: ManagedJob; pricing?: Record<string, unknown>; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/ai-override`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}

export function formatMoney(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(n)
  );
}

export function retailRangeLabel(job: ManagedJob) {
  if (job.showRetailPrice === false) return "On-site assessment required before pricing";
  if (job.customerRetailEstimateLow != null && job.customerRetailEstimateHigh != null) {
    return `${formatMoney(job.customerRetailEstimateLow)}–${formatMoney(job.customerRetailEstimateHigh)}`;
  }
  return "Pending estimate";
}

export { brand };
