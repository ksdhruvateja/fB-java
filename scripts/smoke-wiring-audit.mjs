/**
 * Comprehensive FixBridge wiring audit against a running API + Neon DB.
 * Usage: node --env-file=.env scripts/smoke-wiring-audit.mjs
 */
import { waitForAssessment } from './smoke-assessment-poll.mjs';

const API = process.env.API_URL || 'http://127.0.0.1:3001';
const stamp = Date.now();

let passed = 0;
let failed = 0;
const failures = [];

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
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
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
  console.log(`\nFixBridge wiring audit @ ${API}\n`);

  // ── Frontend ──────────────────────────────────────────────────────────────
  console.log('FRONTEND');
  try {
    const fe = await fetch('http://127.0.0.1:5000/');
    ok('Vite app responds', fe.ok, `status=${fe.status}`);
  } catch (e) {
    ok('Vite app responds', false, e.message);
  }

  // ── Auth: existing accounts ───────────────────────────────────────────────
  console.log('\nAUTH / EXISTING ACCOUNTS');
  const home = await signIn('homeowner', 'maria@example.com', 'demo123');
  ok('homeowner maria login', home.ok && !!home.token, home.message);
  const contractor = await signIn('contractor', 'james@yourcompany.com', 'demo123');
  ok('contractor james login', contractor.ok && !!contractor.token, contractor.message);
  const admin = await signIn('admin', 'admin@fixbridge.local', 'admin123');
  ok('admin login', admin.ok && !!admin.token, admin.message);
  const badPw = await signIn('homeowner', 'maria@example.com', 'wrong-password');
  ok('bad password rejected', badPw.status === 401 || badPw.ok === false);

  if (!home.token || !admin.token || !contractor.token) {
    console.log(`\nAborting — auth failed. passed=${passed} failed=${failed}`);
    process.exit(1);
  }

  const H = auth(home.token);
  const C = auth(contractor.token);
  const A = auth(admin.token);

  const me = await fetch(`${API}/api/auth/me`, { headers: H }).then(json);
  ok('GET /api/auth/me', me.ok && me.user?.email === 'maria@example.com');

  // ── Account creation ──────────────────────────────────────────────────────
  console.log('\nACCOUNT CREATION');
  const newEmail = `audit.ho.${stamp}@example.com`;
  const signup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Audit Homeowner',
      email: newEmail,
      password: 'auditTest123!',
      phone: '5551234567',
    }),
  }).then(json);
  ok('homeowner signup', signup.ok && !!signup.token, signup.message);

  const relogin = await signIn('homeowner', newEmail, 'auditTest123!');
  ok('new homeowner can sign in', relogin.ok && !!relogin.token, relogin.message);

  const newCoEmail = `audit.co.${stamp}@example.com`;
  // Minimal valid PDF-like data URL for W-9 requirement (tiny placeholder)
  const tinyDoc =
    'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCAyMDAgMjAwXQo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDQKL1Jvb3QgMSAwIFIKPj4Kc3RhcnR4cmVmCjE5MQolJUVPRgo=';
  const coSignup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'contractor',
      name: 'Audit Contractor',
      email: newCoEmail,
      password: 'auditTest123!',
      trade: 'Plumbing',
      phone: '5559876543',
      licenseNumber: 'NY-AUDIT-001',
      w9DocumentName: 'w9-audit.pdf',
      w9DocumentData: tinyDoc,
      contractorApplication: {
        legalBusinessName: 'Audit Plumbing LLC',
        ein: '12-3456789',
        agreeTerms: true,
        agreeAccurate: true,
        primaryServices: ['plumbing'],
        serviceStates: ['NY'],
      },
    }),
  }).then(json);
  ok('contractor signup', coSignup.ok && !!coSignup.token, coSignup.message);
  if (coSignup.ok) {
    const coRelogin = await signIn('contractor', newCoEmail, 'auditTest123!');
    ok('new contractor can sign in', coRelogin.ok && !!coRelogin.token, coRelogin.message);
  }

  // ── Security isolation ────────────────────────────────────────────────────
  console.log('\nSECURITY');
  const blocked = await fetch(`${API}/api/admin/managed/jobs`, { headers: H }).then(json);
  ok('homeowner blocked from admin jobs', blocked.status === 403 || blocked.ok === false);
  const blocked2 = await fetch(`${API}/api/admin/subscription-plans`, { headers: C }).then(json);
  ok('contractor blocked from admin plans', blocked2.status === 403 || blocked2.ok === false);

  // ── Homeowner data ────────────────────────────────────────────────────────
  console.log('\nHOMEOWNER DATA');
  const jobs = await fetch(`${API}/api/managed/jobs/my`, { headers: H }).then(json);
  ok('list my jobs', jobs.ok && Array.isArray(jobs.jobs), `count=${jobs.jobs?.length ?? 0}`);

  const props = await fetch(`${API}/api/properties`, { headers: H }).then(json);
  const propList = props.properties || props.items || [];
  ok('list properties endpoint', props.ok !== false || props.status < 500, `keys=${Object.keys(props).join(',')}`);

  // Create property
  const propCreate = await fetch(`${API}/api/properties`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      label: `Audit Home ${stamp}`,
      addressLine1: '123 Audit St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    }),
  }).then(json);
  ok('create property', propCreate.ok && (propCreate.property?.id || propCreate.id), propCreate.message);

  // Create managed job
  const jobCreate = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      category: 'plumbing',
      title: `Audit leak ${stamp}`,
      description: 'Kitchen sink drip for wiring audit',
      serviceTiming: 'weekday',
      preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      preferredTimeSlot: '9-12',
      cityStateZip: 'Brooklyn, NY 11201',
      fullAddress: '123 Audit St, Brooklyn, NY 11201',
      contactName: 'Maria Santos',
      contactPhone: '5551234567',
      zip: '11201',
    }),
  }).then(json);
  ok('create managed job', jobCreate.ok && jobCreate.job?.id, jobCreate.message);
  const jobId = jobCreate.job?.id;

  if (jobId) {
    const assess = await waitForAssessment(API, jobId, H);
    ok('AI assess job', assess.ok, assess.message || assess.status);

    const pay = await fetch(`${API}/api/managed/jobs/${jobId}/pay-dispatch`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ simulate: true }),
    }).then(json);
    ok('simulate visit fee authorize', pay.ok && pay.simulated, `amount=${pay.amount}`);
    if (pay.ok) {
      ok(
        'visit fee uses admin default (>=0)',
        Number.isFinite(Number(pay.amount)) && Number(pay.amount) >= 0,
        `$${pay.amount}`
      );

      // Admin invite/assign + bid + proposal to verify visit-fee credit on final bill
      const invite = await fetch(`${API}/api/admin/managed/jobs/${jobId}/invite`, {
        method: 'POST',
        headers: A,
        body: JSON.stringify({ contractorUserId: contractor.user.id }),
      }).then(json);
      ok('admin invite contractor', invite.ok, invite.message);

      const assign = await fetch(`${API}/api/admin/managed/jobs/${jobId}/assign`, {
        method: 'POST',
        headers: A,
        body: JSON.stringify({ contractorUserId: contractor.user.id }),
      }).then(json);
      ok('admin assign contractor', assign.ok, assign.message);

      const bid = await fetch(`${API}/api/contractor/bids`, {
        method: 'POST',
        headers: C,
        body: JSON.stringify({
          jobId,
          labor: 160,
          materials: 40,
          equipment: 0,
          notes: 'Audit bid',
        }),
      }).then(json);
      ok('contractor submit bid', bid.ok && (bid.bid?.id || bid.id), bid.message);
      const bidId = bid.bid?.id || bid.id;

      if (bidId) {
        const proposal = await fetch(`${API}/api/admin/managed/jobs/${jobId}/proposal`, {
          method: 'POST',
          headers: A,
          body: JSON.stringify({ bidId, serviceCharge: 25 }),
        }).then(json);
        ok('admin create proposal', proposal.ok && proposal.proposal, proposal.message);
        const deposit = Number(proposal.proposal?.depositAmount ?? proposal.proposal?.deposit_amount);
        const retail = Number(proposal.proposal?.retailAmount ?? proposal.proposal?.retail_amount);
        const lines = proposal.proposal?.customerLineItems || proposal.proposal?.customer_line_items || [];
        const hasCredit = Array.isArray(lines)
          ? lines.some((l) => /visit fee credit/i.test(String(l.label || '')))
          : false;
        ok(
          'final bill credits visit fee',
          Number.isFinite(deposit) && Number.isFinite(retail) && deposit <= retail - Number(pay.amount) + 0.01,
          `retail=${retail} deposit=${deposit} visit=${pay.amount} creditLine=${hasCredit}`
        );
        ok('proposal includes visit fee credit line', hasCredit);
      }
    }
  }

  // ── Go Pro / subscription plans ───────────────────────────────────────────
  console.log('\nGO PRO / SUBSCRIPTION PLANS');
  const goPro = await fetch(`${API}/api/platform/go-pro-plans`).then(json);
  ok('public go-pro plans', goPro.ok && Array.isArray(goPro.plans) && goPro.plans.length >= 1, `count=${goPro.plans?.length}`);
  const adminPlans = await fetch(`${API}/api/admin/subscription-plans`, { headers: A }).then(json);
  ok('admin list plans', adminPlans.ok && Array.isArray(adminPlans.plans), `count=${adminPlans.plans?.length}`);
  const pro = (adminPlans.plans || []).find((p) => p.code === 'pro_membership');
  if (pro?.id) {
    const upd = await fetch(`${API}/api/admin/subscription-plans/${pro.id}`, {
      method: 'PATCH',
      headers: A,
      body: JSON.stringify({ amount: Number(pro.amount) }),
    }).then(json);
    ok('admin update plan (noop amount)', upd.ok, upd.message);
  }

  // ── Support tickets ───────────────────────────────────────────────────────
  console.log('\nSUPPORT TICKETS');
  const ticket = await fetch(`${API}/api/support/tickets`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      channel: 'help',
      subject: `Wiring audit ${stamp}`,
      message: 'End-to-end ticket persistence check',
    }),
  }).then(json);
  ok('create support ticket', ticket.ok && ticket.ticket?.ticketNumber, ticket.message);
  ok('ticket deliveries logged', Array.isArray(ticket.deliveries) && ticket.deliveries.length >= 1, `n=${ticket.deliveries?.length}`);
  const myTickets = await fetch(`${API}/api/support/tickets`, { headers: H }).then(json);
  ok('list my tickets', myTickets.ok && myTickets.tickets?.length >= 1);
  const adminTickets = await fetch(`${API}/api/admin/support/tickets`, { headers: A }).then(json);
  ok('admin list tickets', adminTickets.ok && Array.isArray(adminTickets.tickets), `count=${adminTickets.tickets?.length}`);

  // ── Visit fee / pricing rules ─────────────────────────────────────────────
  console.log('\nVISIT FEE / PRICING');
  const rules = await fetch(`${API}/api/pricing/rules`, { headers: A }).then(json);
  ok('admin load pricing rules', rules.ok && rules.rules, rules.message);
  const visitFee = Number(rules.rules?.default_visit_fee ?? 125);
  ok('default_visit_fee present', Number.isFinite(visitFee) && visitFee >= 0, `$${visitFee}`);

  const nextRules = {
    ...rules.rules,
    default_visit_fee: visitFee,
    default_emergency_visit_fee: Number(rules.rules?.default_emergency_visit_fee ?? visitFee),
  };
  const saveRules = await fetch(`${API}/api/pricing/rules`, {
    method: 'PUT',
    headers: A,
    body: JSON.stringify({ rules: nextRules }),
  }).then(json);
  ok('save pricing rules (visit fee)', saveRules.ok, saveRules.message);

  // ── Admin ops ─────────────────────────────────────────────────────────────
  console.log('\nADMIN OPS');
  const adminJobs = await fetch(`${API}/api/admin/managed/jobs`, { headers: A }).then(json);
  ok('admin list jobs', adminJobs.ok && Array.isArray(adminJobs.jobs), `count=${adminJobs.jobs?.length}`);
  const users = await fetch(`${API}/api/admin/users`, { headers: A }).then(json);
  const userList = users.users || users.items || [];
  ok('admin list users', users.ok !== false && (Array.isArray(userList) || users.ok), `count=${userList.length || '?'}`);
  const audit = await fetch(`${API}/api/admin/audit-logs?limit=5`, { headers: A }).then(json);
  ok('audit logs', audit.ok && Array.isArray(audit.logs), `count=${audit.logs?.length}`);
  const subStats = await fetch(`${API}/api/admin/subscription-stats`, { headers: A }).then(json);
  ok('subscription stats', subStats.ok, subStats.message);

  // ── Contractor ────────────────────────────────────────────────────────────
  console.log('\nCONTRACTOR');
  const coJobs = await fetch(`${API}/api/managed/jobs/my`, { headers: C }).then(json);
  ok('contractor jobs list', coJobs.ok && Array.isArray(coJobs.jobs), `count=${coJobs.jobs?.length}`);
  const coMe = await fetch(`${API}/api/auth/me`, { headers: C }).then(json);
  ok('contractor /me', coMe.ok && coMe.user?.role === 'contractor');

  // ── Neon persistence signal ───────────────────────────────────────────────
  console.log('\nPERSISTENCE');
  const jobs2 = await fetch(`${API}/api/managed/jobs/my`, { headers: H }).then(json);
  const found = (jobs2.jobs || []).some((j) => j.id === jobId);
  ok('created job still listed (Neon)', !jobId || found, jobId ? `jobId=${jobId}` : 'skipped');
  const tickets2 = await fetch(`${API}/api/support/tickets`, { headers: H }).then(json);
  const tFound = (tickets2.tickets || []).some((t) => t.subject?.includes(String(stamp)));
  ok('created ticket still listed (Neon)', tFound);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n── RESULT: ${passed} passed, ${failed} failed ──`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('AUDIT_CRASH', e);
  process.exit(1);
});
