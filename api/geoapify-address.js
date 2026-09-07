/**
 * Geoapify Address Autocomplete — server-side only.
 * Used for suggestions/autofill, never as a mandatory verification gate.
 */

const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 8;
const SUGGESTION_CACHE_MS = 8 * 60 * 1000;
const suggestionCache = new Map();

function cacheKey(text, limit, filter) {
  return `${filter}|${limit}|${String(text || '').trim().toLowerCase()}`;
}

function readSuggestionCache(key) {
  const hit = suggestionCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > SUGGESTION_CACHE_MS) {
    suggestionCache.delete(key);
    return null;
  }
  return hit.value;
}

export function geoapifyConfigured() {
  return Boolean(String(process.env.GEOAPIFY_API_KEY || '').trim());
}

export function geoapifyCountryFilter() {
  return String(process.env.GEOAPIFY_COUNTRY_FILTER || 'countrycode:us').trim() || 'countrycode:us';
}

function streetAddressLine(raw = {}) {
  return [raw.housenumber, raw.street].filter(Boolean).join(' ').trim();
}

/**
 * Map a Geoapify result into FixBridge address fields.
 * Does NOT put city/state/ZIP into addressLine2 (that field is apartment/suite/unit).
 * Prefer the street line over a POI/amenity name (e.g. "Google Building 41").
 */
export function mapGeoapifyResult(raw = {}) {
  const streetAddress = streetAddressLine(raw);
  const named = String(raw.name || '').trim();
  const providerLine1 = String(raw.address_line1 || '').trim();
  const houseNumber = String(raw.housenumber || '').trim();
  const providerLineIsPlaceName =
    !providerLine1
    || (named && providerLine1 === named)
    || (houseNumber && !providerLine1.includes(houseNumber));
  const addressLine1 = (streetAddress && providerLineIsPlaceName ? streetAddress : '')
    || providerLine1
    || streetAddress
    || named
    || String(raw.formatted || '').split(',')[0]?.trim()
    || '';

  const stateCode = String(raw.state_code || '').trim().toUpperCase();
  const stateName = String(raw.state || '').trim();
  // Prefer abbreviation; otherwise pass full state name for client normalizeUsStateCode.
  const state = stateCode.length === 2 ? stateCode : stateName;

  const postcode = String(raw.postcode || '').trim();
  const zipDigits = postcode.replace(/\D/g, '');
  const zip = zipDigits.length >= 5 ? zipDigits.slice(0, 5) : postcode;
  const postalCodePlus4 = zipDigits.length >= 9 ? zipDigits.slice(5, 9) : null;

  const lat = raw.lat != null ? Number(raw.lat) : null;
  const lon = raw.lon != null ? Number(raw.lon) : null;

  const city = String(raw.city || raw.town || raw.village || raw.county || '').trim();
  const displayState = stateCode.length === 2 ? stateCode : stateName;

  return {
    label: String(raw.formatted || addressLine1).trim(),
    primary: addressLine1,
    secondary: [city, displayState, zip].filter(Boolean).join(', '),
    addressLine1,
    // Intentionally omit Geoapify address_line2 — it is usually city/state/country, not unit.
    addressLine2: null,
    city,
    state,
    zip,
    postalCodePlus4,
    country: String(raw.country_code || raw.country || 'us').trim().toLowerCase(),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    placeId: raw.place_id != null ? String(raw.place_id) : null,
    resultType: raw.result_type || null,
  };
}

/**
 * @param {{ text: string, limit?: number, signal?: AbortSignal }} opts
 */
export async function autocompleteAddress({ text, limit = DEFAULT_LIMIT, signal } = {}) {
  const q = String(text || '').trim();
  if (q.length < 3) {
    return { ok: true, configured: geoapifyConfigured(), suggestions: [], skipped: true };
  }

  if (!geoapifyConfigured()) {
    return {
      ok: false,
      configured: false,
      code: 'GEOAPIFY_NOT_CONFIGURED',
      message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      suggestions: [],
    };
  }

  const capped = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const filter = geoapifyCountryFilter();
  const key = cacheKey(q, capped, filter);
  const cached = readSuggestionCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    text: q,
    format: 'json',
    limit: String(capped),
    filter,
    lang: 'en',
    apiKey: String(process.env.GEOAPIFY_API_KEY).trim(),
  });

  let res;
  try {
    const timeoutMs = Number(process.env.GEOAPIFY_TIMEOUT_MS || 8000);
    const timeoutSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : null;
    const combined =
      signal && timeoutSignal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeoutSignal])
        : signal || timeoutSignal || undefined;
    res = await fetch(`${GEOAPIFY_AUTOCOMPLETE_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: combined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      if (signal?.aborted) throw e;
      return {
        ok: false,
        configured: true,
        code: 'GEOAPIFY_TIMEOUT',
        message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
        suggestions: [],
      };
    }
    return {
      ok: false,
      configured: true,
      code: 'GEOAPIFY_UNAVAILABLE',
      message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      suggestions: [],
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      configured: true,
      code: 'GEOAPIFY_RATE_LIMIT',
      message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      suggestions: [],
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      configured: true,
      code: 'GEOAPIFY_ERROR',
      message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      suggestions: [],
      status: res.status,
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      configured: true,
      code: 'GEOAPIFY_BAD_RESPONSE',
      message: 'Address suggestions are temporarily unavailable. You can continue entering the address manually.',
      suggestions: [],
    };
  }

  const results = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.features)
      ? data.features.map((f) => ({ ...(f.properties || {}), lat: f.geometry?.coordinates?.[1], lon: f.geometry?.coordinates?.[0] }))
      : [];

  const suggestions = results
    .map(mapGeoapifyResult)
    .filter((s) => s.addressLine1)
    .slice(0, capped);

  const payload = {
    ok: true,
    configured: true,
    suggestions,
  };
  if (suggestions.length > 0) {
    suggestionCache.set(key, { at: Date.now(), value: payload });
  }
  return payload;
}
