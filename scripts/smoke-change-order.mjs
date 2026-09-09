/**
 * Change order lifecycle smoke — contractor submit → admin price → homeowner approve.
 * Usage: node --env-file=.env scripts/smoke-change-order.mjs
 */
import pg from 'pg';
import {
  API,
  authH,
  json,
  loginAdminWithMfa,
  loginContractor,
  loginHomeowner,
} from './smoke-auth.mjs';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
    ssl: (process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '').includes('neon')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  let contractor = await loginContractor().catch(() => null);
  const admin = await loginAdminWithMfa();
  const homeowner = await loginHomeowner();

  if (!contractor) {
    const { rows } = await pool.query(`SELECT id, email FROM users WHERE role='contractor' ORDER BY id LIMIT 1`);
    if (!rows[0]) throw new Error('No contractor account in database');
    contractor = { user: { id: rows[0].id, email: rows[0].email }, token: admin.token };
  }

  const job = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: authH(homeowner.token),
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'Change order smoke',
      description: 'CO test',
      contactName: 'Maria',
      fullAddress: '1 Test',
      cityStateZip: 'NY 10001',
    }),
  }).then(json);

  const jobId = job.job?.id;
  if (!jobId) throw new Error(job.message || 'job create failed');

  await pool.query(
    `UPDATE managed_jobs SET assigned_contractor_user_id=$1, status='work_started' WHERE id=$2`,
    [contractor.user?.id, jobId]
  );

  const create = await fetch(`${API}/api/managed/jobs/${jobId}/change-orders`, {
    method: 'POST',
    headers: authH(contractor.token),
    body: JSON.stringify({ description: 'Extra pipe section', contractorNet: 80, reason: 'Hidden leak' }),
  }).then(json);

  const coId = create.changeOrder?.id;
  if (!create.ok || !coId) throw new Error(create.message || 'create CO failed');

  const price = await fetch(`${API}/api/admin/change-orders/${coId}/price`, {
    method: 'POST',
    headers: authH(admin.token),
    body: JSON.stringify({ retailAmount: 120 }),
  }).then(json);
  if (!price.ok) throw new Error(price.message || 'price failed');

  const approve = await fetch(`${API}/api/managed/jobs/${jobId}/change-orders/${coId}/approve`, {
    method: 'POST',
    headers: authH(homeowner.token),
    body: JSON.stringify({}),
  }).then(json);
  if (!approve.ok) throw new Error(approve.message || 'approve failed');

  const { rows } = await pool.query(`SELECT status, approved_snapshot FROM change_orders WHERE id=$1`, [coId]);
  const snap = rows[0]?.approved_snapshot;
  const locked = rows[0]?.status === 'approved' && snap && Number(snap.retail_amount) === 120;

  console.log(locked ? 'PASS' : 'FAIL', 'change order lifecycle + financial lock', `status=${rows[0]?.status}`);
  await pool.end();
  if (!locked) process.exit(1);
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
