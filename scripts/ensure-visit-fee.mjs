import pg from 'pg';
import { mergePricingRules } from '../api/pricing.js';
import { postgresSslOptions } from '../api/db-ssl.js';

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
  ssl: postgresSslOptions(),
});

const { rows } = await pool.query(`SELECT rules FROM pricing_rules WHERE id='default'`);
const merged = mergePricingRules(rows[0]?.rules || {});
if (merged.default_visit_fee == null) merged.default_visit_fee = 125;
if (merged.default_emergency_visit_fee == null) {
  merged.default_emergency_visit_fee = merged.default_visit_fee;
}
await pool.query(
  `INSERT INTO pricing_rules (id, rules, updated_at)
   VALUES ('default', $1::jsonb, NOW())
   ON CONFLICT (id) DO UPDATE SET rules=$1::jsonb, updated_at=NOW()`,
  [JSON.stringify(merged)]
);
console.log('VISIT_FEE', merged.default_visit_fee, 'EMERGENCY', merged.default_emergency_visit_fee);
await pool.end();
