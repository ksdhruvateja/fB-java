/**
 * Creates (or resets the password of) a FixBridge Commercial admin. Commercial admins are separate
 * from marketplace admins and can only sign in at /commercial/admin.
 *
 *   NEON_DATABASE_URL=... COMMERCIAL_ADMIN_PASSWORD=... node scripts/create-commercial-admin.mjs admin@example.com "Full Name"
 *
 * The password comes from the environment so it never lands in shell history.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { ensureCommercialSchema } from '../api/commercial/schema.js';
import { postgresSslOptions } from '../api/db-ssl.js';

const [email, name = 'Commercial admin'] = process.argv.slice(2);
const password = process.env.COMMERCIAL_ADMIN_PASSWORD || '';
if (!process.env.NEON_DATABASE_URL) throw new Error('Set NEON_DATABASE_URL.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) throw new Error('Usage: node scripts/create-commercial-admin.mjs <email> [name]');
if (password.length < 12) throw new Error('Set COMMERCIAL_ADMIN_PASSWORD (at least 12 characters).');

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: postgresSslOptions() });
try {
  await ensureCommercialSchema(pool);
  const { rows } = await pool.query(
    `INSERT INTO commercial_admins (email, name, password_hash) VALUES ($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, name=EXCLUDED.name, active=TRUE
     RETURNING id, (xmax = 0) AS created`,
    [email.toLowerCase(), name, await bcrypt.hash(password, 12)]
  );
  console.log(`${rows[0].created ? 'Created' : 'Updated'} commercial admin ${email.toLowerCase()} (id ${rows[0].id}).`);
} finally {
  await pool.end();
}
