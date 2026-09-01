import pg from 'pg';
import bcrypt from 'bcryptjs';
import { postgresSslOptions } from '../api/db-ssl.js';

const email = process.env.PRIMARY_ADMIN_EMAIL?.trim() || 'admin@fixbridge.com';
const legacyEmails = ['admin@fixbridge.local', 'admin@fixbridge.us', 'ksdt2702@gmail.com'];
const password = process.env.PRIMARY_ADMIN_PASSWORD?.trim() || 'admin123';
const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('NEON_DATABASE_URL is not set');
  process.exit(1);
}

const connectionString = neonUrl.includes('uselibpqcompat=')
  ? neonUrl
  : `${neonUrl}${neonUrl.includes('?') ? '&' : '?'}uselibpqcompat=true`;

const pool = new pg.Pool({
  connectionString,
  ssl: postgresSslOptions(),
});

const hashed = await bcrypt.hash(password, 10);

for (const legacy of legacyEmails) {
  if (legacy.toLowerCase() === email.toLowerCase()) continue;
  const { rows: legacyRows } = await pool.query(
    `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
    [legacy]
  );
  const { rows: targetRows } = await pool.query(
    `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
    [email]
  );
  if (legacyRows[0] && !targetRows[0]) {
    await pool.query(
      `UPDATE users SET email=$1, password=$2, is_admin=true, name='Ops Admin',
         admin_access_level='read-write', admin_role_preset='super_admin'
       WHERE id=$3`,
      [email, hashed, legacyRows[0].id]
    );
    console.log(`Migrated admin ${legacy} → ${email}`);
  } else if (legacyRows[0] && targetRows[0]) {
    await pool.query(`DELETE FROM users WHERE id=$1`, [legacyRows[0].id]);
    console.log(`Removed duplicate legacy admin ${legacy}`);
  }
}

const existing = await pool.query(
  'SELECT id, role, is_admin, admin_role_preset FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
  ['admin', email]
);
console.log('before:', existing.rows);

if (!existing.rows.length) {
  await pool.query(
    `INSERT INTO users (role, name, email, password, is_admin, admin_access_level, admin_role_preset, compliance_status)
     VALUES ('admin', 'Ops Admin', $1, $2, true, 'read-write', 'super_admin', 'draft')`,
    [email, hashed]
  );
  console.log(`Created admin ${email}`);
} else {
  await pool.query(
    `UPDATE users SET password=$1, is_admin=true, name='Ops Admin',
       admin_access_level='read-write', admin_role_preset='super_admin'
     WHERE role='admin' AND LOWER(email)=LOWER($2)`,
    [hashed, email]
  );
  console.log(`Updated admin ${email} (super_admin)`);
}

const after = await pool.query(
  'SELECT id, role, email, is_admin, admin_role_preset FROM users WHERE LOWER(email)=LOWER($1)',
  [email]
);
console.log('after:', after.rows);
await pool.end();
