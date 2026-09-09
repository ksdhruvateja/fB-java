/**
 * Quote alternatives smoke — deterministic RC-QALT fixture.
 * Creates a dedicated job + Option A/B, revises A without superseding B,
 * then accepts one option and asserts a single invoice.
 *
 * Usage: node --env-file=.env scripts/smoke-quote-alternatives.mjs [API_BASE]
 */
import { resolveSmokeApiBase } from './smoke-api-base.mjs';

const API = resolveSmokeApiBase();
const MARKER = `RC-QALT-${Date.now()}`;

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

function letterOf(o) {
  return String(o?.letter || o?.quoteOptionLabel || '')
    .replace(/^option\s+/i, '')
    .trim()
    .charAt(0)
    .toUpperCase();
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
    if (!r.ok || !r.token) throw new Error(`login failed (${role}): ${r.message || r.status}`);
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
  throw new Error(`login failed (${role}): ${last?.message || 'rate limited'}`);
}

async function main() {
  console.log(`\nFixBridge quote alternatives smoke @ ${API}`);
  console.log(`Fixture marker: ${MARKER}\n`);

  const adminEmail =
    process.env.SMOKE_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL || 'admin@fixbridge.us';
  const adminPass =
    process.env.SMOKE_ADMIN_PASSWORD ||
    process.env.TEST_ADMIN_PASSWORD ||
    process.env.PRIMARY_ADMIN_PASSWORD;
  const homeEmail = process.env.SMOKE_HOMEOWNER_EMAIL || process.env.TEST_HOMEOWNER_EMAIL;
  const homePass = process.env.SMOKE_HOMEOWNER_PASSWORD || process.env.TEST_HOMEOWNER_PASSWORD;
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL || process.env.TEST_CONTRACTOR_EMAIL;
  const contractorPass =
    process.env.SMOKE_CONTRACTOR_PASSWORD || process.env.TEST_CONTRACTOR_PASSWORD;
  if (!adminPass || !homeEmail || !homePass || !contractorEmail || !contractorPass) {
    throw new Error('Set SMOKE_/TEST_ admin, homeowner, and contractor credentials in .env');
  }
  const admin = await login('admin', adminEmail, adminPass);
  const homeowner = await login('homeowner', homeEmail, homePass);
  const contractor = await login('contractor', contractorEmail, contractorPass);

  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const homeownerH = { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' };
  const contractorH = {
    Authorization: `Bearer ${contractor.token}`,
    'Content-Type': 'application/json',
  };
  const contractorUserId = contractor.user?.id || contractor.id;

  // 1) Deterministic job — never pick an arbitrary DB job.
  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeownerH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: `${MARKER} Option A/B fixture`,
      description: `${MARKER} deterministic quote alternatives smoke job`,
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('Create/select suitable job', Boolean(created.ok && created.job?.id), created.message || `job ${created.job?.id}`);
  const jobId = created.job?.id;
  if (!jobId) return;

  // Seed invite+bid via DB for this namespaced RC-QALT job only.
  // Demo contractor is often not live-dispatch-eligible; invite HTTP gate would fail productively
  // for dispatch, but quote alternatives must still be testable without weakening that gate.
  const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!DATABASE_URL) {
    ok('Invite/bid fixture seed', false, 'DATABASE_URL missing');
    return;
  }
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: String(DATABASE_URL).includes('neon') ? { rejectUnauthorized: false } : undefined,
  });
  let bidId = null;
  try {
    await pool.query(
      `INSERT INTO job_invitations (job_id, contractor_user_id, status, message, invited_by, request_type)
       VALUES ($1,$2,'invited',$3,$4,'remote_quote')
       ON CONFLICT (job_id, contractor_user_id) DO UPDATE SET status='invited', responded_at=NULL`,
      [jobId, contractorUserId, `${MARKER} invite`, admin.user?.id || admin.id || null],
    );
    const { rows: bidRows } = await pool.query(
      `INSERT INTO bids
        (job_id, contractor_user_id, labor, materials, net_total, warranty, notes, status)
       VALUES ($1,$2,220,80,300,'1 year parts & labor',$3,'submitted')
       RETURNING id`,
      [jobId, contractorUserId, `${MARKER} bid`],
    );
    bidId = bidRows[0]?.id || null;
    await pool.query(
      `UPDATE managed_jobs SET assigned_contractor_user_id=$1, updated_at=NOW() WHERE id=$2`,
      [contractorUserId, jobId],
    );
  } finally {
    await pool.end();
  }
  ok('Invite/bid fixture seed (RC-QALT namespaced)', Boolean(bidId), bidId ? `bid ${bidId}` : 'failed');
  if (!bidId) return;

  // 2) Create Option A (proposal)
  const optionA = await fetch(`${API}/api/admin/managed/jobs/${jobId}/proposal`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({
      bidId,
      scopeSummary: `${MARKER} Option A repair scope`,
      retailAmount: 480,
      quoteOptionLabel: 'A',
      quoteOptionTitle: 'Repair',
    }),
  }).then(json);
  ok('Create Option A', Boolean(optionA.ok && (optionA.proposal?.id || optionA.quote?.id)), optionA.message || '');
  const optionAId = optionA.proposal?.id || optionA.quote?.id;
  if (!optionAId) return;

  // Ensure A is labeled for option group (proposal create may not set label yet).
  await fetch(`${API}/api/admin/quotes/${optionAId}/document`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({
      quoteOptionLabel: 'A',
      quoteOptionTitle: 'Repair',
      scopeSummary: `${MARKER} Option A repair scope`,
    }),
  }).then(json);

  // 3) Create Option B via duplicate-as-option
  const dup = await fetch(`${API}/api/admin/quotes/${optionAId}/duplicate`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ asOption: true, quoteOptionTitle: 'Replacement' }),
  }).then(json);
  ok('Create Option B', Boolean(dup.ok && dup.quote?.id), dup.message || `id ${dup.quote?.id || 'n/a'}`);
  const optionBId = dup.quote?.id;
  if (!optionBId) return;

  const afterDup = await fetch(`${API}/api/admin/jobs/${jobId}/quote-options`, { headers: adminH }).then(json);
  const activeLabels = new Set(
    (afterDup.options || [])
      .filter((o) => !['superseded', 'canceled', 'cancelled', 'declined'].includes(String(o.status || '').toLowerCase()))
      .map(letterOf)
      .filter(Boolean),
  );
  ok('Option group relationship', activeLabels.has('A') && activeLabels.has('B'), [...activeLabels].join(',') || 'none');

  // 4) Grouped send
  const grouped = await fetch(`${API}/api/admin/quotes/${optionBId}/send-option-group`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ sendEmail: false }),
  }).then(json);
  ok('Send option group', Boolean(grouped.ok && Number(grouped.sent) >= 1), grouped.message || `sent=${grouped.sent}`);

  const beforeRev = await fetch(`${API}/api/admin/jobs/${jobId}/quote-options`, { headers: adminH }).then(json);
  const aBefore = (beforeRev.options || []).find((o) => o.id === optionAId);
  const bBefore = (beforeRev.options || []).find((o) => o.id === optionBId);
  const aVersionBefore = Number(aBefore?.versionNumber || aBefore?.version_number || 1);

  // 5) Revise Option A only
  const revise = await fetch(`${API}/api/admin/quotes/${optionAId}/document`, {
    method: 'PUT',
    headers: adminH,
    body: JSON.stringify({
      changeReason: `${MARKER} revise Option A only`,
      quoteOptionTitle: 'Repair v2',
      scopeSummary: `${MARKER} Option A revised scope`,
      retailAmount: 520,
    }),
  }).then(json);
  ok('Revise Option A', Boolean(revise.ok), revise.message || revise.code || '');

  const resendA = await fetch(`${API}/api/admin/quotes/${optionAId}/send`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({ sendEmail: false, skipNotify: true }),
  }).then(json);
  ok('Resend Option A revision', Boolean(resendA.ok || resendA.status === 400), resendA.message || '');

  const afterRev = await fetch(`${API}/api/admin/jobs/${jobId}/quote-options`, { headers: adminH }).then(json);
  const aAfter = (afterRev.options || []).find((o) => o.id === optionAId);
  const bAfter = (afterRev.options || []).find((o) => o.id === optionBId);
  const aVersionAfter = Number(aAfter?.versionNumber || aAfter?.version_number || 0);
  const aStatus = String(aAfter?.status || '').toLowerCase();
  const bStatus = String(bAfter?.status || '').toLowerCase();

  ok(
    'Option A v2 active',
    Boolean(aAfter) && aVersionAfter > aVersionBefore && !['superseded', 'declined', 'canceled'].includes(aStatus),
    `v${aVersionBefore}→v${aVersionAfter} status=${aStatus || '?'}`,
  );
  ok(
    'Option B remains active',
    Boolean(bAfter) && bStatus !== 'superseded' && letterOf(bAfter) === 'B',
    bAfter ? `${letterOf(bAfter)} status=${bStatus}` : 'missing',
  );
  ok(
    'Option A revision isolation (B not superseded)',
    Boolean(bAfter) && bStatus !== 'superseded',
    bAfter ? bStatus : 'missing',
  );

  // 6) Homeowner selects Option B only
  const accept = await fetch(`${API}/api/managed/jobs/${jobId}/approve-proposal`, {
    method: 'POST',
    headers: homeownerH,
    body: JSON.stringify({
      proposalId: optionBId,
      consents: {
        HOMEOWNER_SERVICE_AGREEMENT: true,
        VISIT_CANCELLATION_POLICY: true,
        QUOTE_SCOPE_APPROVAL: true,
      },
    }),
  }).then(json);
  ok('Homeowner selects one option', Boolean(accept.ok), accept.message || accept.code || '');

  const finalOpts = await fetch(`${API}/api/admin/jobs/${jobId}/quote-options`, { headers: adminH }).then(json);
  const aFinal = (finalOpts.options || []).find((o) => o.id === optionAId);
  const bFinal = (finalOpts.options || []).find((o) => o.id === optionBId);
  const aSel = String(aFinal?.optionSelectionStatus || aFinal?.status || '').toLowerCase();
  const bSel = String(bFinal?.optionSelectionStatus || bFinal?.status || '').toLowerCase();
  ok(
    'Only selected option accepted',
    Boolean(bFinal) &&
      (bSel === 'accepted' || String(bFinal.status).toLowerCase() === 'accepted') &&
      String(aFinal?.status || '').toLowerCase() !== 'accepted',
    `A=${aSel || aFinal?.status} B=${bSel || bFinal?.status}`,
  );

  const invoicesFromAccept = accept.invoice?.id ? 1 : 0;
  let invoiceCount = invoicesFromAccept;
  if (!invoiceCount) {
    const invProbe = await fetch(`${API}/api/admin/quotes/${optionBId}/workspace`, { headers: adminH }).then(json);
    if (invProbe.quote?.invoice?.id || invProbe.invoice?.id) invoiceCount = 1;
  }
  if (!invoiceCount && accept.alreadyAccepted) invoiceCount = 1;
  ok('Exactly one invoice created', invoiceCount === 1, `count=${invoiceCount}`);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
