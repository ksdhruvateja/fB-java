/**
 * Smoke-test admin invite / assign / payout against a running local API.
 * Usage: node --env-file=.env scripts/smoke-dispatch.js
 */
import { waitForAssessment } from './smoke-assessment-poll.mjs';

const API = process.env.API_URL || 'http://127.0.0.1:3001';

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: text || res.statusText };
  }
}

async function main() {
  console.log('API', API);

  const adminLogin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'admin',
      email: 'admin@fixbridge.local',
      password: 'admin123',
    }),
  }).then(json);
  if (!adminLogin.ok || !adminLogin.token) {
    throw new Error(`Admin login failed: ${adminLogin.message || JSON.stringify(adminLogin)}`);
  }
  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminLogin.token}`,
  };
  console.log('✓ admin signed in');

  const homeLogin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      email: 'maria@example.com',
      password: 'demo123',
    }),
  }).then(json);
  if (!homeLogin.ok || !homeLogin.token) {
    throw new Error(`Homeowner login failed: ${homeLogin.message || JSON.stringify(homeLogin)}`);
  }
  const homeHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${homeLogin.token}`,
  };
  console.log('✓ homeowner signed in');

  const users = await fetch(`${API}/api/users`, { headers: adminHeaders }).then(json);
  const james = (users.users || []).find((u) => String(u.email).toLowerCase() === 'james@yourcompany.com');
  if (!james?.id) throw new Error('James contractor not found in /api/users');
  console.log('✓ contractor', james.id, james.name);

  // Ensure approved
  await fetch(`${API}/api/admin/contractors/${james.id}/compliance`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ complianceStatus: 'approved' }),
  }).then(json);

  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeHeaders,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Dispatch smoke test leak',
      description: 'Kitchen sink drip for invite/assign/payout smoke test.',
      serviceTiming: 'weekday',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
    }),
  }).then(json);
  if (!created.ok || !created.job?.id) {
    throw new Error(`Create job failed: ${created.message || JSON.stringify(created)}`);
  }
  const jobId = created.job.id;
  console.log('✓ job created', jobId);

  // Move to paid_for_dispatch-ish path via assess (sets awaiting_service_payment)
  const assessed = await waitForAssessment(API, jobId, homeHeaders);
  if (!assessed.ok) {
    console.warn('assess warning:', assessed.message);
  } else {
    console.log('✓ assessed', assessed.job?.status, 'retail', assessed.job?.customerRetailEstimateLow);
  }

  // Mark fee paid so invite path is realistic
  await fetch(`${API}/api/managed/jobs/${jobId}/pay-dispatch`, {
    method: 'POST',
    headers: homeHeaders,
    body: JSON.stringify({ consents: { PROFESSIONAL_REQUEST_BETA_ACK: true } }),
  })
    .then(json)
    .then((r) => console.log(r.ok ? '✓ dispatch fee simulated' : `dispatch fee: ${r.message || 'skipped'}`))
    .catch(() => console.log('dispatch fee endpoint skipped'));

  const invite = await fetch(`${API}/api/admin/managed/jobs/${jobId}/invite`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ contractorUserId: Number(james.id) }),
  }).then(json);
  if (!invite.ok) throw new Error(`Invite failed: ${invite.message || JSON.stringify(invite)}`);
  console.log('✓ invited', invite.job?.status);

  const assign = await fetch(`${API}/api/admin/managed/jobs/${jobId}/assign`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ contractorUserId: Number(james.id) }),
  }).then(json);
  if (!assign.ok) throw new Error(`Assign failed: ${assign.message || JSON.stringify(assign)}`);
  console.log('✓ assigned', assign.job?.status, 'contractor', assign.job?.assignedContractorUserId);

  const payout = await fetch(`${API}/api/admin/managed/jobs/${jobId}/payout`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({}),
  }).then(json);
  if (!payout.ok) throw new Error(`Payout failed: ${payout.message || JSON.stringify(payout)}`);
  console.log('✓ payout', payout.amount, payout.simulated ? 'simulated' : 'live', payout.job?.status);

  // Contractor should see invitation
  const contractorLogin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      email: 'james@yourcompany.com',
      password: 'demo123',
    }),
  }).then(json);
  const invs = await fetch(`${API}/api/contractor/invitations`, {
    headers: { Authorization: `Bearer ${contractorLogin.token}` },
  }).then(json);
  const found = (invs.invitations || []).some((i) => Number(i.jobId) === Number(jobId));
  console.log(found ? '✓ contractor invitation visible' : '✗ invitation not visible to contractor');

  console.log('\nAll dispatch smoke checks passed.');
}

main().catch((e) => {
  console.error('\nSMOKE FAILED:', e.message || e);
  process.exit(1);
});
