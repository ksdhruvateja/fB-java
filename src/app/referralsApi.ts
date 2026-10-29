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

export type ReferralCredits = {
  availableCents: number;
  pendingCents: number;
  usedCents: number;
};

export type ReferralRow = {
  id: number;
  publicId?: string;
  type: string;
  status: string;
  statusLabel?: string;
  referralCode: string;
  referrerRewardCents: number;
  referredRewardCents: number;
  referredName?: string;
  referredCompany?: string | null;
  createdAt?: string | null;
  rewardAvailableAt?: string | null;
  qualificationEvent?: string | null;
  relatedJobId?: number | null;
  referrerName?: string;
  referrerEmail?: string;
  referredEmail?: string;
};

export async function fetchMyReferrals() {
  return api<{
    ok: boolean;
    code?: string;
    link?: string;
    shareMessage?: string;
    offer?: Record<string, number>;
    credits?: ReferralCredits;
    bonuses?: { totalCents: number; pendingCents: number; paidCents: number } | null;
    referrals?: ReferralRow[];
    message?: string;
  }>("/api/referrals/me");
}

export async function applyMyReferralCode(code: string) {
  return api<{
    ok: boolean;
    alreadyApplied?: boolean;
    referrerName?: string;
    message?: string;
  }>("/api/referrals/apply", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchAdminReferralOverview() {
  return api<{ ok: boolean; overview?: Record<string, number>; message?: string }>(
    "/api/admin/referrals/overview"
  );
}

export async function fetchAdminReferralConfig() {
  return api<{ ok: boolean; config?: Record<string, unknown>; message?: string }>(
    "/api/admin/referrals/config"
  );
}

export async function saveAdminReferralConfig(config: Record<string, unknown>) {
  return api<{ ok: boolean; config?: Record<string, unknown>; message?: string }>(
    "/api/admin/referrals/config",
    { method: "PUT", body: JSON.stringify({ config }) }
  );
}

export async function fetchAdminReferrals(params?: { type?: string; status?: string; q?: string }) {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return api<{ ok: boolean; referrals?: ReferralRow[]; message?: string }>(
    `/api/admin/referrals${suffix}`
  );
}

export async function adminReferralAction(id: number, action: string, note?: string) {
  return api<{ ok: boolean; message?: string }>(`/api/admin/referrals/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action, note }),
  });
}
