/**
 * Client helpers for platform expansion APIs.
 */
import { getStoredToken } from "./auth";

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
      return { ok: false, message: text || res.statusText } as T;
    }
  } catch {
    return { ok: false, message: "Network error." } as T;
  }
}

export async function platformStatus() {
  return api<{ ok: boolean; stripe?: boolean; resend?: boolean; twilio?: boolean; note?: string }>(
    "/api/platform/status"
  );
}

export async function listPlans() {
  return api<{ ok: boolean; plans: Array<{ code: string; label: string; amount: number; family: string }> }>(
    "/api/platform/plans"
  );
}

export async function startSubscription(planCode: string, jobId?: number) {
  return api<{ ok: boolean; url?: string; simulated?: boolean; message?: string }>(
    "/api/subscriptions/checkout",
    { method: "POST", body: JSON.stringify({ planCode, jobId }) }
  );
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

export async function placesAutocomplete(input: string) {
  return api<{ ok: boolean; predictions?: Array<{ description: string; place_id?: string }>; simulated?: boolean }>(
    `/api/places/autocomplete?input=${encodeURIComponent(input)}`
  );
}

export async function startAdminMfa() {
  return api<{ ok: boolean; demoCode?: string }>("/api/auth/mfa/start", { method: "POST", body: "{}" });
}

export async function verifyAdminMfa(code: string) {
  return api<{ ok: boolean; verified?: boolean }>("/api/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
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
  planCode: string | null;
  createdAt: string;
  currentPeriodEnd?: string | null;
  isTrial?: boolean;
  trialDaysLeft?: number;
}

export async function getSubscriptionStats() {
  return api<{ ok: boolean; stats: SubscriberStats; customers: SubscriberCustomer[] }>(
    "/api/admin/subscription-stats"
  );
}

export async function updateSubscriptionOverride(userId: number, staffName: string) {
  return api<{ ok: boolean; message?: string }>("/api/admin/subscriptions/update", {
    method: "POST",
    body: JSON.stringify({ homeownerUserId: userId, planCode: 'pro_membership', staffName }),
  });
}

export async function loadStaffAdmins() {
  return api<{ ok: boolean; staff: AuthUser[] }>("/api/admin/staff");
}

export async function updateStaffAccess(userId: number, accessLevel: string) {
  return api<{ ok: boolean; user: AuthUser }>("/api/admin/staff/access", {
    method: "POST",
    body: JSON.stringify({ userId, accessLevel }),
  });
}
