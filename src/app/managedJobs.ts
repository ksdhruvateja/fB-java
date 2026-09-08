import { getStoredToken } from "./auth";
import { brand } from "../config/brand";
import { emitFeatureDisabled, emitProSubscriptionRequired, parseEntitlementDeniedResponse } from "./proFeatureEvents";
import {
  ASSESSMENT_UNAVAILABLE_CODE,
  assessmentUnavailableMessage,
  sanitizeApiErrorMessage,
} from "./apiErrors";


export type CheckoutBreakdown = {
  customerId?: number | null;
  propertyId?: number | null;
  serviceRequestId?: number;
  bookingId?: string;
  serviceTitle?: string;
  serviceCategory?: string | null;
  serviceAmount?: number | null;
  serviceAmountLow?: number | null;
  serviceAmountHigh?: number | null;
  serviceFee: number;
  couponId?: number | null;
  couponCode?: string | null;
  couponLabel?: string | null;
  couponDiscount: number;
  finalAmount: number;
  pricingVersion?: string;
  preferredDate?: string | null;
  preferredTimeSlot?: string | null;
  serviceTiming?: string | null;
  address?: string | null;
  createdAt?: string;
  lines?: Array<{
    key: string;
    label: string;
    amount_cents: number;
    line_type: 'charge' | 'discount';
  }>;
  authorizedNowCents?: number;
  authorizedNow?: number;
  repairWorkIncluded?: boolean;
  repairWorkNote?: string;
};

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
  service_type?: string;
  service_subcategory?: string;
  problem_classification?: string;
  questions_needed: string[];
  diy_difficulty?: string;
  tools_required?: string[];
  materials_needed?: string[];
  diy_steps?: string[];
  diy_guide_steps?: Array<{
    step_number: number;
    title: string;
    instruction: string;
    explanation: string;
    tools: string[];
    safety_note: string;
    expected_result: string;
    if_not: string;
    image_needed: boolean;
    image_prompt: string;
  }>;
  stop_conditions?: string[];
  disclaimer?: string;
};

export type ManagedJob = {
  id: number;
  bookingId?: string | null;
  jobMode?: string;
  status: ManagedJobStatus | string;
  category?: string;
  serviceSubcategory?: string | null;
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
  priorityTier?: string | null;
  aiAssessment?: StructuredAssessment | null;
  assessmentStatus?: "pending" | "processing" | "ready" | "failed" | null;
  assessmentErrorCode?: string | null;
  showRetailPrice?: boolean;
  customerRetailEstimateLow?: number | null;
  customerRetailEstimateHigh?: number | null;
  estimatedContractorNetLow?: number | null;
  estimatedContractorNetHigh?: number | null;
  pricingDisclaimer?: string;
  estimateContext?: string | null;
  estimateConfidence?: string | null;
  preferredTimeNote?: string;
  assignedContractorUserId?: number | null;
  contractorName?: string | null;
  preferredContractorUserId?: number | null;
  preferredByHomeowner?: boolean;
  sourceRecurringServiceId?: number | null;
  homeownerUserId?: number | null;
  technician?: {
    id: number;
    name?: string | null;
    company?: string | null;
    phone?: string | null;
    email?: string | null;
    rating?: number | null;
    verified?: boolean;
    insured?: boolean;
    trade?: string | null;
    jobTitle?: string | null;
    photoUrl?: string | null;
    bio?: string | null;
  } | null;
  assignedEmployeeId?: number | null;
  homeownerStatusLabel?: string | null;
  activeProposalId?: number | null;
  completionReport?: Record<string, unknown> | null;
  customerConfirmedAt?: string | null;
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
  workQueueStatus?: string | null;
  serviceFeeAmount?: number | null;
  serviceAmount?: number | null;
  couponDiscountAmount?: number | null;
  finalCustomerAmount?: number | null;
  paymentCompletedAt?: string | null;
  checkoutSnapshot?: CheckoutBreakdown | null;
  visitFeeCaptured?: boolean;
  visitFeeAmount?: number | null;
  diyRiskLevel?: string;
  cancellationReason?: string | null;
  cancellationReasonCode?: string | null;
  cancellationDetails?: Record<string, unknown> | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
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
  homeUpdateState?: {
    dismissed?: Record<string, string>;
    snoozedUntil?: Record<string, string>;
    history?: Array<Record<string, unknown>>;
  };
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
  /** system = HVAC, roof, etc.; appliance = fridge, washer, etc. */
  category?: "system" | "appliance";
  brand?: string;
  model?: string;
  modelSource?: string;
  modelConfirmed?: boolean;
  serialNumber?: string;
  serialSource?: string;
  serialConfirmed?: boolean;
  installedYear?: string | number | null;
  installationDate?: string | null;
  manufactureDate?: string | null;
  approximateAge?: string | null;
  location?: string | null;
  filterSize?: string | null;
  warrantyUntil?: string | null;
  lastService?: string | null;
  lastInspection?: string | null;
  notes?: string | null;
  /** Structured follow-up from an inspection or AI document extract (homeowner-confirmed). */
  followUpRecommendation?: string | null;
  followUpDueDate?: string | null;
};

