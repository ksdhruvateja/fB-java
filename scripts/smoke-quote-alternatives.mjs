/**
 * Quote alternatives smoke — Option A/B without superseding each other.
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

async function login(role, email, password) {
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(`login failed: ${r.message}`);
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

async function main() {
  console.log(`\nFixBridge quote alternatives smoke @ ${API}\n`);
  const admin = await login('admin', process.env.SMOKE_ADMIN_EMAIL || 'admin@fixbridge.com', process.env.SMOKE_ADMIN_PASSWORD || 'Fixbridge@9/26');
  const homeowner = await login('homeowner', process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com', process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123');
  const adminH = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const homeownerH = { Authorization: `Bearer ${homeowner.token}`, 'Content-Type': 'application/json' };

  const jobs = await fetch(`${API}/api/admin/managed/jobs`, { headers: adminH }).then(json);
  const job =
    (jobs.jobs || []).find((j) => ['bid_received', 'proposal_sent', 'awaiting_customer_approval'].includes(j.status)) ||
    (jobs.jobs || [])[0];
  ok('Job fixture', Boolean(job?.id), job ? `job ${job.id}` : 'none');

  if (!job?.id) return;

  const opts = await fetch(`${API}/api/managed/jobs/${job.id}/quote-options`, { headers: homeownerH }).then(json);
  ok('Quote options endpoint', opts.ok && Array.isArray(opts.options));
  ok('Has alternatives flag', typeof opts.hasAlternatives === 'boolean');

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
