// FixBridge Commercial workflow, checked against the development plan's pass criteria.
// Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL); the extractor tests run without it.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { extractDispatch, parseDue } from './dispatch-extract.js';
import { billingTimeline } from './service.js';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
process.env.SESSION_SECRET = 'commercial-test-secret';
process.env.DISABLE_OUTBOUND_EMAIL = 'true';
const RUN = Date.now().toString(36);
process.env.COMMERCIAL_ADMIN_EMAIL = `cadmin-${RUN}@example.test`;
process.env.COMMERCIAL_ADMIN_PASSWORD = 'commercial-admin-pass-123';

let base, server, pool;

async function call(method, path, body, token) {
  const res = await fetch(`${base}/api/commercial${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const DISPATCH = `From: "Northwind Facility Services" <dispatch@northwindfs.example>
Subject: Work Order 4471823 - Store #218 - Plumbing - P2

Work Order #: 4471823
Client: Northwind Facility Services
Bill To: Brightway Grocers Inc.
Location: Brightway Grocers Store #218
Address: 1450 Market Street
Springfield, IL 62704
Priority: P2 - 24 Hour
Due Date: 10/16/2026 5:00 PM CST
NTE: $650.00
Contact: Dana Ruiz 217-555-0143
Problem Description: Men's restroom toilet running continuously and leaking at base.
Check-In: Call IVR 1-800-555-0199 with WO# and PIN on arrival and departure.
Invoice Instructions: Email invoice with before/after photos within 7 days.
`;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('../app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); });
const t = TEST_DB ? test : test.skip;

test('a dispatch email is read into job fields, with the original values traceable', () => {
  const r = extractDispatch({ text: DISPATCH });
  assert.equal(r.fields.external_wo_number, '4471823');
  assert.equal(r.fields.nte_amount, 650);
  assert.equal(r.fields.site_address, '1450 Market Street, Springfield, IL 62704');
  assert.equal(r.fields.billing_customer, 'Brightway Grocers Inc.');
  assert.equal(r.fields.dispatcher_name, 'Northwind Facility Services');
  assert.equal(r.fields.priority, 'urgent');
  assert.equal(r.fields.trade, 'Plumbing');
  assert.equal(r.fields.checkin_method, 'phone_ivr');
  assert.equal(r.fields.due_at, '2026-10-16T22:00:00.000Z');
  assert.equal(r.fields.timezone, 'America/Chicago');
  assert.equal(r.flags.filter((f) => f.severity === 'blocking').length, 0);
});

test('unclear address and NTE are flagged instead of guessed', () => {
  const r = extractDispatch({ text: 'Work Order: 5512\nAddress: see store list\nNTE: TBD\nDescription: Replace ballast in back room.' });
  const codes = r.flags.map((f) => f.code);
  assert.ok(codes.includes('address_unclear'), codes.join(','));
  assert.ok(codes.includes('nte_unclear'), codes.join(','));
  assert.equal(r.fields.nte_amount, null);
  const conflict = extractDispatch({ text: 'WO# 777123\nNTE: $500\nAddress: 1 Main St, Dover, DE 19901\nScope: fix door\nLater note: not to exceed $750' });
  assert.ok(conflict.flags.some((f) => f.code === 'nte_conflict'));
});

test('due times without a zone use the site zone and say so', () => {
  const due = parseDue('10/20/2026 8:00 AM', 'America/Los_Angeles');
  assert.equal(due.at.toISOString(), '2026-10-20T15:00:00.000Z');
  assert.equal(due.assumedZone, true);
});

test('founding offer: 30 days free from the later of intake setup and first real job, then $49 for 12 months', () => {
  const c = { plan: 'essentials', founding_member: true, extra_seats: 0, intake_configured_at: '2026-01-01T00:00:00Z', first_job_processed_at: '2026-01-10T00:00:00Z' };
  assert.equal(billingTimeline(c, new Date('2026-01-20')).phase, 'trial');
  assert.equal(billingTimeline(c, new Date('2026-03-01')).monthly, 49);
  assert.equal(billingTimeline(c, new Date('2027-03-01')).monthly, 99);
  assert.equal(billingTimeline({ ...c, first_job_processed_at: null }).phase, 'waiting');
  assert.equal(billingTimeline({ plan: 'team', extra_seats: 2 }).monthly, 229);
});

async function newCompany(adminToken, label) {
  const email = `owner-${label}-${RUN}@example.test`;
  const appRes = await call('POST', '/pilot-applications', {
    company_name: `${label} Mechanical`, contact_name: `${label} Owner`, email, phone: '555-555-0100', trades: ['Plumbing'], consent: true,
  });
  assert.equal(appRes.status, 200, JSON.stringify(appRes.body));
  const approved = await call('POST', `/admin/applications/${appRes.body.id}/approve`, { plan: 'essentials' }, adminToken);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const token = new URL(approved.body.invite_link).searchParams.get('token');
  const set = await call('POST', '/auth/set-password', { token, password: 'owner-password-1' });
  assert.equal(set.status, 200);
  return { token: set.body.token, user: set.body.user, companyId: approved.body.company.id };
}

t('full first workflow and the plan’s pass criteria', async () => {
  const adminLogin = await call('POST', '/admin/auth/login', { email: process.env.COMMERCIAL_ADMIN_EMAIL, password: process.env.COMMERCIAL_ADMIN_PASSWORD });
  assert.equal(adminLogin.status, 200);
  const admin = adminLogin.body.token;

  // Commercial tokens and marketplace tokens are not interchangeable.
  assert.equal((await call('GET', '/admin/applications', undefined, 'not-a-token')).status, 401);

  const a = await newCompany(admin, 'alpha');
  const b = await newCompany(admin, 'bravo');
  // A company token cannot use the commercial admin API, and vice versa.
  assert.equal((await call('GET', '/admin/applications', undefined, a.token)).status, 401);
  assert.equal((await call('GET', '/today', undefined, admin)).status, 401);

  // Team: a technician without financial access.
  const invite = await call('POST', '/team', { email: `tech-${RUN}@example.test`, name: 'Terry Tech', role: 'technician' }, a.token);
  assert.equal(invite.status, 200, JSON.stringify(invite.body));
  const techSet = await call('POST', '/auth/set-password', { token: new URL(invite.body.invite_link).searchParams.get('token'), password: 'tech-password-1' });
  const tech = { token: techSet.body.token, id: techSet.body.user.id };

  // Customer profile with an email submission method.
  const cust = await call('POST', '/customers', {
    name: 'Northwind Facility Services', email_domains: 'northwindfs.example', billing_email: 'ap@northwindfs.example',
    submission_method: 'email', checkin_method: 'phone_ivr', subject_format: 'INV {invoice_number} / WO {wo_number}',
  }, a.token);
  assert.equal(cust.status, 200);

  // Intake.
  const first = await call('POST', '/intake', { text: DISPATCH }, a.token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.outcome, 'created');
  const jobId = first.body.job_id;

  // Same email again: nothing new. Same WO with a changed NTE: the existing job is updated.
  const again = await call('POST', '/intake', { text: DISPATCH }, a.token);
  assert.equal(again.body.outcome, 'duplicate_ignored');
  assert.equal(again.body.job_id, jobId);
  const revised = await call('POST', '/intake', { text: DISPATCH.replace('NTE: $650.00', 'NTE: $800.00') }, a.token);
  assert.equal(revised.body.outcome, 'updated_existing');
  assert.equal(revised.body.job_id, jobId);
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM commercial_jobs WHERE company_id=$1 AND external_wo_number='4471823'`, [a.companyId]);
  assert.equal(count.rows[0].n, 1, 'duplicate dispatch must not create duplicate work');

  let job = (await call('GET', `/jobs/${jobId}`, undefined, a.token)).body;
  assert.equal(job.job.nte_amount, 800);
  assert.equal(job.job.customer_id, cust.body.customer.id);
  assert.equal(job.job.status, 'received');

  // Isolation: the other company cannot see or change this job.
  assert.equal((await call('GET', `/jobs/${jobId}`, undefined, b.token)).status, 404);
  assert.equal((await call('PATCH', `/jobs/${jobId}`, { scope: 'x' }, b.token)).status, 404);
  assert.equal((await call('POST', `/jobs/${jobId}/accept`, { eta_at: new Date().toISOString() }, b.token)).status, 404);
  assert.equal((await call('GET', '/jobs', undefined, b.token)).body.jobs.length, 0);

  // A received dispatch is not an accepted job: no technician before review and acceptance.
  assert.equal((await call('POST', `/jobs/${jobId}/visits`, { technician_user_id: tech.id }, a.token)).status, 409);
  assert.equal((await call('POST', `/jobs/${jobId}/accept`, { eta_at: new Date().toISOString() }, a.token)).status, 422);

  // An unclear dispatch goes to the review queue and cannot be marked reviewed until settled.
  const unclear = await call('POST', '/intake', { text: 'Work Order: 5512\nAddress: see store list\nNTE: TBD\nDescription: Replace ballast in back room.' }, a.token);
  const unclearJob = (await call('GET', `/jobs/${unclear.body.job_id}`, undefined, a.token)).body;
  assert.ok(unclearJob.job.flags.some((f) => f.code === 'address_unclear' && !f.resolved));
  assert.ok(unclearJob.exceptions.some((e) => e.kind === 'dispatch_review' && e.status === 'open' && e.assigned_user_id === a.user.id));
  assert.equal((await call('PATCH', `/jobs/${unclear.body.job_id}`, { mark_reviewed: true }, a.token)).status, 422);

  // Review and accept the good job.
  const reviewed = await call('PATCH', `/jobs/${jobId}`, { mark_reviewed: true }, a.token);
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  const eta = new Date(Date.now() + 3600_000).toISOString();
  const accepted = await call('POST', `/jobs/${jobId}/accept`, { eta_at: eta, assigned_user_ids: [tech.id], notify: { channel: 'email' } }, a.token);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.job.status, 'accepted');

  // The technician sees the job without money.
  const techView = await call('GET', `/jobs/${jobId}`, undefined, tech.token);
  assert.equal(techView.status, 200);
  assert.equal(techView.body.job.nte_amount, undefined);
  assert.equal(techView.body.invoices, undefined);

  // Visit 1: on my way, check in without location, external check-in fails.
  const v1 = (await call('POST', `/jobs/${jobId}/visits`, {}, tech.token)).body.visit;
  assert.equal(v1.external_checkin_status, 'pending');
  await call('POST', `/visits/${v1.id}/action`, { action: 'on_my_way' }, tech.token);
  const ci = await call('POST', `/visits/${v1.id}/action`, { action: 'check_in', client_action_id: 'offline-1' }, tech.token);
  assert.equal(ci.status, 200);
  // The same queued action replayed from the offline outbox is not recorded twice.
  const replay = await call('POST', `/visits/${v1.id}/action`, { action: 'check_in', client_action_id: 'offline-1' }, tech.token);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  const failed = await call('POST', `/visits/${v1.id}/action`, { action: 'external_checkin', status: 'failed', note: 'IVR line busy; called dispatcher at 9:12' }, tech.token);
  assert.equal(failed.status, 200, JSON.stringify(failed.body));
  const exAfterFail = (await call('GET', '/exceptions', undefined, a.token)).body.exceptions;
  assert.ok(exAfterFail.some((e) => e.kind === 'external_checkin_failed' && e.job_id === jobId && e.assigned_user_id));
  const out1 = await call('POST', `/visits/${v1.id}/action`, { action: 'check_out', outcome: 'diagnosis_only', work_performed: 'Flapper and wax ring failed; flange cracked.' }, tech.token);
  assert.equal(out1.status, 200);
  assert.equal(out1.body.job_status, 'proposal_needed');

  // Proposal: technician captures findings; office prices, reviews and submits.
  const prop = await call('POST', `/jobs/${jobId}/proposals`, {
    findings: 'Cracked closet flange, failed wax ring.', scope: 'Replace flange, wax ring and flapper; reset toilet.',
    labor_lines: [{ description: 'Plumber', hours: 3, rate: 999 }], material_lines: [{ description: 'Flange repair kit', quantity: 1, unit_cost: 999 }],
  }, tech.token);
  assert.equal(prop.status, 200);
  assert.equal(prop.body.proposal.total, null, 'technician without financial access sees no prices');
  const priced = await call('PATCH', `/proposals/${prop.body.proposal.id}`, {
    labor_lines: [{ description: 'Plumber', hours: 3, rate: 125 }], material_lines: [{ description: 'Flange repair kit', quantity: 1, unit_cost: 180 }],
    exclusions: 'Subfloor repair', office_reviewed: true,
  }, a.token);
  assert.equal(priced.body.proposal.total, 555);
  const raised = await call('PATCH', `/proposals/${prop.body.proposal.id}`, { labor_lines: [{ description: 'Plumber', hours: 8, rate: 125 }] }, a.token);
  assert.equal(raised.body.proposal.total, 1180);
  const submitted = await call('POST', `/proposals/${prop.body.proposal.id}/submit`, { via: 'email' }, a.token);
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.delivery.ok, true);
  // Sending the same proposal twice is blocked.
  assert.equal((await call('POST', `/proposals/${prop.body.proposal.id}/submit`, { via: 'email' }, a.token)).status, 409);

  // Additional work waits for authorization: completion and invoicing are blocked meanwhile.
  job = (await call('GET', `/jobs/${jobId}`, undefined, a.token)).body;
  assert.equal(job.job.status, 'awaiting_approval');
  assert.ok(job.completion.some((c) => c.code === 'authorizations' && !c.ok));

  // An ambiguous reply goes to human review, not to approved.
  const unclearReply = await call('POST', `/proposals/${prop.body.proposal.id}/decision`, { decision: 'unclear', evidence_text: 'Looks ok, let me check with the store first.' }, a.token);
  assert.equal(unclearReply.body.approval.status, 'needs_review');
  assert.ok((await call('GET', '/exceptions', undefined, a.token)).body.exceptions.some((e) => e.kind === 'ambiguous_reply'));
  const approvedReply = await call('POST', `/proposals/${prop.body.proposal.id}/decision`, {
    decision: 'approved', approver_name: 'Pat Lee, Northwind', approved_amount: 1180, evidence_text: 'Approved $1,180 per your proposal v1. — Pat',
  }, a.token);
  assert.equal(approvedReply.status, 200, JSON.stringify(approvedReply.body));
  job = (await call('GET', `/jobs/${jobId}`, undefined, a.token)).body;
  assert.equal(job.job.authorized_amount, 1180);
  assert.equal(job.job.status, 'return_visit_needed');

  // Return visit keeps visit 1's history.
  const v2 = (await call('POST', `/jobs/${jobId}/visits`, {}, tech.token)).body.visit;
  assert.equal(v2.visit_number, 2);
  await call('POST', `/visits/${v2.id}/action`, { action: 'check_in', lat: 39.78, lng: -89.65 }, tech.token);
  await call('POST', `/visits/${v2.id}/action`, { action: 'external_checkin', status: 'confirmed', reference: 'IVR-8812' }, tech.token);
  await call('POST', `/visits/${v2.id}/action`, { action: 'check_out', outcome: 'completed', work_performed: 'Replaced flange, wax ring and flapper. Tested 10 flushes, no leaks.' }, tech.token);
  job = (await call('GET', `/jobs/${jobId}`, undefined, a.token)).body;
  assert.equal(job.visits.length, 2);
  assert.equal(job.visits[0].outcome, 'diagnosis_only');
  assert.equal(job.visits[0].external_checkin_status, 'failed');
  assert.equal(job.visits[1].outcome, 'completed');

  // Missing completion evidence prevents finalization (no "after" photo yet; visit 1 check-in failure is documented).
  const noPhoto = await call('POST', `/jobs/${jobId}/completion/finalize`, {}, a.token);
  assert.equal(noPhoto.status, 422);
  assert.ok(noPhoto.body.checks.some((c) => c.code === 'completion_photos' && !c.ok));
  const photo = await call('POST', `/jobs/${jobId}/files`, { dataUrl: PNG, name: 'after.png', stage: 'after', visit_id: v2.id }, tech.token);
  assert.equal(photo.status, 200);
  assert.equal((await fetch(`${base}${photo.body.file.url}`)).status, 200);
  assert.equal((await fetch(`${base}/api/commercial/files/${photo.body.file.id}?exp=1&sig=x`)).status, 403);
  const finalized = await call('POST', `/jobs/${jobId}/completion/finalize`, { summary: 'Toilet repaired and tested.' }, a.token);
  assert.equal(finalized.status, 200, JSON.stringify(finalized.body));

  // Invoice: draft from the approved proposal, checks, send, bounce, re-send, payment.
  const inv = await call('POST', `/jobs/${jobId}/invoices`, {}, a.token);
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.equal(inv.body.invoice.total, '1180.00');
  assert.equal(inv.body.invoice.recipient, 'ap@northwindfs.example');
  assert.ok(failingBlockingCodes(inv.body.checks).length === 0, JSON.stringify(inv.body.checks));
  assert.equal((await call('POST', `/jobs/${jobId}/invoices`, {}, a.token)).status, 409, 'no duplicate billing');
  const over = await call('PATCH', `/invoices/${inv.body.invoice.id}`, { lines: [{ type: 'labor', description: 'Plumber', quantity: 10, unit_price: 125 }, { type: 'material', description: 'Kit', quantity: 1, unit_price: 180 }] }, a.token);
  assert.ok(over.body.checks.some((c) => c.code === 'within_authorized' && !c.ok));
  assert.equal((await call('POST', `/invoices/${inv.body.invoice.id}/send`, {}, a.token)).status, 422);
  await call('PATCH', `/invoices/${inv.body.invoice.id}`, { lines: [{ type: 'labor', description: 'Plumber', quantity: 8, unit_price: 125 }, { type: 'material', description: 'Kit', quantity: 1, unit_price: 180 }] }, a.token);
  const sent = await call('POST', `/invoices/${inv.body.invoice.id}/send`, {}, a.token);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.invoice.status, 'sent');
  assert.equal((await call('POST', `/invoices/${inv.body.invoice.id}/send`, {}, a.token)).status, 409, 'no repeated sends');
  assert.equal((await call('GET', '/invoices', undefined, tech.token)).status, 403);

  const bounced = await call('POST', `/invoices/${inv.body.invoice.id}/status`, { status: 'delivery_failed', reason: '550 mailbox unavailable' }, a.token);
  assert.equal(bounced.body.invoice.status, 'delivery_failed');
  const today = (await call('GET', '/today', undefined, a.token)).body;
  assert.ok(today.invoice_problems.some((i) => i.id === inv.body.invoice.id));
  const bounceEx = today.exceptions.find((e) => e.kind === 'invoice_delivery_failed');
  assert.ok(bounceEx && bounceEx.assigned_user_id, 'a bounced invoice is visible and assigned');
  await call('PATCH', `/invoices/${inv.body.invoice.id}`, { recipient: 'billing@northwindfs.example' }, a.token);
  assert.equal((await call('POST', `/invoices/${inv.body.invoice.id}/send`, {}, a.token)).status, 409, 'a re-send needs a reason');
  const resent = await call('POST', `/invoices/${inv.body.invoice.id}/send`, { resend_reason: 'Corrected AP address' }, a.token);
  assert.equal(resent.status, 200, JSON.stringify(resent.body));
  assert.equal((await call('POST', `/invoices/${inv.body.invoice.id}/payments`, { amount: 1180 }, a.token)).status, 400, 'payment needs evidence');
  const paid = await call('POST', `/invoices/${inv.body.invoice.id}/payments`, { amount: 1180, method: 'ACH', reference: 'ACH 99120' }, a.token);
  assert.equal(paid.body.invoice.status, 'paid');
  job = (await call('GET', `/jobs/${jobId}`, undefined, a.token)).body;
  assert.equal(job.job.status, 'paid');
  assert.ok(job.events.length >= 15);

  // Seat limit: Essentials includes 3 users (owner + technician + one more).
  assert.equal((await call('POST', '/team', { email: `office-${RUN}@example.test`, name: 'Olive Office', role: 'office' }, a.token)).status, 200);
  assert.equal((await call('POST', '/team', { email: `extra-${RUN}@example.test`, name: 'Extra Person', role: 'technician' }, a.token)).status, 402);
});

function failingBlockingCodes(checks) {
  return checks.filter((c) => !c.ok && c.severity === 'blocking').map((c) => c.code);
}
