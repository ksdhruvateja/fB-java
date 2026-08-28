/**
 * Post-onboarding Stripe Connect recheck — uses REAL contractor account (no DB flag faking).
 */
import pg from 'pg';
import Stripe from 'stripe';
import { loginAdminWithMfa, loginContractor, authH, API, json } from './smoke-auth.mjs';
import { buildContractorPayoutAccountView } from '../api/payout-db.js';
import { approveAndReleasePayout, ensurePayoutRecordForJob } from '../api/payout-db.js';
import { processSuccessfulPayment } from '../api/payment-settlement.js';
import { listConnectExternalAccounts } from '../api/stripe.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const CONTRACTOR_EMAIL = 'james@yourcompany.com';

const report = {
  stripeAuth: 'FAIL',
  accountId: null,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  readyForTransfers: false,
  outstandingRequirements: [],
  disabledReason: null,
  capabilities: {},
  externalAccountPresent: false,
  externalLast4: null,
  instantEligible: false,
  dbSync: 'FAIL',
  dbBefore: null,
  dbAfter: null,
  standardTransfer: 'BLOCKED',
  standardPayoutState: 'FAIL',
  duplicateProtection: 'FAIL',
  instantPayout: 'BLOCKED_STRIPE_ELIGIBILITY',
  transferId: null,
};

function readyForTransfers(account) {
  return (
    account?.details_submitted === true &&
    account?.payouts_enabled === true &&
    account?.capabilities?.transfers === 'active'
  );
}

