/**
 * Clear Admin Panel operational data so you can re-test from a clean slate.
 * Keeps: admin@fixbridge.local, pricing_rules, payout_settings, subscription_plans, parts_catalog.
 * Removes: jobs/quotes/payments/payouts/ledger, extra staff, partners, coupons, tickets, etc.
 *
 * Usage: node --env-file=.env scripts/clear-admin-ops-data.mjs
 */
import pg from 'pg';
import { postgresSslOptions } from '../api/db-ssl.js';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('NEON_DATABASE_URL is required.');
  process.exit(1);
}

const connectionString = url.includes('uselibpqcompat=')
  ? url
  : `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`;

const pool = new pg.Pool({
  connectionString,
  ssl: postgresSslOptions(),
  max: 3,
});

const KEEP_ADMIN_EMAIL = process.env.PRIMARY_ADMIN_EMAIL?.trim() || 'ksdt2702@gmail.com';

/** Tables to empty when present (order does not matter with CASCADE). */
const TRUNCATE_CANDIDATES = [
  'quote_activity',
  'homeowner_invoices',
  'job_financial_snapshots',
  'job_tips',
  'contractor_payouts',
  'payout_audit_logs',
  'completion_reports',
  'job_status_history',
  'job_invitations',
  'change_orders',
  'bids',
  'proposals',
  'payments',
  'transfers',
  'refunds',
  'disputes',
  'payment_schedules',
  'lead_purchases',
  'partner_referral_events',
  'partner_referrals',
  'partner_users',
  'partners',
  'discount_codes',
  'managed_jobs',
  'properties',
  'property_documents',
  'property_units',
  'diy_projects',
  'media_objects',
  'notifications',
  'messages',
  'conversations',
  'job_chat_messages',
  'job_lifecycle',
  'jobs',
  'audit_logs',
  'error_logs',
  'mfa_challenges',
  'contractor_crm_notes',
  'contractor_accounts',
  'consent_records',
  'webhook_events',
  'market_snapshots',
  'site_reviews',
  'support_tickets',
  'ticket_deliveries',
  'ticket_messages',
  'subscriptions',
];

async function tableExists(client, name) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${name}`]);
  return Boolean(rows[0]?.reg);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = [];
    for (const t of TRUNCATE_CANDIDATES) {
      if (await tableExists(client, t)) existing.push(t);
    }

    if (existing.length) {
      await client.query(`TRUNCATE TABLE ${existing.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
      console.log(`[clear] Truncated ${existing.length} tables.`);
    } else {
      console.log('[clear] No operational tables found to truncate.');
    }

    // Remove non-system staff from Team & Roles
    const staff = await client.query(
      `DELETE FROM users
       WHERE role = 'admin'
         AND LOWER(email) <> LOWER($1)
       RETURNING id, email, name`,
      [KEEP_ADMIN_EMAIL]
    );
    console.log(`[clear] Removed ${staff.rowCount} staff admin account(s).`);
    for (const r of staff.rows) {
      console.log(`  - #${r.id} ${r.name} <${r.email}>`);
    }

    // Remove homeowner / contractor accounts so Admin lists are empty (demo can re-seed on API restart)
    const others = await client.query(
      `DELETE FROM users
       WHERE role IN ('homeowner', 'contractor')
       RETURNING id, role, email`
    );
    console.log(`[clear] Removed ${others.rowCount} homeowner/contractor account(s).`);

    // Ensure system admin remains
    const { rows: admins } = await client.query(
      `SELECT id, email FROM users WHERE role='admin' ORDER BY id`
    );
    if (!admins.length) {
      throw new Error(`No admin left after clear — aborting. Expected ${KEEP_ADMIN_EMAIL}.`);
    }
    console.log('[clear] Remaining admins:', admins.map((a) => `${a.email} (#${a.id})`).join(', '));

    await client.query('COMMIT');
    console.log('[clear] Done. Admin Panel operational data is empty. Restart API if demo users should re-seed.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[clear] Failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
