/**
 * Homeowner professional request beta acknowledgment smoke tests.
 * Usage: node --env-file=.env scripts/smoke-professional-request-beta.mjs [API_BASE]
 */
import { waitForAssessment } from './smoke-assessment-poll.mjs';

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

const TERMS = { ACCOUNT_TERMS: true, PRIVACY_POLICY: true };
const BETA_ACK = { PROFESSIONAL_REQUEST_BETA_ACK: true };

async function signup(ts) {
  const email = `beta.ack.${ts}@example.com`;
  const password = 'SmokePass123!';
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Beta Ack Smoke',
      email,
      password,
      consents: TERMS,
    }),
  }).then(json);
  return {
    r,
    h: r.token ? { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } : null,
  };
}

async function main() {
  console.log(`\nFixBridge professional request beta smoke @ ${API}\n`);
  const ts = Date.now();
  const { r: signupR, h } = await signup(ts);
  ok('homeowner signup', signupR.ok === true, signupR.message);
  if (!h) return;

  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Beta ack smoke leak',
      description: 'Drip under sink for beta acknowledgment smoke test.',
      serviceTiming: 'weekday',
      contactName: 'Beta Ack',
      contactPhone: '555-0199',
    }),
  }).then(json);
  ok('job created', created.ok && created.job?.id, created.message);
  if (!created.job?.id) return;
  const jobId = created.job.id;

  await waitForAssessment(API, jobId, h);

  const noAck = await fetch(`${API}/api/managed/jobs/${jobId}/request-professional`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      serviceTiming: 'weekday',
      preferredTimeSlot: '9-11',
      propertyPurpose: 'current_homeowner',
      transactionStage: 'ongoing_maintenance',
      consents: {},
    }),
  }).then(json);
  ok(
    'request-professional without acknowledgment rejected',
    !noAck.ok && noAck.code === 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
    noAck.missingAcceptanceTypes?.join(', ') || noAck.message
  );

  const withAck = await fetch(`${API}/api/managed/jobs/${jobId}/request-professional`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      serviceTiming: 'weekday',
      preferredTimeSlot: '9-11',
      propertyPurpose: 'current_homeowner',
      transactionStage: 'ongoing_maintenance',
      consents: BETA_ACK,
    }),
  }).then(json);
  ok('request-professional with beta ack allowed', withAck.ok === true, withAck.message);

  const payBlocked = await fetch(`${API}/api/managed/jobs/${jobId}/pay-dispatch`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ consents: {} }),
  }).then(json);
  ok(
    'pay-dispatch without acknowledgment rejected',
    !payBlocked.ok && payBlocked.code === 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
    payBlocked.message
  );

  const pricing = await fetch(`${API}/api/managed/jobs/${jobId}/dispatch-pricing`, { headers: h }).then(json);
  ok('dispatch pricing loaded', pricing.ok && pricing.breakdown, pricing.message);
  const visitLine = pricing.breakdown?.lines?.find((l) => l.key === 'visit_diagnostic');
  const betaLine = pricing.breakdown?.lines?.find((l) => l.key === 'assessment_coordination');
  ok('beta fee line visible in pricing', Boolean(betaLine), betaLine?.label);
  ok('contractor visit line separate', Boolean(visitLine), visitLine?.label);

  const payOk = await fetch(`${API}/api/managed/jobs/${jobId}/pay-dispatch`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ consents: BETA_ACK }),
  }).then(json);
  ok('pay-dispatch with beta ack proceeds', payOk.ok === true || payOk.code === 'STRIPE_NOT_CONFIGURED', payOk.message);

  const acceptances = await fetch(`${API}/api/homeowner/legal/history`, { headers: h }).then(json);
  const betaRecords = (acceptances.acceptances || []).filter(
    (a) => a.acceptance_type === 'PROFESSIONAL_REQUEST_BETA_ACK' && Number(a.job_id) === Number(jobId)
  );
  ok('acceptance record saved', betaRecords.length >= 1, `count=${betaRecords.length}`);
  const snap = betaRecords[0]?.snapshot_data || betaRecords[0]?.snapshotData;
  const parsedSnap = typeof snap === 'string' ? JSON.parse(snap) : snap;
  ok(
    'visit amount snapshot present',
    parsedSnap?.visitDiagnosticAmountCents > 0 || parsedSnap?.breakdown?.lines?.length > 0,
    parsedSnap ? 'snapshot ok' : 'no snapshot'
  );
  ok(
    'acceptance linked to job',
    betaRecords.length >= 1 && Number(betaRecords[0]?.job_id) === Number(jobId),
    `job=${betaRecords[0]?.job_id}`
  );

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