export type Property = {
  id: number;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  postalCodePlus4?: string | null;
  addressVerified?: boolean;
  addressVerifiedAt?: string | null;
  addressVerificationProvider?: string | null;
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
  quoteNumber?: string;
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
  adminDiscount?: number | null;
  customerLineItems?: Array<{
    label?: string;
    name?: string;
    description?: string;
    qty?: number;
    unit?: string;
    unitPrice?: number;
    amount: number;
    visible?: boolean;
  }>;
  couponCode?: string | null;
  serviceCharge?: number | null;
  expectedMarginPct?: number | null;
  bookingId?: string | null;
  jobTitle?: string | null;
  jobCategory?: string | null;
  jobZip?: string | null;
  homeownerName?: string | null;
  homeownerEmail?: string | null;
  homeownerPhone?: string | null;
  contractorName?: string | null;
  aiEstimateLow?: number | null;
  aiEstimateHigh?: number | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  quoteOptionLabel?: string | null;
  quoteOptionTitle?: string | null;
  optionGroup?: string | null;
  optionSelectionStatus?: string | null;
  versionNumber?: number;
  createdByName?: string | null;
  createdById?: number | null;
  pricingAdjustments?: Array<Record<string, unknown>>;
  adminDiscountReason?: string | null;
  lineItems?: Array<{ label: string; amount: number; visible?: boolean }>;
  invoiceId?: number | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  invoiceAmountDue?: number | null;
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
  ai_review_complete: "Quote ready",
  awaiting_service_payment: "Awaiting payment",
  paid_for_dispatch: "Processing",
  awaiting_contractor: "Processing",
  contractor_invited: "Finding provider",
  contractor_accepted: "Provider assigned",
  awaiting_bid: "Getting quotes",
  diagnosing: "Site visit scheduled",
  bid_received: "Quote ready",
  proposal_sent: "Quote ready",
  awaiting_customer_approval: "Review quote",
  approved: "Scheduled",
  scheduled: "Scheduled",
  contractor_en_route: "Provider on the way",
  work_started: "In progress",
  change_order_pending: "Change order pending",
  work_completed: "Completed",
  customer_review_pending: "Confirm completion",
  admin_review_pending: "Processing",
  payout_pending: "Completed",
  paid_out: "Completed",
  closed: "Completed",
  canceled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
};

const inflightGets = new Map<string, Promise<unknown>>();

async function api<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const dedupeKey = method === "GET" ? path : "";
  if (dedupeKey && inflightGets.has(dedupeKey)) {
    return inflightGets.get(dedupeKey) as Promise<T>;
  }
  const run = apiRequest<T>(path, init);
  if (dedupeKey) {
    inflightGets.set(dedupeKey, run);
    void run.finally(() => {
      if (inflightGets.get(dedupeKey) === run) inflightGets.delete(dedupeKey);
    });
  }
  return run;
}

