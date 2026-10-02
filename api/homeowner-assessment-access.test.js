import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('initial assessment admits an active household and keeps free/foreign cases gated', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', NEON_DATABASE_URL: '', SESSION_SECRET: 'local-access-fixture',
    ENABLE_DEMO_USERS: 'false', ENABLE_DEMO_SEED: 'false', DISABLE_OUTBOUND_EMAIL: 'true',
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
    GEMINI_API_KEY: '', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '',
    NETLIFY: '', CONTEXT: '', FIXBRIDGE_HOSTING: '',
  });
  const require = createRequire(import.meta.url);
  const pgMem = require('pg-mem');
  const originalNewDb = pgMem.newDb;
  pgMem.newDb = (options) => {
    const db = originalNewDb({ ...options, noAstCoverageCheck: true });
    for (const name of ['trim', 'btrim']) db.public.registerFunction({
      name, args: ['text'], returns: 'text', implementation: (value) => value.trim(),
    });
    return db;
  };
  const { default: app, pool, initDb } = await import('./app.js');
  let server;
  try {
    await initDb();
    // The handler and entitlement/consent/claim logic are real. Queue execution is
    // stopped at the external-work boundary; the combined UI fixture tests the worker.
    const { registerAssessmentProcessor } = await import('./assessment-worker.js');
    registerAssessmentProcessor(async () => ({ ok: true }));
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES (901,'homeowner','Paid fixture','paid@example.invalid','unused'),(902,'homeowner','Free fixture','free@example.invalid','unused')");
    await pool.query("INSERT INTO subscriptions(user_id,plan_code,plan_family,status,simulated,stripe_subscription_id,current_period_end) VALUES (901,'homecare_pro','homecare_pro','active',false,'fixture-subscription',$1)", [new Date(Date.now() + 86400000).toISOString()]);
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,status,description) VALUES (201,901,'draft','Fixture issue'),(202,902,'draft','Fixture issue')");
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const jwt = require('jsonwebtoken');
    async function post(path, userId, body = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: userId, role: 'homeowner' }, process.env.SESSION_SECRET)}` }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const consent = { assessmentInvocationId: 'fixture-initial-assessment', consents: { AI_ASSESSMENT_ACK: true } };
    const paid = await post('/api/managed/jobs/201/assess', 901, consent);
    assert.equal(paid.status, 202, JSON.stringify(paid.body));
    assert.equal(paid.body.ok, true);
    const free = await post('/api/managed/jobs/202/assess', 902, consent);
    assert.equal(free.status, 403);
    assert.equal(free.body.code, 'HOMECARE_PLAN_REQUIRED');
    assert.equal((await post('/api/managed/jobs/201/assess', 902, consent)).status, 403);
    // Paid direct entry reaches invocation validation, rather than a false plan denial.
    const directPaid = await post('/api/fixera/assessment', 901);
    assert.equal(directPaid.status, 400);
    assert.notEqual(directPaid.body.code, 'HOMECARE_PLAN_REQUIRED');
    assert.equal((await post('/api/fixera/assessment', 902)).body.code, 'HOMECARE_PLAN_REQUIRED');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    pgMem.newDb = originalNewDb;
    await pool.end();
  }
});
