// Route-level checks for the flowchart workflow: safety-concern confirmation, DIY outcome to
// maintenance reminders, and multi-photo cases. Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL);
// skipped otherwise. No AI provider is configured, so nothing here calls a model.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { evaluateDiySafety } from './diy-safety.js';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'fixera-workflow-test-secret';

let base, server, pool, ids = {};
const token = (user) => `Bearer ${jwt.sign({ id: user.id, role: user.role, email: user.email, authStage: 'complete' }, process.env.SESSION_SECRET, { algorithm: 'HS256' })}`;

async function call(method, path, user, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { authorization: token(user) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// A yellow, confirmation-required assessment as FixBridge would store it.
const gfciAssessment = evaluateDiySafety({
  summary: 'Bathroom outlet has no power; the GFCI outlet has tripped',
  confidence: 0.85,
  complexity: 'low',
  diy_difficulty: 'easy',
  safe_diy_allowed: true,
  professional_required: false,
  diy_steps: ['Press the reset button on the GFCI outlet.', 'Remove the panel cover and inspect the breaker.'],
  diy_guide_steps: [],
  follow_up_maintenance: [{ task: 'Test GFCI outlets', interval_days: 30, system: 'electrical', reason: 'A GFCI that no longer trips leaves the circuit unprotected.' }],
});

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  const stamp = Date.now();
  const mkUser = async (role, email) => (await pool.query(
    `INSERT INTO users (role, name, email, password) VALUES ($1, $2, $3, 'x') RETURNING id, role, email`, [role, email, email])).rows[0];
  ids.carol = await mkUser('homeowner', `workflow-carol-${stamp}@example.com`);
  ids.dave = await mkUser('homeowner', `workflow-dave-${stamp}@example.com`);
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan_code, plan_family, status, current_period_end)
     VALUES ($1, 'homecare_pro', 'homecare', 'active', NOW() + interval '30 days')`, [ids.carol.id]);
  ids.property = (await pool.query(
    `INSERT INTO properties (owner_user_id, label, address_line1, city, state, zip, health_profile)
     VALUES ($1, 'Home', '1 Test St', 'Austin', 'TX', '78701', $2::jsonb) RETURNING id`,
    [ids.carol.id, JSON.stringify({ maintenance: [{ label: 'Clean gutters', dueDate: '2027-04-01' }] })])).rows[0].id;
  ids.job = (await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, property_id, category, title, description, status, ai_assessment, diy_risk_level)
     VALUES ($1, $2, 'electrical', 'Dead bathroom outlet', 'Bathroom outlet stopped working', 'draft', $3::jsonb, $4) RETURNING id`,
    [ids.carol.id, ids.property, JSON.stringify(gfciAssessment), gfciAssessment.diy_risk_level])).rows[0].id;
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); });
const t = TEST_DB ? test : test.skip;

t('the guardrail-limited assessment is stored without the prohibited step', () => {
  assert.equal(gfciAssessment.diy_risk_level, 'yellow');
  assert.equal(gfciAssessment.diy_safety.requires_confirmation, true);
  assert.deepEqual(gfciAssessment.diy_steps, ['Press the reset button on the GFCI outlet.']);
});

t('DIY steps are withheld until the homeowner confirms the safety concern', async () => {
  const before = await call('GET', `/api/managed/jobs/${ids.job}`, ids.carol);
  assert.equal(before.status, 200);
  const a = before.body.job.aiAssessment;
  assert.deepEqual(a.diy_steps, []);
  assert.equal(a.diy_steps_withheld, true);
  assert.equal(a.withheld_step_count, 1);
  assert.equal(a.safety_confirmation.required, true);
  assert.ok(a.diy_safety.prohibited_actions.length > 0, 'the reasons and guardrails stay visible');

  const step = await call('POST', `/api/managed/jobs/${ids.job}/fixera-diy`, ids.carol, { event: 'step_completed', stepIndex: 0 });
  assert.equal(step.status, 409);
  assert.equal(step.body.code, 'SAFETY_CONFIRMATION_REQUIRED');

  const consent = await call('POST', '/api/homeowner/consent/action', ids.carol, {
    actionKey: 'DIY_START', jobId: ids.job, consents: { DIY_SAFETY: true, DIY_SAFETY_ABILITY_ACK: true },
  });
  assert.equal(consent.status, 409);
  assert.equal(consent.body.code, 'SAFETY_CONFIRMATION_REQUIRED');
});

t('only the owner can answer, and continuing needs an explicit acknowledgement', async () => {
  assert.equal((await call('POST', `/api/managed/jobs/${ids.job}/safety-confirmation`, ids.dave, { decision: 'continue', acknowledged: true })).status, 404);
  const noAck = await call('POST', `/api/managed/jobs/${ids.job}/safety-confirmation`, ids.carol, { decision: 'continue' });
  assert.equal(noAck.status, 400);
  assert.equal(noAck.body.code, 'ACKNOWLEDGEMENT_REQUIRED');
});

