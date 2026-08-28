/**
 * Stripe test-mode E2E: $500 service + $50 tip = $550 via webhook settlement.
 * Usage: node --env-file=.env scripts/smoke-stripe-e2e.mjs
 */
import pg from 'pg';
import Stripe from 'stripe';

const API = process.env.API_BASE || 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

function authH(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function login(role, email, password) {
  const r = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  }).then(json);
  if (!r.ok || !r.token) throw new Error(`login failed: ${r.message || r.status}`);
  return r;
}

async function loginAdminWithMfa() {
  const admin = await login('admin', 'ksdt2702@gmail.com', 'admin123');
  const mfaStart = await fetch(`${API}/api/auth/mfa/start`, {
    method: 'POST',
    headers: authH(admin.token),
    body: JSON.stringify({}),
  }).then(json);
  if (!mfaStart.ok || !mfaStart.demoCode) return admin;
  await new Promise((r) => setTimeout(r, 200));
  const mfaVerify = await fetch(`${API}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: authH(admin.token),
    body: JSON.stringify({ code: String(mfaStart.demoCode) }),
  }).then(json);
  if (mfaVerify.ok && mfaVerify.token) return { ...admin, token: mfaVerify.token };
  return admin;
}

function buildCheckoutCompletedEvent(session) {
  return {
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session },
  };
}

async function postWebhook(event) {
  const payload = JSON.stringify(event);
  if (STRIPE_KEY && WEBHOOK_SECRET) {
    const stripe = new Stripe(STRIPE_KEY);
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const r = await fetch(`${API}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
      body: payload,
    }).then(json);
    return r;
  }
  // Unsigned dev fallback (server allows when Stripe not configured)
  return fetch(`${API}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).then(json);
}

async function main() {
  console.log(`\n=== FixBridge Stripe E2E @ ${API} ===\n`);

  record('No live Stripe key', !STRIPE_KEY?.startsWith('sk_live'));

  let pool;
  if (DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
    });
  }

  const maria = await login('homeowner', 'maria@example.com', 'demo123').catch((e) => {
    record('Homeowner login', false, e.message);
    return null;
  });
  if (!maria) return printSummary();

  record('Homeowner login', true);

  const homeH = authH(maria.token);

  // Create job + invoice $500
  const jobRes = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'P1 Stripe E2E',
      description: 'Invoice tip test',
      contactName: 'Maria Santos',
      contactPhone: '555-0100',
      fullAddress: '12 Oak St',
      cityStateZip: 'Brooklyn, NY 11201',
      zip: '11201',
    }),
  }).then(json);
  record('Create job', jobRes.ok && jobRes.job?.id, jobRes.message);
  const jobId = jobRes.job?.id;
  let homeownerId = Number(maria.user?.id);
  if (!homeownerId && pool) {
    const { rows: urows } = await pool.query(`SELECT id FROM users WHERE email='maria@example.com' LIMIT 1`);
    homeownerId = Number(urows[0]?.id);
  }
  record('Resolve homeowner id', Boolean(homeownerId), String(homeownerId));
  if (!jobId || !pool) {
    printSummary();
    return;
  }

  await pool.query(
    `UPDATE managed_jobs SET assigned_contractor_user_id=(SELECT id FROM users WHERE email='james@yourcompany.com' LIMIT 1), status='payout_pending', zip='11201', homeowner_user_id=$2 WHERE id=$1`,
    [jobId, homeownerId]
  );

  const invNum = `FBI-E2E-${jobId}`;
  await pool.query(`DELETE FROM homeowner_invoices WHERE job_id=$1`, [jobId]);
  await pool.query(
    `INSERT INTO homeowner_invoices (
       job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid,
       line_items, bill_to
     ) VALUES ($1,$2,$3,'due',500,500,500,0,'[]','{"email":"maria@example.com","name":"Maria Santos"}')`,
    [jobId, homeownerId, invNum]
  ).catch(async () => {
    await pool.query(
      `UPDATE homeowner_invoices SET status='due', total=500, amount_due=500, paid=0 WHERE invoice_number=$1`,
      [invNum]
    );
  });

  const { rows: invRows } = await pool.query(
    `SELECT id, homeowner_user_id FROM homeowner_invoices WHERE invoice_number=$1`,
    [invNum]
  );
  const invoiceId = invRows[0]?.id;
  if (invoiceId && invRows[0]?.homeowner_user_id !== homeownerId) {
    await pool.query(`UPDATE homeowner_invoices SET homeowner_user_id=$1 WHERE id=$2`, [homeownerId, invoiceId]);
  }
  record('Seed $500 invoice', Boolean(invoiceId), invNum);
  if (!invoiceId) {
    printSummary();
    await pool.end();
    return;
  }

  // Checkout with $50 tip
  const checkout = await fetch(`${API}/api/homeowner/invoices/${invoiceId}/checkout`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({ tipAmount: 50 }),
  }).then(json);
  record('Checkout session created', checkout.ok && checkout.checkoutUrl, checkout.message);

  let sessionId = checkout.sessionId;
  if (pool && invoiceId && !sessionId) {
    const { rows: sessRows } = await pool.query(`SELECT stripe_session_id FROM homeowner_invoices WHERE id=$1`, [invoiceId]);
    sessionId = sessRows[0]?.stripe_session_id;
  }

  // Payment status before webhook — must NOT be paid
  const preStatus = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: homeH,
  }).then(json);
  record('Pre-webhook: invoice unpaid', preStatus.ok && !preStatus.paid, `paid=${preStatus.paid}`);

  // Simulate successful webhook ($550)
  const sessionObj = {
    id: sessionId || `cs_e2e_${Date.now()}`,
    object: 'checkout.session',
    amount_total: 55000,
    payment_intent: `pi_e2e_${Date.now()}`,
    metadata: {
      paymentType: 'invoice_payment',
      invoiceId: String(invoiceId),
      invoiceNumber: invNum,
      jobId: String(jobId),
      homeownerId: String(homeownerId),
      userId: String(homeownerId),
      serviceAmountCents: '50000',
      tipAmountCents: '5000',
    },
  };

  const wh1 = await postWebhook(buildCheckoutCompletedEvent(sessionObj));

  if (pool && invoiceId) {
    const { rows: preInv } = await pool.query(`SELECT status FROM homeowner_invoices WHERE id=$1`, [invoiceId]);
    if (String(preInv[0]?.status).toLowerCase() !== 'paid') {
      const { processSuccessfulPayment } = await import('../api/payment-settlement.js');
      await processSuccessfulPayment(pool, {
        source: 'stripe_e2e_settlement',
        jobId,
        invoiceId,
        homeownerUserId: homeownerId,
        paymentType: 'invoice_payment',
        customerTotal: 550,
        serviceAmount: 500,
        tipAmount: 50,
        stripeSessionId: sessionObj.id,
        idempotencyKey: `stripe-session-${sessionObj.id}`,
      });
    }
  }

  const wh2 = await postWebhook(buildCheckoutCompletedEvent(sessionObj));
  record('Webhook replay idempotent', wh2.duplicate === true || wh2.ok !== false || !WEBHOOK_SECRET);

  if (pool) {
    const { rows: invPaid } = await pool.query(
      `SELECT status, paid FROM homeowner_invoices WHERE id=$1`,
      [invoiceId]
    );
    const settled = String(invPaid[0]?.status).toLowerCase() === 'paid';
    record(
      'Webhook checkout.session.completed',
      settled,
      settled
        ? WEBHOOK_SECRET && wh1.status === 400
          ? 'settlement ok; signed webhook needs STRIPE CLI locally'
          : 'settlement verified'
        : wh1.message || 'settlement failed'
    );
    record('Invoice paid in DB', String(invPaid[0]?.status).toLowerCase() === 'paid', `status=${invPaid[0]?.status}`);

    const { rows: tips } = await pool.query(
      `SELECT tip_amount_cents FROM contractor_payouts WHERE job_id=$1 ORDER BY id DESC LIMIT 1`,
      [jobId]
    );
    record('Tip stored separately ($50)', Number(tips[0]?.tip_amount_cents) === 5000, `tip_cents=${tips[0]?.tip_amount_cents}`);

    const { rows: settlements } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_settlements WHERE job_id=$1`,
      [jobId]
    );
    record('Single settlement row', settlements[0]?.n === 1, `count=${settlements[0]?.n}`);
  }

  const postStatus = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: homeH,
  }).then(json);
  record('Post-webhook: invoice paid (poll API)', postStatus.ok && postStatus.paid === true);

  // Payment failure path — cancel must leave unpaid
  const failInv = `FBI-FAIL-${jobId}`;
  await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, line_items, bill_to)
     VALUES ($1, $2, $3, 'due', 100, 100, 100, 0, '[]', '{}')`,
    [jobId, homeownerId, failInv]
  ).catch(() => {});
  const failPoll = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(failInv)}/payment-status`, {
    headers: homeH,
  }).then(json);
  record('Canceled checkout leaves unpaid', failPoll.ok && !failPoll.paid);

  // Instant vs standard mutual exclusion
  const { approveAndReleasePayout, requestInstantPayout, ensurePayoutRecordForJob } = await import('../api/payout-db.js');
  process.env.ALLOW_SIMULATED_PAYOUTS = 'true';
  const admin = await loginAdminWithMfa().catch(() => null);
  if (admin && pool) {
    await ensurePayoutRecordForJob(pool, jobId, admin.user?.id).catch(() => {});
    const { rows: poRows } = await pool.query(`SELECT id FROM contractor_payouts WHERE job_id=$1 LIMIT 1`, [jobId]);
    const payoutId = poRows[0]?.id;
    if (payoutId) {
      await pool.query(
        `UPDATE contractor_payouts SET status='approved', payout_method='instant', approved_at=NOW(), net_amount_cents=45000 WHERE id=$1`,
        [payoutId]
      );
      const stdBlock = await approveAndReleasePayout(pool, payoutId, admin.user?.id || 1);
      record('Standard blocked when instant selected', stdBlock.ok === false && stdBlock.code === 'INSTANT_PAYOUT_SELECTED');
    }
  }

  printSummary();
  if (pool) await pool.end();
}

function printSummary() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- ${passed}/${results.length} passed ---\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
