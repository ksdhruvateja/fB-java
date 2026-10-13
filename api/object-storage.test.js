// Object storage for case photos. Signatures are pinned to values produced by the official AWS SDK
// (@aws-sdk/signature-v4 and @aws-sdk/s3-request-presigner) for the same inputs. The route tests
// use an in-process S3 stand-in and need FIXERA_TEST_DATABASE_URL.
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { presignGet, signRequest } from './object-storage.js';

const r2 = {
  bucket: 'fixbridge-media', region: 'auto', endpoint: 'https://acct123.r2.cloudflarestorage.com',
  accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', pathStyle: true,
};
const now = new Date('2026-10-13T08:00:00Z');

test('upload signature matches the official AWS SDK signer', () => {
  const signed = signRequest(r2, { method: 'PUT', key: 'cases/managed_job/42/abc-def.jpg', body: Buffer.from('hello photo'), contentType: 'image/jpeg', now });
  assert.equal(signed.url, 'https://acct123.r2.cloudflarestorage.com/fixbridge-media/cases/managed_job/42/abc-def.jpg');
  assert.equal(signed.headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261013/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=9d06db6b33c68cceb13347f11986c478d8ef512123777ab248cffcb72fcb11b4');
});

test('pre-signed link matches the official AWS SDK presigner', () => {
  const url = new URL(presignGet(r2, 'cases/managed_job/42/abc-def.jpg', {
    expiresIn: 600, now, extraQuery: { 'x-amz-checksum-mode': 'ENABLED', 'x-id': 'GetObject' },
  }));
  assert.equal(url.searchParams.get('X-Amz-Signature'), '56f93628e53f6e96a73c227431de92547b15e7c4ba1717c6bb86580cea884bd7');
  assert.equal(url.searchParams.get('X-Amz-Content-Sha256'), 'UNSIGNED-PAYLOAD');
});

// ── Route tests against an in-process S3 stand-in ───────────────────────────
const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
const bucket = new Map();
let s3, base, server, pool;

function startFakeS3() {
  return new Promise((resolve) => {
    s3 = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const signedByHeader = String(req.headers.authorization || '').startsWith('AWS4-HMAC-SHA256 Credential=TESTKEY/');
      const presigned = u.searchParams.get('X-Amz-Credential')?.startsWith('TESTKEY/') && u.searchParams.get('X-Amz-Signature');
      if (!signedByHeader && !presigned) { res.writeHead(403); return res.end('unsigned'); }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        if (req.method === 'PUT') {
          bucket.set(u.pathname, { body: Buffer.concat(chunks), type: req.headers['content-type'] });
          res.writeHead(200); return res.end();
        }
        if (req.method === 'DELETE') { bucket.delete(u.pathname); res.writeHead(204); return res.end(); }
        const obj = bucket.get(u.pathname);
        if (!obj) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': obj.type }); return res.end(obj.body);
      });
    }).listen(0, '127.0.0.1', () => resolve(s3.address().port));
  });
}

let s3Port;
before(async () => {
  if (!TEST_DB) return;
  s3Port = await startFakeS3();
  Object.assign(process.env, {
    NEON_DATABASE_URL: TEST_DB,
    SESSION_SECRET: 'object-storage-test-secret',
    MEDIA_STORAGE: 's3',
    S3_BUCKET: 'fixbridge-media',
    S3_REGION: 'auto',
    S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    S3_ACCESS_KEY_ID: 'TESTKEY',
    S3_SECRET_ACCESS_KEY: 'TESTSECRET',
  });
  for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY']) delete process.env[k];
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); s3?.close(); await pool?.end?.(); });
const t = TEST_DB ? test : test.skip;

const png = (n) => `data:image/png;base64,${Buffer.alloc(2000 + n, n).toString('base64')}`;
const auth = (u) => `Bearer ${jwt.sign({ id: u.id, role: 'homeowner', email: 'x', authStage: 'complete' }, process.env.SESSION_SECRET, { algorithm: 'HS256' })}`;

