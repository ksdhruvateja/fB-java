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
  | "diagnosing"
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
  homeownerUserId?: number | null;
  technician?: {
    id: number;
    name?: string | null;
    company?: string | null;
    phone?: string | null;
    rating?: number | null;
    verified?: boolean;
    insured?: boolean;
    trade?: string | null;
  } | null;
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
  updatedAt?: string;
  pricing?: any;
  visitFeeAuthorized?: boolean;
  visitFeeCaptured?: boolean;
  diyRiskLevel?: string;
};

export type PropertyHealthProfilePayload = {
  systems?: Array<{
    system: string;
    status: string;
    nextAction: string;
    notes?: string;
    updatedAt?: string;
    updatedBy?: string;
    relatedJobId?: number | null;
  }>;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  maintenance?: { label: string; dueDate: string; system?: string }[];
  previousServices?: Array<Record<string, unknown>>;
  aiSuggestions?: Array<Record<string, unknown>>;
  onboardingComplete?: boolean;
};

export type PropertyDocumentCategory =
  | "receipt"
  | "warranty"
  | "manual"
  | "invoice"
  | "inspection"
  | "contractor"
  | "photo_before"
  | "photo_after"
  | "other";

export type PropertyDocument = {
  id: number;
  category: PropertyDocumentCategory | string;
  title?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  dataUrl: string;
  notes?: string | null;
  systemKey?: string | null;
  createdAt?: string;
};

