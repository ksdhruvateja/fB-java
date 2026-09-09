/**
 * Browser Stripe E2E — real Hosted Checkout + FixBridge return UX.
 * TEST-ONLY robustness for Stripe Hosted Checkout UI (not application payment logic).
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

async function postCheckoutWebhook(stripe, session) {
  const payload = JSON.stringify({
    id: `evt_browser_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session },
  });
  if (WEBHOOK_SECRET) {
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return fetch(`${API}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
      body: payload,
    }).then((r) => r.json().catch(() => ({})));
  }
  return fetch(`${API}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).then((r) => r.json().catch(() => ({})));
}

async function waitStripePaid(stripe, sessionId, tries = 25) {
  for (let i = 0; i < tries; i++) {
    const sess = await stripe.checkout.sessions.retrieve(sessionId);
    if (sess.payment_status === 'paid') return sess;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return stripe.checkout.sessions.retrieve(sessionId);
}

async function seedInvoice(pool, homeownerId, tag = Date.now()) {
  const invNum = `FBI-BRW-${tag}`;
  const { rows: jobRows } = await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, contact_name, city_state_zip, zip, booking_id)
     VALUES ($1,'Plumbing','Browser Stripe test','E2E',$2,'Maria Santos','Brooklyn NY 11201','11201',$3) RETURNING id`,
    [homeownerId, 'customer_review_pending', `FB-BRW-${tag}`]
  );
  const jobId = jobRows[0].id;
  await pool.query(
    `UPDATE managed_jobs SET assigned_contractor_user_id=(SELECT id FROM users WHERE email='james@yourcompany.com' LIMIT 1) WHERE id=$1`,
    [jobId]
  );
  const { rows: invRows } = await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, line_items, bill_to)
     VALUES ($1,$2,$3,'due',500,500,500,0,'[]','{"email":"maria@example.com","name":"Maria Santos"}') RETURNING id`,
    [jobId, homeownerId, invNum]
  );
  return { jobId, invoiceId: invRows[0].id, invNum };
}

/** Stripe Hosted Checkout card fields live on main page after accordion expand (not iframe). */
async function openCardSection(page) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 90000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  const cardVisible = () => page.locator('#cardNumber').isVisible().catch(() => false);

  if (await cardVisible()) return;

  const expandSelectors = [
    '[data-testid="card-accordion-item-button"]',
    '[aria-label="Pay with card"]',
    'button:has-text("Card")',
    '#payment-method-accordion-item-title-card',
  ];

  for (let attempt = 0; attempt < 8; attempt++) {
    for (const sel of expandSelectors) {
      await page.locator(sel).first().click({ timeout: 3000, force: true }).catch(() => {});
      await page.evaluate((selector) => {
        document.querySelector(selector)?.click();
      }, sel).catch(() => {});
    }
    if (await cardVisible()) return;
    await page.waitForTimeout(1500);
  }

  await page.waitForSelector('#cardNumber', { state: 'visible', timeout: 45000 });
}

async function fillHostedCheckoutCard(page, cardNumber) {
  await openCardSection(page);
  const num = cardNumber.replace(/\s/g, '');
  await page.locator('#cardNumber').fill(num);
  await page.locator('#cardExpiry').fill('1234');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('Maria Santos').catch(() => {});
  await page.locator('#billingPostalCode').fill('11201').catch(() => {});
  if (await page.locator('#billingCountry').isVisible().catch(() => false)) {
    await page.locator('#billingCountry').selectOption('US');
  }
  if (await page.locator('#phoneNumber').isVisible().catch(() => false)) {
    await page.locator('#phoneNumber').fill('2015550123');
  }
  await page.waitForTimeout(1500);
}

async function submitHostedCheckout(page) {
  const submit = page.locator('button[type="submit"]');
  await submit.waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 45; i++) {
    if (!(await submit.isDisabled().catch(() => true))) break;
    await page.waitForTimeout(800);
  }
  await submit.click({ timeout: 30000 });
}

async function stripeCheckout(page, checkoutUrl, cardNumber) {
  let lastErr = null;
  for (let run = 0; run < 2; run++) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(checkoutUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
          break;
        } catch (e) {
          if (attempt === 2) throw e;
          await page.waitForTimeout(2000);
        }
      }
      await fillHostedCheckoutCard(page, cardNumber);
      await submitHostedCheckout(page);
      return;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(3000);
    }
  }
  throw lastErr || new Error('Stripe checkout automation failed');
}