async function apiRequest<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = String(init?.method || "GET").toUpperCase();
  const timeoutMs = init?.timeoutMs ?? (method === "GET" ? 12000 : 45000);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  if (init?.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const { timeoutMs: _ignored, ...rest } = init || {};
    const res = await fetch(path, { ...rest, headers, signal: controller.signal });
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";
    let parsed: Record<string, unknown> | null = null;
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      const message = sanitizeApiErrorMessage(text, res.status);
      return {
        ok: false,
        code: ASSESSMENT_UNAVAILABLE_CODE,
        message,
        status: res.status,
      } as T;
    }
    if (!res.ok && typeof parsed.message === "string") {
      parsed.message = sanitizeApiErrorMessage(String(parsed.message), res.status);
    }
    if (!res.ok && !parsed.code && (res.status >= 500 || res.status === 504)) {
      parsed.code = ASSESSMENT_UNAVAILABLE_CODE;
      if (!parsed.message) parsed.message = assessmentUnavailableMessage();
    }
    const denied = parseEntitlementDeniedResponse(res.status, parsed);
    if (denied?.disabled) {
      emitFeatureDisabled(denied);
    } else if (denied) {
      emitProSubscriptionRequired(denied);
    }
    return parsed as T;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      code: ASSESSMENT_UNAVAILABLE_CODE,
      message: aborted
        ? "The request timed out. Please try again."
        : "Network error. Please check your connection and try again.",
    } as T;
  } finally {
    window.clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    { method: "POST", body: JSON.stringify(body), timeoutMs: 90000 }
  );
}

export async function getPropertyDocument(propertyId: number, docId: number) {
  return api<{ ok: boolean; document?: PropertyDocument; message?: string }>(
    `/api/properties/${propertyId}/documents/${docId}`,
    { timeoutMs: 60000 }
  );
}

export async function deletePropertyDocument(propertyId: number, docId: number) {
  return api<{ ok: boolean; message?: string }>(`/api/properties/${propertyId}/documents/${docId}`, {
    method: "DELETE",
  });
}

export type PropertyDocumentExtraction = {
  serviceType?: string | null;
  systemKey?: string | null;
  systemLabel?: string | null;
  date?: string | null;
  provider?: string | null;
  amount?: string | null;
  warrantyUntil?: string | null;
  installationDate?: string | null;
  inspectionFindings?: string[];
  recommendedFollowUp?: string | null;
  recommendedFollowUpDate?: string | null;
  confidence?: number;
  summary?: string | null;
};

export async function analyzePropertyDocument(propertyId: number, docId: number) {
  return api<{
    ok: boolean;
    extraction?: PropertyDocumentExtraction;
    source?: string;
    message?: string;
  }>(`/api/properties/${propertyId}/documents/${docId}/analyze`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function applyPropertyDocumentExtract(
  propertyId: number,
  docId: number,
  extraction: PropertyDocumentExtraction
) {
  return api<{ ok: boolean; property?: Property; message?: string }>(
    `/api/properties/${propertyId}/documents/${docId}/apply-extract`,
    {
      method: "POST",
      body: JSON.stringify({ extraction }),
    }
  );
}

export async function createManagedJob(body: Record<string, unknown>) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>("/api/managed/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function repeatManagedService(jobId: number, requestSameProvider = true) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(`/api/managed/jobs/${jobId}/repeat-service`, {
    method: "POST",
    body: JSON.stringify({ requestSameProvider }),
  });
}

