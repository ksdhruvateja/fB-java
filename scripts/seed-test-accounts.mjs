/**
 * seed-test-accounts.mjs
 *
 * Creates (or resets) one live test homeowner and one live test contractor
 * directly in the database. Safe to run in production — it never touches
 * admin rows and never deletes data.
 *
 * Usage:
 *   node scripts/seed-test-accounts.mjs
 *
 * Credentials created:
 *   Homeowner  — test.homeowner@fixbridge.us  / TestPass2024!
 *   Contractor — test.contractor@fixbridge.us / TestPass2024!
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { postgresSslOptions } from '../api/db-ssl.js';

const neonUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!neonUrl) {
  console.error('NEON_DATABASE_URL is not set');
  process.exit(1);
}

const connectionString = neonUrl.includes('uselibpqcompat=')
  ? neonUrl
  : `${neonUrl}${neonUrl.includes('?') ? '&' : '?'}uselibpqcompat=true`;

const pool = new pg.Pool({ connectionString, ssl: postgresSslOptions() });

const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD?.trim() || 'TestPass2024!';
const hashed = await bcrypt.hash(PASSWORD, 10);

// 1×1 transparent PNG — satisfies document fields without real files
const PLACEHOLDER_DOC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ACCOUNTS = [
  {
    role: 'homeowner',
    name: 'Test Homeowner',
    email: 'test.homeowner@fixbridge.us',
    extra: {},
  },
  {
    role: 'contractor',
    name: 'Test Contractor',
    email: 'test.contractor@fixbridge.us',
    extra: {
      trade: 'Master Plumber',
      license_number: 'FB-TEST-0001',
      company_name: 'FixBridge Test Co.',
      phone: '(555) 000-0001',
      compliance_status: 'approved',
      dispatch_eligible: true,
    },
  },
];

for (const acct of ACCOUNTS) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`,
    [acct.role, acct.email]
  );

  if (rows.length === 0) {
    if (acct.role === 'contractor') {
      await pool.query(
        `INSERT INTO users (
           role, name, email, password,
           trade, license_number, company_name, phone,
           compliance_status, dispatch_eligible,
           license_document_name, license_document_data,
           insurance_document_name, insurance_document_data,
           is_admin
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          acct.role, acct.name, acct.email, hashed,
          acct.extra.trade, acct.extra.license_number,
          acct.extra.company_name, acct.extra.phone,
          acct.extra.compliance_status, acct.extra.dispatch_eligible,
          'test-license.png', PLACEHOLDER_DOC,
          'test-insurance.png', PLACEHOLDER_DOC,
          false,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO users (role, name, email, password, is_admin, compliance_status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [acct.role, acct.name, acct.email, hashed, false, 'approved']
      );
    }
    console.log(`✓ Created  ${acct.role}: ${acct.email}`);
  } else {
    // Reset password and key fields so credentials are always known
    if (acct.role === 'contractor') {
      await pool.query(
        `UPDATE users SET
           password=$1, name=$2, trade=$3, compliance_status=$4,
           dispatch_eligible=$5
         WHERE role=$6 AND LOWER(email)=LOWER($7)`,
        [
          hashed, acct.name, acct.extra.trade,
          acct.extra.compliance_status, acct.extra.dispatch_eligible,
          acct.role, acct.email,
        ]
      );
    } else {
      await pool.query(
        `UPDATE users SET password=$1, name=$2, compliance_status='approved'
         WHERE role=$3 AND LOWER(email)=LOWER($4)`,
        [hashed, acct.name, acct.role, acct.email]
      );
    }
    console.log(`✓ Updated  ${acct.role}: ${acct.email} (password reset)`);
  }

  const { rows: check } = await pool.query(
    `SELECT id, role, email, compliance_status, dispatch_eligible FROM users WHERE LOWER(email)=LOWER($1)`,
    [acct.email]
  );
  console.log('  →', check[0]);
}

console.log(`\nTest credentials (password: ${PASSWORD})`);
console.log('  Homeowner  →  test.homeowner@fixbridge.us');
console.log('  Contractor →  test.contractor@fixbridge.us');

await pool.end();
