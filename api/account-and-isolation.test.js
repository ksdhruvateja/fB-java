// Accounts, subscriptions and per-house isolation. Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL).
// Google's token check is simulated by intercepting the tokeninfo request inside this process.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'account-isolation-test-secret';
process.env.GOOGLE_CLIENT_ID = 'test-client-123.apps.googleusercontent.com';

let base, server, pool;
const stamp = Date.now();
const realFetch = globalThis.fetch;
const googleTokens = new Map();

globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const token = new URL(u).searchParams.get('id_token');
    const claims = googleTokens.get(token);
    if (!claims) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({
      aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600),
      email_verified: 'true', name: 'Test User', ...claims,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};

async function call(method, path, token, body) {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const consents = { consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true } };

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); globalThis.fetch = realFetch; });
const t = TEST_DB ? test : test.skip;

const email = `acct-${stamp}@example.org`;
let passwordUserId;

t('a password sign-up is saved and later sign-ins return the same account', async () => {
  const signup = await call('POST', '/api/auth/signup', null, { role: 'homeowner', name: 'Pat', email, password: 'Str0ng-pass!', ...consents });
  assert.equal(signup.body.ok, true, JSON.stringify(signup.body));
  passwordUserId = signup.body.user.id;
  const stored = (await pool.query(`SELECT password FROM users WHERE id=$1`, [passwordUserId])).rows[0];
  assert.match(stored.password, /^\$2[aby]\$/, 'password is stored as a bcrypt hash');
  const login = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email: email.toUpperCase(), password: 'Str0ng-pass!' });
  assert.equal(login.body.ok, true);
  assert.equal(login.body.user.id, passwordUserId);
  assert.equal(login.body.user.homeCareSubscription?.isPro ?? false, false);
});

