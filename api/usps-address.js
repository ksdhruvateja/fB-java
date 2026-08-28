/**
 * USPS Addresses API v3 — server-side OAuth + address utilities.
 * Contract: addresses-v3r2_0.yaml (OpenAPI 3.3.1)
 * Endpoints: GET /address, GET /city-state, GET /zipcode
 * No autocomplete/suggestion endpoint in spec.
 */

const USPS_SCOPES = 'addresses';

/** In-memory OAuth cache (per server process). */
let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

/** ZIP → city/state cache (non-sensitive, 1h TTL). */
const cityStateCache = new Map();

function uspsApiRoot() {
  const raw = String(process.env.USPS_API_BASE_URL || 'https://apis-tem.usps.com').trim();
  return raw.replace(/\/$/, '').replace(/\/addresses\/v3$/i, '');
}

export function uspsConfigured() {
  return Boolean(process.env.USPS_CLIENT_ID && process.env.USPS_CLIENT_SECRET);
}

export function addressesApiBase() {
  return `${uspsApiRoot()}/addresses/v3`;
}

function oauthTokenUrl() {
  return `${uspsApiRoot()}/oauth2/v3/token`;
}

function clamp(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function zip5(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

export function zipPlus4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 9) return digits.slice(5, 9);
  if (digits.length === 4 && !zip5(value)) return digits;
  return '';
}

export function normalizeInboundAddress(input = {}) {
  const streetAddress = clamp(input.streetAddress || input.addressLine1 || input.street, 50);
  const secondaryAddress = clamp(input.secondaryAddress || input.addressLine2 || input.suite, 50);
  const city = clamp(input.city, 28);
  const state = clamp(input.state, 2).toUpperCase();
  const ZIPCode = zip5(input.ZIPCode || input.zip || input.postalCode);
  const ZIPPlus4 = zipPlus4(input.ZIPPlus4 || input.zipPlus4 || input.zip);
  return { streetAddress, secondaryAddress, city, state, ZIPCode, ZIPPlus4 };
}

export function uspsDomesticToFixBridge(addr = {}) {
  const zip5val = zip5(addr.ZIPCode || addr.zip);
  const plus4 = zipPlus4(addr.ZIPPlus4 || addr.zip);
  return {
    addressLine1: clamp(addr.streetAddress || addr.streetAddressAbbreviation, 50),
    addressLine2: clamp(addr.secondaryAddress, 50) || null,
    city: clamp(addr.city, 28),
    state: clamp(addr.state, 2).toUpperCase(),
    zip: zip5val,
    postalCodePlus4: plus4 || null,
    zipDisplay: plus4 ? `${zip5val}-${plus4}` : zip5val,
  };
}

function mapUspsError(err, status) {
  const code = err?.error?.code || err?.code || status;
  const message = err?.error?.message || err?.message || 'USPS address request failed.';
  if (status === 404) {
    return { ok: false, code: 'ADDRESS_NOT_FOUND', message, status: 404 };
  }
  if (status === 400) {
    return { ok: false, code: 'INVALID_ADDRESS', message, status: 400 };
  }
  if (status === 401 || status === 403) {
    return { ok: false, code: 'USPS_AUTH_FAILED', message: 'USPS authentication failed.', status: 503 };
  }
  if (status === 429) {
    return { ok: false, code: 'USPS_RATE_LIMIT', message: 'Address verification is busy. Try again shortly.', status: 429 };
  }
  if (status === 503) {
    return { ok: false, code: 'USPS_UNAVAILABLE', message: 'USPS is temporarily unavailable.', status: 503 };
  }
  return { ok: false, code: 'USPS_ERROR', message, status: status || 502 };
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

export async function getUspsAccessToken({ forceRefresh = false } = {}) {
  if (!uspsConfigured()) {
    return { ok: false, code: 'USPS_NOT_CONFIGURED', message: 'USPS credentials are not configured.' };
  }

  const now = Date.now();
  if (!forceRefresh && tokenCache.accessToken && tokenCache.expiresAt > now + 30_000) {
    return { ok: true, accessToken: tokenCache.accessToken };
  }

  try {
    const res = await fetch(oauthTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.USPS_CLIENT_ID,
        client_secret: process.env.USPS_CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: USPS_SCOPES,
      }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok || !data.access_token) {
      return mapUspsError(data, res.status);
    }
    const expiresIn = Number(data.expires_in || 3600);
    tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + Math.max(60, expiresIn - 60) * 1000,
    };
    return { ok: true, accessToken: data.access_token };
  } catch (e) {
    return { ok: false, code: 'USPS_UNAVAILABLE', message: 'Could not reach USPS OAuth.' };
  }
}

async function uspsGet(path, params) {
  const tokenResult = await getUspsAccessToken();
  if (!tokenResult.ok) return tokenResult;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && String(v).trim() !== '') qs.set(k, String(v).trim());
  }

  const url = `${addressesApiBase()}${path}?${qs.toString()}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        Accept: 'application/json',
      },
    });
    const data = await parseJsonSafe(res);
    if (res.status === 401) {
      const refreshed = await getUspsAccessToken({ forceRefresh: true });
      if (!refreshed.ok) return mapUspsError(data, res.status);
      const retry = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${refreshed.accessToken}`, Accept: 'application/json' },
      });
      const retryData = await parseJsonSafe(retry);
      if (!retry.ok) return mapUspsError(retryData, retry.status);
      return { ok: true, data: retryData };
    }
    if (!res.ok) return mapUspsError(data, res.status);
    return { ok: true, data };
  } catch {
    return { ok: false, code: 'USPS_UNAVAILABLE', message: 'USPS address service unreachable.' };
  }
}

