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
    const { LAUNCH_SUBSCRIPTION_PLANS } = await import('./subscription-catalog.js');
    const { mergeHomeCareConfig } = await import('./homecare-config.js');
    const freePlan = LAUNCH_SUBSCRIPTION_PLANS.find((plan) => plan.code === 'free');
    assert.equal(freePlan.unlocksDiy, false);
    assert.equal(freePlan.features.find((feature) => feature.label === 'AI assessment').included, false);
    assert.equal(freePlan.features.find((feature) => feature.label === 'Safe DIY guidance').included, false);
    // Persisted old settings cannot re-enable free AI/DIY after this policy change.
    const config = mergeHomeCareConfig({ features: { ai_assessment: { free: true }, diy_guidance: { free: true }, reduced_coordination_fees: { enabled: true, pro: true } } });
    assert.equal(config.features.ai_assessment.free, false);
    assert.equal(config.features.diy_guidance.free, false);
    assert.equal(config.features.reduced_coordination_fees.enabled, false);
    await pool.query("UPDATE subscription_plans SET unlocks_diy=true, features=$1::jsonb WHERE code='free'", [JSON.stringify([{ label: 'AI assessment', included: true }, { label: 'Safe DIY guidance', included: true }])]);
    const { getSubscriptionPlanByCode } = await import('./subscription-plans.js');
    const oldFreeRow = await getSubscriptionPlanByCode(pool, 'free');
    assert.equal(oldFreeRow.unlocksDiy, false);
    assert.ok(oldFreeRow.features.every((feature) => feature.included === false));
    await pool.query("UPDATE managed_jobs SET ai_assessment=$1::jsonb WHERE id IN (201,202)", [JSON.stringify({ safe_diy_allowed: true, diy_guide_steps: [{ instruction: 'Inspect the visible fixture.' }] })]);
    assert.equal((await post('/api/managed/jobs/202/fixera-diy', 902, { event: 'step_completed', stepIndex: 0 })).body.code, 'HOMECARE_PLAN_REQUIRED');
    assert.equal((await post('/api/managed/jobs/201/fixera-diy', 901, { event: 'step_completed', stepIndex: 0 })).status, 200);
    assert.equal((await post('/api/managed/jobs/202/fixera-diy', 901, { event: 'step_completed', stepIndex: 0 })).status, 404);
    await pool.query("UPDATE managed_jobs SET ai_assessment=$1::jsonb WHERE id=201", [JSON.stringify({ professional_required: true, safe_diy_allowed: false })]);
    assert.equal((await post('/api/managed/jobs/201/fixera-diy', 901, { event: 'step_completed', stepIndex: 0 })).body.code, 'DIY_NOT_ALLOWED');
    for (const path of ['/api/ai/chat', '/api/fixera/chat', '/api/fixa/chat']) {
      assert.equal((await post(path, 902, { messages: [{ role: 'user', content: 'Give me DIY instructions.' }] })).body.code, 'HOMECARE_PLAN_REQUIRED');
      assert.equal((await post(path, 901)).status, 400); // Paid request reaches normal input validation; no provider call.
    }
    await pool.query("UPDATE subscriptions SET status='past_due' WHERE user_id=901");
    const { invalidateHomeCareEntitlementCache } = await import('./subscription-state.js');
    invalidateHomeCareEntitlementCache(901); // Billing event handlers invalidate after state changes.
    assert.equal((await post('/api/managed/jobs/201/fixera-diy', 901, { event: 'step_completed', stepIndex: 0 })).body.code, 'HOMECARE_PLAN_REQUIRED');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    pgMem.newDb = originalNewDb;
    await pool.end();
  }
});