t('confirming unlocks exactly the permitted steps, never the removed ones', async () => {
  const ok = await call('POST', `/api/managed/jobs/${ids.job}/safety-confirmation`, ids.carol, { decision: 'continue', acknowledged: true });
  assert.equal(ok.status, 200);
  const a = ok.body.job.aiAssessment;
  assert.deepEqual(a.diy_steps, ['Press the reset button on the GFCI outlet.']);
  assert.equal(a.safety_confirmation.confirmed, true);
  assert.ok(!JSON.stringify(a.diy_steps).includes('panel cover'));

  const step = await call('POST', `/api/managed/jobs/${ids.job}/fixera-diy`, ids.carol, { event: 'step_completed', stepIndex: 0 });
  assert.equal(step.status, 200);
  const outOfRange = await call('POST', `/api/managed/jobs/${ids.job}/fixera-diy`, ids.carol, { event: 'step_completed', stepIndex: 1 });
  assert.equal(outOfRange.status, 400, 'the removed step cannot be reached after confirming');

  const { rows } = await pool.query(`SELECT event_type FROM diy_safety_events WHERE job_id=$1`, [ids.job]);
  assert.ok(rows.some((r) => r.event_type === 'safety_concern_confirmed'), 'the decision is audited');
});

t('marking the DIY repair fixed schedules reminders tied to the issue and repair', async () => {
  const fixed = await call('POST', `/api/managed/jobs/${ids.job}/fixera-diy`, ids.carol, { event: 'fixed', actualAction: 'Reset the GFCI' });
  assert.equal(fixed.status, 200);
  const { rows } = await pool.query(`SELECT health_profile FROM properties WHERE id=$1`, [ids.property]);
  const maintenance = rows[0].health_profile.maintenance;
  const recheck = maintenance.find((m) => m.id === `fixera-${ids.job}-recheck`);
  const gfci = maintenance.find((m) => m.label === 'Test GFCI outlets');
  assert.ok(recheck, 'repair re-check scheduled');
  assert.ok(gfci, 'follow-up maintenance from the assessment scheduled');
  assert.equal(gfci.relatedJobId, Number(ids.job));
  assert.equal(gfci.repair, 'Reset the GFCI');
  assert.match(gfci.issue, /GFCI/);
  assert.equal(gfci.recurrenceDays, 30);
  assert.ok(maintenance.some((m) => m.label === 'Clean gutters'), 'existing items are kept');
});

t('saving the passport without the Fixera fields keeps them', async () => {
  const { rows } = await pool.query(`SELECT health_profile FROM properties WHERE id=$1`, [ids.property]);
  const stripped = rows[0].health_profile.maintenance.map((m) => ({ label: m.label, dueDate: m.dueDate, system: m.system }));
  const saved = await call('PUT', `/api/properties/${ids.property}/health`, ids.carol, { healthProfile: { ...rows[0].health_profile, maintenance: stripped } });
  assert.equal(saved.status, 200);
  const after = (await pool.query(`SELECT health_profile FROM properties WHERE id=$1`, [ids.property])).rows[0].health_profile.maintenance;
  const gfci = after.find((m) => m.label === 'Test GFCI outlets');
  assert.equal(gfci.source, 'FIXERA');
  assert.equal(gfci.relatedJobId, Number(ids.job));
});

t('due maintenance reminders notify the homeowner once', async () => {
  const { processDueMaintenanceReminders } = await import('./fixera/maintenance-reminders.js');
  const asOf = new Date(Date.now() + 40 * 86400000);
  const first = await processDueMaintenanceReminders(pool, { asOf, maxProperties: 1000 });
  assert.ok(first.sent >= 2);
  const { rows } = await pool.query(
    `SELECT title, message FROM notifications WHERE user_id=$1 AND type='maintenance_reminder'`, [ids.carol.id]);
  assert.ok(rows.some((r) => /Test GFCI outlets/.test(r.title) && /Related repair/.test(r.message)));
  const second = await processDueMaintenanceReminders(pool, { asOf, maxProperties: 1000 });
  const again = await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND type='maintenance_reminder'`, [ids.carol.id]);
  assert.equal(again.rows[0].n, rows.length, `no duplicate reminders (second run sent ${second.sent} elsewhere)`);
});

t('a request can attach up to five photos, all stored on the case', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p4sAAAAASUVORK5CYII=';
  const photo = (n) => `${png.slice(0, -2)}${'A'.repeat(n)}==`;
  const six = await call('POST', '/api/managed/jobs', ids.carol, {
    intent: 'hire', description: 'Leak under sink', category: 'plumbing', propertyId: ids.property,
    mediaDataUrl: photo(0), mediaType: 'image', mediaDataUrls: [1, 2, 3, 4, 5].map(photo),
  });
  assert.equal(six.status, 400);
  assert.equal(six.body.code, 'TOO_MANY_PHOTOS');

  const three = await call('POST', '/api/managed/jobs', ids.carol, {
    intent: 'hire', description: 'Leak under sink', category: 'plumbing', propertyId: ids.property,
    mediaDataUrl: photo(0), mediaType: 'image', mediaDataUrls: [photo(1), photo(2)],
  });
  assert.ok(three.status === 200 || three.status === 201, JSON.stringify(three.body).slice(0, 300));
  const caseId = three.body.job?.id || three.body.pendingServiceRequestId;
  const column = three.body.job?.id ? 'job_id' : 'pending_service_request_id';
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM media_objects WHERE ${column}=$1 AND kind='fixera_repair_case'`, [caseId]);
  assert.equal(rows[0].n, 3);
});