export type HomeSystemRecord = {
  key: string;
  name: string;
  brand?: string;
  model?: string;
  installedYear?: string | number | null;
  warrantyUntil?: string | null;
  lastService?: string | null;
  notes?: string | null;
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
  country?: string | null;
  streetAddress?: string | null;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  homeSystems?: HomeSystemRecord[];
  documents?: PropertyDocument[];
  healthProfile?: PropertyHealthProfilePayload | null;
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
  processingCost?: number;
  quoteValidUntil?: string | null;
  customerLineItems?: Array<{ label: string; amount: number; visible?: boolean }>;
  couponCode?: string | null;
  serviceCharge?: number | null;
  expectedMarginPct?: number | null;
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
  diagnosing: "Site visit / diagnosing",
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

export async function updatePropertyHealth(propertyId: number, healthProfile: PropertyHealthProfilePayload) {
  return api<{ ok: boolean; property?: Property; message?: string }>(`/api/properties/${propertyId}/health`, {
    method: "PUT",
    body: JSON.stringify({ healthProfile }),
  });
}

export async function updateProperty(propertyId: number, body: Partial<Property> & { homeSystems?: HomeSystemRecord[] }) {
  return api<{ ok: boolean; property?: Property; message?: string }>(`/api/properties/${propertyId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function addPropertyDocument(
  propertyId: number,
  body: {
    category: string;
    title?: string;
    fileName?: string;
    mimeType?: string;
    dataUrl: string;
    notes?: string;
    systemKey?: string;
  }
) {
  return api<{ ok: boolean; document?: PropertyDocument; message?: string }>(
    `/api/properties/${propertyId}/documents`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function deletePropertyDocument(propertyId: number, docId: number) {
  return api<{ ok: boolean; message?: string }>(`/api/properties/${propertyId}/documents/${docId}`, {
    method: "DELETE",
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

export async function confirmCompletion(
  jobId: number,
  review?: { rating: number; review: string; location?: string; images?: string[] }
) {
  return api<{ ok: boolean; job?: ManagedJob }>(`/api/managed/jobs/${jobId}/confirm-completion`, {
    method: "POST",
    body: JSON.stringify(review || {}),
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


export async function startStripeOnboarding() {
  return connectPayoutAccount();
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

export async function adminInvite(
  jobId: number,
  contractorUserId: number,
  opts?: { message?: string; requestType?: "remote_quote" | "site_visit"; siteVisitWindow?: string },
) {
  return api<{ ok: boolean; message?: string; job?: ManagedJob }>(`/api/admin/managed/jobs/${jobId}/invite`, {
    method: "POST",
    body: JSON.stringify({
      contractorUserId,
      message: opts?.message,
      requestType: opts?.requestType,
      siteVisitWindow: opts?.siteVisitWindow,
    }),
  });
}

export async function adminQuoteBuilderPreview(
  jobId: number,
  bidId: number,
  body?: Record<string, unknown>,
) {
  if (body && Object.keys(body).length > 0) {
    return api<{
      ok: boolean;
      quotePreview?: Record<string, unknown>;
      aiEstimate?: { low: number | null; high: number | null; confidence: string };
      marketPosition?: string;
      message?: string;
    }>(`/api/admin/managed/jobs/${jobId}/quote-builder/preview`, {
      method: "POST",
      body: JSON.stringify({ bidId, ...body }),
    });
  }
  return api<{
    ok: boolean;
    quotePreview?: Record<string, unknown>;
    aiEstimate?: { low: number | null; high: number | null; confidence: string };
    marketPosition?: string;
    message?: string;
  }>(`/api/admin/managed/jobs/${jobId}/quote-builder?bidId=${bidId}`);
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

export async function adminApplyJobDiscount(jobId: number, code: string) {
  return api<{
    ok: boolean;
    job?: ManagedJob;
    discount?: { code: string; summary?: string };
    message?: string;
  }>(`/api/admin/managed/jobs/${jobId}/apply-discount`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function adminPayout(jobId: number, amount?: number) {
  return adminPayoutV2(jobId, amount);
}

export async function adminPayoutV2(
  jobId: number,
  amount?: number,
  extras?: { adjustmentsCents?: number; note?: string }
) {
  return api<{
    ok: boolean;
    job?: { id: number; status: string };
    amount?: number;
    simulated?: boolean;
    message?: string;
    payout?: ContractorPayout;
  }>(`/api/admin/managed/jobs/${jobId}/payout-v2`, {
    method: "POST",
    body: JSON.stringify({
      ...(amount != null ? { amount } : {}),
      ...(extras?.adjustmentsCents != null ? { adjustmentsCents: extras.adjustmentsCents } : {}),
      ...(extras?.note ? { note: extras.note } : {}),
    }),
  });
}

export async function adminGetPayoutForJob(jobId: number) {
  return api<{ ok: boolean; payout: ContractorPayout | null }>(`/api/admin/payouts/job/${jobId}`);
}

export type HomeownerInvoicePreview = {
  invoiceNumber: string;
  jobId: number;
  bookingId: string;
  issuedAt: string;
  billTo: { name: string; email?: string | null; phone?: string | null; address?: string | null };
  jobTitle?: string;
  lineItems: Array<{ label: string; amount: number; note?: string }>;
  subtotal: number;
  paid: number;
  amountDue: number;
};

export async function adminGetJobInvoice(jobId: number, note?: string) {
  const q = note ? `?note=${encodeURIComponent(note)}` : "";
  return api<{ ok: boolean; invoice?: HomeownerInvoicePreview; html?: string; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/invoice${q}`
  );
}

export async function adminSendJobInvoice(
  jobId: number,
  opts: { sendEmail?: boolean; sendSms?: boolean; email?: string; phone?: string; note?: string }
) {
  return api<{ ok: boolean; invoice?: HomeownerInvoicePreview; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/invoice/send`,
    { method: "POST", body: JSON.stringify(opts) }
  );
}

export async function adminHomeownerJobs(userId: number) {
  return api<{ ok: boolean; jobs: ManagedJob[] }>(`/api/admin/homeowners/${userId}/jobs`);
}

export async function adminHomeownerInvoices(userId: number) {
  return api<{
    ok: boolean;
    invoices: Array<{
      id: number;
      invoiceNumber: string;
      jobId: number;
      amountDue: number;
      sentVia: { email?: { to: string; simulated?: boolean } | null; sms?: { to: string; simulated?: boolean } | null };
      createdAt: string;
    }>;
  }>(`/api/admin/homeowners/${userId}/invoices`);
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

export function formatCents(cents?: number | null) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

export type ContractorPayout = {
  id: number;
  contractorId: number;
  jobId: number;
  jobRef: string;
  customerLabel: string | null;
  completionDate: string | null;
  grossAmountCents: number;
  platformFeeCents: number;
  instantPayoutFeeCents: number;
  adjustmentsCents: number;
  netAmountCents: number;
  reserveAmountCents: number;
  payoutMethod: string;
  status: string;
  statusLabel: string;
  stripeTransferId: string | null;
  stripePayoutId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  estimatedPayoutAt: string | null;
  failureReason: string | null;
  createdAt: string;
  contractorName?: string;
};

export type PayoutSummary = {
  availableBalanceCents: number;
  pendingBalanceCents: number;
  totalEarningsCents: number;
  paidThisMonthCents: number;
};

export type PayoutBankAccount = {
  id: string;
  objectType: string;
  bankName: string;
  last4: string;
  currency: string;
  defaultForCurrency: boolean;
  status: string;
  routingLast4?: string | null;
};

export type PayoutAccount = {
  connected: boolean;
  stripeAccountId: string | null;
  onboardingStatus: string;
  payoutsEnabled: boolean;
  bankAccountStatus: string;
  instantPayoutsEligible: boolean;
  verificationStatus: string;
  requirementsDue?: string[];
  defaultDestination?: PayoutBankAccount | null;
  bankAccounts?: PayoutBankAccount[];
  readyToReceivePayouts?: boolean;
  simulated?: boolean;
};

export type PayoutSettings = {
  instantPayoutEnabled: boolean;
  instantFeeType: string;
  instantFeePercentageBps: number;
  instantFeePercentage: number;
  instantFeeFixedCents: number;
  minimumInstantFeeCents: number;
  maximumInstantFeeCents: number;
  minimumInstantPayoutCents: number;
  maximumInstantPayoutCents: number;
  contractorAbsorbsFee: boolean;
  fixbridgeAbsorbsFee: boolean;
};

export async function listContractorPayouts() {
  return api<{ ok: boolean; payouts: ContractorPayout[] }>("/api/contractor/payouts");
}

export async function getContractorPayoutSummary() {
  return api<{ ok: boolean; summary: PayoutSummary }>("/api/contractor/payouts/summary");
}

export async function getContractorPayoutForJob(jobId: number) {
  return api<{ ok: boolean; payout: ContractorPayout | null }>(`/api/contractor/payouts/job/${jobId}`);
}

export async function getContractorPayoutAccount() {
  return api<{ ok: boolean; account: PayoutAccount }>("/api/contractor/payout-account");
}

export async function refreshPayoutAccount() {
  return api<{ ok: boolean; account: PayoutAccount }>("/api/contractor/payout-account/refresh", {
    method: "POST",
    body: "{}",
  });
}

export async function connectPayoutAccount() {
  return api<{ ok: boolean; simulated?: boolean; url?: string; accountId?: string; account?: PayoutAccount }>(
    "/api/contractor/payout-account/connect",
    { method: "POST", body: "{}" }
  );
}

export async function addPayoutBankAccount() {
  return api<{ ok: boolean; simulated?: boolean; url?: string; message?: string; account?: PayoutAccount }>(
    "/api/contractor/payout-account/add-bank",
    { method: "POST", body: "{}" }
  );
}

export async function managePayoutAccount() {
  return api<{ ok: boolean; simulated?: boolean; url?: string; message?: string; account?: PayoutAccount }>(
    "/api/contractor/payout-account/manage",
    { method: "POST", body: "{}" }
  );
}

export async function previewInstantPayout(payoutId: number) {
  return api<{
    ok: boolean;
    availableCents: number;
    instantFeeCents: number;
    youReceiveCents: number;
    formatted: { available: string; instantFee: string; youReceive: string };
  }>(`/api/contractor/payouts/${payoutId}/preview-instant`, { method: "POST", body: "{}" });
}

export async function requestInstantPayout(payoutId: number) {
  return api<{ ok: boolean; payout: ContractorPayout; instantFeeCents: number; netPayoutCents: number }>(
    `/api/contractor/payouts/${payoutId}/instant`,
    { method: "POST", body: "{}" }
  );
}

export async function adminPayoutsSummary() {
  return api<{
    ok: boolean;
    summary: {
      pendingApproval: { count: number; totalCents: number };
      approved: { count: number; totalCents: number };
      processing: { count: number; totalCents: number };
      paidThisMonth: number;
      failed: { count: number; totalCents: number };
    };
  }>("/api/admin/payouts/summary");
}

export async function adminListPayouts(status?: string) {
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return api<{ ok: boolean; payouts: ContractorPayout[] }>(`/api/admin/payouts${q}`);
}

export async function adminApprovePayout(payoutId: number, adjustmentsCents?: number, note?: string) {
  return api<{ ok: boolean; payout: ContractorPayout; message?: string }>(
    `/api/admin/payouts/${payoutId}/approve`,
    { method: "POST", body: JSON.stringify({ adjustmentsCents, note }) }
  );
}

export async function adminAdjustPayout(payoutId: number, adjustmentsCents: number, reason?: string) {
  return api<{ ok: boolean; payout: ContractorPayout }>(`/api/admin/payouts/${payoutId}/adjust`, {
    method: "POST",
    body: JSON.stringify({ adjustmentsCents, reason }),
  });
}

export async function adminGetPayoutSettings() {
  return api<{ ok: boolean; settings: PayoutSettings }>("/api/admin/payout-settings");
}

export async function adminUpdatePayoutSettings(settings: Partial<PayoutSettings>) {
  return api<{ ok: boolean; settings: PayoutSettings }>("/api/admin/payout-settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function retailRangeLabel(job: ManagedJob) {
  if (job.showRetailPrice === false) return "On-site assessment required before pricing";
  if (job.customerRetailEstimateLow != null && job.customerRetailEstimateHigh != null) {
    return `${formatMoney(job.customerRetailEstimateLow)}–${formatMoney(job.customerRetailEstimateHigh)}`;
  }
  return "Pending estimate";
}

export { brand };
