/**
 * Live RBAC matrix — Super Admin, Operations, Read Only via HTTP.
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { API, authH, json, loginAdminWithMfa } from './smoke-auth.mjs';

const results = [];
function record(endpoint, role, pass, status) {
  results.push({ endpoint, role, pass, status });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${role}] ${endpoint} → ${status}`);
  if (!pass) process.exitCode = 1;
}

async function ensureRoleUser(pool, email, preset, level) {
  const hash = await bcrypt.hash('rbac-test-123', 10);
  const { rows } = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
  if (rows[0]) {
    await pool.query(
      `UPDATE users SET password=$1, is_admin=true, admin_access_level=$2, admin_role_preset=$3, role='admin' WHERE email=$4`,
      [hash, level, preset, email]
    );
    return rows[0].id;
  }
  const ins = await pool.query(
    `INSERT INTO users (role, name, email, password, is_admin, admin_access_level, admin_role_preset, compliance_status)
     VALUES ('admin',$1,$2,$3,true,$4,$5,'approved') RETURNING id`,
    [`RBAC ${preset}`, email, hash, level, preset]
  );
  return ins.rows[0].id;
}

async function loginRole(email) {
  const signin = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin', email, password: 'rbac-test-123' }),
  }).then(json);
  if (!signin.ok || !signin.token) throw new Error(`login ${email}: ${signin.message}`);
  const mfa = await fetch(`${API}/api/auth/mfa/start`, {
    method: 'POST',
    headers: authH(signin.token),
    body: JSON.stringify({}),
  }).then(json);
  if (mfa.demoCode) {
    const v = await fetch(`${API}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: authH(signin.token),
      body: JSON.stringify({ code: String(mfa.demoCode) }),
    }).then(json);
    if (v.token) return v.token;
  }
  return signin.token;
}

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const opsEmail = `ops.rbac.${Date.now()}@example.com`;
  const roEmail = `readonly.rbac.${Date.now()}@example.com`;
  await ensureRoleUser(pool, opsEmail, 'operations_admin', 'read-write');
  await ensureRoleUser(pool, roEmail, 'read_only', 'read');

  const superToken = (await loginAdminWithMfa()).token;
  const opsToken = await loginRole(opsEmail);
  const roToken = await loginRole(roEmail);

  const cases = [
    { method: 'GET', path: '/api/admin/audit-logs', super: 200, ops: 200, ro: 200, write: false },
    { method: 'POST', path: '/api/admin/discounts', body: { code: `RBAC${Date.now()}`, discountType: 'percent', value: 5, maxUses: 1 }, super: [200, 201, 400], ops: [200, 201, 400], ro: 403, write: true },
    { method: 'POST', path: '/api/admin/staff/access', body: { userId: 1, adminAccessLevel: 'read', adminRolePreset: 'read_only' }, super: [200, 403, 404], ops: 403, ro: 403, write: true, critical: 'privilege escalation' },
  ];

  for (const c of cases) {
    for (const [role, token, expected] of [
      ['super', superToken, c.super],
      ['operations', opsToken, c.ops],
      ['read_only', roToken, c.ro],
    ]) {
      const r = await fetch(`${API}${c.path}`, {
        method: c.method,
        headers: authH(token),
        body: c.body ? JSON.stringify(c.body) : undefined,
      });
      const expectedList = Array.isArray(expected) ? expected : [expected];
      const pass = expectedList.includes(r.status);
      record(`${c.method} ${c.path}${c.critical ? ' (escalation)' : ''}`, role, pass, r.status);
    }
  }

  // Operations cannot self-elevate to super_admin
  const opsUser = await pool.query(`SELECT id FROM users WHERE email=$1`, [opsEmail]);
  const selfEsc = await fetch(`${API}/api/admin/staff/access`, {
    method: 'POST',
    headers: authH(opsToken),
    body: JSON.stringify({ userId: opsUser.rows[0].id, adminAccessLevel: 'read-write', adminRolePreset: 'super_admin' }),
  });
  record('POST /api/admin/staff/access (self → super)', 'operations', selfEsc.status === 403, selfEsc.status);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- RBAC: ${passed}/${results.length} passed ---\n`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