export async function getManagedJobAssessmentStatus(jobId: number) {
  return api<{
    ok: boolean;
    status?: "pending" | "processing" | "ready" | "failed";
    assessmentStatus?: "pending" | "processing" | "ready" | "failed";
    job?: ManagedJob;
    pricing?: {
      showPrice?: boolean;
      message?: string | null;
      customerRetailEstimateLow?: number | null;
      customerRetailEstimateHigh?: number | null;
      disclaimer?: string;
    };
    errorCode?: string | null;
    code?: string;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/assessment-status`);
}

export async function startManagedJobAssessment(
  jobId: number,
  {
    force = false,
    aiAssessmentConsent,
  }: {
    force?: boolean;
    aiAssessmentConsent?: {
      assessmentInvocationId: string;
      consents: { AI_ASSESSMENT_ACK: true };
    };
  } = {}
) {
  const body: Record<string, unknown> = {};
  if (force) body.force = true;
  if (aiAssessmentConsent) {
    body.assessmentInvocationId = aiAssessmentConsent.assessmentInvocationId;
    body.consents = aiAssessmentConsent.consents;
  }
  return api<{
    ok: boolean;
    status?: "processing" | "ready";
    assessmentStatus?: "processing" | "ready";
    job?: ManagedJob;
    jobId?: number;
    code?: string;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/assess`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function assessManagedJob(
  jobId: number,
  {
    force = false,
    aiAssessmentConsent,
  }: {
    force?: boolean;
    aiAssessmentConsent?: {
      assessmentInvocationId: string;
      consents: { AI_ASSESSMENT_ACK: true };
    };
  } = {}
) {
  const started = await startManagedJobAssessment(jobId, { force, aiAssessmentConsent });
  if (!started.ok) {
    return {
      ok: false as const,
      code: started.code || ASSESSMENT_UNAVAILABLE_CODE,
      message: started.message || assessmentUnavailableMessage(),
    };
  }
  if (started.status === "ready" && started.job) {
    return {
      ok: true as const,
      job: started.job,
      assessment: started.job.aiAssessment,
      pricing: undefined,
      warning: null,
    };
  }

  const maxAttempts = 50;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(3000);
    const status = await getManagedJobAssessmentStatus(jobId);
    if (!status.ok) continue;
    if (status.status === "ready" && status.job) {
      return {
        ok: true as const,
        job: status.job,
        assessment: status.job.aiAssessment,
        pricing: status.pricing,
        warning: null,
      };
    }
    if (status.status === "failed") {
      return {
        ok: false as const,
        code: status.errorCode || status.code || ASSESSMENT_UNAVAILABLE_CODE,
        message: status.message || assessmentUnavailableMessage(),
      };
    }
  }

  return {
    ok: false as const,
    code: ASSESSMENT_UNAVAILABLE_CODE,
    message: assessmentUnavailableMessage(),
  };
}

export async function listMyManagedJobs() {
  return api<{ ok: boolean; jobs: ManagedJob[] }>("/api/managed/jobs/my");
}

export async function getManagedJob(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob }>("/api/managed/jobs/" + jobId);
}

export async function applyJobCoupon(jobId: number, code: string) {
  return api<{
    ok: boolean;
    discount?: {
      code: string;
      label?: string | null;
      discountType: "percent" | "amount";
      value: number;
      summary: string;
    };
    visitFeeOriginal?: number;
    visitFeeAfterDiscount?: number;
    discountAmount?: number;
    job?: ManagedJob;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/apply-coupon`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function clearJobCoupon(jobId: number) {
  return api<{
    ok: boolean;
    breakdown?: CheckoutBreakdown;
    job?: ManagedJob;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/clear-coupon`, {
    method: "POST",
    body: "{}",
  });
}

export async function prepareCheckout(
  jobId: number,
  body?: { discountCode?: string | null; clearCoupon?: boolean }
) {
  return api<{
    ok: boolean;
    snapshot?: CheckoutBreakdown;
    amount?: number;
    job?: ManagedJob;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/prepare-checkout`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}


export async function fetchDispatchPricing(jobId: number, discountCode?: string) {
  const q = discountCode ? `?discountCode=${encodeURIComponent(discountCode)}` : "";
  return api<{
    ok: boolean;
    breakdown?: CheckoutBreakdown;
    lines?: CheckoutBreakdown["lines"];
    authorizedNow?: number;
    authorizedNowCents?: number;
    repairWorkIncluded?: boolean;
    repairWorkNote?: string;
    message?: string;
  }>(`/api/managed/jobs/${jobId}/dispatch-pricing${q}`);
}


export async function requestProfessionalDispatch(
  jobId: number,
  body: {
    serviceTiming: string;
    preferredDate?: string;
    preferredTimeSlot: string;
    propertyPurpose: string;
    transactionStage: string;
    discountCode?: string;
    consents?: Record<string, boolean>;
    acknowledged?: boolean;
  }
) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/request-professional`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function updateHomeownerJob(
  jobId: number,
  body: {
    serviceTiming?: string;
    preferredDate?: string | null;
    preferredTimeSlot?: string;
    description?: string;
    contactPhone?: string;
    title?: string;
  }
) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/homeowner-update`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

export async function payDispatchFee(
  jobId: number,
  discountCode?: string,
  consents?: Record<string, boolean>
) {
  return api<{ ok: boolean; simulated?: boolean; url?: string; amount?: number; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/pay-dispatch`,
    {
      method: "POST",
      body: JSON.stringify(
        discountCode
          ? { discountCode, consents, acknowledged: true }
          : { consents, acknowledged: true }
      ),
    }
  );
}

