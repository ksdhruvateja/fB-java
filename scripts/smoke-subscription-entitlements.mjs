/**
 * HomeCare Pro entitlement smoke tests.
 * Usage: node --env-file=.env scripts/smoke-subscription-entitlements.mjs
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
  if (!r.ok || !r.token) throw new Error(`login failed for ${email}: ${r.message || r.status}`);
  return r;
}

async function main() {
  console.log(`\nFixBridge HomeCare Pro entitlements @ ${API}\n`);
  if (!creds.hasHomeowner) {
    ok('credentials', false, missingCredsMessage());
    return;
  }

  const maria = await login('homeowner', creds.homeownerEmail, creds.homeownerPassword);
  const freeH = { Authorization: `Bearer ${maria.token}`, 'Content-Type': 'application/json' };

  const props = await fetch(`${API}/api/properties`, { headers: freeH }).then(json);
  ok('free user can list properties', props.ok === true, props.message);
  const propertyId = props.properties?.[0]?.id;
  ok('free user has a property fixture', Boolean(propertyId));

  const freeDocs = props.properties?.[0]?.documents;
  ok('free user properties omit vault documents', !freeDocs || freeDocs.length === 0, `count=${freeDocs?.length ?? 0}`);

  const uploadAttempt = await fetch(`${API}/api/properties/${propertyId}/documents`, {
    method: 'POST',
    headers: freeH,
    body: JSON.stringify({
      category: 'warranty',
      title: 'Entitlement probe',
      fileName: 'probe.txt',
      mimeType: 'text/plain',
      dataUrl: 'data:text/plain;base64,cHJvYmU=',
    }),
  }).then(json);
  ok(
    'free user document upload rejected',
    uploadAttempt.status === 403 && uploadAttempt.code === 'PRO_SUBSCRIPTION_REQUIRED',
    `status=${uploadAttempt.status} code=${uploadAttempt.code}`
  );
  ok('upload rejection includes feature', uploadAttempt.feature === 'document_vault');

  const mariaUserId = maria.user?.id;
  ok('homeowner user id available', Boolean(mariaUserId));

  if (!creds.hasPro) {
    ok('pro user document upload allowed', false, 'SKIPPED — set SMOKE_PRO_HOMEOWNER_EMAIL/PASSWORD');
    console.log('\nDone.\n');
    return;
  }

  const mariaPro = await login('homeowner', creds.proEmail, creds.proPassword);
  const proH = { Authorization: `Bearer ${mariaPro.token}`, 'Content-Type': 'application/json' };

  let docId = null;
  const proUpload = await fetch(`${API}/api/properties/${propertyId}/documents`, {
    method: 'POST',
    headers: proH,
    body: JSON.stringify({
      category: 'warranty',
      title: 'Entitlement probe pro',
      fileName: 'probe-pro.txt',
      mimeType: 'text/plain',
      dataUrl: 'data:text/plain;base64,cHJvYmU=',
    }),
  }).then(json);
  ok('pro user document upload allowed', proUpload.ok === true, proUpload.message);
  docId = proUpload.document?.id;

  if (docId) {
    const analyze = await fetch(`${API}/api/properties/${propertyId}/documents/${docId}/analyze`, {
      method: 'POST',
      headers: proH,
    }).then(json);
    ok(
      'pro user document analyze not blocked by entitlement',
      analyze.status !== 403 || analyze.code !== 'PRO_SUBSCRIPTION_REQUIRED',
      analyze.message || `status=${analyze.status}`
    );
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
