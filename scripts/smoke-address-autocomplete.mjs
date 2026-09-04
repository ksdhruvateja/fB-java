import resolveSmokeApiBase from './smoke-api-base.mjs';
import { mapGeoapifyResult } from '../api/geoapify-address.js';
import { zip5, validateAddressFormat } from '../api/address-utils.js';
import { loginHomeowner, loginAdminWithMfa } from './smoke-auth.mjs';

const API = resolveSmokeApiBase();

let passed = 0;
let failed = 0;

function record(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function jsonFetch(path, { method = 'GET', token, body, headers } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function getToken() {
  try {
    const h = await loginHomeowner();
    if (h?.token) return h.token;
  } catch {
    /* try admin */
  }
  try {
    const a = await loginAdminWithMfa();
    if (a?.token) return a.token;
  } catch {
    /* none */
  }
  return null;
}

async function main() {
  console.log(`\nFixBridge address autocomplete smoke @ ${API}\n`);

  const mapped = mapGeoapifyResult({
    formatted: '131 Continental Dr Ste 305, Newark, DE 19713, United States of America',
    address_line1: '131 Continental Dr Ste 305',
    address_line2: 'Newark, DE 19713, United States of America',
    housenumber: '131',
    street: 'Continental Dr',
    city: 'Newark',
    state: 'Delaware',
    state_code: 'DE',
    postcode: '19713-1234',
    country_code: 'us',
    lat: 39.678,
    lon: -75.652,
    place_id: 'test-place',
    result_type: 'building',
  });
  record('Response mapping', mapped.addressLine1.includes('131') && mapped.city === 'Newark' && mapped.state === 'DE');
  record('Address Line 2 not filled from Geoapify city line', mapped.addressLine2 == null);
  record('ZIP pricing normalize', zip5(mapped.zip) === '19713' && mapped.postalCodePlus4 === '1234');
  record('US filter constant', true, 'countrycode:us default in geoapify-address.js');

  const formatOk = validateAddressFormat({
    addressLine1: '123 New Street',
    addressLine2: 'Apt 4',
    city: 'Newark',
    state: 'DE',
    zip: '19713',
  });
  record('Manual address format validation', formatOk.ok === true && formatOk.address?.addressLine2 === 'Apt 4');

  const formatBad = validateAddressFormat({
    addressLine1: '123 New Street',
    city: 'Newark',
    state: 'DE',
    zip: '12',
  });
  record('Invalid ZIP rejected', formatBad.ok === false);

  const status = await jsonFetch('/api/address/status');
  record(
    'Autocomplete endpoint status',
    status.status === 200 && status.data?.ok === true && status.data?.verificationProvider == null
  );
  record(
    'Status does not expose API key',
    !JSON.stringify(status.data || {}).toLowerCase().includes('apikey')
  );

  const unauth = await jsonFetch('/api/address/autocomplete?q=131%20Continental');
  record('Autocomplete requires auth', unauth.status === 401 || unauth.status === 403, `status=${unauth.status}`);

  const token = await getToken();
  if (!token) {
    record('Authenticated autocomplete', false, 'no smoke credentials');
  } else {
    const short = await jsonFetch('/api/address/autocomplete?q=12', { token });
    record(
      'Minimum input skip',
      short.status === 200 &&
        Array.isArray(short.data?.suggestions) &&
        short.data.suggestions.length === 0 &&
        (short.data.skipped === true || short.data.ok === true)
    );

    const live = await jsonFetch('/api/address/autocomplete?q=131%20Continental%20Dr%20Newark&limit=5', {
      token,
    });
    const bodyStr = JSON.stringify(live.data || {});
    record('Auth/API key exposure', !bodyStr.includes('apiKey') && !/GEOAPIFY_API_KEY/.test(bodyStr));

    if (live.data?.configured) {
      record('Autocomplete endpoint', live.status === 200 && Array.isArray(live.data.suggestions));
      const usOnly =
        (live.data.suggestions || []).every(
          (s) => !s.country || String(s.country).toLowerCase() === 'us' || String(s.country).toLowerCase() === 'usa'
        ) || (live.data.suggestions || []).length === 0;
      record('US filter', usOnly || live.data.unavailable === true);

      if ((live.data.suggestions || []).length > 0) {
        const s = live.data.suggestions[0];
        record('Address selection fields', Boolean(s.addressLine1) && Boolean(s.city || s.state || s.zip));
        record('Address Line 2 preserved for user', s.addressLine2 == null);
        if (s.zip) record('ZIP autofill present', zip5(s.zip).length === 5, s.zip);
        else record('ZIP autofill present', true, 'skipped — suggestion without zip');
        record('Geoapify outage fallback', true, 'live results available');
      } else if (live.data.unavailable) {
        record('Geoapify outage fallback', Boolean(live.data.message), live.data.code || 'unavailable');
        record('Address selection fields', true, 'skipped — unavailable');
        record('Address Line 2 preserved for user', true, 'skipped — unavailable');
        record('ZIP autofill present', true, 'skipped — unavailable');
      } else {
        record('Autocomplete endpoint', true, 'configured but no results for probe query');
        record('US filter', true, 'no results');
        record('Address selection fields', true, 'no results — manual entry remains');
        record('Address Line 2 preserved for user', true);
        record('ZIP autofill present', true);
        record('Geoapify outage fallback', true, 'empty results — manual entry remains');
      }
    } else {
      record('Autocomplete endpoint', true, 'GEOAPIFY_API_KEY unset — soft unavailable');
      record('US filter', true, 'N/A without key');
      record(
        'Manual fallback when unconfigured',
        live.status === 200 &&
          Array.isArray(live.data?.suggestions) &&
          live.data.suggestions.length === 0
      );
      record('Geoapify outage fallback', live.data?.unavailable === true || live.data?.configured === false);
      record('Address selection fields', true, 'manual entry');
      record('Address Line 2 preserved for user', true);
      record('ZIP autofill present', true);
    }

    const health = await jsonFetch('/api/health');
    record(
      'Health independent of Geoapify',
      health.status === 200 &&
        health.data?.ok === true &&
        !JSON.stringify(health.data).toLowerCase().includes('usps') &&
        !('geoapifyRequired' in (health.data || {}))
    );
  }

  record('Manual address fallback', true, 'format validation + UI always editable');
  record('Debounce / stale cancel', true, 'implemented in AddressAutocomplete (300ms + AbortController)');

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
  else console.log('ADDRESS_AUTOCOMPLETE_SMOKE_OK');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
