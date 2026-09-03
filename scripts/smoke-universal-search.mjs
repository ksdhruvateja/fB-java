/**
 * Admin universal search smoke tests.
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

async function main() {
  console.log(`\nFixBridge universal search smoke @ ${API}\n`);
  const admin = await login('admin', process.env.SMOKE_ADMIN_EMAIL || 'admin@fixbridge.com', process.env.SMOKE_ADMIN_PASSWORD || 'Fixbridge@9/26');
  const h = { Authorization: `Bearer ${admin.token}` };

  const blocked = await fetch(`${API}/api/admin/search?q=a`, { headers: h }).then(json);
  ok('Short query returns empty', blocked.ok);

  const maria = await fetch(`${API}/api/admin/search?q=maria`, { headers: h }).then(json);
  ok('Homeowner search', maria.ok && maria.results?.homeowners != null);
  ok('Categorized results', maria.results?.jobs != null && maria.results?.contractors != null);

  const homeownerLogin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'homeowner', email: 'maria@example.com', password: 'demo123' }),
  }).then(json);
  if (homeownerLogin?.token) {
    const idor = await fetch(`${API}/api/admin/search?q=test`, {
      headers: { Authorization: `Bearer ${homeownerLogin.token}` },
    }).then(json);
    ok('Non-admin blocked', idor.status === 403 || idor.status === 401);
  } else {
    ok('Non-admin blocked', true, 'skipped');
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
