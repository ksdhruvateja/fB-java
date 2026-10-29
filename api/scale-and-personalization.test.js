// Scale safeguards and per-user personalisation. Database tests need FIXERA_TEST_DATABASE_URL.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { BoundedCache } from './bounded-cache.js';
import { aiFairnessGuard, aiFairnessStats } from './ai-fairness.js';
import { signedMediaUrl, verifyMediaSignature } from './media-signing.js';
import { deriveProfile, personalizationContext } from './fixera/user-profile.js';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'scale-test-secret';

test('bounded cache never grows past its cap and expires entries', async () => {
  const c = new BoundedCache({ max: 3, ttlMs: 20 });
  for (let i = 0; i < 10; i++) c.set(i, i);
  assert.equal(c.size, 3);
  assert.equal(c.get(0), undefined);
  assert.equal(c.get(9), 9);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.get(9), undefined);
});

test('AI fairness: a user is limited to their own share and others are not blocked', () => {
  const guard = aiFairnessGuard({ perUser: 2, global: 3 });
  const mk = (id) => {
    const listeners = {};
    const res = {
      statusCode: 200, headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
      on(ev, fn) { listeners[ev] = fn; },
      done() { listeners.finish?.(); },
    };
    let passed = false;
    guard({ authUser: { id } }, res, () => { passed = true; });
    return { res, passed };
  };
  const a1 = mk(1); const a2 = mk(1); const a3 = mk(1);
  assert.equal(a1.passed && a2.passed, true);
  assert.equal(a3.passed, false);
  assert.equal(a3.res.statusCode, 429, 'third request from the same user waits');
  const b1 = mk(2);
  assert.equal(b1.passed, true, 'another user still gets through');
  const c1 = mk(3);
  assert.equal(c1.res.statusCode, 503, 'instance cap answers busy instead of slowing everyone');
  [a1, a2, b1].forEach((x) => x.res.done());
  assert.equal(aiFairnessStats().inflightTotal, 0);
});

test('signed photo links name one job, expire, and cannot be altered', () => {
  const url = new URL(signedMediaUrl('job', 42), 'http://x');
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  assert.equal(verifyMediaSignature('job', 42, exp, sig), true);
  assert.equal(verifyMediaSignature('job', 43, exp, sig), false, 'another job');
  assert.equal(verifyMediaSignature('job', 42, Number(exp) + 300, sig), false, 'tampered expiry');
  assert.equal(verifyMediaSignature('job', 42, Math.floor(Date.now() / 1000) - 1, sig), false, 'expired');
});

test('profile reflects only the given homeowner history and never relaxes safety', () => {
  const p = deriveProfile({
    outcomes: [
      { outcome: 'DIY_FIXED', category: 'plumbing' },
      { outcome: 'DIY_FIXED', category: 'plumbing' },
      { outcome: 'DIY_FIXED', category: 'plumbing' },
      { outcome: 'DIY_STILL_BROKEN', category: 'electrical' },
    ],
    jobs: [{ category: 'electrical', completion_report: { fixeraDiy: { attemptedSteps: [{ event: 'step_failed' }] } } }],
  });
  assert.equal(p.categories.plumbing.level, 'experienced');
  assert.deepEqual(p.strengths, ['plumbing']);
  assert.deepEqual(p.needs_support, ['electrical']);
  const ctx = personalizationContext(p, 'electrical');
  assert.match(ctx, /struggled here before/);
  assert.match(ctx, /never makes a prohibited or professional-only step acceptable/);
  assert.match(personalizationContext(p, 'plumbing'), /concise/);
});