t('subscription status is read from the database on every sign-in and session restore', async () => {
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, current_period_end)
     VALUES ($1, 'homecare_pro', 'homecare', 'active', NOW() + interval '30 days')`, [passwordUserId]);
  // Payment activation clears this cache in the app; the test writes the row directly.
  (await import('./subscription-state.js')).invalidateHomeCareEntitlementCache(passwordUserId);
  const login = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email, password: 'Str0ng-pass!' });
  assert.equal(login.body.user.homeCareSubscription.isPro, true);
  const me = await call('GET', '/api/auth/me', login.body.token);
  assert.equal(me.body.user.id, passwordUserId);
  assert.equal(me.body.user.homeCareSubscription.isPro, true);
  // A stored plan code alone never grants Pro: the subscription row is the source of truth.
  await pool.query(`UPDATE subscriptions SET status='canceled', current_period_end=NOW() - interval '1 day' WHERE user_id=$1`, [passwordUserId]);
  const { invalidateHomeCareEntitlementCache } = await import('./subscription-state.js');
  invalidateHomeCareEntitlementCache?.(passwordUserId);
  const again = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email, password: 'Str0ng-pass!' });
  assert.equal(again.body.user.homeCareSubscription.isPro, false);
  await pool.query(`UPDATE subscriptions SET status='active', current_period_end=NOW() + interval '30 days' WHERE user_id=$1`, [passwordUserId]);
  invalidateHomeCareEntitlementCache?.(passwordUserId);
});

t('Google sign-in with the same email opens the same account and subscription', async () => {
  googleTokens.set('tok-existing', { sub: `g-existing-${stamp}`, email });
  const g = await call('POST', '/api/auth/google', null, { credential: 'tok-existing', role: 'homeowner' });
  assert.equal(g.body.ok, true, JSON.stringify(g.body));
  assert.equal(g.body.user.id, passwordUserId);
  assert.equal(g.body.user.homeCareSubscription.isPro, true);
  const pw = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email, password: 'Str0ng-pass!' });
  assert.equal(pw.body.user.id, passwordUserId, 'password sign-in still works after linking Google');
});

t('a new Google account is saved, returns on the next Google sign-in, and has no guessable password', async () => {
  const gEmail = `google-only-${stamp}@example.org`;
  const sub = `g-new-${stamp}`;
  googleTokens.set('tok-new', { sub, email: gEmail });
  const first = await call('POST', '/api/auth/google', null, { credential: 'tok-new', role: 'homeowner', ...consents });
  assert.equal(first.body.ok, true, JSON.stringify(first.body));
  assert.equal(first.body.isNew, true);
  const second = await call('POST', '/api/auth/google', null, { credential: 'tok-new', role: 'homeowner' });
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(second.body.isNew, false);
  const guess = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email: gEmail, password: `GOOGLE_OAUTH_${sub}` });
  assert.equal(guess.status, 401);
  assert.equal(guess.body.code, 'PASSWORD_NOT_SET');
  const linked = await call('GET', '/api/auth/google/linked', second.body.token);
  assert.equal(linked.body.password.enabled, false);
});

t('older Google accounts with an ID-derived password are refused on password sign-in', async () => {
  const sub = `g-legacy-${stamp}`;
  const legacyEmail = `legacy-${stamp}@example.org`;
  await pool.query(
    `INSERT INTO users (role, name, email, password, oauth_google_sub, signup_method) VALUES ('homeowner','Legacy',$1,$2,$3,'google')`,
    [legacyEmail, await bcrypt.hash(`GOOGLE_OAUTH_${sub}`, 10), sub]);
  const guess = await call('POST', '/api/auth/signin', null, { role: 'homeowner', email: legacyEmail, password: `GOOGLE_OAUTH_${sub}` });
  assert.equal(guess.status, 401);
  assert.equal(guess.body.code, 'PASSWORD_NOT_SET');
  const row = (await pool.query(`SELECT password_login_enabled FROM users WHERE LOWER(email)=LOWER($1)`, [legacyEmail])).rows[0];
  assert.equal(row.password_login_enabled, false);
});

t('the demo-email free Pro rule does not apply in production', async () => {
  const { isQaGuidedDiyDemoEmail } = await import('./subscription-state.js');
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(isQaGuidedDiyDemoEmail('demo.homeowner.anyone@example.com'), false);
    process.env.QA_GUIDED_DIY_EMAILS = 'demo.homeowner.qa1@example.com';
    assert.equal(isQaGuidedDiyDemoEmail('demo.homeowner.qa1@example.com'), true);
  } finally {
    process.env.NODE_ENV = prev;
    delete process.env.QA_GUIDED_DIY_EMAILS;
  }
});

t("each house's context contains only that house", async () => {
  const owner = (await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner','Two Homes',$1,'x') RETURNING id`, [`two-${stamp}@example.org`])).rows[0].id;
  const other = (await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner','Neighbour',$1,'x') RETURNING id`, [`nb-${stamp}@example.org`])).rows[0].id;
  const mkProp = async (uid, label, systems) => (await pool.query(
    `INSERT INTO properties (owner_user_id, label, address_line1, city, state, zip, home_systems) VALUES ($1,$2,'1 Main','Austin','TX','78701',$3::jsonb) RETURNING id`,
    [uid, label, JSON.stringify(systems)])).rows[0].id;
  const houseA = await mkProp(owner, 'Lake house', [{ key: 'wh-a', name: 'HOUSE_A_HEATER', type: 'water_heater' }]);
  const houseB = await mkProp(owner, 'City flat', [{ key: 'wh-b', name: 'HOUSE_B_HEATER', type: 'water_heater' }]);
  const houseC = await mkProp(other, 'Neighbour', [{ key: 'wh-c', name: 'HOUSE_C_HEATER', type: 'water_heater' }]);
  const mkJob = async (uid, prop, title) => (await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, property_id, category, title, description, status, customer_confirmed_at)
     VALUES ($1,$2,'plumbing',$3,$3,'completed',NOW()) RETURNING id`, [uid, prop, title])).rows[0].id;
  await mkJob(owner, houseA, 'HOUSE_A_JOB');
  const jobB = await mkJob(owner, houseB, 'HOUSE_B_JOB');
  await mkJob(other, houseC, 'HOUSE_C_JOB');

  const { buildPropertyAIContext, buildHomeAssistantContext } = await import('./property-ai-context.js');
  const ctxA = await buildPropertyAIContext(pool, houseA, owner, { includeAddress: false });
  assert.match(ctxA.text, /HOUSE_A_JOB/);
  assert.doesNotMatch(ctxA.text, /HOUSE_B|HOUSE_C/);
  assert.equal(await buildPropertyAIContext(pool, houseC, owner, { includeAddress: false }), null, "another owner's house is refused");

  const mixed = await buildHomeAssistantContext(pool, { userId: owner, propertyId: houseA, jobId: jobB, userMessage: 'hi' });
  assert.doesNotMatch(mixed.contextText, /HOUSE_B/, "a job from the owner's other house is not mixed in");
  assert.equal(mixed.verifiedJobId, null);
  const own = await buildHomeAssistantContext(pool, { userId: owner, propertyId: houseB, jobId: jobB, userMessage: 'hi' });
  assert.match(own.contextText, /HOUSE_B_JOB/);
  assert.equal(own.verifiedJobId, Number(jobB));
});
