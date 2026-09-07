import { api } from "./platformApi";

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

const UNAVAILABLE =
  "Address suggestions are temporarily unavailable. You can continue entering the address manually.";

const suggestionCache = new Map<string, { at: number; data: AddressAutocompleteResponse }>();
const SUGGESTION_CACHE_MS = 8 * 60 * 1000;

function cacheKey(q: string, limit: number) {
  return `${limit}:${q.toLowerCase()}`;
}

function readSuggestionCache(key: string) {
  const hit = suggestionCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SUGGESTION_CACHE_MS) {
    suggestionCache.delete(key);
    return null;
  }
  return hit.data;
}

/**
 * Geoapify suggestions via the public FixBridge proxy.
 * The API key stays server-side. Do not send the session token: a stale JWT
 * 401s `/api/address/autocomplete` and was shown as a provider outage.
 */
export async function fetchAddressAutocomplete(
  q: string,
  opts?: { signal?: AbortSignal; limit?: number }
): Promise<AddressAutocompleteResponse> {
  const query = q.trim();
  const limit = opts?.limit ?? 6;
  if (query.length < 3) {
    return { ok: true, suggestions: [], skipped: true };
  }

  const key = cacheKey(query, limit);
  const cached = readSuggestionCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const path = `/api/public/address/autocomplete?${params}`;
  try {
    const res = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: opts?.signal,
    });
    const text = await res.text();
    let data: AddressAutocompleteResponse | null = null;
    try {
      data = JSON.parse(text) as AddressAutocompleteResponse;
    } catch {
      data = null;
    }
    if (!res.ok || !data || typeof data !== "object") {
      return {
        ok: true,
        suggestions: [],
        unavailable: true,
        message: data?.message || UNAVAILABLE,
      };
    }
    if (data.unavailable) {
      return { ...data, suggestions: data.suggestions || [], message: data.message || UNAVAILABLE };
    }
    const normalized = { ...data, suggestions: data.suggestions || [] };
    if ((normalized.suggestions || []).length > 0) {
      suggestionCache.set(key, { at: Date.now(), data: normalized });
    }
    return normalized;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return {
      ok: true,
      suggestions: [],
      unavailable: true,
      message: UNAVAILABLE,
    };
  }
}
