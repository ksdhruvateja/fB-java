/**
 * Client helpers for platform expansion APIs.
 */
import { getStoredToken } from "./auth";
import { PAID_HOME_CARE_PLAN_CODE } from "./subscriptionCatalog";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
      return { ok: false, message: text || res.statusText } as T;
    }
  } catch {
    return { ok: false, message: "Network error." } as T;
  }
}

export async function platformStatus() {
  return api<{ ok: boolean; stripe?: boolean; gmail?: boolean; note?: string }>(
    "/api/platform/status"
  );
}

export async function listPlans() {
  return api<{ ok: boolean; plans: Array<{ code: string; label: string; amount: number; family: string }> }>(
    "/api/platform/plans"
  );
}

export async function startSubscription(planCode: string, jobId?: number, returnTo?: string) {
  return api<{
    ok: boolean;
    url?: string;
    simulated?: boolean;
    message?: string;
    code?: string;
    alreadySubscribed?: boolean;
    plan?: string;
    status?: string;
    subscription?: unknown;
  }>(
    "/api/subscriptions/checkout",
    { method: "POST", body: JSON.stringify({ planCode, jobId, returnTo }) }
  );
}

export async function cancelHomeCareSubscription() {
  return api<{ ok: boolean; message?: string; subscription?: unknown }>("/api/subscriptions/cancel", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resumeHomeCareSubscription() {
  return api<{ ok: boolean; message?: string; subscription?: unknown }>("/api/subscriptions/resume", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function openHomeCareBillingPortal() {
  return api<{ ok: boolean; url?: string; message?: string }>("/api/subscriptions/billing-portal", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function guestSubscriptionCheckout(body: {
  planCode: string;
  email: string;
  name?: string;
  password?: string;
}) {
  return api<{
    ok: boolean;
    url?: string;
    simulated?: boolean;
    message?: string;
    token?: string;
    user?: import("./auth").AuthUser;
    subscription?: unknown;
  }>("/api/subscriptions/guest-checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function mySubscriptions() {
  return api<{ ok: boolean; subscriptions: unknown[] }>("/api/subscriptions/mine");
}

export async function unlockDirectLead(jobId: number, amount = 65) {
  return api<{
    ok: boolean;
    url?: string;
    simulated?: boolean;
    contact?: { fullAddress?: string; contactName?: string; contactPhone?: string };
    message?: string;
  }>(`/api/direct/jobs/${jobId}/unlock`, { method: "POST", body: JSON.stringify({ amount }) });
}

export async function setJobMode(jobId: number, jobMode: "managed" | "direct") {
  return api<{ ok: boolean; jobMode?: string }>(`/api/admin/managed/jobs/${jobId}/mode`, {
    method: "PUT",
    body: JSON.stringify({ jobMode }),
  });
}

export async function createChangeOrder(jobId: number, body: { description: string; contractorNet: number; mediaDataUrl?: string }) {
  return api<{ ok: boolean; changeOrder?: unknown; message?: string }>(
    `/api/managed/jobs/${jobId}/change-orders`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export async function priceChangeOrder(id: number, retailAmount?: number) {
  return api<{ ok: boolean; changeOrder?: unknown }>(`/api/admin/change-orders/${id}/price`, {
    method: "POST",
    body: JSON.stringify(retailAmount != null ? { retailAmount } : {}),
  });
}

export async function approveChangeOrder(jobId: number, coId: number) {
  return api<{ ok: boolean }>(`/api/managed/jobs/${jobId}/change-orders/${coId}/approve`, {
    method: "POST",
    body: "{}",
  });
}

export async function listChangeOrders(jobId: number) {
  return api<{ ok: boolean; changeOrders: unknown[] }>(`/api/managed/jobs/${jobId}/change-orders`);
}

export async function refundPayment(paymentId: number, amount?: number, reason?: string) {
  return api<{ ok: boolean; refund?: unknown; message?: string }>(
    `/api/admin/payments/${paymentId}/refund`,
    { method: "POST", body: JSON.stringify({ amount, reason }) }
  );
}

export async function holdTransfer(id: number, reason?: string) {
  return api<{ ok: boolean }>(`/api/admin/transfers/${id}/hold`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function releaseTransfer(id: number, amount?: number) {
  return api<{ ok: boolean }>(`/api/admin/transfers/${id}/release`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function reverseTransfer(id: number) {
  return api<{ ok: boolean }>(`/api/admin/transfers/${id}/reverse`, {
    method: "POST",
    body: "{}",
  });
}

export async function matchContractors(jobId: number) {
  return api<{ ok: boolean; coverageState?: string; matches?: Array<{ id: number; name: string; trade?: string }> }>(
    `/api/admin/managed/jobs/${jobId}/match`,
    { method: "POST", body: "{}" }
  );
}

export async function listOverdueOps() {
  return api<{ ok: boolean; overdue: unknown[] }>("/api/admin/ops/overdue");
}

export async function listParts(q?: string) {
  return api<{ ok: boolean; parts: unknown[] }>(`/api/parts${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}

export async function saveDiyProject(body: { title?: string; jobId?: number; plan: Record<string, unknown> }) {
  return api<{ ok: boolean; project?: unknown }>("/api/diy/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listDiyProjects() {
  return api<{ ok: boolean; projects: unknown[] }>("/api/diy/projects");
}

export async function opportunityBudgets(propertyId: number) {
  return api<{
    ok: boolean;
    budgets?: {
      essential: { label: string; amount: number };
      moveIn: { label: string; amount: number };
      resale: { label: string; amount: number };
    };
  }>(`/api/properties/${propertyId}/opportunity-budgets`);
}

export async function convertInspection(reportText: string) {
  return api<{ ok: boolean; items?: Array<{ finding: string; urgency: string; trade: string }>; message?: string }>(
    "/api/inspections/convert",
    { method: "POST", body: JSON.stringify({ reportText }) }
  );
}

export async function placesAutocomplete(input: string, opts?: { public?: boolean }) {
  const base = opts?.public ? "/api/public/places/autocomplete" : "/api/places/autocomplete";
  return api<{ ok: boolean; predictions?: Array<{ description: string; place_id?: string }>; simulated?: boolean }>(
    `${base}?input=${encodeURIComponent(input)}`
  );
}

export async function reverseGeocode(address?: string, lat?: number, lng?: number, opts?: { public?: boolean }) {
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (lat != null) params.set("lat", String(lat));
  if (lng != null) params.set("lng", String(lng));
  const base = opts?.public ? "/api/public/places/reverse-geocode" : "/api/places/reverse-geocode";
  return api<{
    ok: boolean;
    simulated?: boolean;
    lat?: number | null;
    lng?: number | null;
    zip?: string | null;
    city?: string | null;
    state?: string | null;
    county?: string | null;
    streetAddress?: string | null;
    formattedAddress?: string | null;
    message?: string;
  }>(`${base}?${params.toString()}`);
}

export async function scanZipsInRadius(lat: number, lng: number, radiusMiles: number) {
  return api<{ ok: boolean; simulated?: boolean; zips?: string[]; message?: string }>("/api/places/scan-zips", {
    method: "POST",
    body: JSON.stringify({ lat, lng, radiusMiles }),
  });
}

export async function startAdminMfa() {
  return api<{ ok: boolean; demoCode?: string; fallbackCode?: string; emailDelivered?: boolean; emailConfigured?: boolean }>("/api/auth/mfa/start", { method: "POST", body: "{}" });
}

export async function verifyAdminMfa(code: string) {
  return api<{ ok: boolean; verified?: boolean; token?: string; user?: import("./auth").AuthUser }>(
    "/api/auth/mfa/verify",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    }
  );
}

export async function uploadMedia(dataUrl: string, kind?: string, jobId?: number) {
  return api<{ ok: boolean; signedUrl?: string; media?: { id: number } }>("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({ dataUrl, kind, jobId }),
  });
}

export async function setPaymentSchedule(
  jobId: number,
  items: Array<{ label: string; amount: number; dueAt?: string }>
) {
  return api<{ ok: boolean }>(`/api/admin/managed/jobs/${jobId}/payment-schedule`, {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export async function setCommercialLimits(jobId: number, nteLimit?: number, slaHours?: number) {
  return api<{ ok: boolean }>(`/api/admin/managed/jobs/${jobId}/commercial`, {
    method: "PUT",
    body: JSON.stringify({ nteLimit, slaHours }),
  });
}

export interface SubscriberStats {
  totalHomeowners: number;
  subscribedCount: number;
  nonSubscribedCount: number;
}

export interface SubscriberCustomer {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  planCode: string | null;
  accountStatus?: string;
  createdAt: string;
  currentPeriodEnd?: string | null;
  isTrial?: boolean;
  trialDaysLeft?: number;
}

export async function getSubscriptionStats(q = "") {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return api<{ ok: boolean; stats: SubscriberStats; customers: SubscriberCustomer[] }>(
    `/api/admin/subscription-stats${qs}`
  );
}

export async function getAdminHomeownerProfile(userId: number) {
  return api<{
    ok: boolean;
    message?: string;
    customer?: {
      id: number;
      name: string;
      email: string;
      phone?: string | null;
      planCode: string | null;
      accountStatus: string;
      joinedAt: string;
    };
    addresses?: Array<{
      propertyId: number;
      label: string;
      isPrimary: boolean;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      propertyType?: string | null;
      createdAt?: string;
    }>;
    serviceHistory?: Array<{
      id: number;
      bookingId?: string | null;
      title?: string | null;
      category?: string | null;
      status: string;
      propertyId?: number | null;
      address?: string | null;
      contractor?: string | null;
      amount?: number | null;
      createdAt?: string;
      completedAt?: string | null;
    }>;
    payments?: Array<Record<string, unknown>>;
    transactions?: Array<{
      id: number;
      transactionId: string;
      paymentType: string;
      amount: number;
      currency: string;
      status: string;
      provider?: string;
      jobId?: number | null;
      meta?: Record<string, unknown>;
      createdAt: string;
    }>;
    subscriptions?: Array<Record<string, unknown>>;
    referrals?: Array<Record<string, unknown>>;
    stats?: {
      activeJobs: number;
      totalJobs: number;
      openQuotes: number;
      outstandingBalance: number;
      totalPaid: number;
      openTickets: number;
      properties: number;
    };
    quotes?: Array<{
      id: number;
      quoteNumber?: string | null;
      jobId: number;
      service?: string | null;
      amount?: number | null;
      status?: string;
      createdAt?: string;
      sentAt?: string | null;
      acceptedAt?: string | null;
    }>;
    invoices?: Array<{
      id: number;
      invoiceNumber?: string | null;
      quoteNumber?: string | null;
      proposalId?: number | null;
      jobId: number;
      total: number;
      paid: number;
      amountDue: number;
      status: string;
      dueDate?: string | null;
      createdAt?: string;
    }>;
    tickets?: Array<{
      id: number;
      ticketNumber: string;
      subject: string;
      category?: string | null;
      priority?: string;
      status: string;
      createdAt?: string;
      updatedAt?: string;
    }>;
    activity?: Array<{ at: string; action: string; detail?: string | null }>;
  }>(`/api/admin/homeowners/${userId}/profile`);
}

export async function getFinanceOverview(range: string, from?: string, to?: string) {
  const params = new URLSearchParams({ range });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return api<{ ok: boolean; summary?: Record<string, number> }>(`/api/admin/finance/overview?${params.toString()}`);
}

export async function listHomeownerNotes(userId: number) {
  return api<{
    ok: boolean;
    notes: Array<{
      id: number;
      note: string;
      adminName?: string;
      relatedJobId?: number | null;
      relatedTicketId?: number | null;
      createdAt: string;
    }>;
  }>(`/api/admin/homeowners/${userId}/notes`);
}

export async function addHomeownerNote(userId: number, note: string, relatedJobId?: number, relatedTicketId?: number) {
  return api<{
    ok: boolean;
    note?: { id: number; note: string; adminName?: string; createdAt: string };
  }>(`/api/admin/homeowners/${userId}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, relatedJobId, relatedTicketId }),
  });
}

export async function getMyTransactions() {
  return api<{
    ok: boolean;
    message?: string;
    transactions: Array<{
      id: number;
      transactionId: string;
      paymentType: string;
      typeLabel: string;
      description: string;
      amount: number;
      currency: string;
      status: string;
      provider?: string;
      jobId?: number | null;
      planCode?: string | null;
      createdAt: string;
      receiptUrl?: string | null;
    }>;
  }>("/api/payments/mine");
}

export async function updateSubscriptionOverride(userId: number, staffName: string) {
  return api<{ ok: boolean; message?: string }>("/api/admin/subscriptions/update", {
    method: "POST",
    body: JSON.stringify({ homeownerUserId: userId, planCode: PAID_HOME_CARE_PLAN_CODE, staffName }),
  });
}

export async function loadStaffAdmins() {
  return api<{ ok: boolean; staff: AuthUser[] }>("/api/admin/staff");
}

export async function createStaffAdmin(input: {
  name: string;
  email: string;
  password: string;
  accessLevel: "read" | "write" | "read-write";
}) {
  return api<{ ok: boolean; user?: AuthUser; message?: string }>("/api/admin/staff/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStaffAccess(userId: number, accessLevel: string) {
  return api<{ ok: boolean; user: AuthUser }>("/api/admin/staff/access", {
    method: "POST",
    body: JSON.stringify({ userId, accessLevel }),
  });
}

export async function adminSendPasswordReset(userId: number) {
  return api<{ ok: boolean; message?: string }>(`/api/admin/users/${userId}/send-password-reset`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