let base, server, pool;
async function call(method, path, user, body) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers.authorization = `Bearer ${jwt.sign({ id: user.id, role: user.role, email: 'x', authStage: 'complete' }, process.env.SESSION_SECRET, { algorithm: 'HS256' })}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: res.status, body: json, text, type: res.headers.get('content-type') };
}

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); });
const t = TEST_DB ? test : test.skip;
const stamp = Date.now();
const mkUser = async (label) => (await pool.query(
  `INSERT INTO users (role,name,email,password) VALUES ('homeowner',$1,$2,'x') RETURNING id, role`, [label, `${label}-${stamp}@example.org`])).rows[0];

t('job lists carry a signed photo link instead of the photo bytes', async () => {
  const u = await mkUser('list');
  const photo = `data:image/png;base64,${Buffer.alloc(30000, 9).toString('base64')}`;
  await pool.query(`INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, media_data_url, media_type) VALUES ($1,'plumbing','t','d','draft',$2,'image')`, [u.id, photo]);
  const list = await call('GET', '/api/managed/jobs/my', u);
  assert.equal(list.status, 200);
  const url = list.body.jobs[0].mediaDataUrl;
  assert.match(url, /^\/api\/media\/job\/\d+\?exp=\d+&sig=/);
  assert.ok(list.text.length < 5000, 'no embedded photo in the list');
  const file = await call('GET', url);
  assert.equal(file.status, 200);
  assert.equal(file.type, 'image/png');
  assert.equal((await call('GET', url.replace(/sig=[^&]+/, 'sig=forged'))).status, 403);
});

t('the assessment queue runs each case once, one at a time per user, and other users are not held up', async () => {
  const { ensureAssessmentQueueSchema, enqueueAssessment, startAssessmentQueueWorker } = await import('./assessment-queue.js');
  await ensureAssessmentQueueSchema(pool);
  const heavy = await mkUser('heavy');
  const light = await mkUser('light');
  for (let i = 1; i <= 4; i++) await enqueueAssessment(pool, { recordType: 'managed_job', recordId: 900000 + i, actorUserId: heavy.id });
  assert.equal((await enqueueAssessment(pool, { recordType: 'managed_job', recordId: 900001, actorUserId: heavy.id })).queued, false, 'duplicate not queued');
  await enqueueAssessment(pool, { recordType: 'managed_job', recordId: 900010, actorUserId: light.id });
  const runningPerUser = new Map();
  let maxPerUser = 0;
  const order = [];
  const processor = async (_p, payload) => {
    const n = (runningPerUser.get(payload.actorUserId) || 0) + 1;
    runningPerUser.set(payload.actorUserId, n);
    maxPerUser = Math.max(maxPerUser, n);
    order.push(payload.actorUserId);
    await new Promise((r) => setTimeout(r, 40));
    runningPerUser.set(payload.actorUserId, n - 1);
    return { ok: true };
  };
  const w = startAssessmentQueueWorker(pool, processor, { concurrency: 4, pollMs: 20 });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM fixera_assessment_queue WHERE actor_user_id = ANY($1) AND status='done'`, [[heavy.id, light.id]]);
    if (rows[0].n === 5) break;
    await new Promise((r) => setTimeout(r, 30));
  }
  w.stop();
  assert.equal(order.length, 5, 'each case processed exactly once');
  assert.equal(maxPerUser, 1, 'never two at once for the same user');
  assert.ok(order.indexOf(light.id) <= 1, "the light user's case is not stuck behind the heavy user's four");
});

t('a case left by a crashed instance is recovered and retried', async () => {
  const { enqueueAssessment, startAssessmentQueueWorker } = await import('./assessment-queue.js');
  const u = await mkUser('crash');
  const q = await enqueueAssessment(pool, { recordType: 'managed_job', recordId: 910001, actorUserId: u.id });
  await pool.query(`UPDATE fixera_assessment_queue SET status='running', locked_by='dead', locked_at=NOW() - interval '1 hour', attempts=1 WHERE id=$1`, [q.id]);
  let ran = 0;
  const w = startAssessmentQueueWorker(pool, async () => { ran += 1; return { ok: true }; }, { pollMs: 20, staleMs: 1000 });
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && ran === 0) await new Promise((r) => setTimeout(r, 30));
  w.stop();
  assert.equal(ran, 1);
});

t("each homeowner's profile is built from their own cases only", async () => {
  const { rebuildUserProfile } = await import('./fixera/user-profile.js');
  const { recordCaseOutcome } = await import('./fixera/learning-loop.js');
  const a = await mkUser('profA');
  const b = await mkUser('profB');
  const jobA = (await pool.query(`INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status) VALUES ($1,'plumbing','a','a','draft') RETURNING id`, [a.id])).rows[0].id;
  await recordCaseOutcome(pool, { jobId: Number(jobA), outcome: 'DIY_FIXED', source: 'homeowner' });
  const pa = (await call('GET', '/api/fixera/my-profile', a)).body.profile;
  assert.equal(pa.categories.plumbing.diy_attempts, 1);
  const pb = await rebuildUserProfile(pool, b.id);
  assert.equal(pb.overall.diy_attempts, 0, "user B is unaffected by user A's repairs");
  assert.equal((await call('GET', '/api/fixera/my-profile', b)).body.profile.overall.diy_attempts, 0);
});
