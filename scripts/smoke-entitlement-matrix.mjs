/**
 * HomeCare Pro entitlement matrix smoke test.
 * Usage: node --env-file=.env scripts/smoke-entitlement-matrix.mjs
 *
 * Pro tests use SMOKE_PRO_HOMEOWNER_EMAIL/PASSWORD when set (no admin MFA required).
 */
import { smokeCredentials, missingCredsMessage } from './smoke-credentials.mjs';

const creds = smokeCredentials();
const API = creds.api;

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

async function login(role, email, password) {
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(`login failed: ${r.message}`);
  return r;
}

const MATRIX = [
  { feature: 'document_vault', method: 'POST', path: (pid) => `/api/properties/${pid}/documents`, body: { category: 'warranty', title: 'm', fileName: 'm.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,dGVzdA==' } },
  { feature: 'recurring_cleaning', method: 'GET', path: () => '/api/recurring-services' },
  { feature: 'household_sharing', method: 'GET', path: (pid) => `/api/household/${pid}` },
  { feature: 'annual_health_report', method: 'GET', path: (pid) => `/api/properties/${pid}/home-health-report` },
];

async function main() {
  console.log(`\nEntitlement matrix @ ${API}\n`);
  if (!creds.hasHomeowner) {
    ok('credentials', false, missingCredsMessage());
    return;
  }
  const maria = await login('homeowner', creds.homeownerEmail, creds.homeownerPassword);
  const freeH = { Authorization: `Bearer ${maria.token}`, 'Content-Type': 'application/json' };
  const props = await fetch(`${API}/api/properties`, { headers: freeH }).then(json);
  const pid = props.properties?.[0]?.id;

  for (const row of MATRIX) {
    const r = await fetch(`${API}${row.path(pid)}`, {
      method: row.method,
      headers: freeH,
      body: row.body ? JSON.stringify(row.body) : undefined,
    }).then(json);
    ok(`FREE blocked ${row.feature}`, r.status === 403 && r.code === 'PRO_SUBSCRIPTION_REQUIRED', `status=${r.status}`);
  }

  if (!creds.hasPro) {
    ok('PRO entitlement tests', false, 'SKIPPED — set SMOKE_PRO_HOMEOWNER_EMAIL/PASSWORD (pre-configured Pro account)');
    console.log('\nDone.\n');
    return;
  }

  const pro = await login('homeowner', creds.proEmail, creds.proPassword);
  const proH = { Authorization: `Bearer ${pro.token}`, 'Content-Type': 'application/json' };

  for (const row of MATRIX) {
    const r = await fetch(`${API}${row.path(pid)}`, {
      method: row.method,
      headers: proH,
      body: row.body ? JSON.stringify(row.body) : undefined,
    }).then(json);
    ok(`PRO allowed ${row.feature}`, r.status !== 403 || r.code !== 'PRO_SUBSCRIPTION_REQUIRED', `status=${r.status}`);
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
