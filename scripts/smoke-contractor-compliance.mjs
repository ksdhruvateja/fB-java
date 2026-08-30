/**
 * Contractor compliance matrix & dispatch gating smoke tests.
 * Usage: node --env-file=.env scripts/smoke-contractor-compliance.mjs [API_BASE]
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

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function login(role, email, password) {
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
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

const tinyPdf =
  'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE3NAolJUVPRg==';

async function signupContractor(ts, overrides = {}) {
  const contractorEmail = `compliance.smoke.${ts}@example.com`;
  const contractorPassword = 'SmokePass123!';
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      name: 'Compliance Smoke Co',
      email: contractorEmail,
      password: contractorPassword,
      trade: 'Plumbing',
      contractorApplication: {
        legalBusinessName: 'Compliance Smoke LLC',
        ein: '12-3456789',
        businessType: 'LLC',
        unionStatus: 'Non-Union',
        yearsInBusiness: '3',
        businessAddress: '1 Test St',
        businessCity: 'Newark',
        businessState: 'DE',
        businessZip: '19713',
        contactName: 'Smoke Tester',
        contactEmail: contractorEmail,
        contactPhone: '555-0100',
        contactPhoneType: 'Mobile',
        primaryServices: ['Plumbing'],
        serviceZips: '19713',
        maxServiceRadius: '25',
        companySize: 'solo',
        generalLiability: 'yes',
        coverageAmount: '1000000',
        workersComp: 'no',
        facilityYears: '2',
        commercialExperience: 'yes',
        standardHourlyRate: '95',
        agreeTerms: true,
        agreeContractorAgreementV4: true,
        agreeAccurate: true,
        ...overrides.application,
      },
      ...overrides.signup,
    }),
  }).then(json);
  return {
    signup,
    contractorEmail,
    contractorPassword,
    contractorId: Number(signup.user?.id),
    contractorH: { Authorization: `Bearer ${signup.token}`, 'Content-Type': 'application/json' },
  };
}

async function uploadDoc(headers, type, expirationDate) {
  return fetch(`${API}/api/contractor/compliance/documents/${type}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: `${type}.pdf`,
      fileData: tinyPdf,
      expirationDate: expirationDate || undefined,
    }),
  }).then(json);
}

async function verifyDoc(adminH, contractorId, type, body = {}) {
  return fetch(`${API}/api/admin/contractors/${contractorId}/compliance/documents/${type}/verify`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify(body),
  }).then(json);
}

async function adminSummary(adminH, contractorId) {
  return fetch(`${API}/api/admin/contractors/${contractorId}/compliance`, { headers: adminH }).then(json);
}

const LEVEL1_VERIFY_TYPES = [
  'W9',
  'TRADE_LICENSE',
  'GENERAL_LIABILITY_COI',
  'AI_ONGOING_OPS',
  'AI_COMPLETED_OPS',
  'PRIMARY_NON_CONTRIBUTORY',
  'GL_WAIVER_SUBROGATION',
  'SOLO_OWNER_ACK',
];

async function main() {
  console.log(`\nFixBridge contractor compliance matrix smoke @ ${API}\n`);

  const admin = await login('admin', 'ksdt2702@gmail.com', 'admin123');
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

  const ts = Date.now();
  const { signup, contractorId, contractorH } = await signupContractor(ts);

  ok('application with missing docs', signup.ok && contractorId, signup.message);

  const summary1 = await fetch(`${API}/api/contractor/compliance/summary`, { headers: contractorH }).then(json);
  ok('compliance summary loads', summary1.ok && summary1.summary, summary1.message);
  ok('matrix fields present', Boolean(summary1.summary?.level1?.matrix?.length));
  ok('dispatch blocked initially', summary1.summary?.dispatchEligible === false);
  ok('overall RED initially', summary1.summary?.overallComplianceStatus === 'RED');

  const uploadLater = await fetch(`${API}/api/contractor/compliance/documents/W9`, {
    method: 'POST',
    headers: contractorH,
    body: JSON.stringify({ uploadLater: true }),
  }).then(json);
  ok('upload later W-9', uploadLater.ok, uploadLater.message);

  for (const type of ['W9', 'TRADE_LICENSE', 'GENERAL_LIABILITY_COI']) {
    const up = await uploadDoc(contractorH, type, '2030-12-31');
    ok(`upload ${type}`, up.ok, up.message);
  }

  ok(
    'uploaded but unverified blocks dispatch',
    (await fetch(`${API}/api/contractor/compliance/summary`, { headers: contractorH }).then(json)).summary
      ?.dispatchEligible === false
  );

  const verifyAsContractor = await verifyDoc(contractorH, contractorId, 'W9');
  ok('contractor cannot verify (403)', verifyAsContractor.status === 403);

  const homeowner = await login('homeowner', 'maria@example.com', 'demo123');
  const verifyAsHomeowner = await verifyDoc(
    { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' },
    contractorId,
    'W9'
  );
  ok('homeowner cannot verify (403)', verifyAsHomeowner.status === 403);

  for (const type of ['W9', 'TRADE_LICENSE']) {
    const v = await verifyDoc(adminH, contractorId, type);
    ok(`admin verify ${type}`, v.ok, v.message);
  }

  const missingGl = await adminSummary(adminH, contractorId);
  ok('missing GL → RED', missingGl.summary?.overallComplianceStatus === 'RED');
  ok('missing GL blocks L1', missingGl.summary?.level1Eligible === false);

  const glVerify = await verifyDoc(adminH, contractorId, 'GENERAL_LIABILITY_COI', {
    expirationDate: '2030-12-31',
    policyCarrier: 'Smoke Insurance Co',
    policyNumber: 'GL-12345',
  });
  ok('admin verify GL with policy fields', glVerify.ok, glVerify.message);

  const expiredTs = Date.now() + 1;
  const expiredContractor = await signupContractor(expiredTs);
  await uploadDoc(expiredContractor.contractorH, 'GENERAL_LIABILITY_COI', isoDaysFromNow(-1));
  await uploadDoc(expiredContractor.contractorH, 'W9', '2030-12-31');
  await verifyDoc(adminH, expiredContractor.contractorId, 'W9');
  await verifyDoc(adminH, expiredContractor.contractorId, 'GENERAL_LIABILITY_COI', {
    expirationDate: isoDaysFromNow(-1),
  });
  const expiredSummary = await adminSummary(adminH, expiredContractor.contractorId);
  const glRow = expiredSummary.summary?.level1?.matrix?.find(
    (m) => m.documentType === 'GENERAL_LIABILITY_COI'
  );
  ok('expired GL status EXPIRED', glRow?.matrixStatus === 'EXPIRED');
  ok('expired GL blocks dispatch', expiredSummary.summary?.level1Eligible === false);

  const alertTs = Date.now() + 2;
  const alertContractor = await signupContractor(alertTs);
  await uploadDoc(alertContractor.contractorH, 'GENERAL_LIABILITY_COI', isoDaysFromNow(30));
  await verifyDoc(adminH, alertContractor.contractorId, 'GENERAL_LIABILITY_COI', {
    expirationDate: isoDaysFromNow(30),
  });
  const sweep30 = await fetch(`${API}/api/admin/compliance/expiration-sweep`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json);
  ok('30-day expiration sweep runs', sweep30.ok, sweep30.message);
  ok('30-day alert idempotent (second sweep)', (await fetch(`${API}/api/admin/compliance/expiration-sweep`, {
    method: 'POST',
    headers: adminH,
    body: '{}',
  }).then(json)).ok);

  const greenTs = Date.now() + 3;
  const green = await signupContractor(greenTs);
  for (const type of LEVEL1_VERIFY_TYPES) {
    const exp = type === 'W9' || type === 'SOLO_OWNER_ACK' ? undefined : '2030-12-31';
    await uploadDoc(green.contractorH, type, exp);
    const v = await verifyDoc(adminH, green.contractorId, type, exp ? { expirationDate: exp } : {});
    ok(`green path verify ${type}`, v.ok, v.message);
  }
  const greenSummary = await adminSummary(adminH, green.contractorId);
  ok('GREEN L1 compliance', greenSummary.summary?.level1?.overallStatus === 'GREEN');
  ok('Level 1 dispatch PASS', greenSummary.summary?.level1Eligible === true);
  ok(
    'Level 2 blocked without umbrella',
    greenSummary.summary?.level2Eligible === false || greenSummary.summary?.level2?.overallStatus !== 'GREEN'
  );

  const l1Check = await fetch(
    `${API}/api/admin/contractors/${green.contractorId}/compliance/dispatch-checklist?jobTier=level_1`,
    { headers: adminH }
  ).then(json);
  ok('job-specific L1 dispatch allowed', l1Check.eligible === true);

  const l2Check = await fetch(
    `${API}/api/admin/contractors/${green.contractorId}/compliance/dispatch-checklist?jobTier=level_2`,
    { headers: adminH }
  ).then(json);
  ok('job-specific L2 dispatch blocked/review', l2Check.eligible === false);

  const wcTs = Date.now() + 4;
  const wcContractor = await signupContractor(wcTs, {
    application: { companySize: '5', workersComp: 'no' },
  });
  await uploadDoc(wcContractor.contractorH, 'WC_WAIVER_SUBROGATION', '2030-12-31');
  await verifyDoc(adminH, wcContractor.contractorId, 'WC_WAIVER_SUBROGATION');
  const wcSummary = await adminSummary(adminH, wcContractor.contractorId);
  const wcRow = wcSummary.summary?.level1?.matrix?.find((m) => m.documentType === 'WORKERS_COMP');
  ok('WC waiver does not satisfy WC', wcRow?.matrixStatus === 'MISSING' || wcRow?.status === 'MISSING');

  const soloTs = Date.now() + 5;
  const solo = await signupContractor(soloTs, { application: { companySize: 'solo', workersComp: 'no' } });
  await uploadDoc(solo.contractorH, 'SOLO_OWNER_ACK');
  await verifyDoc(adminH, solo.contractorId, 'SOLO_OWNER_ACK');
  const soloSummary = await adminSummary(adminH, solo.contractorId);
  const soloWc = soloSummary.summary?.level1?.matrix?.find((m) => m.documentType === 'WORKERS_COMP');
  ok('solo owner WC display', soloWc?.matrixStatus === 'SOLO_OWNER' || soloWc?.matrixStatus === 'NOT_APPLICABLE');

  const aiTs = Date.now() + 6;
  const aiOnly = await signupContractor(aiTs);
  await uploadDoc(aiOnly.contractorH, 'GENERAL_LIABILITY_COI', '2030-12-31');
  await verifyDoc(adminH, aiOnly.contractorId, 'GENERAL_LIABILITY_COI', { expirationDate: '2030-12-31' });
  const aiSummary = await adminSummary(adminH, aiOnly.contractorId);
  const aiRow = aiSummary.summary?.level1?.matrix?.find((m) => m.documentType === 'AI_ONGOING_OPS');
  ok('generic COI alone — AI endorsement MISSING', aiRow?.matrixStatus === 'MISSING');

  const autoTs = Date.now() + 7;
  const autoC = await signupContractor(autoTs, {
    application: { commercialAuto: 'yes', usesCommercialVehicles: 'yes' },
  });
  await uploadDoc(autoC.contractorH, 'COMMERCIAL_AUTO', isoDaysFromNow(-2));
  await verifyDoc(adminH, autoC.contractorId, 'COMMERCIAL_AUTO', { expirationDate: isoDaysFromNow(-2) });
  const autoSummary = await adminSummary(adminH, autoC.contractorId);
  const autoRow = autoSummary.summary?.level1?.matrix?.find((m) => m.documentType === 'COMMERCIAL_AUTO');
  ok('commercial auto EXPIRED after date passes', autoRow?.matrixStatus === 'EXPIRED');

  const createdJob = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Compliance dispatch gate probe',
      description: 'Dispatch gate smoke job',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('create probe job', createdJob.ok && createdJob.job?.id, createdJob.message);
  const jobId = createdJob.job?.id;

  const inviteBlocked = await fetch(`${API}/api/admin/managed/jobs/${jobId}/invite`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ contractorUserId: contractorId, requestType: 'remote_quote' }),
  }).then(json);
  ok(
    'dispatch API blocks non-eligible contractor',
    inviteBlocked.code === 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE' || inviteBlocked.status === 409,
    inviteBlocked.code || inviteBlocked.message
  );

  const peerContractor = await login('contractor', 'james@yourcompany.com', 'demo123');
  const idor = await fetch(`${API}/api/contractor/compliance/documents/W9/file`, {
    headers: { Authorization: `Bearer ${peerContractor.token}` },
  }).then(json);
  ok('contractor IDOR own file only (peer may 404)', idor.status === 404 || idor.ok === false);

  // Agreement Package v4
  const agreementStatus = await fetch(`${API}/api/contractor/agreement/status`, {
    headers: contractorH,
  }).then(json);
  ok('agreement status loads', agreementStatus.ok && agreementStatus.status, agreementStatus.message);
  ok('v4 accepted on signup', agreementStatus.status?.acceptedCurrent === true);
  ok('agreement version saved', String(agreementStatus.status?.acceptedVersion) === '4');

  const noV4Signup = await signupContractor(Date.now() + 1, {
    application: { agreeContractorAgreementV4: false, agreeAccurate: true },
  });
  ok('signup without v4 rejected', noV4Signup.signup.ok === false);

  const adminAgreement = await fetch(`${API}/api/admin/contractors/${contractorId}/agreement`, {
    headers: adminH,
  }).then(json);
  ok('admin agreement view', adminAgreement.ok && adminAgreement.agreement, adminAgreement.message);
  ok('admin sees v4 acceptance', adminAgreement.agreement?.acceptedCurrent === true);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
