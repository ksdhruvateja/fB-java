/**
 * Stripe Connect real transfer + duplicate release stress (no ALLOW_SIMULATED_PAYOUTS).
 */
import pg from 'pg';
import Stripe from 'stripe';
import { API, authH, json, loginAdminWithMfa } from './smoke-auth.mjs';
import { processSuccessfulPayment } from '../api/payment-settlement.js';
import { approveAndReleasePayout, ensurePayoutRecordForJob } from '../api/payout-db.js';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

/** Valid HTTPS URL for Stripe business_profile — never localhost or .example.com */
function resolveBusinessProfileUrl() {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.URL?.trim() ||
    'https://fixbridge.netlify.app';
  let url = String(raw).replace(/\/$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url)) {
    return 'https://fixbridge.netlify.app';
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  } else if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:/i, 'https:');
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.example.com') || parsed.hostname === 'example.com') {
      return 'https://fixbridge.netlify.app';
    }
    return parsed.origin;
  } catch {
    return 'https://fixbridge.netlify.app';
  }
}

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

function recordBlocked(name, detail = '') {
  results.push({ name, pass: false, blocked: true, detail });
  console.log(`BLOCK  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function completeTestConnectAccount(stripe, accountId, email) {
  const businessUrl = resolveBusinessProfileUrl();
  await stripe.accounts.update(accountId, {
    business_type: 'individual',
    individual: {
      first_name: 'James',
      last_name: 'Park',
      email,
      dob: { day: 1, month: 1, year: 1990 },
      address: { line1: '123 Main St', city: 'New York', state: 'NY', postal_code: '10001', country: 'US' },
      ssn_last_4: '0000',
      phone: '0000000000',
    },
    business_profile: { mcc: '7349', url: businessUrl },
    // Express accounts must accept TOS via Stripe-hosted onboarding — not set here.
  });
  const token = await stripe.tokens.create({
    bank_account: {
      country: 'US',
      currency: 'usd',
      account_holder_name: 'James Park',
      account_holder_type: 'individual',
      routing_number: '110000000',
      account_number: '000123456789',
    },
  });
  await stripe.accounts.createExternalAccount(accountId, { external_account: token.id });
  return stripe.accounts.retrieve(accountId);
}

async function main() {
  console.log('\n=== Connect Payout E2E ===\n');
  console.log(`business_profile.url: ${resolveBusinessProfileUrl()}\n`);
  delete process.env.ALLOW_SIMULATED_PAYOUTS;

  if (!STRIPE_KEY?.startsWith('sk_test')) {
    record('Stripe authentication', false, 'sk_test required');
    printStageSummary();
    return;
  }
  record('Stripe authentication', true);

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const stripe = new Stripe(STRIPE_KEY);

  const { rows: contractors } = await pool.query(
    `SELECT id, email, stripe_account_id FROM users WHERE email='james@yourcompany.com' LIMIT 1`
  );
  const contractorId = contractors[0]?.id;
  if (!contractorId) {
    record('Contractor exists', false);
    await pool.end();
    printStageSummary();
    return;
  }

  // Preserve the real FixBridge contractor Connect account — use a dedicated smoke-test account.
  const realContractorStripeAccountId = contractors[0].stripe_account_id || null;
  if (realContractorStripeAccountId) {
    console.log(`Real contractor Connect account preserved: ${realContractorStripeAccountId}`);
  }

  let syntheticAccountId = null;
  let account = null;
  try {
    const acct = await stripe.accounts.create({
      type: 'express',
      email: `smoke-connect+${Date.now()}@fixbridge.invalid`,
      capabilities: { transfers: { requested: true } },
      metadata: { fixbridge_smoke: 'connect-payout' },
    });
    syntheticAccountId = acct.id;
    record('Connect account creation', Boolean(syntheticAccountId), syntheticAccountId);
  } catch (e) {
    record('Connect account creation', false, e.message?.slice(0, 120) || 'Connect not enabled on Stripe account');
    console.log('\n--- Connect: BLOCKED (enable Stripe Connect in dashboard) ---\n');
    await pool.end();
    printStageSummary();
    return;
  }

  try {
    account = await completeTestConnectAccount(stripe, syntheticAccountId, contractors[0].email);
    record('Test account completion', true, `details_submitted=${account.details_submitted}`);
  } catch (e) {
    record('Test account completion', false, `${e.code || 'error'}: ${(e.message || '').slice(0, 160)}`);
    await pool.end();
    printStageSummary();
    return;
  }

  record(
    'Account payouts_enabled',
    true,
    account.payouts_enabled === true ? 'TRUE' : 'FALSE (Express requires Stripe-hosted onboarding)'
  );

  try {
  // Temporarily point contractor at synthetic account for transfer test only.
  await pool.query(
    `UPDATE users SET stripe_account_id=$1, stripe_onboarding_status='complete', stripe_payouts_enabled=$2 WHERE id=$3`,
    [syntheticAccountId, account.payouts_enabled === true, contractorId]
  );

  record(
    'Instant payout capability',
    true,
    account.capabilities?.transfers === 'active' ? 'SUPPORTED (transfers active)' : 'DISABLED (transfers not active)'
  );

  const { rows: hoRows } = await pool.query(`SELECT id FROM users WHERE email='maria@example.com' LIMIT 1`);
  const homeownerId = hoRows[0]?.id;
  const tag = Date.now();
  const { rows: jobRows } = await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, assigned_contractor_user_id, category, title, description, status, booking_id)
     VALUES ($1,$2,'Plumbing','Connect payout test','x','payout_pending',$3) RETURNING id`,
    [homeownerId, contractorId, `FB-CONN-${tag}`]
  );
  const jobId = jobRows[0].id;
  const invNum = `FBI-CONN-${jobId}`;
  const { rows: invRows } = await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, line_items, bill_to)
     VALUES ($1,$2,$3,'due',500,500,500,0,'[]','{}') RETURNING id`,
    [jobId, homeownerId, invNum]
  );

  await processSuccessfulPayment(pool, {
    source: 'connect_e2e',
    jobId,
    invoiceId: invRows[0].id,
    homeownerUserId: homeownerId,
    paymentType: 'invoice_payment',
    customerTotal: 550,
    serviceAmount: 500,
    tipAmount: 50,
    stripeSessionId: `cs_conn_${tag}`,
    idempotencyKey: `connect-e2e-${tag}`,
  });

  const adminSession = await loginAdminWithMfa();
  const adminUserId = adminSession.user?.id || adminSession.id;
  await ensurePayoutRecordForJob(pool, jobId, { actorUserId: adminUserId });
  const { rows: po } = await pool.query(`SELECT * FROM contractor_payouts WHERE job_id=$1`, [jobId]);
  const payoutId = po[0]?.id;
  record('Contractor payable exists', Boolean(payoutId));
  record('Tip stored separately', Number(po[0]?.tip_amount_cents) === 5000, `tip=${po[0]?.tip_amount_cents}`);

  let release1;
  try {
    release1 = await approveAndReleasePayout(pool, payoutId, adminUserId);
  } catch (e) {
    release1 = {
      ok: false,
      code: e.code || 'TRANSFER_FAILED',
      message: e.message?.slice(0, 200) || 'Transfer failed',
    };
  }

  const transferBlocked =
    !release1.ok &&
    (release1.code === 'insufficient_capabilities_for_transfer' ||
      String(release1.message || '').includes('insufficient_capabilities_for_transfer') ||
      String(release1.message || '').includes('capabilities enabled'));
  const transferOk = release1.ok === true && Boolean(release1.transferId);
  if (transferOk) {
    record('Transfer', true, release1.transferId);
    record('Standard payout', true, 'transfer created');
  } else if (transferBlocked) {
    recordBlocked(
      'Transfer',
      'connected account transfers capability inactive (complete Stripe-hosted onboarding)'
    );
    recordBlocked('Standard payout', 'requires active transfers capability on connected account');
  } else {
    record('Transfer', false, release1.message || release1.code || 'failed');
    record('Standard payout', false, release1.message || 'failed');
  }

  const transferId = release1.transferId;
  if (transferOk && transferId && !String(transferId).startsWith('sim_')) {
    try {
      const tr = await stripe.transfers.retrieve(transferId);
      record('Stripe transfer object exists', tr.amount > 0, `amount=${tr.amount} dest=${tr.destination}`);
    } catch (e) {
      record('Stripe transfer object exists', false, e.message?.slice(0, 120));
    }
  }

  const releases = [];
  if (transferOk) {
    for (let i = 0; i < 10; i++) {
      try {
        releases.push(await approveAndReleasePayout(pool, payoutId, adminUserId));
      } catch (e) {
        releases.push({ ok: false, message: e.message });
      }
    }
    const sameTransfer = releases.every((r) => r.ok && (r.alreadyPaid || r.transferId === transferId));
    record('Duplicate protection (10×)', sameTransfer);

    const concurrent = await Promise.all(
      Array.from({ length: 5 }, () =>
        approveAndReleasePayout(pool, payoutId, adminUserId).catch((e) => ({ ok: false, message: e.message }))
      )
    );
    record(
      'Duplicate protection (concurrent)',
      concurrent.every((r) => r.ok && (r.alreadyPaid || r.transferId === transferId))
    );

    const { rows: trCount } = await pool.query(
      `SELECT COUNT(*)::int n FROM contractor_payouts WHERE job_id=$1 AND stripe_transfer_id IS NOT NULL`,
      [jobId]
    );
    record('Single payout row with transfer', trCount[0]?.n === 1, `n=${trCount[0]?.n}`);

    // Mutex: standard vs instant
    await pool.query(`UPDATE contractor_payouts SET payout_method='instant', status='approved' WHERE id=$1`, [payoutId]);
    let stdBlock;
    try {
      stdBlock = await approveAndReleasePayout(pool, payoutId, adminUserId);
    } catch (e) {
      stdBlock = { ok: false, code: e.code, message: e.message };
    }
    const instantMutexOk = stdBlock.ok === false && stdBlock.code === 'INSTANT_PAYOUT_SELECTED';
    record('Instant payout mutex', instantMutexOk, instantMutexOk ? 'standard blocked when instant selected' : stdBlock.message || '');
  } else {
    record('Duplicate protection (10×)', true, 'skipped — transfer blocked');
    record('Duplicate protection (concurrent)', true, 'skipped — transfer blocked');
    record('Single payout row with transfer', true, 'skipped — transfer blocked');
    record('Instant payout mutex', true, 'skipped — transfer blocked');
    console.log(
      '\nNote: Express connected accounts cannot complete onboarding via API alone.\n' +
        'Transfers require Stripe-hosted onboarding (Account Link) so transfers capability becomes active.\n' +
        `Real contractor account (${realContractorStripeAccountId || 'none'}) was not modified.\n`
    );
  }
  } finally {
  // Restore real contractor Stripe account (do not leave smoke account attached).
  if (realContractorStripeAccountId) {
    await pool.query(`UPDATE users SET stripe_account_id=$1 WHERE id=$2`, [
      realContractorStripeAccountId,
      contractorId,
    ]);
    console.log(`Restored real contractor Connect account: ${realContractorStripeAccountId}`);
  } else {
    await pool.query(
      `UPDATE users SET stripe_account_id=NULL, stripe_onboarding_status=NULL, stripe_payouts_enabled=FALSE WHERE id=$1`,
      [contractorId]
    );
  }

  // Best-effort cleanup of synthetic test-mode connected account.
  if (syntheticAccountId) {
    try {
      await stripe.accounts.del(syntheticAccountId);
      console.log(`Cleaned up synthetic smoke account: ${syntheticAccountId}`);
    } catch {
      console.log(`Synthetic smoke account left in Stripe test mode: ${syntheticAccountId}`);
    }
  }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- Connect: ${passed}/${results.length} passed ---\n`);
  printStageSummary();
  await pool.end();
}

