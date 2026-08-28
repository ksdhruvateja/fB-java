/**
 * USPS Addresses API v3 smoke / diagnostic.
 * Never prints secrets or OAuth tokens.
 */
import { authH, json } from './smoke-auth.mjs';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function loginHomeowner() {
  const signin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner', email: 'maria@example.com', password: 'demo123' }),
  }).then(json);
  if (!signin.ok || !signin.token) throw new Error(signin.message || 'homeowner login failed');
  return signin.token;
}

async function main() {
  console.log('FixBridge USPS address smoke\n');

  const status = await fetch(`${API}/api/address/status`).then(json);
  record('Address API status', status.ok === true, `spec ${status.specVersion || '?'}`);
  record(
    'USPS true autocomplete supported by spec',
    status.autocompleteSupported === false,
    'expected false'
  );

  const configured = Boolean(status.uspsConfigured);
  console.log(`USPS configured: ${configured ? 'yes' : 'no (set USPS_CLIENT_ID/SECRET in .env)'}`);

  let token;
  try {
    token = await loginHomeowner();
    record('Auth for address routes', Boolean(token));
  } catch (e) {
    record('Auth for address routes', false, e.message);
    return;
  }

  const suggestions = await fetch(`${API}/api/address/suggestions?q=123+Main`, {
    headers: authH(token),
  }).then(json);
  record(
    'Suggestion endpoint NOT SUPPORTED',
    suggestions.code === 'NOT_SUPPORTED' || suggestions.supported === false,
    suggestions.message || ''
  );

  const badZip = await fetch(`${API}/api/address/city-state?zip=12`, {
    headers: authH(token),
  }).then(json);
  record('Invalid ZIP rejected', badZip.ok === false, badZip.code || badZip.message);

  if (configured) {
    const oauthProbe = await import('../api/usps-address.js').then((m) => m.getUspsAccessToken());
    record('USPS OAuth', oauthProbe.ok === true, oauthProbe.ok ? 'token acquired' : oauthProbe.code);

    const verify = await fetch(`${API}/api/address/verify`, {
      method: 'POST',
      headers: { ...authH(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streetAddress: '1600 Pennsylvania Avenue NW',
        city: 'Washington',
        state: 'DC',
        zip: '20500',
      }),
    }).then(json);
    record('USPS address verification', verify.ok === true, verify.exactMatch ? 'exact match' : 'response ok');

    const cityState = await fetch(`${API}/api/address/city-state?zip=75201`, {
      headers: authH(token),
    }).then(json);
    record(
      'City/state lookup',
      cityState.ok === true,
      cityState.city ? `${cityState.city}, ${cityState.state}` : cityState.message
    );

    const zipLookup = await fetch(
      `${API}/api/address/zip?streetAddress=123+Main+St&city=Dallas&state=TX`,
      { headers: authH(token) }
    ).then(json);
    record('ZIP lookup', zipLookup.ok === true || zipLookup.code === 'ADDRESS_NOT_FOUND', zipLookup.code || zipLookup.zip);
  } else {
    record('USPS OAuth', true, 'SKIP — not configured');
    record('USPS address verification', true, 'SKIP — not configured');
    record('City/state lookup', true, 'SKIP — not configured');
    record('ZIP lookup', true, 'SKIP — not configured');
  }

  const leak = await fetch(`${API}/api/address/status`).then((r) => r.text());
  record(
    'OAuth secrets server-only',
    !/access_token|client_secret/i.test(leak),
    'status response sanitized'
  );

  console.log('\nSummary:', `${results.filter((r) => r.pass).length}/${results.length} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
