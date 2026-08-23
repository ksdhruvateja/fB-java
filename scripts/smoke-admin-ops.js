/**
 * Smoke test for admin ops: audit logs, staff, invoices, payouts v2.
 * Usage: node --env-file=.env scripts/smoke-admin-ops.js
 */
const API = process.env.API_URL || 'http://127.0.0.1:3001';

let passed = 0;
let failed = 0;

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, message: text || res.statusText };
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

async function signIn() {
  return fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', email: 'admin@fixbridge.local', password: 'admin123' }),
  }).then(json);
}

async function main() {
  console.log(`\nFixBridge admin ops smoke @ ${API}\n`);

  const admin = await signIn();
  ok('admin login', admin.ok && admin.token, admin.message);
  if (!admin.token) {
    console.log(`\nFailed: ${failed}\n`);
    process.exit(1);
  }
  const H = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };

  console.log('\nAUDIT & STAFF');
  const logs = await fetch(`${API}/api/admin/audit-logs?limit=10`, { headers: H }).then(json);
  ok('audit logs list', logs.ok && Array.isArray(logs.logs), `count=${logs.logs?.length ?? 0}, ok=${logs.ok}`);

  const staff = await fetch(`${API}/api/admin/staff`, { headers: H }).then(json);
  ok('staff list', staff.ok && Array.isArray(staff.staff), `count=${staff.staff?.length ?? 0}`);

  console.log('\nMANAGED JOBS');
  const jobs = await fetch(`${API}/api/admin/managed/jobs`, { headers: H }).then(json);
  ok('managed jobs', jobs.ok && Array.isArray(jobs.jobs), `count=${jobs.jobs?.length ?? 0}`);

  const job = jobs.jobs?.[0];
  if (job?.id) {
    console.log(`\nJOB #${job.id}`);
    const invPreview = await fetch(`${API}/api/admin/managed/jobs/${job.id}/invoice`, { headers: H }).then(json);
    ok('invoice preview', invPreview.ok && invPreview.invoice?.invoiceNumber, invPreview.invoice?.invoiceNumber);

    const invSend = await fetch(`${API}/api/admin/managed/jobs/${job.id}/invoice/send`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ sendEmail: true, sendSms: false, email: 'maria@example.com' }),
    }).then(json);
    ok('invoice send (email)', invSend.ok, invSend.message);

    const discount = await fetch(`${API}/api/admin/managed/jobs/${job.id}/apply-discount`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ code: 'INVALID_CODE_XYZ' }),
    }).then(json);
    ok('apply discount rejects invalid', !discount.ok && discount.status === 400, discount.message);

    if (job.homeownerUserId) {
      const hwJobs = await fetch(`${API}/api/admin/homeowners/${job.homeownerUserId}/jobs`, { headers: H }).then(json);
      ok('homeowner jobs', hwJobs.ok && Array.isArray(hwJobs.jobs), `count=${hwJobs.jobs?.length ?? 0}`);
    }
  } else {
    console.log('  (skip job-specific tests — no managed jobs)');
  }

  console.log('\nPAYOUTS');
  const payoutSummary = await fetch(`${API}/api/admin/payouts/summary`, { headers: H }).then(json);
  ok('payouts summary', payoutSummary.ok && payoutSummary.summary, '');

  console.log(`\n────────────────────────────`);
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log('Admin ops checks passed.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
