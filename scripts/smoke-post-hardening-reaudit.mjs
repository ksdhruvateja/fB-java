/**
 * Independent post-hardening adversarial re-audit script.
 * Usage: node --env-file=.env scripts/smoke-post-hardening-reaudit.mjs
 */
import { shouldSimulatePayment, assertPaymentsAvailable, stripeConfigured } from '../api/stripe.js';
import { postgresSslOptions } from '../api/db-ssl.js';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
let failed = 0;
const findings = [];

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

function ok(label, pass, detail = '', severity = null) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) {
    failed += 1;
    if (severity) findings.push({ severity, label, detail });
  }
}

async function login(role, email, password) {
  return fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
}

function H(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function main() {
  console.log(`\n=== Post-hardening re-audit @ ${API} ===\n`);

  // Unit-level: production simulation safety
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const hadStripe = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  ok('prod shouldSimulatePayment=false', shouldSimulatePayment(true) === false);
  ok('prod SSL rejectUnauthorized=true', postgresSslOptions().rejectUnauthorized === true);
  let assertOk = false;
  try {
    assertPaymentsAvailable(true);
  } catch (e) {
    assertOk = e.code === 'STRIPE_NOT_CONFIGURED' && e.status === 503;
  }
  ok('prod assertPaymentsAvailable fails closed', assertOk);
  if (hadStripe) process.env.STRIPE_SECRET_KEY = hadStripe;
  process.env.NODE_ENV = prev || 'development';

  const health = await fetch(`${API}/api/health`).then(json);
  ok('API health', health.ok === true && health.database === 'neon', JSON.stringify(health));

  // Auth negatives
  ok(
    'missing token',
    (await fetch(`${API}/api/auth/me`).then(json)).status === 401
  );
  ok(
    'malformed JWT',
    (await fetch(`${API}/api/auth/me`, { headers: { Authorization: 'Bearer a.b.c' } }).then(json))
      .status === 401
  );
  ok(
    'wrong password',
    (await login('homeowner', 'maria@example.com', 'wrong-password')).ok !== true
  );

  const maria = await login('homeowner', 'maria@example.com', 'demo123');
  const peerEmail = `reaudit.peer.${Date.now()}@example.com`;
  const peerSignup = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Reaudit Peer',
      email: peerEmail,
      password: 'PeerPass123!',
    }),
  }).then(json);
  ok('peer signup', peerSignup.ok && peerSignup.token, peerSignup.message);
  const admin = await login('admin', 'admin@fixbridge.local', 'admin123');
  const james = await login('contractor', 'james@yourcompany.com', 'demo123');
  ok('maria login', maria.ok);
  ok('admin login', admin.ok);
  ok('james login', james.ok);

  // Guest intake attack
  const guestHijack = await fetch(`${API}/api/public/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'maria@example.com',
      contactName: 'Attacker',
      contactPhone: '555-0000',
      category: 'Plumbing',
      description: 'Attempting to attach to existing account without auth',
      streetAddress: '1 Hack St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    }),
  }).then(json);
  ok(
    'guest cannot hijack existing email',
    guestHijack.status === 409 || guestHijack.code === 'ACCOUNT_EXISTS',
    `status=${guestHijack.status}`,
    'CRITICAL'
  );

  // Create job as maria for IDOR
  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: H(maria.token),
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Reaudit IDOR job',
      description: 'Job for independent IDOR matrix verification after hardening.',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
    }),
  }).then(json);
  ok('create job for IDOR', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;

  const peer = peerSignup.token;
  const peerH = H(peer);
  const homeH = H(maria.token);
  const adminH = H(admin.token);
  const coH = H(james.token);

  const idorTargets = [
    [`GET /change-orders`, `${API}/api/managed/jobs/${jobId}/change-orders`],
    [`GET /payment-schedule`, `${API}/api/managed/jobs/${jobId}/payment-schedule`],
    [`GET /managed/jobs/:id`, `${API}/api/managed/jobs/${jobId}`],
  ];
  for (const [name, url] of idorTargets) {
    const r = await fetch(url, { headers: peerH }).then(json);
    ok(`IDOR peer blocked ${name}`, r.status === 403 || r.ok === false, `status=${r.status}`, 'HIGH');
  }

  // Property units
  const props = await fetch(`${API}/api/properties`, { headers: homeH }).then(json);
  const propId = (props.properties || [])[0]?.id;
  if (propId) {
    const u = await fetch(`${API}/api/properties/${propId}/units`, { headers: peerH }).then(json);
    ok('IDOR property units', u.status === 403, `status=${u.status}`, 'HIGH');
  } else {
    ok('IDOR property units (no prop)', true);
  }

  // Support tickets isolation
  const ticketsPeer = await fetch(`${API}/api/support/tickets`, { headers: peerH }).then(json);
  const ticketsMaria = await fetch(`${API}/api/support/tickets`, { headers: homeH }).then(json);
  const peerSeesMaria =
    (ticketsPeer.tickets || []).some((t) =>
      (ticketsMaria.tickets || []).some((m) => Number(m.id) === Number(t.id) && m.id)
    ) && (ticketsMaria.tickets || []).length > 0;
  // Peer should only see own tickets (empty or own)
  ok(
    'support tickets scoped to owner',
    ticketsPeer.ok === true && !peerSeesMaria,
    `peer=${(ticketsPeer.tickets || []).length} maria=${(ticketsMaria.tickets || []).length}`
  );

  // Markup privacy
  const jobGet = await fetch(`${API}/api/managed/jobs/${jobId}`, { headers: homeH }).then(json);
  const blob = JSON.stringify(jobGet.job || {});
  const leak = /"contractorNet"|"contractor_net"|"platformGross"|"platform_gross"|"markupAmount"|"internalCost"/.test(
    blob
  );
  ok('homeowner job DTO no internal pricing', !leak, leak ? blob.slice(0, 200) : 'clean', 'CRITICAL');

  // Reviews
  const anon = await fetch(`${API}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rating: 5,
      text: 'Anonymous spam review that must be rejected by the server.',
      location: 'NYC',
    }),
  }).then(json);
  ok('anon review rejected', anon.status === 401 || anon.ok === false, `status=${anon.status}`, 'HIGH');

  const unfinished = await fetch(`${API}/api/reviews`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({
      jobId,
      rating: 5,
      text: 'Trying to review an unfinished job which should be rejected by status checks.',
      location: 'Brooklyn',
    }),
  }).then(json);
  ok(
    'unfinished job review rejected',
    unfinished.status === 400 || unfinished.code === 'JOB_NOT_COMPLETE',
    `status=${unfinished.status} code=${unfinished.code}`
  );

  const coRev = await fetch(`${API}/api/reviews`, {
    method: 'POST',
    headers: coH,
    body: JSON.stringify({
      jobId,
      rating: 5,
      text: 'Contractor attempting to leave a review should be rejected.',
      location: 'Queens',
    }),
  }).then(json);
  ok('contractor review rejected', coRev.status === 403, `status=${coRev.status}`);

  // Role abuse
  ok(
    'homeowner blocked admin jobs',
    (await fetch(`${API}/api/admin/managed/jobs`, { headers: homeH }).then(json)).status === 403
  );
  ok(
    'contractor blocked admin payouts settings',
    (await fetch(`${API}/api/admin/payout-settings`, { headers: coH }).then(json)).status === 403
  );
  ok(
    'homeowner blocked profitability',
    (await fetch(`${API}/api/admin/profitability`, { headers: homeH }).then(json)).status === 403
  );
  ok(
    'admin profitability works',
    (await fetch(`${API}/api/admin/profitability`, { headers: adminH }).then(json)).ok === true
  );

  // Client cannot mark paid
  const markPaid = await fetch(`${API}/api/managed/jobs/${jobId}`, {
    method: 'PUT',
    headers: homeH,
    body: JSON.stringify({ status: 'paid_out', paymentStatus: 'succeeded', paid: true }),
  }).then(json);
  ok(
    'client cannot force paid status via PUT',
    markPaid.ok !== true || (markPaid.job && markPaid.job.status !== 'paid_out'),
    `status=${markPaid.status} jobStatus=${markPaid.job?.status}`
  );

  // Partner open
  ok(
    'partner referrals need JWT',
    (await fetch(`${API}/api/partner/ANYCODE/referrals`).then(json)).status === 401
  );

  // Self-elevation attempt: set own access to super via body manipulation is N/A for non-staff;
  // try staff access on self as admin with elevated request
  const selfElev = await fetch(`${API}/api/admin/staff/access`, {
    method: 'POST',
    headers: adminH,
    body: JSON.stringify({
      userId: admin.user.id,
      rolePreset: 'super_admin',
      accessLevel: 'read-write',
    }),
  }).then(json);
  // Already super via legacy — should succeed or no-op; attempt demote then elevating peer is covered elsewhere
  ok('staff access endpoint responds', selfElev.status === 200 || selfElev.ok === true || selfElev.status === 403);

  // CORS hostile (browser would send Origin) — API may allow null Origin for curl
  const cors = await fetch(`${API}/api/auth/me`, {
    headers: { Origin: 'https://evil-attacker.example', Authorization: `Bearer ${maria.token}` },
  });
  const acao = cors.headers.get('access-control-allow-origin');
  ok(
    'hostile Origin not reflected (or blocked)',
    !acao || acao === 'null' || !acao.includes('evil-attacker'),
    `ACA-Origin=${acao}`
  );

  console.log('\n── Findings requiring attention ──');
  for (const f of findings) console.log(`${f.severity}: ${f.label} — ${f.detail}`);

  console.log(failed ? `\nREAUDIT_FAILED (${failed})\n` : '\nREAUDIT_OK\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
