#!/usr/bin/env node
/**
 * Removes QA test data from the database: throwaway QA accounts, and test requests created on a
 * real test account during a test window. Dry run by default; pass --apply to delete.
 *
 *   NEON_DATABASE_URL=... node scripts/remove-qa-test-data.mjs \
 *     --qa-email-like 'claude.qa.%@example.com' \
 *     --test-account mr.test@gmail.com --since 2026-10-13T08:00:00Z \
 *     --ticket FBT-10001 [--apply]
 *
 * Safety: everything runs in one transaction; only rows created at or after --since are touched
 * (so an older record that happens to share a job number is never matched); the test account
 * itself and its property are kept, only its test requests and their records go.
 */
import pg from 'pg';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes('--apply');
const QA_LIKE = opt('qa-email-like');
const TEST_ACCOUNT = opt('test-account');
const SINCE = opt('since');
const TICKETS = args.flatMap((a, i) => (a === '--ticket' ? [args[i + 1]] : []));
const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!url || !SINCE || (!QA_LIKE && !TEST_ACCOUNT && !TICKETS.length)) {
  console.error('Usage: NEON_DATABASE_URL=... node scripts/remove-qa-test-data.mjs --since ISO [--qa-email-like PATTERN] [--test-account EMAIL] [--ticket FBT-n]... [--apply]');
  process.exit(2);
}
if (Number.isNaN(Date.parse(SINCE))) { console.error('--since must be an ISO date'); process.exit(2); }

const USER_COLS = new Set([
  'user_id', 'homeowner_user_id', 'owner_user_id', 'actor_user_id', 'referred_user_id', 'referrer_user_id',
  'opened_by_user_id', 'invited_by_user_id', 'uploader_user_id', 'sender_user_id', 'created_by_user_id', 'author_user_id',
]);
const JOB_COLS = new Set(['job_id', 'related_job_id', 'managed_job_id']);

const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
});
const client = await pool.connect();
const report = [];
const q = (sql, params) => client.query(sql, params);

