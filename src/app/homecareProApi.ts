import { getStoredToken } from "./auth";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { ok: false, message: text || res.statusText } as T;
  }
}

export type RecurringService = {
  id: number;
  propertyId: number;
  serviceType: "recurring_cleaning" | "recurring_landscaping";
  recurrence: "weekly" | "biweekly" | "monthly";
  preferredDay?: string | null;
  preferredTimeWindow?: string | null;
  startDate?: string | null;
  status: "active" | "paused" | "cancelled";
  nextServiceDate?: string | null;
  notes?: string | null;
  providerName?: string | null;
};

export type QuoteSecondOpinion = {
  summary?: string;
  scopeReview?: string;
  pricingContext?: string;
  thingsToAsk?: string | string[];
  recommendation?: string;
  disclaimer?: string;
  generatedAt?: string;
};

export async function listRecurringServices() {
  return api<{ ok: boolean; services?: RecurringService[]; message?: string }>("/api/recurring-services");
}

export async function createRecurringService(body: {
  propertyId: number;
  serviceType: RecurringService["serviceType"];
  recurrence: RecurringService["recurrence"];
  preferredDay?: string;
  preferredTimeWindow?: string;
  startDate?: string;
  notes?: string;
}) {
  return api<{ ok: boolean; service?: RecurringService; message?: string }>("/api/recurring-services", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRecurringService(
  id: number,
  body: Partial<Pick<RecurringService, "status" | "recurrence" | "preferredDay" | "preferredTimeWindow" | "nextServiceDate" | "notes">>
) {
  return api<{ ok: boolean; service?: RecurringService; message?: string }>(`/api/recurring-services/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function skipRecurringService(id: number, date?: string) {
  return api<{ ok: boolean; service?: RecurringService; message?: string }>(`/api/recurring-services/${id}/skip`, {
    method: "POST",
    body: JSON.stringify(date ? { date } : {}),
  });
}

export async function rescheduleRecurringService(id: number, newDate: string, preferredTimeWindow?: string | null) {
  return api<{ ok: boolean; service?: RecurringService; message?: string }>(`/api/recurring-services/${id}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ newDate, preferredTimeWindow: preferredTimeWindow || undefined }),
  });
}

export async function requestRecurringVisit(id: number) {
  return api<{ ok: boolean; jobId?: number; nextServiceDate?: string; message?: string }>(
    `/api/recurring-services/${id}/request-visit`,
    { method: "POST" }
  );
}

export async function savePropertyMaintenance(propertyId: number, maintenance: Array<{ label: string; dueDate?: string; system?: string; completed?: boolean; skipped?: boolean }>) {
  return api<{ ok: boolean; maintenance?: unknown[]; message?: string }>(`/api/properties/${propertyId}/maintenance`, {
    method: "PUT",
    body: JSON.stringify({ maintenance }),
  });
}

export async function getHousehold(propertyId: number) {
  return api<{
    ok: boolean;
    members?: Array<{ id: number; userId: number; name: string; email: string; role: string }>;
    invitations?: Array<{ id: number; email: string; role: string; expiresAt: string }>;
    message?: string;
  }>(`/api/household/${propertyId}`);
}

export async function inviteHouseholdMember(propertyId: number, email: string, role: "viewer" | "member" | "manager") {
  return api<{ ok: boolean; invitation?: { id: number; email: string; acceptPath?: string }; message?: string }>(
    `/api/household/${propertyId}/invite`,
    { method: "POST", body: JSON.stringify({ email, role }) }
  );
}

export async function revokeHouseholdInvite(inviteId: number) {
  return api<{ ok: boolean; message?: string }>(`/api/household/invitations/${inviteId}`, { method: "DELETE" });
}

export async function removeHouseholdMember(propertyId: number, memberId: number) {
  return api<{ ok: boolean; message?: string }>(`/api/household/${propertyId}/members/${memberId}`, { method: "DELETE" });
}

export async function getHomeHealthReport(propertyId: number) {
  return api<{ ok: boolean; report?: { id: number; generatedAt: string; content: Record<string, unknown> } | null; message?: string }>(
    `/api/properties/${propertyId}/home-health-report`
  );
}

export async function generateHomeHealthReport(propertyId: number) {
  return api<{ ok: boolean; report?: { id: number; generatedAt: string; content: Record<string, unknown> }; message?: string }>(
    `/api/properties/${propertyId}/home-health-report`,
    { method: "POST" }
  );
}

export async function requestQuoteSecondOpinion(jobId: number) {
  return api<{ ok: boolean; opinion?: QuoteSecondOpinion; message?: string }>(
    `/api/managed/jobs/${jobId}/quote-second-opinion`,
    { method: "POST" }
  );
}

export async function getHomeCareSubscriptionStatus() {
  return api<{
    ok: boolean;
    planCode?: string;
    isPro?: boolean;
    status?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    paymentIssue?: boolean;
    memberLabel?: string | null;
    subscription?: {
      planCode: string;
      status: string;
      currentPeriodEnd?: string;
      cancelAtPeriodEnd?: boolean;
      paymentIssue?: boolean;
    } | null;
    message?: string;
  }>("/api/homecare/subscription-status");
}