export async function getProposal(jobId: number) {
  return api<{ ok: boolean; proposal: Proposal | null }>(`/api/managed/jobs/${jobId}/proposal`);
}

export async function approveProposal(jobId: number, consents?: Record<string, boolean>, proposalId?: number) {
  return api<{ ok: boolean; proposal?: Proposal; message?: string }>(
    `/api/managed/jobs/${jobId}/approve-proposal`,
    { method: "POST", body: JSON.stringify({ consents, acknowledged: true, proposalId }) }
  );
}

export async function payRetail(jobId: number, consents?: Record<string, boolean>) {
  return api<{ ok: boolean; simulated?: boolean; url?: string; amount?: number; job?: ManagedJob; message?: string }>(
    `/api/managed/jobs/${jobId}/pay-retail`,
    { method: "POST", body: JSON.stringify({ consents, acknowledged: true }) }
  );
}

export async function requestAdminDispatch(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/request-dispatch`,
    { method: "POST", body: "{}" }
  );
}

export async function confirmCompletion(
  jobId: number,
  review?: {
    rating: number;
    review?: string;
    location?: string;
    images?: string[];
    categories?: Record<string, number>;
  }
) {
  return api<{
    ok: boolean;
    job?: ManagedJob;
    review?: {
      id: number;
      rating: number;
      verified: boolean;
      verifiedFixBridgeJob: boolean;
      categories?: Record<string, number> | null;
    } | null;
  }>(`/api/managed/jobs/${jobId}/confirm-completion`, {
    method: "POST",
    body: JSON.stringify(review || {}),
  });
}

export async function listInvitations() {
  return api<{ ok: boolean; invitations: Array<Record<string, unknown>> }>("/api/contractor/invitations");
}

export type ContractorJobReview = {
  id: number;
  authorName: string;
  location: string | null;
  serviceType: string | null;
  rating: number;
  text: string;
  verified: boolean;
  verifiedFixBridgeJob?: boolean;
  categories?: Record<string, number> | null;
  createdAt: string | null;
  jobId: number | null;
  jobTitle: string | null;
  jobRef: string | null;
};

export async function getContractorPerformance() {
  return api<{
    ok: boolean;
    reviews?: ContractorJobReview[];
    stats?: {
      reviewCount: number;
      averageRating: number | null;
      categoryAverages?: Record<string, number | null> | null;
    };
    message?: string;
  }>("/api/contractor/performance");
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

export async function adminAssign(
  jobId: number,
  contractorUserId: number,
  options?: { employeeId?: number | null; clearEmployee?: boolean }
) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(`/api/admin/managed/jobs/${jobId}/assign`, {
    method: "POST",
    body: JSON.stringify({
      contractorUserId,
      employeeId: options?.employeeId,
      clearEmployee: options?.clearEmployee,
    }),
  });
}

export type ContractorEmployee = {
  id: number;
  contractorUserId: number;
  fullName: string;
  jobTitle?: string | null;
  bio?: string | null;
  trade?: string | null;
  yearsExperience?: number | null;
  employeeRef?: string | null;
  customerDescription?: string | null;
  internalNotes?: string | null;
  active: boolean;
  phones: { value: string; label?: string | null; customerVisible?: boolean; isPrimary?: boolean }[];
  emails: { value: string; label?: string | null; customerVisible?: boolean; isPrimary?: boolean }[];
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  hasPhoto?: boolean;
  photoUrl?: string | null;
};

export async function fetchContractorEmployees() {
  return api<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }>("/api/contractor/employees");
}

export async function saveContractorEmployee(body: Record<string, unknown>, id?: number) {
  const path = id ? `/api/contractor/employees/${id}` : "/api/contractor/employees";
  return api<{ ok: boolean; employee?: ContractorEmployee; message?: string }>(path, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchAdminContractorEmployees(contractorId: number) {
  return api<{ ok: boolean; employees?: ContractorEmployee[]; message?: string }>(
    `/api/admin/contractors/${contractorId}/employees`
  );
}

export async function assignJobTechnician(jobId: number, employeeId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/contractor/managed/jobs/${jobId}/assign-technician`,
    { method: "POST", body: JSON.stringify({ employeeId }) }
  );
}

