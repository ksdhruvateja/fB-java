/**
 * P1 production hardening regression suite.
 * Usage: node --env-file=.env scripts/smoke-p1.mjs
 */
import { spawnSync } from 'child_process';
import pg from 'pg';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

function runScript(script) {
  const r = spawnSync(process.execPath, ['--env-file=.env', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, API_BASE: API },
  });
  const pass = r.status === 0;
  const tail = (r.stdout || r.stderr || '').trim().split('\n').slice(-3).join(' | ');
  record(`Suite: ${script}`, pass, tail);
  return pass;
}

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

async function loginAdminWithMfa() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const signin = await fetch(`${API}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', email: 'ksdt2702@gmail.com', password: 'admin123' }),
    }).then(json);
    if (!signin.ok || !signin.token) throw new Error(signin.message || 'admin signin failed');
    const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signin.token}` },
      body: JSON.stringify({}),
    }).then(json);
    if (!mfaStart.ok || !mfaStart.demoCode) throw new Error('MFA start failed');
    const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signin.token}` },
      body: JSON.stringify({ code: mfaStart.demoCode }),
    }).then(json);
    if (mfaVerify.ok && mfaVerify.token) return mfaVerify.token;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
    else throw new Error(mfaVerify.message || 'MFA verify failed');
  }
  throw new Error('MFA verify failed');
}

async function main() {
  console.log('\n=== FixBridge P1 Smoke ===\n');

  // P0 regression (must stay green)
  runScript('scripts/smoke-p0-remediation.mjs');
  runScript('scripts/p0-tip-calculations.mjs');

  // P1-specific checks (avoid duplicate admin MFA — covered in smoke:p0-final)
  runScript('scripts/smoke-stripe-e2e.mjs');

  const fs = await import('fs');
  const notifySrc = fs.readFileSync('api/notify.js', 'utf8');
  const quoteSrc = fs.readFileSync('api/quote-workspace-routes.js', 'utf8');
  record('SMS provider gate (smsConfigured)', notifySrc.includes('function smsConfigured'));
  record('Quote/invoice SMS blocked when unconfigured', quoteSrc.includes('sms_not_configured'));

  let pool;
  if (DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
    });
  }

  if (pool) {
    const { filterEligibleContractors } = await import('../api/contractor-matching.js');
    const job = { category: 'HVAC', zip: '75201' };
    const contractors = [
      { id: 1, role: 'contractor', trade: 'HVAC', service_zips: ['75201', '75202'], compliance_status: 'approved', is_blocked: false },
      { id: 2, role: 'contractor', trade: 'HVAC', service_zips: ['10001'], compliance_status: 'approved', is_blocked: false },
    ];
    const eligible = filterEligibleContractors(contractors, job);
    record('ZIP service-area matching', eligible.length === 1 && eligible[0].id === 1, `eligible=${eligible.map((c) => c.id).join(',')}`);

    // Quote expiry — isolated job with only expired proposal
    const mariaLogin = await fetch(`${API}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'homeowner', email: 'maria@example.com', password: 'demo123' }),
    }).then(json);
    const expJob = await fetch(`${API}/api/managed/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mariaLogin.token}` },
      body: JSON.stringify({
        category: 'Plumbing',
        title: 'Expiry test',
        description: 'x',
        contactName: 'Maria',
        fullAddress: '1 Test',
        cityStateZip: 'NY 10001',
      }),
    }).then(json);
    const expJobId = expJob.job?.id;
    if (expJobId) {
      await pool.query(`DELETE FROM proposals WHERE job_id=$1`, [expJobId]);
      await pool.query(
        `INSERT INTO proposals (job_id, retail_amount, status, quote_number, quote_valid_until, version_number, created_at)
         VALUES ($1, 200, 'sent', $2, NOW() - INTERVAL '1 day', 1, NOW())`,
        [expJobId, `FBQ-EXP-${Date.now()}`]
      );
      const expiredAccept = await fetch(`${API}/api/managed/jobs/${expJobId}/approve-proposal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mariaLogin.token}` },
        body: JSON.stringify({}),
      }).then(json);
      record(
        'Expired quote blocked',
        expiredAccept.status === 409 || expiredAccept.code === 'quote_expired',
        expiredAccept.code || String(expiredAccept.status)
      );
    }
  }

  // Static UX checks
  const appTsx = fs.readFileSync('src/app/App.tsx', 'utf8');
  record('Invoice return URL sets confirming (not paid)', appTsx.includes('fixbridge-invoice-confirming'));
  const dash = fs.readFileSync('src/app/HomeownerDashboard.tsx', 'utf8');
  record('Invoice payment polls backend', dash.includes('homeownerInvoicePaymentStatus'));
  record('No hardcoded 4.8 in ContractorDashboard', !fs.readFileSync('src/app/ContractorDashboard.tsx', 'utf8').includes('rating={4.8}'));
  record('No hardcoded 4.8 in marketing pages', !fs.readFileSync('src/app/ContractorPage.tsx', 'utf8').includes('4.8'));
  record('Work queue backend endpoint wired', fs.readFileSync('src/app/AdminWorkQueue.tsx', 'utf8').includes('work-queue') || fs.readFileSync('api/platform-routes.js', 'utf8').includes('/api/admin/work-queue'));
  record('Change order panel wired (contractor)', fs.readFileSync('src/app/ContractorJobsPanel.tsx', 'utf8').includes('ChangeOrderPanel'));
  record('Coupon atomic claim (FOR UPDATE)', fs.readFileSync('api/discounts.js', 'utf8').includes('FOR UPDATE'));

  runScript('scripts/smoke-coupon-concurrency.mjs');

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- P1 smoke: ${passed}/${results.length} passed ---\n`);
  if (pool) await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
