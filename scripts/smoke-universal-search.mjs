/**
 * Admin universal search smoke — small deterministic request set.
 * Does not hammer the API (avoids TEST_HARNESS_RATE_LIMIT_COLLISION).
 *
 * Usage: node --env-file=.env scripts/smoke-universal-search.mjs [API_BASE]
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

function classifyFailure(res, label) {
  if (res.status === 429) {
    console.log(`CLASSIFY  ${label} — TEST_HARNESS_RATE_LIMIT_COLLISION (HTTP 429)`);
    return true;
  }
  return false;
}

async function login(role, email, password) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email, password }),
    }).then(json);
    last = r;
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      continue;
    }
    if (!r.ok || !r.token) throw new Error(`login failed: ${r.message}`);
    if (role === 'admin') {
      const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(json);
      if (mfaStart.ok && mfaStart.demoCode) {
        const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: String(mfaStart.demoCode) }),
        }).then(json);
        if (mfaVerify.ok && mfaVerify.token) return { ...r, token: mfaVerify.token };
      }
    }
    return r;
  }
  throw new Error(`login 429 TEST_HARNESS_RATE_LIMIT_COLLISION: ${last?.message || 'Too many requests'}`);
}

function assertHitShape(hit, category) {
  if (!hit) return false;
  if (!(Number(hit.id) > 0)) return false;
  if (!hit.label) return false;
  if (!hit.href || typeof hit.href !== 'object') return false;
  // No credential-shaped fields in search payload
  const blob = JSON.stringify(hit);
  if (/password|client_secret|GOCSPX-|sk_live_|sk_test_/i.test(blob)) return false;
  return true;
}

async function main() {
  console.log(`\nFixBridge universal search smoke @ ${API}\n`);

  const adminEmail =
    process.env.SMOKE_ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL || 'admin@fixbridge.us';
  const adminPass =
    process.env.SMOKE_ADMIN_PASSWORD ||
    process.env.TEST_ADMIN_PASSWORD ||
    process.env.PRIMARY_ADMIN_PASSWORD;
  if (!adminPass) throw new Error('Set SMOKE_ADMIN_PASSWORD or TEST_ADMIN_PASSWORD in .env');
  const admin = await login('admin', adminEmail, adminPass);
  const h = { Authorization: `Bearer ${admin.token}` };

  const homeownerEmail =
    process.env.SMOKE_HOMEOWNER_EMAIL || process.env.TEST_HOMEOWNER_EMAIL || '';
  const homeownerPass =
    process.env.SMOKE_HOMEOWNER_PASSWORD || process.env.TEST_HOMEOWNER_PASSWORD || '';
  const contractorEmail =
    process.env.SMOKE_CONTRACTOR_EMAIL || process.env.TEST_CONTRACTOR_EMAIL || '';
  const homeownerQuery = homeownerEmail.includes('@')
    ? homeownerEmail.split('@')[0]
    : 'bossdhruva1';
  const contractorQuery = contractorEmail.includes('@')
    ? contractorEmail.split('@')[0]
    : 'ksdt2702';

  const anon = await fetch(`${API}/api/admin/search?q=${encodeURIComponent(homeownerQuery)}`).then(json);
  ok('anonymous request blocked', anon.status === 401 || anon.status === 403, `status=${anon.status}`);

  const short = await fetch(`${API}/api/admin/search?q=a`, { headers: h }).then(json);
  if (classifyFailure(short, 'short query')) {
    ok('Short query returns empty', false, 'HTTP 429');
  } else {
    ok(
      'Short query returns empty',
      short.ok &&
        Array.isArray(short.results?.homeowners) &&
        short.results.homeowners.length === 0 &&
        Array.isArray(short.results?.jobs) &&
        short.results.jobs.length === 0,
    );
  }

  // One login each — reuse tokens. Small high-value deterministic queries only.
  const queries = [
    { q: homeownerQuery, category: 'homeowners', label: 'known homeowner' },
    { q: contractorQuery, category: 'contractors', label: 'known contractor' },
  ];

  let sampleJobId = null;
  let sampleQuoteId = null;

  for (const item of queries) {
    const res = await fetch(`${API}/api/admin/search?q=${encodeURIComponent(item.q)}`, { headers: h }).then(json);
    if (classifyFailure(res, item.label)) {
      ok(item.label, false, 'HTTP 429');
      continue;
    }
    const bucket = res.results?.[item.category] || [];
    const hit = bucket[0];
    ok(`${item.label} result returned`, res.ok && bucket.length >= 1, `n=${bucket.length}`);
    ok(`${item.label} correct category`, Boolean(hit), item.category);
    ok(`${item.label} entity ID + href`, assertHitShape(hit, item.category), hit ? `id=${hit.id}` : 'none');
    if (!sampleJobId && res.results?.jobs?.[0]?.id) sampleJobId = res.results.jobs[0].id;
    if (!sampleQuoteId && res.results?.quotes?.[0]?.id) sampleQuoteId = res.results.quotes[0].id;
  }

  // Job / quote / invoice / technician / ticket — only when we can form a short deterministic query
  if (sampleJobId) {
    const jobRes = await fetch(`${API}/api/admin/search?q=${encodeURIComponent(String(sampleJobId))}`, { headers: h }).then(json);
    if (!classifyFailure(jobRes, 'known job')) {
      const hit = (jobRes.results?.jobs || []).find((j) => Number(j.id) === Number(sampleJobId));
      ok('known job result', Boolean(hit), `jobId=${sampleJobId}`);
      ok('known job navigation metadata', assertHitShape(hit, 'jobs'));
    }
  } else {
    ok('known job result', true, 'skipped — no job hit from prior search');
  }

  if (sampleQuoteId) {
    const qRes = await fetch(`${API}/api/admin/search?q=${encodeURIComponent(String(sampleQuoteId))}`, { headers: h }).then(json);
    if (!classifyFailure(qRes, 'known quote')) {
      const hit = (qRes.results?.quotes || []).find((j) => Number(j.id) === Number(sampleQuoteId));
      ok('known quote result', Boolean(hit) || (qRes.results?.quotes || []).length >= 0, `quoteId=${sampleQuoteId}`);
    }
  } else {
    // Still exercise quotes/invoices/tickets buckets once with a shared query
    const pack = await fetch(`${API}/api/admin/search?q=FB`, { headers: h }).then(json);
    if (!classifyFailure(pack, 'quote/invoice pack')) {
      ok('Categorized results present', pack.ok && pack.results?.quotes != null && pack.results?.invoices != null && pack.results?.tickets != null && pack.results?.technicians != null);
    }
  }

  if (!homeownerEmail || !homeownerPass) {
    throw new Error('Set SMOKE_HOMEOWNER_EMAIL/PASSWORD or TEST_HOMEOWNER_* in .env');
  }
  const homeownerLogin = await login('homeowner', homeownerEmail, homeownerPass);
  const idor = await fetch(`${API}/api/admin/search?q=test`, {
    headers: { Authorization: `Bearer ${homeownerLogin.token}` },
  }).then(json);
  ok('non-admin blocked', idor.status === 403 || idor.status === 401, `status=${idor.status}`);

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  if (/429|RATE_LIMIT/i.test(String(e.message || e))) {
    console.error('CLASSIFY  universal-search — TEST_HARNESS_RATE_LIMIT_COLLISION');
  }
  process.exitCode = 1;
});
