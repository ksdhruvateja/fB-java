import pg from 'pg';
import { initManagedSchema } from '../api/schema-managed.js';
import { initSupportTicketSchema } from '../api/support-tickets.js';
import { initSubscriptionPlansSchema } from '../api/subscription-plans.js';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('NO_URL');
  process.exit(1);
}

const connectionString = url.includes('uselibpqcompat=')
  ? url
  : `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const KEY_TABLES = [
  'users',
  'properties',
  'managed_jobs',
  'subscriptions',
  'subscription_plans',
  'support_tickets',
  'ticket_deliveries',
  'notifications',
  'pricing_rules',
  'payments',
  'bids',
  'proposals',
];

async function main() {
  const client = await pool.connect();
  try {
    const ping = await client.query('SELECT current_database() AS db, now() AS ts');
    console.log('CONNECTED', JSON.stringify(ping.rows[0]));

    console.log('INIT_SCHEMAS...');
    await initManagedSchema(pool);
    await initSupportTicketSchema(pool);
    await initSubscriptionPlansSchema(pool);
    console.log('INIT_SCHEMAS_OK');

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('TABLE_COUNT', tables.rows.length);
    console.log('TABLES', tables.rows.map((r) => r.table_name).join(','));

    for (const t of KEY_TABLES) {
      try {
        const c = await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
        console.log(`COUNT_${t}`, c.rows[0].n);
      } catch (e) {
        console.log(`MISSING_${t}`, e.message.split('\n')[0]);
      }
    }

    const roles = await client.query(
      `SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY role`
    );
    console.log('USERS_BY_ROLE', JSON.stringify(roles.rows));

    const sample = await client.query(
      `SELECT id, email, role, COALESCE(plan_code,'') AS plan_code
       FROM users ORDER BY id ASC LIMIT 10`
    );
    console.log('SAMPLE_USERS', JSON.stringify(sample.rows));

    const plans = await client.query(
      `SELECT id, code, name, amount, active, unlocks_diy, sort_order
       FROM subscription_plans ORDER BY sort_order, id`
    );
    console.log('SUBSCRIPTION_PLANS', JSON.stringify(plans.rows));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