t('new case photos go to the bucket; the database keeps only references', async () => {
  const u = (await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner','obj',$1,'x') RETURNING id`, [`obj-${Date.now()}@example.org`])).rows[0];
  const prop = (await pool.query(`INSERT INTO properties (owner_user_id,label,address_line1,city,state,zip) VALUES ($1,'Home','1 Main','Austin','TX','78701') RETURNING id`, [u.id])).rows[0].id;
  await pool.query(`INSERT INTO subscriptions (user_id, plan_code, plan_family, status, current_period_end) VALUES ($1,'homecare_pro','homecare','active',NOW()+interval '30 days')`, [u.id]);
  const res = await fetch(`${base}/api/managed/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth(u) },
    body: JSON.stringify({ intent: 'hire', description: 'Leak', category: 'plumbing', propertyId: prop, mediaDataUrl: png(1), mediaType: 'image', mediaDataUrls: [png(2)] }),
  });
  const body = await res.json();
  assert.ok(res.status === 200 || res.status === 201, JSON.stringify(body).slice(0, 200));
  const caseId = body.job?.id || body.pendingServiceRequestId;
  const table = body.job?.id ? 'managed_jobs' : 'pending_service_requests';
  const column = body.job?.id ? 'job_id' : 'pending_service_request_id';
  const cover = (await pool.query(`SELECT media_data_url FROM ${table} WHERE id=$1`, [caseId])).rows[0].media_data_url;
  assert.match(cover, /^objstore:cases\//);
  const media = (await pool.query(`SELECT data_url FROM media_objects WHERE ${column}=$1 ORDER BY id`, [caseId])).rows;
  assert.equal(media.length, 2);
  assert.ok(media.every((m) => m.data_url.startsWith('objstore:')));
  assert.equal(media[0].data_url, cover, 'the cover is the first photo, stored once');
  const keys = [...bucket.keys()].filter((k) => k.includes(`/${caseId}/`));
  assert.equal(keys.length, 2);

  // The AI still receives the photos themselves.
  const { listFixeraCaseImages } = await import('./fixera/case-media.js');
  const images = await listFixeraCaseImages(pool, { caseType: table === 'managed_jobs' ? 'managed_job' : 'pending_service_request', caseId });
  assert.deepEqual(images, [png(1), png(2)]);

  if (table === 'managed_jobs') {
    const list = await (await fetch(`${base}/api/managed/jobs/my`, { headers: { authorization: auth(u) } })).json();
    const link = list.jobs.find((j) => Number(j.id) === Number(caseId)).mediaDataUrl;
    const hop = await fetch(`${base}${link}`, { redirect: 'manual' });
    assert.equal(hop.status, 302, 'the app redirects to a short-lived bucket link');
    assert.match(hop.headers.get('location'), new RegExp(`^http://127\\.0\\.0\\.1:${s3Port}/fixbridge-media/cases/.*X-Amz-Signature=`));
    const img = await fetch(hop.headers.get('location'));
    assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), png(1).split(',')[1]);
  }
});

t('existing database photos are migrated once, and re-running changes nothing', async () => {
  const u = (await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner','mig',$1,'x') RETURNING id`, [`mig-${Date.now()}@example.org`])).rows[0];
  const photo = png(7);
  const job = (await pool.query(`INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, media_data_url, media_type) VALUES ($1,'plumbing','old','old','draft',$2,'image') RETURNING id`, [u.id, photo])).rows[0].id;
  await pool.query(`INSERT INTO media_objects (owner_user_id, job_id, case_type, kind, storage_key, content_type, byte_size, data_url) VALUES ($1,$2,'managed_job','fixera_repair_case','legacy','image/png',100,$3)`, [u.id, job, photo]);
  const before = bucket.size;
  const run = () => promisify(execFile)('node', ['scripts/migrate-media-to-object-storage.mjs'], { env: process.env, cwd: new URL('..', import.meta.url).pathname });
  const out = JSON.parse((await run()).stdout.trim().split('\n').pop());
  assert.equal(out.failed, 0);
  const cover = (await pool.query(`SELECT media_data_url FROM managed_jobs WHERE id=$1`, [job])).rows[0].media_data_url;
  const mediaRef = (await pool.query(`SELECT data_url FROM media_objects WHERE job_id=$1`, [job])).rows[0].data_url;
  assert.match(cover, /^objstore:/);
  assert.equal(mediaRef, cover, 'same photo, one object');
  assert.equal(bucket.size - before, out.covers + out.casePhotos);
  const again = JSON.parse((await run()).stdout.trim().split('\n').pop());
  assert.equal(again.covers + again.casePhotos, 0);
});
