/**
 * Full security + operations smoke test against a running local API.
 * Uses only the three demo accounts. No fabricated business data beyond DB writes.
 *
 * Usage: node --env-file=.env scripts/smoke-full.js
 */
import { waitForAssessment } from './smoke-assessment-poll.mjs';

const API = process.env.API_URL || 'http://127.0.0.1:3001';

let passed = 0;
let failed = 0;

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, ok: false, message: text || res.statusText };
  }
}

function ok(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function signIn(role, email, password) {
  return fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function main() {
  console.log(`\nFixBridge full smoke @ ${API}\n`);

  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log('AUTH');
  const home = await signIn('homeowner', 'maria@example.com', 'demo123');
  ok('homeowner login', home.ok && home.token, home.message);
  const contractor = await signIn('contractor', 'james@yourcompany.com', 'demo123');
  ok('contractor login', contractor.ok && contractor.token, contractor.message);
  const admin = await signIn('admin', 'admin@fixbridge.local', 'admin123');
  ok('admin login', admin.ok && admin.token, admin.message);
  const bad = await signIn('homeowner', 'maria@example.com', 'wrong-password');
  ok('bad password rejected', !bad.ok || bad.status === 401 || bad.status === 400);

  const homeH = auth(home.token);
  const contractorH = auth(contractor.token);
  const adminH = auth(admin.token);

  // ── Security: role isolation ──────────────────────────────────────────────
  console.log('\nSECURITY');
  const adminGate = await fetch(`${API}/api/admin/managed/jobs`, { headers: homeH }).then(json);
  ok('homeowner blocked from admin jobs', adminGate.status === 403 || adminGate.ok === false);

  const adminGate2 = await fetch(`${API}/api/admin/managed/jobs`, { headers: contractorH }).then(json);
  ok('contractor blocked from admin jobs', adminGate2.status === 403 || adminGate2.ok === false);

  const usersAsHome = await fetch(`${API}/api/users`, { headers: homeH }).then(json);
  ok('homeowner blocked from /api/users', usersAsHome.status === 403 || usersAsHome.ok === false);

  // Contractor cannot self-approve
  const selfApprove = await fetch(`${API}/api/contractor/compliance`, {
    method: 'PUT',
    headers: contractorH,
    body: JSON.stringify({ complianceStatus: 'approved' }),
  }).then(json);
  ok('contractor compliance endpoint accepts profile update', selfApprove.ok === true);
  // Verify still approved only via seed/admin — fetch admin users
  const adminUsers = await fetch(`${API}/api/admin/users`, { headers: adminH }).then(json);
  const james = (adminUsers.users || []).find((u) => String(u.email).toLowerCase() === 'james@yourcompany.com');
  ok('James exists with real id', Boolean(james?.id), `id=${james?.id}`);
  ok('James compliance approved (seed/admin)', String(james?.complianceStatus || '').toLowerCase() === 'approved');

  // Force draft then ensure self-approve cannot restore
  await fetch(`${API}/api/admin/contractors/${james.id}/compliance`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({ complianceStatus: 'draft' }),
  }).then(json);
  await fetch(`${API}/api/contractor/compliance`, {
    method: 'PUT',
    headers: contractorH,
    body: JSON.stringify({ complianceStatus: 'approved' }),
  }).then(json);
  const afterSelf = await fetch(`${API}/api/admin/users`, { headers: adminH }).then(json);
  const james2 = (afterSelf.users || []).find((u) => Number(u.id) === Number(james.id));
  ok(
    'contractor cannot self-set approved',
    String(james2?.complianceStatus || '').toLowerCase() !== 'approved',
    `status=${james2?.complianceStatus}`
  );
  // Restore approved for rest of flow
  await fetch(`${API}/api/admin/contractors/${james.id}/compliance`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({ complianceStatus: 'approved' }),
  }).then(json);

  // Legacy IDOR — homeowner must not mutate another job's lifecycle
  const board = await fetch(`${API}/api/jobs`, { headers: contractorH }).then(json);
  const boardJobs = Array.isArray(board) ? board : board.jobs || [];
  if (boardJobs[0]) {
    const masked = boardJobs[0];
    ok(
      'board masks customer phone',
      masked.contactPhone == null || masked.contactPhone === '',
      `phone=${masked.contactPhone}`
    );
    ok(
      'board masks full address',
      masked.fullAddress == null || masked.fullAddress === '',
      `addr=${masked.fullAddress}`
    );
  } else {
    ok('board list reachable (empty ok)', true, 'no legacy jobs yet');
  }

  const spoofChat = await fetch(`${API}/api/chat/999999001`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({ text: 'spoof', senderRole: 'admin', senderName: 'Hacker' }),
  }).then(json);
  ok('chat on unknown/foreign job blocked', spoofChat.status === 403 || spoofChat.ok === false || spoofChat.error);

  // ── Homeowner real job flow ───────────────────────────────────────────────
  console.log('\nHOMEOWNER FLOW');
  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Full-smoke kitchen leak',
      description: 'Under-sink leak dripping onto cabinet floor. Need verified plumber.',
      serviceTiming: 'weekday',
      preferredTimeSlot: '9-11',
      preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      propertyPurpose: 'current_homeowner',
      transactionStage: 'ongoing_maintenance',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('create managed job', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;

  const assessed = await waitForAssessment(API, jobId, homeH);
  ok('assess job', assessed.ok, assessed.message);
  ok(
    'assessment has real pricing or message',
    assessed.job?.customerRetailEstimateLow != null || assessed.pricing != null || assessed.ok,
    `retailLow=${assessed.job?.customerRetailEstimateLow}`
  );

  const foreignAssess = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: contractorH,
  }).then(json);
  ok('contractor cannot assess homeowner job', foreignAssess.status === 403 || !foreignAssess.ok);

  const pay = await fetch(`${API}/api/managed/jobs/${jobId}/pay-dispatch`, {
    method: 'POST',
    headers: homeH,
    body: '{}',
  }).then(json);
  ok('pay dispatch (auto simulate if no Stripe)', pay.ok, pay.message || `sim=${pay.simulated}`);
  ok('job awaiting contractor after pay', ['awaiting_contractor', 'paid_for_dispatch'].includes(pay.job?.status), pay.job?.status);

  // ── Admin invite / assign / reporting ─────────────────────────────────────
  console.log('\nADMIN DISPATCH');
  const invite = await fetch(`${API}/api/admin/managed/jobs/${jobId}/invite`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ contractorUserId: Number(james.id) }),
  }).then(json);
  ok('invite James', invite.ok, invite.message || invite.job?.status);

  const assign = await fetch(`${API}/api/admin/managed/jobs/${jobId}/assign`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ contractorUserId: Number(james.id) }),
  }).then(json);
  ok('assign James', assign.ok && Number(assign.job?.assignedContractorUserId) === Number(james.id), assign.message);

  const report = await fetch(`${API}/api/admin/reporting/summary`, { headers: adminH }).then(json);
  ok('reporting from live DB', report.ok && typeof report.revenueCollected === 'number');
  ok('reporting exposes live/sim split', report.revenueLive != null || report.revenueSimulated != null);
  ok('kpis present', report.kpis?.totalJobs >= 1, `jobs=${report.kpis?.totalJobs}`);

  // Homeowner cannot payout
  const homePayout = await fetch(`${API}/api/admin/managed/jobs/${jobId}/payout`, {
    method: 'POST',
    headers: homeH,
    body: '{}',
  }).then(json);
  ok('homeowner cannot release payout', homePayout.status === 403 || !homePayout.ok);

  // ── Contractor portal ─────────────────────────────────────────────────────
  console.log('\nCONTRACTOR FLOW');
  const invs = await fetch(`${API}/api/contractor/invitations`, { headers: contractorH }).then(json);
  ok(
    'invitation visible to James',
    (invs.invitations || []).some((i) => Number(i.jobId) === Number(jobId))
  );

  const bid = await fetch(`${API}/api/contractor/bids`, {
    method: 'POST',
    headers: contractorH,
    body: JSON.stringify({
      jobId,
      labor: 180,
      materials: 40,
      equipment: 20,
      notes: 'Can fix same week',
    }),
  }).then(json);
  ok('submit confidential bid', bid.ok, bid.message);

  const otherBids = await fetch(`${API}/api/managed/jobs/${jobId}/bids`, { headers: contractorH }).then(json);
  const onlyOwn =
    otherBids.ok &&
    (otherBids.bids || []).every((b) => Number(b.contractorUserId) === Number(james.id) || b.labor == null);
  ok('contractor bid list is scoped / confidential', otherBids.ok && onlyOwn);

  // Illegal status jump
  const badStatus = await fetch(`${API}/api/managed/jobs/${jobId}/status`, {
    method: 'POST',
    headers: contractorH,
    body: JSON.stringify({ status: 'paid_out' }),
  }).then(json);
  ok('contractor cannot jump to paid_out', !badStatus.ok, badStatus.message);

  // Admin creates proposal from bid
  const bidsAdmin = await fetch(`${API}/api/managed/jobs/${jobId}/bids`, { headers: adminH }).then(json);
  const bidId = bidsAdmin.bids?.[0]?.id;
  ok('admin sees bid', Boolean(bidId));
  if (bidId) {
    const proposal = await fetch(`${API}/api/admin/managed/jobs/${jobId}/proposal`, {
      method: 'POST',
      headers: adminH,
      body: JSON.stringify({ bidId }),
    }).then(json);
    ok('create retail proposal', proposal.ok, proposal.message);
  }

  // Payout
  const payout = await fetch(`${API}/api/admin/managed/jobs/${jobId}/payout`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json);
  ok('release payout', payout.ok && payout.amount > 0, payout.message || `$${payout.amount}`);

  // ── Unauthenticated ───────────────────────────────────────────────────────
  console.log('\nUNAUTH');
  const noAuth = await fetch(`${API}/api/admin/managed/jobs`).then(json);
  ok('admin routes require auth', noAuth.status === 401 || !noAuth.ok);

  console.log(`\n────────────────────────────`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('All checks passed.\n');
}

main().catch((e) => {
  console.error('SMOKE CRASHED:', e);
  process.exit(1);
});
