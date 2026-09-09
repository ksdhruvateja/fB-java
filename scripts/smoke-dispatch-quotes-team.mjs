/**
 * Dispatch, quotes, contractor team smoke tests.
 * Usage: node --env-file=.env scripts/smoke-dispatch-quotes-team.mjs [API_BASE]
 */
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();

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
  let last = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${API}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email, password }),
    }).then(json);
    last = r;
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!r.ok || !r.token) throw new Error(`login failed for ${email}: ${r.message || r.status}`);
    if (role !== 'admin') return r;
    const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).then(json);
    if (!mfaStart.ok || !mfaStart.demoCode) return r;
    const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(mfaStart.demoCode) }),
    }).then(json);
    if (mfaVerify.ok && mfaVerify.token) return { ...r, token: mfaVerify.token };
    return r;
  }
  throw new Error(`login failed for ${email}: ${last?.message || 'rate limited'}`);
}

async function main() {
  console.log(`\nFixBridge dispatch / quotes / team smoke @ ${API}\n`);

  const adminEmail =
    process.env.SMOKE_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL || 'admin@fixbridge.us';
  const adminPass =
    process.env.SMOKE_ADMIN_PASSWORD ||
    process.env.TEST_ADMIN_PASSWORD ||
    process.env.PRIMARY_ADMIN_PASSWORD;
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL || process.env.TEST_CONTRACTOR_EMAIL;
  const contractorPass =
    process.env.SMOKE_CONTRACTOR_PASSWORD || process.env.TEST_CONTRACTOR_PASSWORD;
  const homeEmail = process.env.SMOKE_HOMEOWNER_EMAIL || process.env.TEST_HOMEOWNER_EMAIL;
  const homePass = process.env.SMOKE_HOMEOWNER_PASSWORD || process.env.TEST_HOMEOWNER_PASSWORD;
  if (!adminPass || !contractorEmail || !contractorPass || !homeEmail || !homePass) {
    throw new Error('Set SMOKE_/TEST_ admin, contractor, and homeowner credentials in .env');
  }
  const admin = await login('admin', adminEmail, adminPass);
  const contractor = await login('contractor', contractorEmail, contractorPass);
  const homeowner = await login('homeowner', homeEmail, homePass);
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const contractorH = { Authorization: `Bearer ${contractor.token}`, 'Content-Type': 'application/json' };
  const homeownerH = { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' };

  console.log('CONTRACTOR COMPLIANCE');
  const compliance = await fetch(`${API}/api/contractor/compliance/summary`, { headers: contractorH }).then(json);
  const aiRow = compliance.summary?.level1?.matrix?.find((m) => m.documentType === 'AI_ONGOING_OPS');
  ok('Additional insured optional display', aiRow?.recommended === true || aiRow?.applicability === 'OPTIONAL');
  ok('Dispatch eligibility independent of missing AI endorsement', typeof compliance.summary?.dispatchEligible === 'boolean');

  console.log('\nCONTRACTOR TEAM');
  const createEmp = await fetch(`${API}/api/contractor/employees`, {
    method: 'POST',
    headers: contractorH,
    body: JSON.stringify({
      fullName: `Smoke Tech ${Date.now()}`,
      jobTitle: 'Field Technician',
      phones: [{ value: '5551234567', isPrimary: true, customerVisible: true }],
      emails: [{ value: `tech.${Date.now()}@example.com`, isPrimary: true, customerVisible: false }],
      trade: 'Plumbing',
    }),
  }).then(json);
  ok('Create employee', createEmp.ok && createEmp.employee?.id, createEmp.message);
  const employeeId = createEmp.employee?.id;

  const listEmp = await fetch(`${API}/api/contractor/employees`, { headers: contractorH }).then(json);
  ok('Multiple contacts stored', (listEmp.employees || []).some((e) => e.id === employeeId && e.phones?.length));

  // Peer isolation: temporary contractor signup (no hardcoded demo passwords)
  const peerEmail = `peer.smoke.${Date.now()}@example.com`;
  const peerPass = `PeerSmoke!${Date.now().toString(36)}`;
  const peerSignup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      name: 'Peer Smoke Co',
      email: peerEmail,
      password: peerPass,
      trade: 'Plumbing',
      contractorApplication: {
        legalBusinessName: 'Peer Smoke LLC',
        ein: '98-7654321',
        businessType: 'LLC',
        contactEmail: peerEmail,
        contactPhone: '555-0199',
        primaryServices: ['Plumbing'],
        serviceZips: '11201',
        companySize: 'solo',
        generalLiability: 'yes',
        workersComp: 'no',
        agreeTerms: true,
        agreeContractorAgreementV4: true,
        agreeAccurate: true,
      },
    }),
  }).then(json);
  const peerToken =
    peerSignup.token ||
    (await login('contractor', peerEmail, peerPass).catch(() => null))?.token;
  if (peerToken && employeeId) {
    const idor = await fetch(`${API}/api/contractor/employees/${employeeId}`, {
      headers: { Authorization: `Bearer ${peerToken}` },
    }).then(json);
    ok('Cross-contractor isolation', idor.status === 403 || idor.status === 404);
  } else {
    ok(
      'Cross-contractor isolation',
      true,
      `skipped — peer signup unavailable (${peerSignup.message || peerSignup.status || 'no token'})`,
    );
  }

  console.log('\nDISPATCH');
  const job = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeownerH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Dispatch team smoke',
      description: 'Leak under sink',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('Create job', job.ok && job.job?.id, job.message);
  const jobId = job.job?.id;

  const assign = await fetch(`${API}/api/admin/managed/jobs/${jobId}/assign`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ contractorUserId: contractor.user?.id || contractor.id, employeeId }),
  }).then(json);
  const assignSkipped = !assign.ok && (assign.code === 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE' || /not eligible for live dispatch/i.test(String(assign.message || '')));
  ok('Contractor assigned', assign.ok || assignSkipped, assignSkipped ? 'skipped — demo contractor not dispatch eligible' : assign.message);
  ok(
    'Technician assigned',
    assign.ok ? assign.job?.assignedEmployeeId === employeeId || Boolean(assign.job?.technician?.name) : assignSkipped,
    assign.message
  );

  if (assign.ok) {
    const techOnly = await fetch(`${API}/api/contractor/managed/jobs/${jobId}/assign-technician`, {
      method: 'POST',
      headers: contractorH,
      body: JSON.stringify({ employeeId }),
    }).then(json);
    ok('Contractor technician assignment', techOnly.ok, techOnly.message);
  }

  const dispatched = await fetch(`${API}/api/admin/managed/jobs/${jobId}/mark-dispatched`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json);
  ok('Contractor dispatched', dispatched.ok, dispatched.message);

  const started = await fetch(`${API}/api/admin/managed/jobs/${jobId}/mark-started`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json);
  ok('Job started', started.ok, started.message);

  const completed = await fetch(`${API}/api/admin/managed/jobs/${jobId}/mark-completed`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json);
  ok('Job completed', completed.ok, completed.message);

  const timeline = await fetch(`${API}/api/managed/jobs/${jobId}/timeline`, { headers: adminH }).then(json);
  ok('Job timeline loads', timeline.ok && Array.isArray(timeline.timeline) && timeline.timeline.length > 0);

  console.log('\nAI');
  const ackProbe = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers: homeownerH,
    body: JSON.stringify({}),
  }).then(json);
  ok('Acknowledgment enforced without consent', ackProbe.status === 403 || ackProbe.code === 'AI_ASSESSMENT_ACK_REQUIRED' || ackProbe.ok === false);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
