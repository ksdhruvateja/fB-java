/**
 * Stripe + Connect diagnosis — reports PRESENT/MISSING only; never prints secrets.
 */
import Stripe from 'stripe';
import pg from 'pg';

function envStatus(key) {
  const v = process.env[key];
  if (!v || !String(v).trim()) return 'MISSING';
  return 'PRESENT';
}

function keyKind(key) {
  const v = String(process.env[key] || '').trim();
  if (!v) return 'missing';
  if (v.startsWith('sk_test')) return 'sk_test';
  if (v.startsWith('sk_live')) return 'sk_live';
  if (v.startsWith('pk_test')) return 'pk_test';
  if (v.startsWith('pk_live')) return 'pk_live';
  if (v.startsWith('whsec_')) return 'whsec';
  return 'other';
}

async function main() {
  console.log('=== ENV CONFIGURATION (values not shown) ===\n');
  const envKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_CONNECT_SECRET_KEY',
    'STRIPE_CONNECT_CLIENT_ID',
    'APP_URL',
    'ALLOW_SIMULATED_PAYOUTS',
    'ALLOW_PAYMENT_SIMULATION',
    'NODE_ENV',
  ];
  for (const k of envKeys) {
    const status = envStatus(k);
    const extra =
      k === 'STRIPE_SECRET_KEY' && status === 'PRESENT'
        ? ` (${keyKind(k)})`
        : k === 'STRIPE_WEBHOOK_SECRET' && status === 'PRESENT'
          ? ` (${keyKind(k)})`
          : k === 'VITE_STRIPE_PUBLISHABLE_KEY' && status === 'PRESENT'
            ? ` (${keyKind(k)})`
            : k === 'STRIPE_CONNECT_SECRET_KEY'
              ? ' (NOT REQUIRED if STRIPE_SECRET_KEY used)'
              : k === 'STRIPE_CONNECT_CLIENT_ID'
                ? ' (NOT REQUIRED for Express accounts)'
                : '';
    console.log(`${k}: ${status}${extra}`);
  }
  console.log('SEPARATE_CONNECT_API_KEY: NOT REQUIRED (code uses STRIPE_SECRET_KEY)\n');

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    console.log('DIAGNOSIS: BLOCKED_MISSING_STRIPE_CREDENTIALS');
    return;
  }

  const stripe = new Stripe(secret);
  console.log('=== STRIPE API AUTHENTICATION ===\n');

  let account;
  try {
    account = await stripe.accounts.retrieve();
    console.log('accounts.retrieve() (platform): PASS');
    console.log(`platform_account_id: ${account.id}`);
    console.log(`charges_enabled: ${account.charges_enabled}`);
    console.log(`payouts_enabled: ${account.payouts_enabled}`);
    console.log(`country: ${account.country || 'unknown'}`);
  } catch (e) {
    console.log('accounts.retrieve() (platform): FAIL');
    console.log(`error_type: ${e.type || 'unknown'}`);
    console.log(`error_code: ${e.code || 'none'}`);
    console.log(`error_message: ${(e.message || '').slice(0, 200)}`);
    console.log('DIAGNOSIS: BLOCKED_MISSING_STRIPE_CREDENTIALS or invalid key');
    return;
  }

  console.log('\n=== STRIPE CONNECT CAPABILITY PROBE ===\n');

  let connectCase = 'UNKNOWN';
  let testAccountId = null;

  try {
    const testAcct = await stripe.accounts.create({
      type: 'express',
      email: `connect-probe-${Date.now()}@fixbridge-diagnosis.invalid`,
      capabilities: { transfers: { requested: true } },
      metadata: { fixbridge_probe: 'true', created_by: 'stripe-connect-diagnosis' },
    });
    testAccountId = testAcct.id;
    console.log('accounts.create(express): PASS');
    console.log(`probe_account_id: ${testAccountId}`);
    connectCase = 'CONNECT_AVAILABLE';

    const retrieved = await stripe.accounts.retrieve(testAccountId);
    console.log('accounts.retrieve(connected): PASS');
    console.log(`details_submitted: ${retrieved.details_submitted}`);
    console.log(`payouts_enabled: ${retrieved.payouts_enabled}`);
    console.log(`charges_enabled: ${retrieved.charges_enabled}`);
    console.log(`transfers_capability: ${retrieved.capabilities?.transfers || 'unknown'}`);

    const base = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');
    const link = await stripe.accountLinks.create({
      account: testAccountId,
      refresh_url: `${base}/?stripe=refresh`,
      return_url: `${base}/?stripe=return`,
      type: 'account_onboarding',
    });
    console.log('accountLinks.create(onboarding): PASS');
    console.log(`account_link_url_present: ${Boolean(link.url)}`);

    // Transfer probe — will likely fail without platform balance; that's informative
    try {
      await stripe.transfers.create({
        amount: 100,
        currency: 'usd',
        destination: testAccountId,
        description: 'FixBridge connect diagnosis probe (expected to fail without balance)',
        metadata: { probe: 'true' },
      });
      console.log('transfers.create: PASS (unexpected — had balance)');
    } catch (te) {
      const msg = te.message || '';
      const benign =
        te.code === 'balance_insufficient' ||
        msg.includes('insufficient') ||
        msg.includes('balance');
      console.log(`transfers.create: ${benign ? 'AUTH_OK_BALANCE_BLOCKED' : 'FAIL'}`);
      console.log(`transfer_error_code: ${te.code || 'none'}`);
      console.log(`transfer_error_message: ${msg.slice(0, 200)}`);
    }
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    console.log('accounts.create(express): FAIL');
    console.log(`error_type: ${e.type || 'unknown'}`);
    console.log(`error_code: ${e.code || 'none'}`);
    console.log(`error_message: ${(e.message || '').slice(0, 240)}`);

    if (
      msg.includes('signed up for connect') ||
      msg.includes('connect') && msg.includes('not enabled') ||
      e.code === 'account_invalid' ||
      msg.includes('platform')
    ) {
      connectCase = 'CONNECT_NOT_ENABLED_ON_PLATFORM';
      console.log('\nCASE: B — STRIPE CONNECT NOT ENABLED ON PLATFORM ACCOUNT');
      console.log('External action: Stripe Dashboard → Settings → Connect → complete platform profile / enable Connect');
    } else if (e.type === 'StripeAuthenticationError') {
      connectCase = 'INVALID_API_KEY';
    } else {
      connectCase = 'CONNECT_CONFIG_INCOMPLETE_OR_CODE';
    }
  }

  console.log('\n=== DATABASE CONTRACTOR STRIPE STATE ===\n');
  const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (dbUrl) {
    const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    const { rows } = await pool.query(
      `SELECT id, email, stripe_account_id, stripe_onboarding_status, stripe_payouts_enabled
       FROM users WHERE email='james@yourcompany.com' LIMIT 1`
    );
    if (rows[0]) {
      const u = rows[0];
      console.log(`contractor_id: ${u.id}`);
      console.log(`stripe_account_id: ${u.stripe_account_id || 'null'}`);
      console.log(`stripe_onboarding_status: ${u.stripe_onboarding_status || 'null'}`);
      console.log(`stripe_payouts_enabled: ${u.stripe_payouts_enabled}`);
      if (u.stripe_account_id && connectCase === 'CONNECT_AVAILABLE') {
        try {
          const live = await stripe.accounts.retrieve(u.stripe_account_id);
          console.log(`live_stripe_payouts_enabled: ${live.payouts_enabled}`);
          console.log(`live_details_submitted: ${live.details_submitted}`);
          console.log(`live_requirements_due: ${(live.requirements?.currently_due || []).length}`);
        } catch (re) {
          console.log(`live_account_retrieve: FAIL — ${re.code || re.message}`);
        }
      }
    } else {
      console.log('demo contractor james@yourcompany.com: not found');
    }
    await pool.end();
  } else {
    console.log('DATABASE_URL: MISSING — skipped DB check');
  }

  console.log('\n=== SUMMARY CASE ===');
  console.log(`connect_case: ${connectCase}`);
  if (testAccountId) {
    console.log(`note: probe connected account ${testAccountId} left in Stripe test mode (delete in Dashboard if desired)`);
  }
}

main().catch((e) => {
  console.error('DIAGNOSIS_CRASH', e.message);
  process.exit(1);
});
