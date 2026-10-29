const REFERRAL_KEY = "fixbridge-referral-code";

export function normalizeReferralCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const asUrl = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://local.invalid");
    const fromQuery = asUrl.searchParams.get("ref") || asUrl.searchParams.get("referral") || asUrl.searchParams.get("code");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  } catch {
    // not a URL
  }
  const match = trimmed.match(/[?&](?:ref|referral|code)=([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function storePendingReferralCode(code: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REFERRAL_KEY, normalized);
  } catch {
    /* ignore */
  }
}

export function getPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(REFERRAL_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function clearPendingReferralCode() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REFERRAL_KEY);
  } catch {
    /* ignore */
  }
}