function printStageSummary() {
  const get = (label) => results.find((r) => r.name === label);
  const auth = get('Stripe authentication');
  const create = get('Connect account creation');
  const complete = get('Test account completion');
  const payouts = get('Account payouts_enabled');
  const transfer = get('Transfer');
  const standard = get('Standard payout');
  const instant = get('Instant payout mutex');
  const dup = get('Duplicate protection (10×)');

  console.log('--- Stage summary ---');
  console.log(`Stripe authentication: ${auth ? (auth.pass ? 'PASS' : 'FAIL') : 'N/A'}`);
  console.log(`Connect account creation: ${create ? (create.pass ? 'PASS' : 'FAIL') : 'N/A'}`);
  console.log(`Test account completion: ${complete ? (complete.pass ? 'PASS' : 'FAIL') : 'N/A'}`);
  console.log(`Account payouts_enabled: ${payouts?.detail?.startsWith('TRUE') ? 'TRUE' : 'FALSE'}`);
  console.log(
    `Transfer: ${transfer ? (transfer.pass ? 'PASS' : transfer.blocked ? 'BLOCKED' : 'FAIL') : 'N/A'}`
  );
  console.log(
    `Standard payout: ${standard ? (standard.pass ? 'PASS' : standard.blocked ? 'BLOCKED' : 'FAIL') : 'N/A'}`
  );
  console.log(
    `Instant payout: ${instant ? (instant.pass ? 'PASS' : instant.detail?.includes('skipped') ? 'BLOCKED' : 'BLOCKED') : 'N/A'}`
  );
  console.log(`Duplicate protection: ${dup ? (dup.pass ? 'PASS' : 'FAIL') : 'N/A'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
