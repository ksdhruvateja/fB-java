/**
 * Coupon concurrency — max_uses=1 must allow exactly one winner.
 * Usage: node --env-file=.env scripts/smoke-coupon-concurrency.mjs
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
const CODE = `FIXBRIDGE100-${Date.now()}`;

async function main() {
  if (!DATABASE_URL) {
    console.error('NEON_DATABASE_URL required');
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });

  const { claimDiscountRedemption } = await import('../api/discounts.js');

  await pool.query(
    `INSERT INTO discount_codes (code, label, discount_type, value, max_uses, active, uses_count)
     VALUES ($1, 'P1 concurrency test', 'percent', 100, 1, true, 0)`,
    [CODE]
  );
  const { rows } = await pool.query(`SELECT id FROM discount_codes WHERE code=$1`, [CODE]);
  const id = rows[0].id;

  const results = await Promise.all([
    claimDiscountRedemption(pool, id),
    claimDiscountRedemption(pool, id),
  ]);

  const wins = results.filter((r) => r.ok).length;
  const fails = results.filter((r) => !r.ok).length;
  const pass = wins === 1 && fails === 1;

  console.log(pass ? 'PASS' : 'FAIL', `coupon concurrency (${CODE})`, `wins=${wins} fails=${fails}`);
  if (!pass) process.exitCode = 1;

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
