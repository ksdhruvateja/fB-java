import { getStoredToken } from "./auth";
import { formatMoney } from "./managedJobs";

export type ManagedSubscriptionPlan = {
  id?: number;
  code: string;
  name: string;
  amount: number;
  interval: "month" | "year" | string;
  theme: "light" | "blue" | "plum" | string;
  sortOrder: number;
  features: { label: string; included: boolean }[];
  highlight: boolean;
  unlocksDiy: boolean;
  trialDays: number;
  active: boolean;
  ctaLabel: string;
  description?: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json()) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data;
}

export async function listGoProPlans() {
  return api<{ ok: boolean; plans: ManagedSubscriptionPlan[]; pricingRevision?: string }>(
    "/api/platform/go-pro-plans"
  );
}

const PRICING_REVISION_KEY = "fixbridge-pricing-revision";

export function getStoredPricingRevision(): string | null {
  try {
    return localStorage.getItem(PRICING_REVISION_KEY);
  } catch {
    return null;
  }
}

export function storePricingRevision(revision: string) {
  try {
    localStorage.setItem(PRICING_REVISION_KEY, revision);
  } catch {
    // ignore
  }
}

export async function listAdminSubscriptionPlans() {
  return api<{ ok: boolean; plans: ManagedSubscriptionPlan[] }>("/api/admin/subscription-plans");
}

export async function createAdminSubscriptionPlan(plan: Partial<ManagedSubscriptionPlan>) {
  return api<{ ok: boolean; plan: ManagedSubscriptionPlan }>("/api/admin/subscription-plans", {
    method: "POST",
    body: JSON.stringify(plan),
  });
}

export async function updateAdminSubscriptionPlan(id: number, plan: Partial<ManagedSubscriptionPlan>) {
  return api<{ ok: boolean; plan: ManagedSubscriptionPlan }>(`/api/admin/subscription-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(plan),
  });
}

export async function deleteAdminSubscriptionPlan(id: number) {
  return api<{ ok: boolean }>(`/api/admin/subscription-plans/${id}`, { method: "DELETE" });
}

export function formatPlanPrice(amount: number, interval?: string) {
  if (!amount || amount <= 0) {
    return { label: "Free", suffix: "" };
  }
  const label = formatMoney(amount).replace(/\.00$/, "");
  const suffix = interval === "year" ? "/yr" : "/mo";
  return { label, suffix };
}
