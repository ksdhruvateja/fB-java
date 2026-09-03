/**
 * AI assessment acknowledgment smoke tests.
 * Usage: node --env-file=.env scripts/smoke-ai-assessment-ack.mjs [API_BASE]
 */
import { parseJsonResponse } from './smoke-assessment-poll.mjs';
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();
const stamp = Date.now();

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner', email, password }),
  }).then(parseJsonResponse);
  return res.token ? { Authorization: `Bearer ${res.token}`, 'Content-Type': 'application/json' } : null;
}

function aiAssessBody(extra = {}) {
  const invocationId = `smoke-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    assessmentInvocationId: invocationId,
    consents: { AI_ASSESSMENT_ACK: true },
    ...extra,
  };
}

async function createJob(h) {
  return fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      category: 'Plumbing',
      title: `AI ack smoke ${stamp}`,
      description: 'Slow drip under kitchen sink cabinet.',
      preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      preferredTimeSlot: '9-12',
      cityStateZip: 'Brooklyn, NY 11201',
      fullAddress: '123 Test St, Brooklyn, NY 11201',
      contactName: 'Smoke User',
      contactPhone: '5551234567',
      zip: '11201',
    }),
  }).then(parseJsonResponse);
}

async function countAiAcks(h, jobId) {
  const adminEmail = process.env.PRIMARY_ADMIN_EMAIL || 'admin@fixbridge.com';
  const adminPass = process.env.PRIMARY_ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD;
  if (!adminPass) return null;
  const admin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', email: adminEmail, password: adminPass }),
  }).then(parseJsonResponse);
  if (!admin.token || admin.mfaRequired) return null;
  const adminH = { Authorization: `Bearer ${admin.token}` };
  const res = await fetch(`${API}/api/admin/homeowner-acceptances?jobId=${jobId}`, { headers: adminH }).then(
    parseJsonResponse
  );
  if (!res.ok) return null;
  const rows = Array.isArray(res.acceptances) ? res.acceptances : [];
  return rows.filter((r) => r.acceptanceType === 'AI_ASSESSMENT_ACK').length;
}

async function main() {
  console.log(`\nFixBridge AI assessment acknowledgment @ ${API}\n`);

  const homeEmail = process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com';
  const homePass = process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123';
  const h = await login(homeEmail, homePass);
  if (!h) {
    console.error('Login failed');
    process.exit(1);
  }

  const created = await createJob(h);
  ok('create job', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;
  if (!jobId) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  const blocked = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({}),
  }).then(parseJsonResponse);
  ok('direct API bypass rejected', blocked.code === 'AI_ASSESSMENT_ACK_REQUIRED', blocked.code);

  const missingConsent = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ assessmentInvocationId: `no-consent-${stamp}` }),
  }).then(parseJsonResponse);
  ok('missing consent rejected', missingConsent.code === 'AI_ASSESSMENT_ACK_REQUIRED', missingConsent.code);

  const first = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(aiAssessBody()),
  }).then(parseJsonResponse);
  ok('assess with acknowledgment accepted', first.ok, first.message || first.status);

  const reforceNoAck = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ force: true }),
  }).then(parseJsonResponse);
  ok('re-assess without new ack blocked', reforceNoAck.code === 'AI_ASSESSMENT_ACK_REQUIRED', reforceNoAck.code);

  const reforce = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(aiAssessBody({ force: true })),
  }).then(parseJsonResponse);
  ok('re-assess with new acknowledgment accepted', reforce.ok, reforce.message || reforce.status);

  const adminAckCount = await countAiAcks(h, jobId);
  if (adminAckCount != null) {
    ok('acceptance persisted per invocation (admin audit)', adminAckCount >= 2, `count=${adminAckCount}`);
  } else {
    console.log('SKIP  acceptance audit count — admin MFA token unavailable in smoke env');
  }

  const legacyAi = await fetch(`${API}/api/ai/assess`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      category: 'Plumbing',
      description: 'Dripping faucet',
    }),
  }).then(parseJsonResponse);
  ok('legacy /api/ai/assess blocked without ack', legacyAi.code === 'AI_ASSESSMENT_ACK_REQUIRED', legacyAi.code);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
