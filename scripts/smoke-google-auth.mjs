/**
 * Google authentication smoke tests (API-level).
 * Usage: node --env-file=.env scripts/smoke-google-auth.mjs [API_BASE]
 */
const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function main() {
  console.log(`\nFixBridge Google auth smoke @ ${API}\n`);

  const cfg = await fetch(`${API}/api/auth/google/config`).then(json);
  ok('google config endpoint', cfg.ok === true, `configured=${cfg.configured}`);

  const noCred = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner' }),
  }).then(json);
  ok('missing credential rejected', noCred.status === 400 || noCred.ok === false, noCred.message);

  const forged = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner', credential: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid' }),
  }).then(json);
  ok(
    'forged credential rejected',
    forged.status === 401 || forged.status === 503 || forged.ok === false,
    forged.message
  );

  const adminUnknown = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', credential: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid' }),
  }).then(json);
  ok(
    'admin forged/invalid blocked',
    adminUnknown.status === 401 || adminUnknown.status === 403 || adminUnknown.status === 503 || adminUnknown.ok === false,
    adminUnknown.message
  );

  const contractorNoAgreement = await fetch(`${API}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      intent: 'signup',
      credential: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
      agreeContractorAgreementV4: false,
    }),
  }).then(json);
  ok(
    'contractor signup without agreement blocked (when token invalid path)',
    contractorNoAgreement.status >= 400 || contractorNoAgreement.ok === false,
    contractorNoAgreement.message
  );

  const linkedNoAuth = await fetch(`${API}/api/auth/google/linked`).then(json);
  ok('linked sign-in methods requires auth', linkedNoAuth.status === 401 || linkedNoAuth.ok === false, linkedNoAuth.message);

  const ts = Date.now();
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Google Link Smoke',
      email: `google.link.${ts}@example.com`,
      password: 'SmokePass123!',
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  ok('password homeowner signup for link test', signup.ok === true, signup.message);

  if (signup.token) {
    const linked = await fetch(`${API}/api/auth/google/linked`, {
      headers: { Authorization: `Bearer ${signup.token}` },
    }).then(json);
    ok('linked endpoint returns password enabled for email signup', linked.ok && linked.password?.enabled === true);
    ok('linked endpoint google not connected initially', linked.ok && linked.google?.connected === false);
  }

  console.log('\nGoogle auth smoke complete.\n');
  if (!cfg.configured) {
    console.log('Note: GOOGLE_CLIENT_ID not configured — live Google token tests skipped.\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