export async function contractorMarkTravel(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/contractor/managed/jobs/${jobId}/mark-travel`,
    { method: "POST", body: "{}" }
  );
}

export async function contractorMarkArrived(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/contractor/managed/jobs/${jobId}/mark-arrived`,
    { method: "POST", body: "{}" }
  );
}

export async function contractorMarkStarted(jobId: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/contractor/managed/jobs/${jobId}/mark-started`,
    { method: "POST", body: "{}" }
  );
}

export async function adminMarkJobDispatched(jobId: number, employeeId?: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/mark-dispatched`,
    { method: "POST", body: JSON.stringify({ employeeId }) }
  );
}

export async function adminMarkJobStarted(jobId: number, employeeId?: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/mark-started`,
    { method: "POST", body: JSON.stringify({ employeeId }) }
  );
}

export async function adminMarkJobCompleted(jobId: number, employeeId?: number) {
  return api<{ ok: boolean; job?: ManagedJob; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/mark-completed`,
    { method: "POST", body: JSON.stringify({ employeeId }) }
  );
}

export async function fetchJobTimeline(jobId: number) {
  return api<{
    ok: boolean;
    timeline?: { kind: string; at: string; label: string; eventType?: string }[];
    message?: string;
  }>(`/api/managed/jobs/${jobId}/timeline`);
}

export async function adminCreateProposal(jobId: number, bidId: number, extras?: Record<string, unknown>) {
  return api<{ ok: boolean; proposal?: Proposal; message?: string }>(
    `/api/admin/managed/jobs/${jobId}/proposal`,
    { method: "POST", body: JSON.stringify({ bidId, ...extras }) }
  );
}

export async function adminQuoteWorkspace(id: number | string) {
  return api<{
    ok: boolean;
    quote?: import("./quoteDocument").QuoteDocument;
    invoice?: import("./quoteDocument").QuoteInvoice | null;
    activity?: import("./quoteDocument").QuoteActivity[];
    revisionHistory?: {
      versionNumber: number;
      changeReason?: string | null;
      customerTotal?: number | null;
      contractorAmount?: number | null;
      createdAt?: string;
    }[];
    previousRevision?: {
      versionNumber: number;
      changeReason?: string | null;
      customerTotal?: number | null;
      contractorAmount?: number | null;
      snapshot?: Record<string, unknown>;
    } | null;
    jobQuoteHistory?: {
      id: number;
      quoteNumber?: string;
      status: string;
      versionNumber: number;
      total: number;
      createdAt?: string;
      publishedAt?: string;
      supersededAt?: string | null;
    }[];
    message?: string;
  }>(`/api/admin/quotes/${id}/workspace`);
}

export async function adminGetInvoice(id: number | string) {
  return api<{
    ok: boolean;
    invoice?: import("./quoteDocument").QuoteInvoice;
    message?: string;
  }>(`/api/admin/invoices/${id}`);
}

