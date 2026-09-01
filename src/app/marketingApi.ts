import { getStoredToken } from "./auth";

export type MarketingPreferences = {
  userId: number;
  email?: string;
  phone?: string | null;
  name?: string;
  signupMethod?: string;
  preferencesCollected?: boolean;
  emailMarketing: { subscribed: boolean; optedInAt?: string | null; optedOutAt?: string | null };
  smsMarketing: { subscribed: boolean; optedInAt?: string | null; optedOutAt?: string | null };
};

export type CustomerDirectoryRow = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  signupMethod?: string;
  planCode?: string | null;
  accountStatus?: string;
  createdAt: string;
  propertyCount?: number;
  lastActivity?: string | null;
  emailMarketing?: boolean;
  smsMarketing?: boolean;
  marketingSummary?: string;
};

export type MarketingSubscriberRow = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  signupMethod?: string;
  planCode?: string | null;
  createdAt: string;
  emailMarketing: boolean;
  smsMarketing: boolean;
  emailOptInAt?: string | null;
  smsOptInAt?: string | null;
  emailOptOutAt?: string | null;
  smsOptOutAt?: string | null;
  lastConsentSource?: string | null;
  preferencesCollectedAt?: string | null;
  unsubscribeStatus?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  return res.json() as Promise<T>;
}

export async function getGoogleAuthConfig() {
  return api<{ ok: boolean; configured: boolean; clientId: string | null }>("/api/auth/google/config");
}

export async function signInWithGoogle(
  credential: string,
  body: Record<string, unknown> = {},
  role: "homeowner" | "contractor" | "admin" = "homeowner",
) {
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, role, ...body }),
  });
  return res.json();
}

export type LinkedSignInMethods = {
  google: { connected: boolean; email: string | null; avatarUrl: string | null };
  password: { enabled: boolean };
  signupMethod: string;
};

export async function getLinkedSignInMethods() {
  return api<{ ok: boolean; google?: LinkedSignInMethods["google"]; password?: LinkedSignInMethods["password"]; signupMethod?: string; message?: string }>(
    "/api/auth/google/linked"
  );
}

export async function completeGoogleMarketingPreferences(body: {
  marketingEmailOptIn: boolean;
  marketingSmsOptIn: boolean;
}) {
  return api<{ ok: boolean; message?: string }>("/api/auth/google/marketing-preferences", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getCommunicationPreferences() {
  return api<{ ok: boolean; preferences?: MarketingPreferences; message?: string }>(
    "/api/homeowner/communication-preferences"
  );
}

export async function updateCommunicationPreferences(body: {
  emailOptIn?: boolean;
  smsOptIn?: boolean;
}) {
  return api<{ ok: boolean; preferences?: MarketingPreferences; message?: string }>(
    "/api/homeowner/communication-preferences",
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export async function listAdminCustomers(q = "", limit = 100, offset = 0) {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  return api<{ ok: boolean; customers: CustomerDirectoryRow[]; message?: string }>(
    `/api/admin/customers?${qs}`
  );
}

export async function listAdminMarketingSubscribers(q = "", channel = "", limit = 100, offset = 0) {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  if (channel) qs.set("channel", channel);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  return api<{ ok: boolean; subscribers: MarketingSubscriberRow[]; message?: string }>(
    `/api/admin/marketing-subscribers?${qs}`
  );
}

export async function getAdminMarketingPreferences(userId: number) {
  return api<{ ok: boolean; preferences?: MarketingPreferences; message?: string }>(
    `/api/admin/homeowners/${userId}/marketing-preferences`
  );
}

export async function adminUnsubscribeMarketing(userId: number, channels: Array<"email" | "sms">) {
  return api<{ ok: boolean; preferences?: MarketingPreferences; message?: string }>(
    `/api/admin/homeowners/${userId}/marketing-unsubscribe`,
    { method: "POST", body: JSON.stringify({ channels }) }
  );
}

export async function processMarketingUnsubscribe(token: string, channel = "email") {
  const qs = new URLSearchParams({ token, channel });
  return api<{ ok: boolean; message?: string; channel?: string }>(`/api/marketing/unsubscribe?${qs}`);
}