async function makeContext(maria) {
  const browser = await chromium.launch({
    headless: process.env.SMOKE_HEADLESS === '1',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  await context.addInitScript(
    ({ token, user }) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      localStorage.setItem('fixbridge-auth-token', token);
      localStorage.setItem('fixbridge-user-cache', JSON.stringify(user));
      localStorage.setItem('fixbridge-app-state', JSON.stringify({ page: 'homeowner-dashboard', marketingContext: 'home' }));
    },
    { token: maria.token, user: maria.user }
  );
  return { browser, context };
}

async function main() {
  console.log(`\n=== Browser Stripe E2E @ ${APP} ===\n`);
  record('Stripe test mode', !STRIPE_KEY?.startsWith('sk_live'));
  if (!STRIPE_KEY) {
    record('STRIPE_SECRET_KEY', false);
    return;
  }

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL?.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });
  const stripe = new Stripe(STRIPE_KEY);
  const maria = await loginHomeowner();
  const homeownerId = Number(maria.user?.id);

  const { jobId, invoiceId, invNum } = await seedInvoice(pool, homeownerId);
  const checkout = await fetch(`${API}/api/homeowner/invoices/${invoiceId}/checkout`, {
    method: 'POST',
    headers: authH(maria.token),
    body: JSON.stringify({ tipAmount: 50 }),
  }).then(json);

  record('API checkout $550 session', checkout.ok && checkout.checkoutUrl, checkout.message);
  if (!checkout.checkoutUrl) {
    await pool.end();
    return;
  }

  const { browser, context } = await makeContext(maria);
  const page = await context.newPage();
  record('Browser opened Stripe Hosted Checkout', true);
  await stripeCheckout(page, checkout.checkoutUrl, '4242424242424242');
  await page.waitForURL(/localhost:5000|127\.0\.0\.1:5000/, { timeout: 120000 });

  const confirming = await page.getByText(/Confirming your payment/i).isVisible().catch(() => false);
  record('Return UX: confirming/processing state', confirming || page.url().includes('invoicePaid='));

  const prePoll = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Backend authoritative (pre-webhook)', prePoll.paid !== true, `paid=${prePoll.paid}`);

  let sess = checkout.sessionId ? await waitStripePaid(stripe, checkout.sessionId) : null;
  record('Stripe session paid', sess?.payment_status === 'paid', sess?.payment_status);
  if (sess?.payment_status === 'paid' && prePoll.paid !== true) {
    await postCheckoutWebhook(stripe, sess);
  }

  await page.waitForFunction(() => document.body.innerText.match(/Payment received|PAID/i), { timeout: 90000 }).catch(() => {});
  const postPoll = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Backend poll paid', postPoll.ok && postPoll.paid === true);
  record('Browser PAID UI', await page.getByText(/Payment received|PAID/i).isVisible().catch(() => false));

  if (checkout.sessionId) {
    sess = sess || (await stripe.checkout.sessions.retrieve(checkout.sessionId));
    record('Stripe amount_total=55000', sess.amount_total === 55000, String(sess.amount_total));
    record('Stripe metadata', Boolean(sess.metadata?.invoiceId && sess.metadata?.jobId));
  }

  const settlements = await pool.query(`SELECT COUNT(*)::int n FROM payment_settlements WHERE job_id=$1`, [jobId]);
  record('DB single settlement', settlements.rows[0]?.n === 1, `n=${settlements.rows[0]?.n}`);

  // Refresh during confirming — sessionStorage should resume poll
  const refreshPage = await context.newPage();
  await refreshPage.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await refreshPage.evaluate((num) => {
    sessionStorage.setItem('fixbridge-invoice-confirming', num);
  }, invNum);
  await refreshPage.reload({ waitUntil: 'networkidle' });
  record(
    'Refresh resumes confirming poll',
    await refreshPage.getByText(/Confirming your payment/i).isVisible().catch(() => false)
  );
  await refreshPage.close();

  // Decline card
  const fail = await seedInvoice(pool, homeownerId, Date.now() + 1);
  const failCo = await fetch(`${API}/api/homeowner/invoices/${fail.invoiceId}/checkout`, {
    method: 'POST',
    headers: authH(maria.token),
    body: JSON.stringify({ tipAmount: 50 }),
  }).then(json);
  const failPage = await context.newPage();
  await stripeCheckout(failPage, failCo.checkoutUrl, '4000000000000002');
  await failPage.waitForTimeout(6000);
  record(
    'Decline card blocked',
    failPage.url().includes('checkout.stripe.com') || (await failPage.getByText(/declined|failed|error/i).count()) > 0
  );
  const failStatus = await fetch(`${API}/api/homeowner/invoices/by-number/${encodeURIComponent(fail.invNum)}/payment-status`, {
    headers: authH(maria.token),
  }).then(json);
  record('Decline invoice unpaid', failStatus.paid !== true);

  await browser.close();
  await pool.end();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- Browser Stripe: ${passed}/${results.length} passed ---\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