export async function adminSaveQuoteDocument(id: number, body: Record<string, unknown>) {
  return api<{ ok: boolean; quote?: import("./quoteDocument").QuoteDocument; message?: string }>(
    `/api/admin/quotes/${id}/document`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

export async function adminSendQuote(
  id: number,
  body: {
    sendEmail?: boolean;
    sendSms?: boolean;
    email?: string;
    phone?: string;
    subject?: string;
    message?: string;
  }
) {
  return api<{ ok: boolean; quote?: import("./quoteDocument").QuoteDocument; message?: string }>(
    `/api/admin/quotes/${id}/send`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function adminDuplicateQuote(
  id: number,
  body: { asOption?: boolean; quoteOptionLabel?: string; quoteOptionTitle?: string } = {},
) {
  return api<{ ok: boolean; quote?: import("./quoteDocument").QuoteDocument; message?: string }>(
    `/api/admin/quotes/${id}/duplicate`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function adminJobQuoteOptions(jobId: number) {
  return api<{
    ok: boolean;
    options?: Array<
      import("./quoteDocument").QuoteDocument & {
        customerTotal?: number;
        contractorAmount?: number;
        margin?: number;
        letter?: string | null;
        customerTitle?: string | null;
        historical?: boolean;
      }
    >;
    groupId?: string | null;
    message?: string;
  }>(`/api/admin/jobs/${jobId}/quote-options`);
}

export async function adminSendQuoteOptionGroup(
  id: number,
  body: { sendEmail?: boolean; email?: string; subject?: string; message?: string } = {},
) {
  return api<{ ok: boolean; sent?: number; quote?: import("./quoteDocument").QuoteDocument; message?: string }>(
    `/api/admin/quotes/${id}/send-option-group`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function adminRemoveDraftQuoteOption(id: number) {
  return api<{ ok: boolean; message?: string }>(`/api/admin/quotes/${id}/remove-draft-option`, {
    method: "POST",
    body: "{}",
  });
}

export async function adminCancelQuote(id: number, reason?: string) {
  return api<{ ok: boolean; quote?: import("./quoteDocument").QuoteDocument; message?: string }>(
    `/api/admin/quotes/${id}/cancel`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export async function adminConvertQuoteToInvoice(id: number) {
  return api<{
    ok: boolean;
    quote?: import("./quoteDocument").QuoteDocument;
    invoice?: import("./quoteDocument").QuoteInvoice;
    message?: string;
  }>(`/api/admin/quotes/${id}/convert-invoice`, { method: "POST", body: JSON.stringify({}) });
}

export async function adminSendWorkspaceInvoice(
  id: number,
  opts: { sendEmail?: boolean; sendSms?: boolean; email?: string; phone?: string }
) {
  return api<{ ok: boolean; invoice?: import("./quoteDocument").QuoteInvoice; message?: string }>(
    `/api/admin/invoices/${id}/send`,
    { method: "POST", body: JSON.stringify(opts) }
  );
}

export async function adminMarkInvoicePaid(
  id: number,
  body: {
    amountReceived?: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
    paymentDate?: string;
  }
) {
  return api<{ ok: boolean; invoice?: import("./quoteDocument").QuoteInvoice; message?: string }>(
    `/api/admin/invoices/${id}/mark-paid`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function adminCreateInvoicePaymentLink(id: number, force?: boolean) {
  return api<{
    ok: boolean;
    paymentLink?: string;
    invoice?: import("./quoteDocument").QuoteInvoice;
    message?: string;
  }>(`/api/admin/invoices/${id}/payment-link`, {
    method: "POST",
    body: JSON.stringify({ force: force === true }),
  });
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

export async function homeownerInvoiceCheckout(invoiceId: number, tipAmount = 0) {
  return api<{
    ok: boolean;
    checkoutUrl?: string;
    summary?: { serviceTotal: number; tipAmount: number; customerTotal: number };
    message?: string;
  }>(`/api/homeowner/invoices/${invoiceId}/checkout`, {
    method: "POST",
    body: JSON.stringify({ tipAmount }),
  });
}

export async function homeownerGetInvoice(invoiceId: number) {
  return api<{ ok: boolean; invoice?: import("./quoteDocument").QuoteInvoice; message?: string }>(
    `/api/homeowner/invoices/${invoiceId}`
  );
}

/** Authoritative invoice settlement poll — do not trust Stripe return URL alone. */
export async function homeownerInvoicePaymentStatus(invoiceNumber: string) {
  return api<{
    ok: boolean;
    paid?: boolean;
    status?: string;
    invoiceNumber?: string;
    amountPaid?: number;
    total?: number;
    jobId?: number;
    message?: string;
  }>(`/api/homeowner/invoices/by-number/${encodeURIComponent(invoiceNumber)}/payment-status`);
}

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

export async function adminOrderLedger(q = "") {
  const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return api<{
    ok: boolean;
    summary?: {
      totalIncoming: number;
      totalPending: number;
      totalPaidOut: number;
      totalQuotedProfit: number;
      netPosition: number;
      orderCount: number;
      ledgerEventCount: number;
    };
    orders?: Array<Record<string, unknown>>;
    ledger?: Array<Record<string, unknown>>;
    message?: string;
  }>(`/api/admin/order-ledger${params}`);
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
  notes?: string | null;
  discountType: string;
  value: number;
  active: boolean;
  maxUses?: number | null;
  usesCount: number;
  perUserLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

export async function adminDiscounts() {
  return api<{ ok: boolean; discounts: AdminDiscount[] }>("/api/admin/discounts");
}

export async function adminCreateDiscount(body: {
  code: string;
  label?: string;
  notes?: string;
  discountType: "percent" | "amount";
  value: number;
  maxUses?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
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

export async function adminDeleteDiscount(id: number) {
  return api<{ ok: boolean; archived?: boolean; message?: string }>(`/api/admin/discounts/${id}`, {
    method: "DELETE",
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
      notes?: string | null;
      active?: boolean;
      created_at?: string;
      createdAt?: string;
      intakeUrl?: string;
    }>;
  }>("/api/admin/partners");
}

export async function adminCreatePartner(body: Record<string, unknown>) {
  return api<{
    ok: boolean;
    message?: string;
    partner?: { id: number; code: string; name: string; email?: string; active?: boolean; intakeUrl?: string };
  }>("/api/admin/partners", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adminUpdatePartner(id: number, body: { active: boolean }) {
  return api<{ ok: boolean; active?: boolean; message?: string }>(`/api/admin/partners/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function adminDeletePartner(id: number) {
  return api<{ ok: boolean; archived?: boolean; message?: string }>(`/api/admin/partners/${id}`, {
    method: "DELETE",
  });
}

export async function adminSetCompliance(userId: number, complianceStatus: string) {
  return api<{ ok: boolean }>(`/api/admin/contractors/${userId}/compliance`, {
    method: "PUT",
    body: JSON.stringify({ complianceStatus }),
  });
}

export async function adminRequestContractorInfo(
  userId: number,
  body: { items?: string[]; message?: string }
) {
  return api<{ ok: boolean; message?: string; simulated?: boolean }>(
    `/api/admin/contractors/${userId}/request-info`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function adminUpdateContractorProfile(userId: number, fields: Record<string, unknown>) {
  return api<{ ok: boolean; user?: AuthUserLike; message?: string }>(
    `/api/admin/contractors/${userId}/profile`,
    {
      method: "PUT",
      body: JSON.stringify(fields),
    }
  );
}

type AuthUserLike = {
  id?: number;
  name?: string;
  email?: string;
  [key: string]: unknown;
};

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

export type PayoutEconomics = {
  homeowner: {
    contractProposalCents: number | null;
    approvedChangeOrdersCents: number;
    visitFeesCents: number;
    refundsCents: number;
    totalChargedCents: number;
    totalReceivedCents: number | null;
  };
  paymentCosts: {
    stripeProcessingFeeCents: number | null;
    stripeProcessingFeeStatus: 'known' | 'pending' | 'not_applicable';
  };
  contractor: {
    originalAgreedAmountCents: number | null;
    adminAdjustmentCents: number;
    contractorPayableCents: number | null;
    payoutMethod: string;
    instantPayoutFeeCents: number | null;
    contractorGrossPayoutCents: number | null;
    contractorNetPayoutCents: number | null;
  };
  fixbridge: {
    grossMarginCents: number | null;
    stripeProcessingFeeCents: number | null;
    instantPayoutFeeCents: number | null;
    fixbridgeNetCents: number | null;
  };
  refundReconciliations: Array<{
    id: number;
    refundAmountCents: number;
    platformExposureCents: number;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  ledgerEventCount: number;
};

export type ConnectAccountStatus = {
  connected: boolean;
  accountId: string | null;
  onboardingComplete: boolean;
  transfersEligible: boolean;
  payoutsEnabled: boolean;
  blockedReason: string | null;
  currentlyDue: string[];
  pastDue: string[];
};

export type PayoutAuditLog = {
  id: number;
  payoutId: number;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  performedBy: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

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
  economics?: PayoutEconomics;
  connectStatus?: ConnectAccountStatus | null;
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
  connectStatus?: ConnectAccountStatus | null;
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

export async function adminGetPayoutDetail(payoutId: number) {
  return api<{ ok: boolean; payout: ContractorPayout; auditLogs: PayoutAuditLog[] }>(
    `/api/admin/payouts/${payoutId}`
  );
}

export async function adminGetPayoutSettings() {
  return api<{ ok: boolean; settings: PayoutSettings }>("/api/admin/payout-settings");
}

export async function adminUpdatePayoutSettings(settings: Partial<PayoutSettings>) {
  return api<{ ok: boolean; settings: PayoutSettings; message?: string }>("/api/admin/payout-settings", {
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
