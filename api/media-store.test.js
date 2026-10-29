// Case photos stored in Neon (the default). Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
let base, server, pool;
before(async () => {
  if (!TEST_DB) return;
  Object.assign(process.env, { NEON_DATABASE_URL: TEST_DB, SESSION_SECRET: 'media-store-test-secret' });
  delete process.env.MEDIA_STORAGE;
  for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY']) delete process.env[k];
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); });
const t = TEST_DB ? test : test.skip;

const png = (n) => `data:image/png;base64,${Buffer.alloc(3000 + n, n).toString('base64')}`;
const auth = (id) => `Bearer ${jwt.sign({ id, role: 'homeowner', email: 'x', authStage: 'complete' }, process.env.SESSION_SECRET, { algorithm: 'HS256' })}`;
const mkUser = async (label) => (await pool.query(
  `INSERT INTO users (role,name,email,password) VALUES ('homeowner',$1,$2,'x') RETURNING id`, [label, `${label}-${Date.now()}@example.org`])).rows[0].id;

t('new photos are stored once in Neon as bytes; the job row keeps only a reference', async () => {
  const uid = await mkUser('neon');
  const prop = (await pool.query(`INSERT INTO properties (owner_user_id,label,address_line1,city,state,zip) VALUES ($1,'Home','1 Main','Austin','TX','78701') RETURNING id`, [uid])).rows[0].id;
  await pool.query(`INSERT INTO subscriptions (user_id, plan_code, plan_family, status, current_period_end) VALUES ($1,'homecare_pro','homecare','active',NOW()+interval '30 days')`, [uid]);
  const res = await fetch(`${base}/api/managed/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth(uid) },
    body: JSON.stringify({ intent: 'hire', description: 'Leak', category: 'plumbing', propertyId: prop, mediaDataUrl: png(1), mediaType: 'image', mediaDataUrls: [png(2)] }),
  });
  const body = await res.json();
  assert.ok(res.ok, JSON.stringify(body).slice(0, 200));
  const caseId = body.job?.id || body.pendingServiceRequestId;
  const table = body.job?.id ? 'managed_jobs' : 'pending_service_requests';
  const column = body.job?.id ? 'job_id' : 'pending_service_request_id';
  const cover = (await pool.query(`SELECT media_data_url FROM ${table} WHERE id=$1`, [caseId])).rows[0].media_data_url;
  assert.match(cover, /^neonmedia:\d+$/);
  const media = (await pool.query(`SELECT id, data_url, octet_length(bytes) AS n FROM media_objects WHERE ${column}=$1 ORDER BY id`, [caseId])).rows;
  assert.equal(media.length, 2);
  assert.ok(media.every((m) => m.data_url === null && m.n > 0), 'bytes, not base64 text');
  assert.equal(cover, `neonmedia:${media[0].id}`, 'the cover is the first photo, stored once');
  assert.ok(!JSON.stringify(body).includes('base64'), 'the response does not echo the photo');

  const { listFixeraCaseImages } = await import('./fixera/case-media.js');
  const images = await listFixeraCaseImages(pool, { caseType: table === 'managed_jobs' ? 'managed_job' : 'pending_service_request', caseId });
  assert.deepEqual(images, [png(1), png(2)], 'the AI receives the original photos');

  if (table === 'managed_jobs') {
    const list = await (await fetch(`${base}/api/managed/jobs/my`, { headers: { authorization: auth(uid) } })).json();
    const link = list.jobs.find((j) => Number(j.id) === Number(caseId)).mediaDataUrl;
    assert.match(link, /^\/api\/media\/job\/\d+\?exp=/);
    const detail = await (await fetch(`${base}/api/managed/jobs/${caseId}`, { headers: { authorization: auth(uid) } })).json();
    assert.equal(detail.job.mediaDataUrl.split('?')[0], link.split('?')[0], 'detail uses the same link');
    const img = await fetch(`${base}${link}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), png(1).split(',')[1]);
  }
});

t('older base64 photos migrate into Neon bytes once; re-running changes nothing', async () => {
  const uid = await mkUser('legacy');
  const cover = png(5);
  const other = png(6);
  const job = (await pool.query(`INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, media_data_url, media_type) VALUES ($1,'plumbing','old','old','draft',$2,'image') RETURNING id`, [uid, cover])).rows[0].id;
  await pool.query(`INSERT INTO media_objects (owner_user_id, job_id, case_type, kind, storage_key, content_type, byte_size, data_url) VALUES ($1,$2,'managed_job','fixera_repair_case','k1','image/png',1,$3),($1,$2,'managed_job','fixera_repair_case','k2','image/png',1,$4)`, [uid, job, cover, other]);
  const pending = (await pool.query(`INSERT INTO pending_service_requests (homeowner_user_id, status, category, title, description, media_data_url, media_type) VALUES ($1,'pending','plumbing','p','p',$2,'image') RETURNING id`, [uid, png(8)])).rows[0].id;
  const run = async () => JSON.parse((await promisify(execFile)('node', ['scripts/migrate-case-photos.mjs'], { env: process.env, cwd: new URL('..', import.meta.url).pathname })).stdout.trim().split('\n').pop());
  const out = await run();
  assert.equal(out.failed, 0);
  assert.equal(out.backend, 'neon');
  const jobRef = (await pool.query(`SELECT media_data_url FROM managed_jobs WHERE id=$1`, [job])).rows[0].media_data_url;
  assert.match(jobRef, /^neonmedia:/);
  const rows = (await pool.query(`SELECT id, data_url, bytes FROM media_objects WHERE job_id=$1 ORDER BY id`, [job])).rows;
  assert.equal(rows.length, 2, 'the cover reused its identical case photo row');
  assert.ok(rows.every((r) => r.data_url === null && r.bytes));
  assert.equal(jobRef, `neonmedia:${rows[0].id}`);
  const pendingRef = (await pool.query(`SELECT media_data_url FROM pending_service_requests WHERE id=$1`, [pending])).rows[0].media_data_url;
  assert.match(pendingRef, /^neonmedia:/, 'a cover without a case photo row gets one');
  const { resolveMediaDataUrl } = await import('./media-store.js');
  assert.equal(await resolveMediaDataUrl(pool, jobRef), cover);
  assert.equal(await resolveMediaDataUrl(pool, pendingRef), png(8));
  const again = await run();
  assert.equal(again.covers + again.casePhotos, 0);
});

t('expired saved requests take their photos with them', async () => {
  const uid = await mkUser('expire');
  const pending = (await pool.query(`INSERT INTO pending_service_requests (homeowner_user_id, status, category, title, description, checkout_expires_at) VALUES ($1,'pending','plumbing','p','p', NOW() - interval '1 hour') RETURNING id`, [uid])).rows[0].id;
  await pool.query(`INSERT INTO media_objects (owner_user_id, pending_service_request_id, case_type, kind, storage_key, content_type, byte_size, bytes) VALUES ($1,$2,'pending_service_request','fixera_repair_case','k','image/png',3,'\\x010203')`, [uid, pending]);
  await fetch(`${base}/api/pending-service-requests/my`, { headers: { authorization: auth(uid) } });
  const left = (await pool.query(`SELECT COUNT(*)::int AS n FROM media_objects WHERE pending_service_request_id=$1`, [pending])).rows[0].n;
  assert.equal(left, 0);
});
