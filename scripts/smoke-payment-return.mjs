/**
 * Payment return UX — backend-authoritative poll (no Stripe card automation).
 */
import pg from 'pg';
import Stripe from 'stripe';
import { chromium } from 'playwright';
import { API, authH, json, loginHomeowner } from './smoke-auth.mjs';

const APP = process.env.APP_URL || 'http://localhost:5000';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim();
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function postWebhook(stripe, event) {
  const payload = JSON.stringify(event);
  if (WEBHOOK_SECRET) {
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    await fetch(`${API}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
      body: payload,
    });
    return;
  }
  await fetch(`${API}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
}

async function main() {
  console.log('\n=== Payment Return UX ===\n');
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });
  const stripe = new Stripe(STRIPE_KEY);
  const maria = await loginHomeowner();
  const tag = Date.now();
  const invNum = `FBI-RET-${tag}`;
  const { rows: jobRows } = await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, contact_name, city_state_zip, zip, booking_id)
     VALUES ($1,'Plumbing','Return UX','test','customer_review_pending','Maria','Brooklyn NY 11201','11201',$2) RETURNING id`,
    [maria.user.id, `FB-RET-${tag}`]
  );
  const jobId = jobRows[0].id;
  const { rows: invRows } = await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, line_items, bill_to)
     VALUES ($1,$2,$3,'due',500,500,500,0,'[]','{}') RETURNING id`,
    [jobId, maria.user.id, invNum]
  );
  const invoiceId = invRows[0].id;

  await fetch(`${API}/api/homeowner/invoices/${invoiceId}/checkout`, {
    method: 'POST',
    headers: authH(maria.token),
    body: JSON.stringify({ tipAmount: 50 }),
  }).then(json);

  const pre = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Pre-return unpaid', pre.paid !== true);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(
    ({ token, user, invNum: num }) => {
      localStorage.setItem('fixbridge-auth-token', token);
      localStorage.setItem('fixbridge-user-cache', JSON.stringify(user));
      localStorage.setItem('fixbridge-app-state', JSON.stringify({ page: 'homeowner-dashboard', marketingContext: 'home' }));
      sessionStorage.setItem('fixbridge-invoice-confirming', num);
    },
    { token: maria.token, user: maria.user, invNum }
  );
  const page = await context.newPage();
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => /Confirming your payment/i.test(document.body.innerText || ''),
    { timeout: 25000 }
  );
  record('Shows confirming (not instant PAID)', true);

  const mid = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Mid-poll backend unpaid', mid.paid !== true, `paid=${mid.paid}`);

  const sessionObj = {
    id: `cs_return_${tag}`,
    object: 'checkout.session',
    amount_total: 55000,
    payment_intent: `pi_return_${tag}`,
    payment_status: 'paid',
    metadata: {
      paymentType: 'invoice_payment',
      invoiceId: String(invoiceId),
      invoiceNumber: invNum,
      jobId: String(jobId),
      homeownerId: String(maria.user.id),
      userId: String(maria.user.id),
      serviceAmountCents: '50000',
      tipAmountCents: '5000',
    },
  };
  await postWebhook(stripe, {
    id: `evt_return_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: sessionObj },
  });

  await page.waitForFunction(() => /Payment received/i.test(document.body.innerText || ''), { timeout: 60000 });
  record('Auto-updates to Payment received', true);

  const post = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Backend confirms paid', post.paid === true);

  await browser.close();
  await pool.end();
  console.log(`\n--- Return UX: ${results.filter((r) => r.pass).length}/${results.length} passed ---\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
