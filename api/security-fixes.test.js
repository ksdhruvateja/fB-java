// Regression tests for the auth, MFA, password-reset, tip and error-handler fixes.
// Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL), like the other database tests.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
process.env.SESSION_SECRET = 'security-fixes-test-secret';
// No Gmail configured: MFA email delivery is "simulated".
delete process.env.GMAIL_USER;
delete process.env.GMAIL_APP_PASSWORD;

let base, server, pool, tips;
const stamp = Date.now();
const t = TEST_DB ? test : test.skip;

async function call(method, path, token, body, rawBody) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  tips = await import('./tips.js');
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await pool?.end?.();
});

const adminEmail = `sec-admin-${stamp}@example.org`;
const adminPassword = 'Adm1n-pass-test!';

async function createAdmin() {
  const hash = await bcrypt.hash(adminPassword, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (role, name, email, password, is_admin, admin_access_level, admin_role_preset, compliance_status)
     VALUES ('admin', 'Sec Admin', $1, $2, true, 'read-write', 'super_admin', 'approved') RETURNING id`,
    [adminEmail, hash]
  );
  return Number(rows[0].id);
}

async function adminPendingToken() {
  const r = await call('POST', '/api/auth/signin', null, { role: 'admin', email: adminEmail, password: adminPassword });
  assert.equal(r.body?.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.mfaRequired, true);
  return r.body.token;
}

t('an MFA-pending admin token can only reach the MFA endpoints', async () => {
  await createAdmin();
  const pending = await adminPendingToken();

  // requireAdmin route
  const audit = await call('GET', '/api/admin/audit-logs', pending);
  assert.equal(audit.status, 403);
  assert.equal(audit.body.code, 'mfa_required');
  // route that only used requireAdminWrite before the fix
  const ref = await call('PUT', '/api/admin/referrals/config', pending, {});
  assert.equal(ref.status, 403);
  assert.equal(ref.body.code, 'mfa_required');
  // ordinary authenticated route
  const me = await call('GET', '/api/auth/me', pending);
  assert.equal(me.status, 403);

  const start = await call('POST', '/api/auth/mfa/start', pending, {});
  assert.equal(start.body?.ok, true, JSON.stringify(start.body));
});

t('MFA codes are never shown on screen in production', async () => {
  const pending = await adminPendingToken();
  process.env.CONTEXT = 'production';
  try {
    const start = await call('POST', '/api/auth/mfa/start', pending, {});
    assert.equal(start.status, 503);
    assert.equal(start.body.ok, false);
    assert.equal(start.body.fallbackCode, undefined);
    assert.equal(start.body.demoCode, undefined);
  } finally {
    delete process.env.CONTEXT;
  }
});

t('wrong MFA codes lock the challenge after five attempts; a correct code completes sign-in', async () => {
  const pending = await adminPendingToken();
  const start = await call('POST', '/api/auth/mfa/start', pending, {});
  const code = start.body.fallbackCode;
  assert.match(code, /^\d{6}$/, 'development returns the code when email is not configured');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) {
    const r = await call('POST', '/api/auth/mfa/verify', pending, { code: wrong });
    assert.equal(r.status, 401);
  }
  const locked = await call('POST', '/api/auth/mfa/verify', pending, { code });
  assert.notEqual(locked.body.ok, true, 'the right code no longer works after five failures');

  const again = await call('POST', '/api/auth/mfa/start', pending, {});
  const ok = await call('POST', '/api/auth/mfa/verify', pending, { code: again.body.fallbackCode });
  assert.equal(ok.body.ok, true, JSON.stringify(ok.body));
  const audit = await call('GET', '/api/admin/audit-logs', ok.body.token);
  assert.equal(audit.status, 200);
  const reuse = await call('POST', '/api/auth/mfa/verify', pending, { code: again.body.fallbackCode });
  assert.notEqual(reuse.body.ok, true, 'a code cannot be used twice');
});

t('partner-style tokens (typ claim) are not accepted as user sessions', async () => {
  const token = jwt.sign({ typ: 'partner', id: 1, role: 'admin' }, process.env.SESSION_SECRET, { algorithm: 'HS256' });
  const r = await call('GET', '/api/auth/me', token);
  assert.equal(r.status, 401);
});

t('a password reset ends existing sessions and its link works only once', async () => {
  const email = `sec-home-${stamp}@example.org`;
  const signup = await call('POST', '/api/auth/signup', null, {
    role: 'homeowner', name: 'Reset Test', email, password: 'Old-pass-123!',
    consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
  });
  assert.equal(signup.body.ok, true, JSON.stringify(signup.body));
  const oldToken = signup.body.token;
  assert.equal((await call('GET', '/api/auth/me', oldToken)).status, 200);

  const { hashResetToken } = await import('./password-reset.js');
  const raw = `raw-${stamp}`;
  await pool.query(
    `INSERT INTO password_reset_tokens (email, role, token, expires_at) VALUES ($1,'homeowner',$2, NOW() + INTERVAL '1 hour')`,
    [email, hashResetToken(raw)]
  );
  // Tokens carry whole-second iat; make sure the reset happens in a later second.
  await new Promise((r) => setTimeout(r, 1100));
  const [a, b] = await Promise.all([
    call('POST', '/api/auth/reset-password', null, { token: raw, role: 'homeowner', password: 'New-pass-456!' }),
    call('POST', '/api/auth/reset-password', null, { token: raw, role: 'homeowner', password: 'Other-pass-789!' }),
  ]);
  assert.equal([a, b].filter((r) => r.body?.ok === true).length, 1, 'only one of two simultaneous resets succeeds');

  const after = await call('GET', '/api/auth/me', oldToken);
  assert.equal(after.status, 401, 'the session from before the reset is rejected');

  const winner = a.body?.ok ? 'New-pass-456!' : 'Other-pass-789!';
  const login = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email, password: winner });
  assert.equal(login.body.ok, true);
  assert.equal((await call('GET', '/api/auth/me', login.body.token)).status, 200, 'a new session works');
});

t('tips: one row per payment, retries do not double count, multiple tips add up', async () => {
  const jobId = 900000000 + (stamp % 1000000);
  const pending = await tips.recordPendingTip(pool, { jobId, homeownerUserId: 1, amountDollars: 10 });
  assert.equal(pending.status, 'pending');

  const first = await tips.settleTipForPayment(pool, { jobId, tipDollars: 10, stripePaymentIntentId: `pi_a_${stamp}`, homeownerUserId: 1 });
  const retry = await tips.settleTipForPayment(pool, { jobId, tipDollars: 10, stripePaymentIntentId: `pi_a_${stamp}`, homeownerUserId: 1 });
  assert.equal(retry.id, first.id, 'a retried webhook returns the same tip');

  await tips.recordPendingTip(pool, { jobId, homeownerUserId: 1, amountDollars: 5 });
  await tips.settleTipForPayment(pool, { jobId, tipDollars: 5, stripePaymentIntentId: `pi_b_${stamp}`, homeownerUserId: 1 });
  assert.equal(await tips.getPaidTipAmountDollars(pool, jobId), 15, 'second tip is recorded and both count');

  await tips.markTipRefunded(pool, jobId);
  assert.equal(await tips.getPaidTipAmountDollars(pool, jobId), 0);
});

t('malformed JSON gets a generic 400, not a Google sign-up error', async () => {
  const r = await call('POST', '/api/auth/signin', null, undefined, '{not json');
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'INVALID_REQUEST');
  assert.doesNotMatch(r.body.message, /google/i);
});
