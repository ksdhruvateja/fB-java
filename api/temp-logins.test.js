// COMMERCIAL_TEMP_LOGIN_PASSWORD gives temporary commercial logins only (no marketplace accounts).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
process.env.SESSION_SECRET = 'temp-logins-test-secret';
process.env.COMMERCIAL_TEMP_LOGIN_PASSWORD = 'Temp-login-pass-123';
delete process.env.TEMP_LOGIN_PASSWORD;
process.env.COMMERCIAL_AUTH_RATE_LIMIT_MAX = '200';
delete process.env.COMMERCIAL_DEMO_PASSWORD;

const t = TEST_DB ? test : test.skip;
let base, server, pool;

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await pool?.end?.();
});

const post = (path, body) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

t('temporary logins exist for every commercial role and not on the homeowner side', async () => {
  const pw = process.env.COMMERCIAL_TEMP_LOGIN_PASSWORD;
  for (const [role, email] of [['homeowner', 'temp.homeowner@fixbridge.us'], ['contractor', 'temp.contractor@fixbridge.us'], ['admin', 'temp.admin@fixbridge.us']]) {
    const r = await post('/api/auth/signin', { role, email, password: pw });
    assert.notEqual(r.body.ok, true, `${role} must not have a temporary login`);
  }
  const ca = await post('/api/commercial/admin/auth/login', { email: 'temp.commercial-admin@fixbridge.us', password: pw });
  assert.equal(ca.status, 200, JSON.stringify(ca.body));
  for (const [role, email] of [['owner', 'demo.owner@fixbridge.us'], ['office', 'demo.office@fixbridge.us'], ['technician', 'demo.tech@fixbridge.us']]) {
    const r = await post('/api/commercial/auth/login', { email, password: pw, role });
    assert.equal(r.status, 200, `${role}: ${JSON.stringify(r.body)}`);
  }
});
