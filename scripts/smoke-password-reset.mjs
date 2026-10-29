import pg from 'pg';
import bcrypt from 'bcryptjs';
import { postgresSslOptions } from '../api/db-ssl.js';
import {
  completePasswordReset,
  createRawResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MS,
} from '../api/password-reset.js';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('NO_URL');
  process.exit(1);
}
const connectionString = url.includes('uselibpqcompat=')
  ? url
  : `${url}${url.includes('?') ? '&' : '?'}uselibpqcompat=true`;
const pool = new pg.Pool({ connectionString, ssl: postgresSslOptions(), max: 2 });

const raw = createRawResetToken();
const hash = hashResetToken(raw);
await pool.query(
  `UPDATE password_reset_tokens SET used=true WHERE email=$1 AND role=$2 AND used=false`,
  ['admin@fixbridge.local', 'admin']
);
await pool.query(
  `INSERT INTO password_reset_tokens (email, role, token, expires_at) VALUES ($1,$2,$3,$4)`,
  ['admin@fixbridge.local', 'admin', hash, new Date(Date.now() + RESET_TOKEN_TTL_MS)]
);
const r = await completePasswordReset(pool, {
  rawToken: raw,
  role: 'admin',
  password: 'AdminReset99',
});
console.log('complete', r);
const { rows } = await pool.query(
  `SELECT password FROM users WHERE email=$1 AND role=$2`,
  ['admin@fixbridge.local', 'admin']
);
console.log('new_password_works', await bcrypt.compare('AdminReset99', rows[0].password));
console.log(
  'reuse_fails',
  (
    await completePasswordReset(pool, {
      rawToken: raw,
      role: 'admin',
      password: 'AdminReset99',
    })
  ).ok === false
);
const hashed = await bcrypt.hash('admin123', 10);
await pool.query(`UPDATE users SET password=$1 WHERE email=$2 AND role=$3`, [
  hashed,
  'admin@fixbridge.local',
  'admin',
]);
console.log('restored_demo_password');
await pool.end();
