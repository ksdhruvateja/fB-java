/**
 * P0 remediation smoke checks.
 * Run: node scripts/smoke-p0-remediation.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('FAIL', name, '-', e.message);
  }
}
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

const app = read('api/app.js');
const rbac = read('api/rbac.js');
const managed = read('api/managed-routes.js');
const settlement = read('api/payment-settlement.js');
const payoutDb = read('api/payout-db.js');
const quotes = read('api/quote-workspace-routes.js');
const platform = read('api/platform-routes.js');
const password = read('api/password-reset.js');
const schema = read('api/schema-managed.js');
const appTsx = read('src/app/App.tsx');
const dash = read('src/app/HomeownerDashboard.tsx');
const adminLogin = read('src/app/AdminLogin.tsx');

check('P0-1 Dual payout eliminated (legacy → ledger)', () => {
  must(managed.includes("'/api/admin/managed/jobs/:id/payout'"), 'legacy payout route missing');
  must(managed.includes('approveAndReleasePayout'), 'ledger release missing');
  const idx = managed.indexOf("'/api/admin/managed/jobs/:id/payout'");
  must(managed.slice(idx, idx + 2500).includes('approveAndReleasePayout'), 'legacy must call ledger release');
  must(payoutDb.includes('fixbridge-payout-'), 'Stripe transfer idempotency key missing');
});

check('P0-2 Refund/dispute holds payouts', () => {
  must(settlement.includes('holdPayoutsForJob'), 'hold helper missing');
  must(settlement.includes('applyPaymentRiskToPayouts'), 'risk helper missing');
  must(managed.includes('applyPaymentRiskToPayouts'), 'webhook risk wiring missing');
});

check('P0-3 Webhook claim lifecycle', () => {
  must(settlement.includes('claimWebhookEvent'), 'claim helper missing');
  must(settlement.includes('markWebhookProcessed'), 'processed helper missing');
  must(settlement.includes('markWebhookFailed'), 'failed helper missing');
  must(managed.includes('claimWebhookEvent'), 'webhook not using claim');
});

check('P0-4 Accepted quotes locked (409)', () => {
  must(quotes.includes('quote_locked'), 'lock code missing');
  must((quotes.match(/status\(409\)/g) || []).length >= 1, '409 responses missing');
});

check('P0-5 Acceptance snapshot', () => {
  must(schema.includes('quote_acceptance_snapshots'), 'snapshot table missing');
  must(managed.includes('quote_acceptance_snapshots'), 'approve path missing snapshot insert');
  must(managed.includes("status='accepted'"), 'accepted status missing');
});

check('P0-6 Convert requires acceptance (or force)', () => {
  must(quotes.includes('acceptance_required'), 'acceptance gate missing');
  must(quotes.includes('forceConvert'), 'force convert missing');
});

check('P0-7 Quote version foundation', () => {
  must(schema.includes('version_number'), 'version_number column missing');
  must(
    quotes.includes('changeReason') || quotes.includes('change_reason') || quotes.includes('revision_required'),
    'revision reason missing'
  );
});

check('P0-8 MFA pending vs complete tokens', () => {
  must(app.includes('mfa_pending'), 'mfa_pending stage missing');
  must(app.includes('mfa_required'), 'requireAdmin MFA block missing');
  must(platform.includes("authStage: 'complete'"), 'MFA verify complete token missing');
  must(adminLogin.includes('saveSession') || adminLogin.includes('saveSession'), 'AdminLogin must persist post-MFA token');
});

check('P0-9 Legacy RBAC defaults to operations_admin', () => {
  must(rbac.includes("return 'operations_admin'") || rbac.includes('return "operations_admin"'), 'operations_admin default missing');
  must(schema.includes('operations_admin'), 'migration default missing');
});

check('P0-10 is_admin boolean cannot grant admin', () => {
  must(/isAdmin: rows\[0\]\.role === 'admin'/.test(app), 'requireAuth isAdmin not role-only');
  must(/isAdmin: r\.role === 'admin'/.test(app), 'rowToUser isAdmin not role-only');
  must(!/isAdmin: rows\[0\]\.role === 'admin' \|\| rows\[0\]\.is_admin === true/.test(app), 'legacy is_admin OR still present');
});

check('P0-11 Admin mutations require write', () => {
  must(platform.includes('requireAdmin, requireAdminWrite, async'), 'platform write gates missing');
  must(managed.includes('requireAdminWrite'), 'managed write gates missing');
});

check('P0-12 Admin user docs not in list', () => {
  must(app.includes('includeDocumentData: false'), 'list still includes document data');
  must(app.includes('/documents'), 'dedicated documents endpoint missing');
});

check('P0-13 Reset token hash-only compare', () => {
  must(!/token=\$2 OR token=\$3/.test(password), 'raw-or-hash compare still present');
  must(/token=\$2/.test(password), 'hash compare missing');
});

check('P0-15 Production secrets fatal', () => {
  must(/STRIPE_SECRET_KEY[\s\S]{0,120}required in production/i.test(app), 'STRIPE_SECRET_KEY not fatal');
  must(/STRIPE_WEBHOOK_SECRET[\s\S]{0,120}required in production/i.test(app), 'STRIPE_WEBHOOK_SECRET not fatal');
  must(/SESSION_SECRET/.test(app) && /FATAL/.test(app), 'SESSION_SECRET not enforced');
});

check('P0-16 Demo seed explicit opt-in', () => {
  must(/ENABLE_DEMO_(USERS|SEED)[\s\S]{0,120}'false'/.test(app), 'demo seed default not false in app');
  must(/ENABLE_DEMO_(USERS|SEED)[\s\S]{0,120}'false'/.test(schema), 'demo seed default not false in schema');
});

check('P0-17 Payment success requires backend confirm', () => {
  must(appTsx.includes('fixbridge-dispatch-confirming'), 'confirming flag missing');
  must(!appTsx.includes('fixbridge-dispatch-paid'), 'false paid flag still set from URL');
  must(dash.includes('getManagedJob'), 'dashboard must poll job');
  must(/Confirming payment/i.test(dash), 'confirming UX missing');
});

check('P0-18 Shared settlement path', () => {
  must(settlement.includes('settleSuccessfulJobPayment'), 'settlement helper missing');
  must(managed.includes('settleSuccessfulJobPayment'), 'webhook settlement wiring missing');
});

check('P0-19 Tips wired (service + tip separate)', () => {
  must(fs.existsSync(path.join(root, 'api/tips.js')), 'tips module missing');
  must(fs.existsSync(path.join(root, 'api/financial-calculations.js')), 'financial-calculations missing');
  must(settlement.includes('processSuccessfulPayment'), 'central settlement missing');
  must(settlement.includes('payment_settlements'), 'settlement ledger missing');
  must(settlement.includes("status='paid'") || settlement.includes('job_tips'), 'tip handling missing');
  must(payoutDb.includes('validatePayoutEligibility'), 'payout eligibility missing');
  must(payoutDb.includes('tip_amount_cents'), 'payout tip column wiring missing');
  must(quotes.includes('tipAmountCents'), 'invoice checkout tip metadata missing');
});

check('P0-20 Auth helpers + no partner123 default', () => {
  must(fs.existsSync(path.join(root, 'api/auth-helpers.js')), 'auth-helpers missing');
  must(!platform.includes("'partner123'"), 'partner123 default still present');
  must(!platform.includes('tempPassword'), 'tempPassword leak still present');
  must(managed.includes("req.authUser.role !== 'admin'"), 'managed routes must use role for bypass');
});

check('P0-21 Demo hints gated in frontend', () => {
  const authTs = read('src/app/auth.ts');
  must(authTs.includes('VITE_ENABLE_DEMO_HINTS') || authTs.includes('import.meta.env.DEV'), 'demo hints not gated');
});

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(
  path.join(root, 'scripts/_p0-smoke-results.json'),
  JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2)
);
console.log('\nSummary:', results.length - failed.length, 'passed,', failed.length, 'failed');
process.exit(failed.length ? 1 : 0);
