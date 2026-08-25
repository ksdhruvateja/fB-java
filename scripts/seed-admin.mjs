import pg from 'pg';
import bcrypt from 'bcryptjs';
import { postgresSslOptions } from '../api/db-ssl.js';

const email = 'admin@fixbridge.local';
const password = 'admin123';
const neonUrl = process.env.NEON_DATABASE_URL;
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
const existing = await pool.query(
  'SELECT id, role, is_admin FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
  ['admin', email]
);
console.log('before:', existing.rows);

if (!existing.rows.length) {
  await pool.query(
    `INSERT INTO users (role, name, email, password, is_admin, compliance_status)
     VALUES ('admin', 'Ops Admin', $1, $2, true, 'draft')
     ON CONFLICT DO NOTHING`,
    [email, hashed]
  );
  console.log('inserted admin');
} else {
  await pool.query(
    `UPDATE users SET password=$1, is_admin=true, name='Ops Admin'
     WHERE role='admin' AND LOWER(email)=LOWER($2)`,
    [hashed, email]
  );
  console.log('reset admin password');
}

const after = await pool.query(
  'SELECT id, role, email, is_admin FROM users WHERE LOWER(email)=LOWER($1)',
  [email]
);
console.log('after:', after.rows);
await pool.end();
