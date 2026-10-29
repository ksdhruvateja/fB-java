// Usage (staging only):
//   LOAD_DB=postgres://... SESSION_SECRET=<staging secret> node scripts/loadtest.mjs seed users=1000
//   LOAD_DB=postgres://... SESSION_SECRET=<staging secret> node scripts/loadtest.mjs run users=1000 seconds=60 base=https://staging.example.com
// Set API_RATE_LIMIT_MAX high on the staging API, or the per-session rate limit will answer 429.
//
// Concurrency load test: N virtual users, each with its own account, house and jobs, run the
// dashboard request mix at the same time. Reports throughput, latency percentiles, errors,
// response sizes, and any response that contains another user's data (isolation check).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const [,, mode, ...rest] = process.argv;
const opts = Object.fromEntries(rest.map((a) => a.split('=')));
const DB = process.env.LOAD_DB;
const BASES = (opts.base || 'http://127.0.0.1:3911').split(',');
const USERS = Number(opts.users || 400);
const SECONDS = Number(opts.seconds || 30);
const SECRET = process.env.SESSION_SECRET;

if (mode === 'seed') {
  if (process.env.NODE_ENV === 'production' || (/neon\.tech/.test(DB || '') && opts.force !== 'yes')) {
    console.error('Refusing to seed what looks like a production database. Use a staging branch (add force=yes for a Neon staging branch).');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DB });
  const photo = `data:image/jpeg;base64,${Buffer.alloc(Number(opts.photoKb || 150) * 768, 7).toString('base64')}`;
  await pool.query(`DELETE FROM users WHERE email LIKE 'load-%@example.org'`);
  for (let i = 0; i < USERS; i++) {
    const u = (await pool.query(`INSERT INTO users (role,name,email,password) VALUES ('homeowner',$1,$2,'x') RETURNING id`, [`Load ${i}`, `load-${i}@example.org`])).rows[0].id;
    const p = (await pool.query(`INSERT INTO properties (owner_user_id,label,address_line1,city,state,zip) VALUES ($1,$2,'1 Main','Austin','TX','78701') RETURNING id`, [u, `HOUSE-${u}`])).rows[0].id;
    for (let j = 0; j < 3; j++) {
      await pool.query(
        `INSERT INTO managed_jobs (homeowner_user_id, property_id, category, title, description, status, media_data_url, media_type, ai_assessment)
         VALUES ($1,$2,'plumbing',$3,$3,'draft',$4,'image',$5::jsonb)`,
        [u, p, `JOB-OF-USER-${u}-${j}`, photo, JSON.stringify({ summary: `ASSESSMENT-OF-USER-${u}-${j}`, diy_steps: ['Close valve.'] })]);
    }
  }
  console.log(`seeded ${USERS} users`);
  await pool.end();
  process.exit(0);
}

const pool = new Pool({ connectionString: DB });
const users = (await pool.query(`SELECT id FROM users WHERE email LIKE 'load-%@example.org' ORDER BY id LIMIT $1`, [USERS])).rows.map((r) => Number(r.id));
await pool.end();
const routes = ['/api/auth/me', '/api/managed/jobs/my', '/api/notifications/unread-count', '/api/properties'];
const lat = [];
let ok = 0, errors = 0, bytes = 0, leaks = 0;
const statusCounts = {};
const deadline = Date.now() + SECONDS * 1000;

async function vu(uid) {
  const token = jwt.sign({ id: uid, role: 'homeowner', email: `load@x`, authStage: 'complete' }, SECRET, { algorithm: 'HS256' });
  let i = uid % routes.length;
  while (Date.now() < deadline) {
    const route = routes[i++ % routes.length];
    const t0 = performance.now();
    try {
      const res = await fetch(`${BASES[uid % BASES.length]}${route}`, { headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `10.${(uid >> 16) & 255}.${(uid >> 8) & 255}.${uid & 255}` } });
      const text = await res.text();
      lat.push(performance.now() - t0);
      bytes += text.length;
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      if (res.ok) ok++; else errors++;
      // Isolation: a response must only mention this user's own jobs/houses.
      for (const m of text.matchAll(/(?:JOB-OF-USER|ASSESSMENT-OF-USER|HOUSE)-(\d+)/g)) {
        if (Number(m[1]) !== uid) { leaks++; break; }
      }
    } catch {
      lat.push(performance.now() - t0);
      errors++;
    }
  }
}
const t0 = Date.now();
await Promise.all(users.map((u) => vu(u)));
const secs = (Date.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(0) : '-';
console.log(JSON.stringify({
  label: opts.label || '',
  concurrentUsers: users.length,
  seconds: Number(secs.toFixed(1)),
  requests: lat.length,
  requestsPerSecond: Math.round(lat.length / secs),
  p50ms: pct(0.5), p95ms: pct(0.95), p99ms: pct(0.99),
  ok, errors, statusCounts,
  avgResponseKb: Math.round(bytes / Math.max(1, lat.length) / 1024),
  crossUserLeaks: leaks,
}));
