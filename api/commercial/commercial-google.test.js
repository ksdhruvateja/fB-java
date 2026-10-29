// Google sign-in on FixBridge Commercial. Google's token check is simulated in-process.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
process.env.SESSION_SECRET = 'commercial-google-test-secret';
process.env.GOOGLE_CLIENT_ID = 'test-client-123.apps.googleusercontent.com';
process.env.COMMERCIAL_ADMIN_EMAIL = 'first-admin@example.test';
process.env.COMMERCIAL_ADMIN_PASSWORD = 'first-admin-password';
process.env.COMMERCIAL_AUTH_RATE_LIMIT_MAX = '200';

const t = TEST_DB ? test : test.skip;
const RUN = Date.now();
const realFetch = globalThis.fetch;
const tokens = new Map();
function googleToken(email, sub) {
  const id = `tok-${tokens.size}-${RUN}`;
  tokens.set(id, { email, sub });
  return id;
}
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const claims = tokens.get(new URL(u).searchParams.get('id_token'));
    if (!claims) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({
      aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600),
      email_verified: 'true', name: 'Google Person', ...claims,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};

let base, server, pool;
before(async () => {
  if (!TEST_DB) return;
  const mod = await import('../app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/commercial`;
});
after(async () => {
  server?.close();
  await pool?.end?.();
});
async function call(method, path, body, token) {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

t('commercial admin Google sign-in is only for admin@fixbridge.us, and the Google link is saved', async () => {
  const other = await call('POST', '/admin/auth/google', { credential: googleToken('someone@gmail.com', `s-other-${RUN}`) });
  assert.equal(other.status, 403);
  assert.equal(other.body.code, 'GOOGLE_NOT_ALLOWED');

  const sub = `s-admin-${RUN}`;
  const first = await call('POST', '/admin/auth/google', { credential: googleToken('admin@fixbridge.us', sub) });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal((await call('GET', '/admin/me', undefined, first.body.token)).status, 200);
  const { rows } = await pool.query('SELECT google_sub FROM commercial_admins WHERE email=$1', ['admin@fixbridge.us']);
  assert.equal(rows[0].google_sub, sub, 'Google account saved on the admin');

  const imposter = await call('POST', '/admin/auth/google', { credential: googleToken('admin@fixbridge.us', `s-imposter-${RUN}`) });
  assert.equal(imposter.status, 403, 'a different Google account with the same email is refused');
  assert.equal((await call('POST', '/admin/auth/google', { credential: googleToken('admin@fixbridge.us', sub) })).status, 200);
});

t('owners and staff sign up and sign in with Google; accounts wait for approval and are saved', async () => {
  const admin = (await call('POST', '/admin/auth/login', { email: process.env.COMMERCIAL_ADMIN_EMAIL, password: process.env.COMMERCIAL_ADMIN_PASSWORD })).body.token;
  const ownerEmail = `g-owner-${RUN}@gmail.com`;
  const ownerSub = `s-owner-${RUN}`;

  const noAccount = await call('POST', '/auth/google', { credential: googleToken(ownerEmail, ownerSub), role: 'owner', intent: 'signin' });
  assert.equal(noAccount.status, 404);
  assert.equal(noAccount.body.code, 'NO_ACCOUNT');

  const missingCompany = await call('POST', '/auth/google', { credential: googleToken(ownerEmail, ownerSub), role: 'owner', intent: 'signup' });
  assert.equal(missingCompany.status, 400);

  const signup = await call('POST', '/auth/google', { credential: googleToken(ownerEmail, ownerSub), role: 'owner', intent: 'signup', company_name: `Google ${RUN} Mechanical` });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  assert.equal(signup.body.pending, true);
  const saved = (await pool.query('SELECT * FROM commercial_users WHERE email=$1', [ownerEmail])).rows[0];
  assert.equal(saved.google_sub, ownerSub);
  assert.equal(saved.password_hash, null);
  assert.equal(saved.approval_status, 'pending');

  const pending = await call('POST', '/auth/google', { credential: googleToken(ownerEmail, ownerSub), role: 'owner', intent: 'signin' });
  assert.equal(pending.body.code, 'PENDING_APPROVAL');

  assert.equal((await call('POST', `/admin/accounts/${saved.id}/approve`, {}, admin)).status, 200);
  const owner = await call('POST', '/auth/google', { credential: googleToken(ownerEmail, ownerSub), role: 'owner', intent: 'signin' });
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  const team = await call('GET', '/team', undefined, owner.body.token);
  assert.equal(team.status, 200, 'Google-only owner can use the portal');
  assert.equal(team.body.users.find((u) => u.email === ownerEmail).invited, false);

  // Invited technician accepts by signing in with Google (no password).
  const techEmail = `g-tech-${RUN}@gmail.com`;
  const invite = await call('POST', '/team', { email: techEmail, name: 'Gina Tech', role: 'technician' }, owner.body.token);
  assert.equal(invite.status, 200);
  const techSub = `s-tech-${RUN}`;
  const beforeApproval = await call('POST', '/auth/google', { credential: googleToken(techEmail, techSub), role: 'technician', intent: 'signin' });
  assert.equal(beforeApproval.body.code, 'PENDING_APPROVAL');
  assert.equal((await pool.query('SELECT google_sub FROM commercial_users WHERE email=$1', [techEmail])).rows[0].google_sub, techSub);
  await call('POST', `/admin/accounts/${invite.body.user.id}/approve`, {}, admin);
  const tech = await call('POST', '/auth/google', { credential: googleToken(techEmail, techSub), role: 'technician', intent: 'signin' });
  assert.equal(tech.status, 200, JSON.stringify(tech.body));
  const wrongPage = await call('POST', '/auth/google', { credential: googleToken(techEmail, techSub), role: 'owner', intent: 'signin' });
  assert.equal(wrongPage.body.code, 'WRONG_ROLE');
  const otherGoogle = await call('POST', '/auth/google', { credential: googleToken(techEmail, `s-x-${RUN}`), role: 'technician', intent: 'signin' });
  assert.equal(otherGoogle.body.code, 'GOOGLE_MISMATCH');
});
