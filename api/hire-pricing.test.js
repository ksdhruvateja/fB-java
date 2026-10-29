// Hire-a-Pro fees are admin-managed and apply to every homeowner (members and non-members).
// Needs a real PostgreSQL in FIXERA_TEST_DATABASE_URL; skipped otherwise.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

const TEST_DB = process.env.FIXERA_TEST_DATABASE_URL;
if (TEST_DB) process.env.NEON_DATABASE_URL = TEST_DB;
for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) delete process.env[k];
process.env.SESSION_SECRET = 'hire-pricing-test-secret';
const t = TEST_DB ? test : test.skip;

let base, server, pool;
const u = {};
const token = (user) => `Bearer ${jwt.sign({ id: user.id, role: user.role, email: user.email, authStage: 'complete' }, process.env.SESSION_SECRET, { algorithm: 'HS256' })}`;
async function call(method, path, user, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { authorization: token(user) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  if (!TEST_DB) return;
  const mod = await import('./app.js');
  pool = mod.pool;
  await mod.initDb();
  const mk = async (role, email, extra = '') => (await pool.query(
    `INSERT INTO users (role, name, email, password${extra ? ', is_admin, admin_access_level, admin_role_preset' : ''})
     VALUES ($1, $2, $3, 'x'${extra ? ", true, 'read-write', 'super_admin'" : ''}) RETURNING id, role, email`, [role, email, email])).rows[0];
  u.admin = await mk('admin', `pricing-admin-${Date.now()}@example.com`, 'admin');
  u.bob = await mk('homeowner', `pricing-bob-${Date.now()}@example.com`);
  u.eve = await mk('homeowner', `pricing-eve-${Date.now()}@example.com`);
  u.pending = (await pool.query(
    `INSERT INTO pending_service_requests (homeowner_user_id, status, category, title, description)
     VALUES ($1, 'pending', 'plumbing', 'Leak', 'Water under sink') RETURNING id`, [u.bob.id])).rows[0].id;
  server = mod.default.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await pool?.end?.(); });

const FEES = [
  { key: 'platform_fee', label: 'Platform fee', amount_cents: 5000, enabled: true, line_type: 'charge' },
  { key: 'admin_fee', label: 'Admin fee', amount_cents: 1000, enabled: true, line_type: 'charge' },
  { key: 'care_fee', label: 'Care fee', amount_cents: 500, enabled: true, line_type: 'charge' },
];
let total;

t('admin adds Platform, Admin and Care fees; they apply to a non-member homeowner', async () => {
  const current = await call('GET', '/api/pricing/rules', u.admin);
  assert.equal(current.status, 200);
  const rules = current.body.rules;
  const existing = rules.professional_dispatch_pricing.lines;
  // Replace (not duplicate) these fee lines, so the test also passes on a database that ran it before.
  const feeKeys = new Set(FEES.map((f) => f.key));
  rules.professional_dispatch_pricing.lines = [...existing.filter((l) => !feeKeys.has(l.key)), ...FEES];
  const saved = await call('PUT', '/api/pricing/rules', u.admin, { rules });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const quote = await call('GET', `/api/pending-service-requests/${u.pending}/professional-pricing`, u.bob);
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  const labels = quote.body.lines.map((l) => l.label);
  for (const f of FEES) assert.ok(labels.includes(f.label), `${f.label} shown`);
  const sum = quote.body.lines.reduce((s, l) => s + l.amount_cents, 0);
  assert.equal(quote.body.authorizedNowCents, sum);
  total = sum;
  assert.equal((await call('GET', `/api/pending-service-requests/${u.pending}/professional-pricing`, u.eve)).status, 404);
});

t('admin cannot save fees that would break checkout', async () => {
  const { body } = await call('GET', '/api/pricing/rules', u.admin);
  const rules = body.rules;
  const huge = { ...rules, professional_dispatch_pricing: { ...rules.professional_dispatch_pricing, lines: [...rules.professional_dispatch_pricing.lines, { key: 'mega_discount', label: 'Mega discount', amount_cents: 999999, enabled: true, line_type: 'discount' }] } };
  assert.equal((await call('PUT', '/api/pricing/rules', u.admin, { rules: huge })).status, 400);
  const dup = { ...rules, professional_dispatch_pricing: { ...rules.professional_dispatch_pricing, lines: [...rules.professional_dispatch_pricing.lines, { ...FEES[0] }] } };
  assert.equal((await call('PUT', '/api/pricing/rules', u.admin, { rules: dup })).status, 400);
  const unnamed = { ...rules, professional_dispatch_pricing: { ...rules.professional_dispatch_pricing, lines: [...rules.professional_dispatch_pricing.lines, { key: 'x', label: '  ', amount_cents: 100, enabled: true, line_type: 'charge' }] } };
  assert.equal((await call('PUT', '/api/pricing/rules', u.admin, { rules: unnamed })).status, 400);
  assert.equal((await call('PUT', '/api/pricing/rules', u.bob, { rules })).status, 403, 'homeowners cannot edit pricing');
});

t('checkout charges the admin total, and refuses if the price changed under the homeowner', async () => {
  const body = { acknowledged: true, consents: { PROFESSIONAL_REQUEST_ACK: true }, serviceTiming: 'weekday', preferredTimeSlot: '9-11' };
  const stale = await call('POST', `/api/pending-service-requests/${u.pending}/professional-checkout`, u.bob, { ...body, expectedAmountCents: 12500 === total ? 1 : 12500 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'PRICING_CHANGED');
  assert.equal(stale.body.authorizedNowCents, total);
  const ok = await call('POST', `/api/pending-service-requests/${u.pending}/professional-checkout`, u.bob, { ...body, expectedAmountCents: total });
  // Stripe is not configured in tests, so checkout stops right before redirecting.
  assert.equal(ok.body.code, 'STRIPE_NOT_CONFIGURED', JSON.stringify(ok.body));
  const { rows } = await pool.query('SELECT paid_amount_cents FROM pending_service_requests WHERE id=$1', [u.pending]);
  assert.equal(rows[0].paid_amount_cents, total, 'quoted admin total stored, not a hardcoded $125');
});

t('payment confirmation accepts the quoted total and rejects any other amount', async () => {
  const event = (id, amount) => ({
    id, type: 'checkout.session.completed',
    data: { object: { id: `cs_${id}`, amount_total: amount, payment_intent: `pi_${id}`, metadata: { paymentType: 'pending_professional_fee', pendingServiceRequestId: String(u.pending), userId: String(u.bob.id), amountCents: String(total) } } },
  });
  const wrong = await call('POST', '/api/stripe/webhook', null, event('evt_wrong', total + 1));
  assert.equal(wrong.status, 400);
  const right = await call('POST', '/api/stripe/webhook', null, event('evt_right', total));
  assert.equal(right.status, 200, JSON.stringify(right.body));
});
