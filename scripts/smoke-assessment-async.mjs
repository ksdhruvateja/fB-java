/**
 * Smoke test: async AI assessment flow (202 + poll, no raw HTML paths).
 * Usage: node --env-file=.env scripts/smoke-assessment-async.mjs
 */
import { waitForAssessment, parseJsonResponse } from './smoke-assessment-poll.mjs';

const API = process.env.API_URL || 'http://127.0.0.1:3001';
const stamp = Date.now();

let passed = 0;
let failed = 0;

function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(parseJsonResponse);
  return res.token ? { Authorization: `Bearer ${res.token}` } : null;
}

async function main() {
  console.log('\nASSESSMENT ASYNC SMOKE\n');

  const homeEmail = process.env.SMOKE_HOMEOWNER_EMAIL || 'maria.santos@example.com';
  const homePass = process.env.SMOKE_HOMEOWNER_PASSWORD || 'password123';
  const homeH = await login(homeEmail, homePass);
  if (!homeH) {
    console.error('Login failed — set SMOKE_HOMEOWNER_EMAIL/PASSWORD');
    process.exit(1);
  }

  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: { ...homeH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Plumbing',
      title: `Async assess ${stamp}`,
      description: 'Kitchen sink dripping slowly under cabinet.',
      preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      preferredTimeSlot: '9-12',
      cityStateZip: 'Brooklyn, NY 11201',
      fullAddress: '123 Test St, Brooklyn, NY 11201',
      contactName: 'Maria Santos',
      contactPhone: '5551234567',
      zip: '11201',
    }),
  }).then(parseJsonResponse);

  ok('create job', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;
  if (!jobId) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const start = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: { ...homeH, 'Content-Type': 'application/json' },
    body: '{}',
  }).then(parseJsonResponse);

  ok('assess returns quickly', start.ok, `status=${start.status || start.assessmentStatus}`);
  ok(
    'assess is processing (not blocking)',
    start.status === 'processing' || start.assessmentStatus === 'processing' || start.status === 'ready',
    String(start.status || start.assessmentStatus)
  );

  const assessed = await waitForAssessment(API, jobId, homeH, { maxAttempts: 45, intervalMs: 2000 });
  ok('assessment completes', assessed.ok && assessed.status === 'ready', assessed.message || assessed.status);
  ok(
    'assessment payload present',
    Boolean(assessed.job?.aiAssessment || assessed.job?.customerRetailEstimateLow != null),
    `hasAi=${Boolean(assessed.job?.aiAssessment)}`
  );

  const dup = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: { ...homeH, 'Content-Type': 'application/json' },
    body: '{}',
  }).then(parseJsonResponse);
  ok(
    'duplicate assess joins existing ready job',
    dup.ok && (dup.status === 'ready' || dup.assessmentStatus === 'ready'),
    dup.status || dup.assessmentStatus
  );

  const status = await fetch(`${API}/api/managed/jobs/${jobId}/assessment-status`, {
    headers: homeH,
  }).then(parseJsonResponse);
  ok('status endpoint ready', status.ok && status.status === 'ready', status.message);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
