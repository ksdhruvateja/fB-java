import { api } from "./platformApi";
import { getStoredToken } from "./auth";

/** Service-area check by ZIP. */
export async function checkServiceAreaCoverage(zip: string) {
  try {
    const res = await fetch(`/api/public/service-area/check?zip=${encodeURIComponent(zip)}`);
    return (await res.json()) as {
      ok?: boolean;
      covered?: boolean;
      market?: string;
      message?: string;
    };
  } catch {
    return { ok: false, covered: null as boolean | null };
  }
}

/** Optional format-only validation (no external verification gate). */
export async function validateAddressFormat(body: {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
}) {
  return api<{
    ok: boolean;
    message?: string;
    code?: string;
    address?: {
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
      zip: string;
    };
  }>("/api/address/validate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type AddressSuggestion = {
  label: string;
  primary: string;
  secondary: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zip: string;
  postalCodePlus4?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  resultType?: string | null;
};

export type AddressAutocompleteResponse = {
  ok: boolean;
  configured?: boolean;
  suggestions?: AddressSuggestion[];
  skipped?: boolean;
  unavailable?: boolean;
  message?: string;
  code?: string;
};

/** Geoapify suggestions via FixBridge backend proxy (API key never in browser). */
export async function fetchAddressAutocomplete(
  q: string,
  opts?: { signal?: AbortSignal; limit?: number }
): Promise<AddressAutocompleteResponse> {
  const token = getStoredToken();
  const params = new URLSearchParams({
    q: q.trim(),
    limit: String(opts?.limit ?? 6),
  });
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/address/autocomplete?${params}`, {
      method: "GET",
      headers,
      signal: opts?.signal,
    });
    const data = (await res.json()) as AddressAutocompleteResponse;
    if (!res.ok) {
      return {
        ok: true,
        suggestions: [],
        unavailable: true,
        message:
          data.message ||
          "Address suggestions are temporarily unavailable. You can continue entering the address manually.",
      };
    }
    return data;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return {
      ok: true,
      suggestions: [],
      unavailable: true,
      message:
        "Address suggestions are temporarily unavailable. You can continue entering the address manually.",
    };
  }
}
