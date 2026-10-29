// Public Contact page inquiries become support tickets. Needs FIXERA_TEST_DATABASE_URL (real PostgreSQL).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { validateContactInquiry } from './support-tickets.js';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
process.env.SESSION_SECRET = 'contact-inquiry-test-secret';

let base, server, pool;

async function call(method, path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
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

const valid = {
  name: 'Pat Visitor',
  email: 'Pat.Visitor@example.org',
  category: 'Business Inquiries',
  subject: 'Partnership question',
  message: 'We manage rental homes and would like to talk about using FixBridge.',
};

test('contact inquiries are validated field by field', () => {
  assert.equal(validateContactInquiry(valid).ok, true);
  const bad = validateContactInquiry({ ...valid, email: 'nope', category: 'Free stuff', message: 'hi', name: ' ' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['category', 'email', 'message', 'name']);
  assert.equal(validateContactInquiry({ ...valid, phone: 'call me' }).ok, false);
});

t('a visitor inquiry lands in the admin support queue as a ticket', async () => {
  const sent = await call('POST', '/api/contact', valid);
  assert.equal(sent.status, 200);
  assert.match(sent.body.ticketNumber, /^FBT-\d+$/);
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE ticket_number=$1', [sent.body.ticketNumber]);
  assert.equal(rows[0].channel, 'contact');
  assert.equal(rows[0].user_role, 'visitor');
  assert.equal(rows[0].user_email, 'pat.visitor@example.org');
  assert.equal(rows[0].category, 'Business Inquiries');
  const msgs = await pool.query('SELECT message FROM support_ticket_messages WHERE ticket_id=$1', [rows[0].id]);
  assert.equal(msgs.rows[0].message, valid.message);
});

t('invalid inquiries are refused with per-field errors, and bot submissions are not stored', async () => {
  const bad = await call('POST', '/api/contact', { ...valid, email: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.email);
  const before = (await pool.query('SELECT COUNT(*)::int AS n FROM support_tickets')).rows[0].n;
  const bot = await call('POST', '/api/contact', { ...valid, website: 'http://spam.example' });
  assert.equal(bot.status, 200);
  assert.equal(bot.body.ticketNumber, null);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM support_tickets')).rows[0].n, before);
});