async function main() {
  console.log('\n=== FIXBRIDGE POST-ONBOARDING CONNECT RECHECK ===\n');

  if (!STRIPE_KEY?.startsWith('sk_test')) {
    console.log('Stripe authentication: FAIL (sk_test required)');
    printFinal();
    return;
  }

  const stripe = new Stripe(STRIPE_KEY);
  try {
    await stripe.accounts.retrieve();
    report.stripeAuth = 'PASS';
    console.log('Stripe authentication: PASS');
  } catch (e) {
    console.log('Stripe authentication: FAIL', e.message?.slice(0, 120));
    printFinal();
    return;
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const { rows: contractors } = await pool.query(
    `SELECT id, email, stripe_account_id, stripe_onboarding_status, stripe_payouts_enabled
     FROM users WHERE email=$1 LIMIT 1`,
    [CONTRACTOR_EMAIL]
  );
  const contractor = contractors[0];
  if (!contractor) {
    console.log('Contractor not found');
    await pool.end();
    printFinal();
    return;
  }

  const accountId = contractor.stripe_account_id;
  report.accountId = accountId;
  if (!accountId) {
    console.log('Connected account retrieval: FAIL — no stripe_account_id in DB');
    await pool.end();
    printFinal();
    return;
  }

  let account;
  try {
    account = await stripe.accounts.retrieve(accountId);
    console.log('Connected account retrieval: PASS');
  } catch (e) {
    console.log('Connected account retrieval: FAIL', e.message?.slice(0, 120));
    await pool.end();
    printFinal();
    return;
  }

  report.detailsSubmitted = account.details_submitted === true;
  report.chargesEnabled = account.charges_enabled === true;
  report.payoutsEnabled = account.payouts_enabled === true;
  report.readyForTransfers = readyForTransfers(account);
  report.disabledReason = account.requirements?.disabled_reason || null;
  report.outstandingRequirements = [
    ...(account.requirements?.currently_due || []),
    ...(account.requirements?.past_due || []),
  ];
  report.capabilities = {
    transfers: account.capabilities?.transfers || null,
    card_payments: account.capabilities?.card_payments || null,
  };

  const external = await listConnectExternalAccounts(accountId);
  const defaultExt = external.accounts?.find((a) => a.defaultForCurrency) || external.accounts?.[0];
  report.externalAccountPresent = Boolean(defaultExt);
  report.externalLast4 = defaultExt?.last4 || null;
  report.instantEligible = account.capabilities?.transfers === 'active';

  console.log(`\n--- Real Stripe account: ${accountId} ---`);
  console.log(`details_submitted: ${report.detailsSubmitted}`);
  console.log(`charges_enabled: ${report.chargesEnabled}`);
  console.log(`payouts_enabled: ${report.payoutsEnabled}`);
  console.log(`Ready for transfers: ${report.readyForTransfers}`);
  console.log(`capabilities.transfers: ${report.capabilities.transfers}`);
  console.log(`requirements.currently_due: ${JSON.stringify(account.requirements?.currently_due || [])}`);
  console.log(`requirements.past_due: ${JSON.stringify(account.requirements?.past_due || [])}`);
  console.log(`requirements.disabled_reason: ${report.disabledReason || 'none'}`);
  console.log(`external_account: ${report.externalAccountPresent ? `present (last4=${report.externalLast4 || 'n/a'})` : 'missing'}`);
  console.log(`instant_payout_eligible (transfers active): ${report.instantEligible}`);

  report.dbBefore = {
    stripe_account_id: contractor.stripe_account_id,
    stripe_onboarding_status: contractor.stripe_onboarding_status,
    stripe_payouts_enabled: contractor.stripe_payouts_enabled,
  };

  // Sync via existing server logic (authoritative — not manual UPDATE)
  const view = await buildContractorPayoutAccountView(pool, contractor.id);
  const { rows: afterUser } = await pool.query(
    `SELECT stripe_account_id, stripe_onboarding_status, stripe_payouts_enabled FROM users WHERE id=$1`,
    [contractor.id]
  );
  const { rows: mirror } = await pool.query(`SELECT * FROM contractor_accounts WHERE contractor_id=$1`, [
    contractor.id,
  ]);
  report.dbAfter = {
    users: afterUser[0],
    contractor_accounts: mirror[0]
      ? {
          stripe_account_id: mirror[0].stripe_account_id,
          stripe_account_status: mirror[0].stripe_account_status,
          payouts_enabled: mirror[0].payouts_enabled,
          bank_account_status: mirror[0].bank_account_status,
          verification_status: mirror[0].verification_status,
          instant_payouts_eligible: mirror[0].instant_payouts_eligible,
        }
      : null,
    view_readyToReceivePayouts: view?.readyToReceivePayouts,
  };

  const dbOk =
    afterUser[0]?.stripe_account_id === accountId &&
    afterUser[0]?.stripe_payouts_enabled === report.payoutsEnabled &&
    mirror[0]?.stripe_account_id === accountId &&
    mirror[0]?.payouts_enabled === report.payoutsEnabled;
  report.dbSync = dbOk ? 'PASS' : 'FAIL';

  console.log('\n--- DB sync (buildContractorPayoutAccountView) ---');
  console.log(`DB sync: ${report.dbSync}`);
  console.log(`users.stripe_onboarding_status: ${afterUser[0]?.stripe_onboarding_status}`);
  console.log(`users.stripe_payouts_enabled: ${afterUser[0]?.stripe_payouts_enabled}`);
  console.log(`contractor_accounts.payouts_enabled: ${mirror[0]?.payouts_enabled}`);
  console.log(`view.readyToReceivePayouts: ${view?.readyToReceivePayouts}`);

  // API refresh endpoint (contractor cannot set flags directly)
  const contractorSession = await loginContractor();
  const refreshRes = await fetch(`${API}/api/contractor/payout-account/refresh`, {
    method: 'POST',
    headers: authH(contractorSession.token),
    body: '{}',
  }).then(json);
  console.log(`API refresh ok: ${refreshRes.ok}, readyToReceivePayouts: ${refreshRes.account?.readyToReceivePayouts}`);

  if (!report.readyForTransfers) {
    console.log('\n--- Standard transfer test: BLOCKED (account not ready) ---');
    report.standardTransfer = 'BLOCKED';
    report.duplicateProtection = 'FAIL';
    await pool.end();
    printFinal();
    return;
  }

  // Real-account standard transfer test
  console.log('\n--- Standard transfer test (REAL account) ---');
  delete process.env.ALLOW_SIMULATED_PAYOUTS;

  const { rows: hoRows } = await pool.query(`SELECT id FROM users WHERE email='maria@example.com' LIMIT 1`);
  const homeownerId = hoRows[0]?.id;
  const tag = `post-onboard-${Date.now()}`;
  const { rows: jobRows } = await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, assigned_contractor_user_id, category, title, description, status, booking_id)
     VALUES ($1,$2,'Plumbing','Post-onboard payout','x','payout_pending',$3) RETURNING id`,
    [homeownerId, contractor.id, `FB-PO-${tag}`]
  );
  const jobId = jobRows[0].id;
  const invNum = `FBI-PO-${jobId}`;
  const { rows: invRows } = await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, line_items, bill_to)
     VALUES ($1,$2,$3,'due',500,500,500,0,'[]','{}') RETURNING id`,
    [jobId, homeownerId, invNum]
  );

  await processSuccessfulPayment(pool, {
    source: 'post_onboard_recheck',
    jobId,
    invoiceId: invRows[0].id,
    homeownerUserId: homeownerId,
    paymentType: 'invoice_payment',
    customerTotal: 550,
    serviceAmount: 500,
    tipAmount: 50,
    stripeSessionId: `cs_po_${tag}`,
    idempotencyKey: `post-onboard-${tag}`,
  });

  const adminSession = await loginAdminWithMfa();
  const adminUserId = adminSession.user?.id || adminSession.id;
  await ensurePayoutRecordForJob(pool, jobId, { actorUserId: adminUserId });
  const { rows: po } = await pool.query(`SELECT * FROM contractor_payouts WHERE job_id=$1`, [jobId]);
  const payoutId = po[0]?.id;

  let release1;
  try {
    release1 = await approveAndReleasePayout(pool, payoutId, adminUserId);
  } catch (e) {
    release1 = { ok: false, code: e.code, message: e.message };
  }

  if (release1.ok && release1.transferId) {
    report.standardTransfer = 'PASS';
    report.transferId = release1.transferId;
    report.standardPayoutState = 'PASS';
    console.log(`Standard transfer: PASS — ${release1.transferId}`);

    const tr = await stripe.transfers.retrieve(release1.transferId);
    console.log(`Stripe transfer verified: amount=${tr.amount} dest=${tr.destination}`);

    const dupes = [];
    for (let i = 0; i < 5; i++) {
      dupes.push(await approveAndReleasePayout(pool, payoutId, adminUserId));
    }
    const dupOk = dupes.every((r) => r.ok && (r.alreadyPaid || r.transferId === release1.transferId));
    report.duplicateProtection = dupOk ? 'PASS' : 'FAIL';
    console.log(`Duplicate protection: ${report.duplicateProtection}`);

    const { rows: trCount } = await pool.query(
      `SELECT COUNT(*)::int n FROM contractor_payouts WHERE job_id=$1 AND stripe_transfer_id IS NOT NULL`,
      [jobId]
    );
    console.log(`Single transfer row: ${trCount[0]?.n === 1 ? 'PASS' : 'FAIL'} (n=${trCount[0]?.n})`);
  } else {
    const blocked =
      release1.code === 'insufficient_capabilities_for_transfer' ||
      String(release1.message || '').includes('insufficient_capabilities') ||
      String(release1.message || '').includes('balance');
    report.standardTransfer = blocked ? 'BLOCKED' : 'FAIL';
    report.standardPayoutState = blocked ? 'FAIL' : 'FAIL';
    console.log(`Standard transfer: ${report.standardTransfer} — ${release1.message || release1.code || 'unknown'}`);
    report.duplicateProtection = 'FAIL';
  }

  // Instant payout probe (separate job if standard passed)
  if (report.standardTransfer === 'PASS' && report.instantEligible) {
    try {
      const balance = await stripe.balance.retrieve({ stripeAccount: accountId });
      const avail = balance.available?.[0]?.amount || 0;
      console.log(`\nConnected account available balance: ${avail} cents`);
      if (avail >= 50) {
        const payout = await stripe.payouts.create(
          { amount: 50, currency: 'usd', method: 'instant' },
          { stripeAccount: accountId }
        );
        console.log(`Instant payout probe: PASS — ${payout.id}`);
        report.instantPayout = 'PASS';
      } else {
        console.log('Instant payout probe: BLOCKED_STRIPE_ELIGIBILITY — insufficient connected balance for instant probe');
        report.instantPayout = 'BLOCKED_STRIPE_ELIGIBILITY';
      }
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('instant') || msg.includes('eligible') || msg.includes('debit')) {
        report.instantPayout = 'BLOCKED_STRIPE_ELIGIBILITY';
        console.log(`Instant payout: BLOCKED_STRIPE_ELIGIBILITY — ${e.message?.slice(0, 160)}`);
      } else {
        report.instantPayout = 'FAIL';
        console.log(`Instant payout: FAIL — ${e.message?.slice(0, 160)}`);
      }
    }
  } else if (!report.instantEligible) {
    report.instantPayout = 'BLOCKED_STRIPE_ELIGIBILITY';
    console.log('\nInstant payout: BLOCKED_STRIPE_ELIGIBILITY (transfers capability not active)');
  }

  await pool.end();
  printFinal();
}

function printFinal() {
  console.log('\n=== RECHECK SUMMARY (script) ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