async function columns() {
  const { rows } = await q(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`);
  const byTable = new Map();
  for (const r of rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set());
    byTable.get(r.table_name).add(r.column_name);
  }
  return byTable;
}

async function del(label, sql, params) {
  const { rowCount } = await q(sql, params);
  if (rowCount) report.push([label, rowCount]);
  return rowCount;
}

try {
  await q('BEGIN');
  const cols = await columns();
  const has = (t, c) => cols.get(t)?.has(c);

  // ── Targets ──
  const qaUsers = QA_LIKE ? (await q(`SELECT id, email, created_at FROM users WHERE email LIKE $1 AND created_at >= $2`, [QA_LIKE, SINCE])).rows : [];
  const testUser = TEST_ACCOUNT ? (await q(`SELECT id, email FROM users WHERE LOWER(email)=LOWER($1)`, [TEST_ACCOUNT])).rows[0] : null;
  if (TEST_ACCOUNT && !testUser) throw new Error(`Test account ${TEST_ACCOUNT} not found`);
  const qaIds = qaUsers.map((u) => u.id);
  const ownerIds = [...qaIds, ...(testUser ? [testUser.id] : [])];
  const jobs = ownerIds.length ? (await q(`SELECT id FROM managed_jobs WHERE homeowner_user_id = ANY($1) AND created_at >= $2`, [ownerIds, SINCE])).rows.map((r) => r.id) : [];
  const pending = ownerIds.length ? (await q(`SELECT id FROM pending_service_requests WHERE homeowner_user_id = ANY($1) AND created_at >= $2`, [ownerIds, SINCE])).rows.map((r) => r.id) : [];
  const tickets = TICKETS.length ? (await q(`SELECT id, ticket_number FROM support_tickets WHERE ticket_number = ANY($1) AND created_at >= $2`, [TICKETS, SINCE])).rows : [];
  console.log('QA accounts:', qaUsers.map((u) => `${u.id} ${u.email}`));
  console.log('Test account kept:', testUser ? `${testUser.id} ${testUser.email}` : '-');
  console.log('Test requests (managed jobs):', jobs);
  console.log('Pending requests:', pending);
  console.log('Support tickets:', tickets.map((t) => t.ticket_number));

  // ── Records tied to the test requests ──
  if (pending.length) {
    if (has('media_objects', 'pending_service_request_id')) await del('media_objects (pending)', `DELETE FROM media_objects WHERE pending_service_request_id = ANY($1) AND created_at >= $2`, [pending, SINCE]);
    await del('fixera_interactions (pending)', `DELETE FROM fixera_interactions WHERE case_type='pending_service_request' AND case_id = ANY($1) AND created_at >= $2`, [pending, SINCE]);
    await del('fixera_assessment_queue (pending)', `DELETE FROM fixera_assessment_queue WHERE record_type='pending_service_request' AND record_id = ANY($1)`, [pending]);
  }
  if (jobs.length) {
    await del('fixera_assessment_queue (jobs)', `DELETE FROM fixera_assessment_queue WHERE record_type='managed_job' AND record_id = ANY($1)`, [jobs]);
    await del('fixera_interactions (case)', `DELETE FROM fixera_interactions WHERE case_type='managed_job' AND case_id = ANY($1) AND created_at >= $2`, [jobs, SINCE]);
    for (const [table, set] of cols) {
      if (table === 'managed_jobs' || table === 'pending_service_requests') continue;
      for (const c of set) {
        if (!JOB_COLS.has(c)) continue;
        const timeGuard = set.has('created_at') ? ` AND created_at >= $2` : set.has('generated_at') ? ` AND generated_at >= $2` : null;
        if (!timeGuard) { console.log(`  skipped ${table}.${c} (no timestamp to guard with)`); continue; }
        // Where the row also names its user, it must be one of ours (job numbers can collide
        // with other record types, such as pending-request numbers).
        const owner = ['homeowner_user_id', 'user_id', 'owner_user_id'].find((u) => set.has(u));
        const ownerGuard = owner ? ` AND ${owner} = ANY($3)` : '';
        await del(`${table}.${c}`, `DELETE FROM ${table} WHERE ${c} = ANY($1)${timeGuard}${ownerGuard}`, owner ? [jobs, SINCE, ownerIds] : [jobs, SINCE]);
      }
    }
  }
  if (pending.length) await del('pending_service_requests', `DELETE FROM pending_service_requests WHERE id = ANY($1)`, [pending]);
  if (jobs.length) await del('managed_jobs', `DELETE FROM managed_jobs WHERE id = ANY($1)`, [jobs]);

  // ── The test account's own AI records from the test window (account and property are kept) ──
  if (testUser) {
    await del('fixera_interactions (test account)', `DELETE FROM fixera_interactions WHERE user_id=$1 AND created_at >= $2`, [testUser.id, SINCE]);
    if (cols.has('fixera_user_profiles')) await del('fixera_user_profiles (rebuilt from real use)', `DELETE FROM fixera_user_profiles WHERE user_id=$1`, [testUser.id]);
    await del('notifications (test account)', `DELETE FROM notifications WHERE user_id=$1 AND created_at >= $2`, [testUser.id, SINCE]);
    const props = (await q(`SELECT id, health_profile FROM properties WHERE owner_user_id=$1`, [testUser.id])).rows;
    for (const p of props) {
      const health = typeof p.health_profile === 'string' ? JSON.parse(p.health_profile || '{}') : p.health_profile || {};
      const list = Array.isArray(health.maintenance) ? health.maintenance : [];
      const keep = list.filter((m) => String(m?.source || '').toUpperCase() !== 'FIXERA');
      if (keep.length !== list.length) {
        console.log(`  property ${p.id}: removing Fixera reminders`, list.filter((m) => !keep.includes(m)).map((m) => `${m.label} (${m.dueDate})`));
        health.maintenance = keep;
        await q(`UPDATE properties SET health_profile=$1 WHERE id=$2`, [JSON.stringify(health), p.id]);
        report.push([`properties ${p.id} Fixera reminders`, list.length - keep.length]);
      }
    }
  }

  // ── QA accounts and everything they own ──
  if (qaIds.length) {
    for (const [table, set] of cols) {
      if (table === 'users') continue;
      for (const c of set) {
        if (USER_COLS.has(c)) await del(`${table}.${c}`, `DELETE FROM ${table} WHERE ${c} = ANY($1)`, [qaIds]);
      }
    }
    await del('users (QA accounts)', `DELETE FROM users WHERE id = ANY($1)`, [qaIds]);
  }

  // ── QA support tickets ──
  for (const t of tickets) {
    for (const table of ['support_ticket_messages', 'support_ticket_activity', 'support_ticket_attachments', 'ticket_deliveries']) {
      if (cols.has(table)) await del(table, `DELETE FROM ${table} WHERE ticket_id=$1`, [t.id]);
    }
    await del('notifications (ticket)', `DELETE FROM notifications WHERE title LIKE $1 AND created_at >= $2`, [`%${t.ticket_number}%`, SINCE]);
    await del('support_tickets', `DELETE FROM support_tickets WHERE id=$1`, [t.id]);
  }

  console.log('\nRows affected:');
  for (const [label, n] of report) console.log(`  ${String(n).padStart(5)}  ${label}`);
  if (APPLY) { await q('COMMIT'); console.log('\nAPPLIED.'); }
  else { await q('ROLLBACK'); console.log('\nDry run only — nothing was changed. Re-run with --apply to delete.'); }
} catch (e) {
  await q('ROLLBACK').catch(() => {});
  console.error('Failed, nothing was changed:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