/**
 * Standardize/verify a U.S. address (GET /address).
 */
export async function verifyAddress(input = {}) {
  if (!uspsConfigured()) {
    return { ok: false, code: 'USPS_NOT_CONFIGURED', message: 'USPS is not configured on this server.' };
  }

  const addr = normalizeInboundAddress(input);
  if (!addr.streetAddress) {
    return { ok: false, code: 'INCOMPLETE_ADDRESS', message: 'Street address is required.' };
  }
  if (!addr.ZIPCode && (!addr.city || !addr.state)) {
    return {
      ok: false,
      code: 'INCOMPLETE_ADDRESS',
      message: 'City and state, or ZIP code, are required.',
    };
  }

  const params = {
    streetAddress: addr.streetAddress,
    secondaryAddress: addr.secondaryAddress || undefined,
    city: addr.city || undefined,
    state: addr.state || undefined,
    ZIPCode: addr.ZIPCode || undefined,
    ZIPPlus4: addr.ZIPPlus4 || undefined,
  };

  const result = await uspsGet('/address', params);
  if (!result.ok) return result;

  const domestic = result.data?.address || {};
  const standardized = uspsDomesticToFixBridge(domestic);
  const entered = {
    addressLine1: addr.streetAddress,
    addressLine2: addr.secondaryAddress || null,
    city: addr.city,
    state: addr.state,
    zip: addr.ZIPCode,
    postalCodePlus4: addr.ZIPPlus4 || null,
    zipDisplay: addr.ZIPPlus4 ? `${addr.ZIPCode}-${addr.ZIPPlus4}` : addr.ZIPCode,
  };

  const corrections = result.data?.corrections || [];
  const matches = result.data?.matches || [];
  const warnings = result.data?.warnings || [];
  const additional = result.data?.additionalInfo || {};

  const same =
    entered.addressLine1.toUpperCase() === standardized.addressLine1.toUpperCase() &&
    (entered.addressLine2 || '').toUpperCase() === (standardized.addressLine2 || '').toUpperCase() &&
    entered.city.toUpperCase() === standardized.city.toUpperCase() &&
    entered.state === standardized.state &&
    zip5(entered.zip) === standardized.zip;

  return {
    ok: true,
    entered,
    standardized,
    verified: true,
    exactMatch: same,
    needsUserChoice: !same,
    corrections,
    matches,
    warnings,
    dpvConfirmation: additional.DPVConfirmation || null,
    dpvEnhancedConfirmation: additional.DPVEnhancedConfirmation || null,
    secondaryInfo: additional.secondaryInfo || null,
    provider: 'usps',
  };
}

/**
 * ZIP → city/state (GET /city-state).
 */
export async function lookupCityState(zipInput) {
  const ZIPCode = zip5(zipInput);
  if (ZIPCode.length !== 5) {
    return { ok: false, code: 'INVALID_ZIP', message: 'ZIP must be 5 digits.' };
  }

  const cached = cityStateCache.get(ZIPCode);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, city: cached.city, state: cached.state, ZIPCode, cached: true };
  }

  if (!uspsConfigured()) {
    return { ok: false, code: 'USPS_NOT_CONFIGURED', message: 'USPS is not configured.' };
  }

  const result = await uspsGet('/city-state', { ZIPCode });
  if (!result.ok) return result;

  const city = clamp(result.data?.city, 28);
  const state = clamp(result.data?.state, 2).toUpperCase();
  cityStateCache.set(ZIPCode, { city, state, expiresAt: Date.now() + 3_600_000 });
  return { ok: true, city, state, ZIPCode };
}

/**
 * Street + city + state → ZIP (GET /zipcode).
 */
export async function lookupZip(input = {}) {
  if (!uspsConfigured()) {
    return { ok: false, code: 'USPS_NOT_CONFIGURED', message: 'USPS is not configured.' };
  }

  const addr = normalizeInboundAddress(input);
  if (!addr.streetAddress || !addr.city || !addr.state) {
    return {
      ok: false,
      code: 'INCOMPLETE_ADDRESS',
      message: 'Street, city, and state are required for ZIP lookup.',
    };
  }

  const result = await uspsGet('/zipcode', {
    streetAddress: addr.streetAddress,
    secondaryAddress: addr.secondaryAddress || undefined,
    city: addr.city,
    state: addr.state,
    ZIPCode: addr.ZIPCode || undefined,
    ZIPPlus4: addr.ZIPPlus4 || undefined,
  });
  if (!result.ok) return result;

  const domestic = result.data?.address || result.data || {};
  const zip5val = zip5(domestic.ZIPCode || domestic.zip);
  const plus4 = zipPlus4(domestic.ZIPPlus4 || domestic.zip);
  return {
    ok: true,
    zip: zip5val,
    postalCodePlus4: plus4 || null,
    zipDisplay: plus4 ? `${zip5val}-${plus4}` : zip5val,
    provider: 'usps',
  };
}

/** Spec has no suggestion/autocomplete endpoint. */
export function suggestAddresses() {
  return {
    ok: false,
    code: 'NOT_SUPPORTED',
    message: 'USPS Addresses API v3 does not provide street-level autocomplete.',
    supported: false,
  };
}
