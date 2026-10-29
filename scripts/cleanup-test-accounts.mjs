/**
 * FixBridge test-account cleanup — dry-run / execute.
 *
 * KEEP (auth users only):
 *   admin@fixbridge.us (admin, super_admin)
 *   ksdt2702@gmail.com (contractor)
 *   bossdhruva1@gmail.com (homeowner)
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup-test-accounts.mjs --dry-run
 *   node --env-file=.env scripts/cleanup-test-accounts.mjs --execute
 *
 * Passwords come from env (never hardcoded in repo):
 *   TEST_ADMIN_PASSWORD / TEST_CONTRACTOR_PASSWORD / TEST_HOMEOWNER_PASSWORD
 *   or CLEANUP_ADMIN_PASSWORD / CLEANUP_CONTRACTOR_PASSWORD / CLEANUP_HOMEOWNER_PASSWORD
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { postgresSslOptions } from '../api/db-ssl.js';

const KEEP = [
  {
    email: 'admin@fixbridge.us',
    role: 'admin',
    name: 'FixBridge Admin',
    passwordEnv: ['TEST_ADMIN_PASSWORD', 'CLEANUP_ADMIN_PASSWORD'],
    adminAccessLevel: 'read-write',
    adminRolePreset: 'super_admin',
  },
  {
    email: 'ksdt2702@gmail.com',
    role: 'contractor',
    name: 'Test Contractor',
    passwordEnv: ['TEST_CONTRACTOR_PASSWORD', 'CLEANUP_CONTRACTOR_PASSWORD'],
  },
  {
    email: 'bossdhruva1@gmail.com',
    role: 'homeowner',
    name: 'Test Homeowner',
    passwordEnv: ['TEST_HOMEOWNER_PASSWORD', 'CLEANUP_HOMEOWNER_PASSWORD'],
  },
];

const KEEP_EMAILS = KEEP.map((k) => k.email.toLowerCase());
const mode = process.argv.includes('--execute') ? 'execute' : 'dry-run';

function passwordFor(entry) {
  for (const key of entry.passwordEnv) {
    const v = String(process.env[key] || '').trim();
    if (v) return v;
  }
  return '';
}

function reportDir() {
  const dir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('NEON_DATABASE_URL / DATABASE_URL required');

  const missingPw = KEEP.filter((k) => !passwordFor(k)).map((k) => k.email);
  if (mode === 'execute' && missingPw.length) {
    throw new Error(
      `Missing password env for: ${missingPw.join(', ')}. Set TEST_ADMIN_PASSWORD, TEST_CONTRACTOR_PASSWORD, TEST_HOMEOWNER_PASSWORD.`
    );
  }

  const pool = new pg.Pool({ connectionString: url, ssl: postgresSslOptions() });
  const client = await pool.connect();

  try {
    const { rows: allUsers } = await client.query(
      `SELECT id, role, email, name, is_admin, admin_role_preset, admin_access_level, is_blocked,
              compliance_status, created_at
       FROM users
       ORDER BY role, LOWER(email)`
    );

    const keepUsers = allUsers.filter((u) => KEEP_EMAILS.includes(String(u.email || '').toLowerCase()));
    const deleteUsers = allUsers.filter((u) => !KEEP_EMAILS.includes(String(u.email || '').toLowerCase()));

    console.log('FIXBRIDGE TEST ACCOUNT CLEANUP —', mode.toUpperCase());
    console.log('Authoritative login table: users');
    console.log(`Total current accounts: ${allUsers.length}`);
    console.log(`Accounts to KEEP: ${KEEP.length} (allowlist)`);
    console.log(`Existing keep matches: ${keepUsers.length}`);
    console.log(`Accounts to DELETE: ${deleteUsers.length}`);
    console.log('\nKEEP allowlist:');
    for (const k of KEEP) console.log(`  ${k.role}\t${k.email}`);
    console.log('\nDELETE emails:');
    for (const u of deleteUsers) console.log(`  ${u.id}\t${u.role}\t${u.email}`);

    // Partner users — separate system; report only, do not delete unless unused test clutter
    let partnerUsers = [];
    try {
      const p = await client.query(
        `SELECT id, email, role, created_at FROM partner_users ORDER BY id`
      );
      partnerUsers = p.rows;
      console.log(`\npartner_users (preserved — separate system): ${partnerUsers.length}`);
      for (const p of partnerUsers) console.log(`  ${p.id}\t${p.email}`);
    } catch {
      console.log('\npartner_users table not present or inaccessible — skipped');
    }

    const exportPath = path.join(
      reportDir(),
      `fixbridge-user-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    const exportPayload = {
      generatedAt: new Date().toISOString(),
      mode,
      keepAllowlist: KEEP.map(({ email, role, name }) => ({ email, role, name })),
      note: 'Password hashes intentionally omitted.',
      before: {
        total: allUsers.length,
        keepMatches: keepUsers.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          adminRolePreset: u.admin_role_preset,
          complianceStatus: u.compliance_status,
        })),
        toDelete: deleteUsers.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          adminRolePreset: u.admin_role_preset,
        })),
        partnerUsersPreserved: partnerUsers.map((p) => ({
          id: p.id,
          email: p.email,
          role: p.role,
        })),
      },
      domainNote:
        'Admin login is admin@fixbridge.us. Support sender remains support@fixbridge.us.',
    };
    fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2));
    console.log(`\nBackup export written: ${exportPath}`);

    if (mode !== 'execute') {
      console.log('\nDRY RUN ONLY — no changes applied. Re-run with --execute to apply.');
      return;
    }

    await client.query('BEGIN');

    // Upsert keep accounts
    for (const k of KEEP) {
      const pw = passwordFor(k);
      const hash = await bcrypt.hash(pw, 10);
      const email = k.email.toLowerCase();
      const { rows: existing } = await client.query(
        `SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,
        [email]
      );

      if (existing[0]) {
        if (k.role === 'admin') {
          await client.query(
            `UPDATE users SET
               role='admin',
               name=$2,
               email=$3,
               password=$4,
               is_admin=true,
               is_blocked=false,
               admin_access_level=$5,
               admin_role_preset=$6
             WHERE id=$1`,
            [existing[0].id, k.name, email, hash, k.adminAccessLevel, k.adminRolePreset]
          );
        } else if (k.role === 'contractor') {
          await client.query(
            `UPDATE users SET
               role='contractor',
               name=$2,
               email=$3,
               password=$4,
               is_admin=false,
               is_blocked=false,
               admin_access_level=NULL,
               admin_role_preset=NULL
             WHERE id=$1`,
            [existing[0].id, k.name, email, hash]
          );
        } else {
          await client.query(
            `UPDATE users SET
               role='homeowner',
               name=$2,
               email=$3,
               password=$4,
               is_admin=false,
               is_blocked=false,
               admin_access_level=NULL,
               admin_role_preset=NULL
             WHERE id=$1`,
            [existing[0].id, k.name, email, hash]
          );
        }
        console.log(`Updated ${k.role} ${email} id=${existing[0].id}`);
      } else if (k.role === 'admin') {
        const { rows } = await client.query(
          `INSERT INTO users (role,name,email,password,is_admin,compliance_status,admin_access_level,admin_role_preset)
           VALUES ('admin',$1,$2,$3,true,'approved',$4,$5)
           RETURNING id`,
          [k.name, email, hash, k.adminAccessLevel, k.adminRolePreset]
        );
        console.log(`Created admin ${email} id=${rows[0].id}`);
      } else if (k.role === 'contractor') {
        const { rows } = await client.query(
          `INSERT INTO users (role,name,email,password,is_admin,compliance_status,trade)
           VALUES ('contractor',$1,$2,$3,false,'approved','General Contractor')
           RETURNING id`,
          [k.name, email, hash]
        );
        console.log(`Created contractor ${email} id=${rows[0].id}`);
      } else {
        const { rows } = await client.query(
          `INSERT INTO users (role,name,email,password,is_admin,compliance_status)
           VALUES ('homeowner',$1,$2,$3,false,'approved')
           RETURNING id`,
          [k.name, email, hash]
        );
        console.log(`Created homeowner ${email} id=${rows[0].id}`);
      }
    }

    // Re-query keep ids after upsert
    const { rows: keepNow } = await client.query(
      `SELECT id, email, role FROM users WHERE LOWER(email)=ANY($1::text[])`,
      [KEEP_EMAILS]
    );
    const keepIds = keepNow.map((r) => Number(r.id));

    // Delete other users — dependents mostly CASCADE via FKs; handle SET NULL / non-FK refs carefully
    const { rows: toDelete } = await client.query(
      `SELECT id, email, role FROM users WHERE NOT (LOWER(email)=ANY($1::text[]))`,
      [KEEP_EMAILS]
    );
    const deleteIds = toDelete.map((r) => Number(r.id));

    let financialNote = [];
    if (deleteIds.length) {
      // Report payments/payouts that will be removed with deleted test users
      try {
        const pay = await client.query(
          `SELECT COUNT(*)::int AS c FROM payments WHERE user_id = ANY($1::int[])`,
          [deleteIds]
        );
        const xfer = await client.query(
          `SELECT COUNT(*)::int AS c FROM transfers WHERE contractor_user_id = ANY($1::int[])`,
          [deleteIds]
        );
        financialNote.push({
          paymentsTiedToDeletedUsers: pay.rows[0]?.c || 0,
          transfersTiedToDeletedUsers: xfer.rows[0]?.c || 0,
          action: 'Removed with deleted test users (smoke/demo accounts — not retained)',
        });
      } catch (e) {
        financialNote.push({ note: e.message });
      }

      async function safeNull(table, col) {
        const sp = `sp_null_${table}_${col}`.replace(/[^a-zA-Z0-9_]/g, '_');
        try {
          await client.query(`SAVEPOINT ${sp}`);
          await client.query(`UPDATE ${table} SET ${col}=NULL WHERE ${col} = ANY($1::int[])`, [deleteIds]);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        } catch {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          } catch {
            /* ignore */
          }
        }
      }

      async function safeDelete(table, col) {
        const sp = `sp_del_${table}_${col}`.replace(/[^a-zA-Z0-9_]/g, '_');
        try {
          await client.query(`SAVEPOINT ${sp}`);
          const res = await client.query(`DELETE FROM ${table} WHERE ${col} = ANY($1::int[])`, [deleteIds]);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          return res.rowCount || 0;
        } catch {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          } catch {
            /* ignore */
          }
          return 0;
        }
      }

      // Soft-detach actor/created_by refs that should not block user deletion
      const nullSets = [
        ['audit_logs', 'actor_user_id'],
        ['admin_audit_logs', 'actor_user_id'],
        ['job_status_history', 'actor_user_id'],
        ['job_operational_events', 'actor_user_id'],
        ['dispute_events', 'actor_user_id'],
        ['quote_activity', 'actor_user_id'],
        ['support_ticket_activity', 'actor_user_id'],
        ['contractor_compliance_events', 'actor_user_id'],
        ['discount_codes', 'created_by'],
        ['legal_document_versions', 'created_by'],
        ['proposals', 'created_by'],
        ['quote_revision_snapshots', 'created_by'],
        ['job_financial_snapshots', 'created_by'],
        ['financial_ledger_events', 'created_by'],
        ['referral_credits', 'created_by'],
        ['refunds', 'created_by'],
        ['transfers', 'created_by'],
        ['error_logs', 'user_id'],
        ['marketing_consent_events', 'admin_user_id'],
        ['homeowner_internal_notes', 'admin_user_id'],
        ['messages', 'sent_by_admin_user_id'],
        ['support_tickets', 'assigned_to'],
        ['availability_exceptions', 'created_by'],
        ['household_memberships', 'invited_by_user_id'],
      ];
      for (const [table, col] of nullSets) {
        await safeNull(table, col);
      }

      // Hard-delete owned dependent rows (no FK or incomplete cascade coverage)
      const deleteOwned = [
        ['notifications', 'user_id'],
        ['mfa_challenges', 'user_id'],
        ['consent_records', 'user_id'],
        ['homeowner_acceptances', 'user_id'],
        ['homeowner_acknowledgments', 'user_id'],
        ['diy_projects', 'user_id'],
        ['diy_safety_events', 'user_id'],
        ['conversation_read_cursors', 'user_id'],
        ['marketing_consent_events', 'user_id'],
        ['marketing_unsubscribe_tokens', 'user_id'],
        ['media_objects', 'owner_user_id'],
        ['home_health_reports', 'owner_user_id'],
        ['property_documents', 'owner_user_id'],
        ['property_memory_suggestions', 'owner_user_id'],
        ['preferred_contractors', 'owner_user_id'],
        ['preferred_contractors', 'contractor_user_id'],
        ['recurring_services', 'owner_user_id'],
        ['recurring_services', 'assigned_contractor_user_id'],
        ['household_invitations', 'owner_user_id'],
        ['household_memberships', 'user_id'],
        ['contractor_employees', 'contractor_user_id'],
        ['contractor_availability', 'contractor_user_id'],
        ['availability_exceptions', 'contractor_user_id'],
        ['employee_availability', 'contractor_user_id'],
        ['contractor_agreement_acceptances', 'contractor_user_id'],
        ['contractor_compliance_alerts', 'contractor_user_id'],
        ['contractor_compliance_documents', 'contractor_user_id'],
        ['contractor_compliance_events', 'contractor_user_id'],
        ['contractor_crm_notes', 'contractor_user_id'],
        ['solo_owner_acknowledgments', 'contractor_user_id'],
        ['lead_purchases', 'contractor_user_id'],
        ['site_reviews', 'user_id'],
        ['site_reviews', 'contractor_user_id'],
        ['support_tickets', 'user_id'],
        ['support_messages', 'user_id'],
        ['support_ticket_messages', 'sender_user_id'],
        ['homeowner_invoices', 'homeowner_user_id'],
        ['homeowner_internal_notes', 'homeowner_user_id'],
        ['service_reminder_eligibility', 'homeowner_user_id'],
        ['disputes', 'homeowner_user_id'],
        ['disputes', 'contractor_user_id'],
        ['disputes', 'opened_by_user_id'],
        ['conversations', 'homeowner_user_id'],
        ['conversations', 'contractor_user_id'],
        ['messages', 'sender_user_id'],
        ['message_attachments', 'uploader_user_id'],
        ['job_tips', 'homeowner_user_id'],
        ['job_tips', 'contractor_user_id'],
        ['job_dispatch_evidence', 'homeowner_user_id'],
        ['job_dispatch_evidence', 'contractor_user_id'],
        ['job_operational_events', 'contractor_user_id'],
        ['quote_acceptance_snapshots', 'homeowner_user_id'],
        ['quote_acceptance_snapshots', 'contractor_user_id'],
        ['payment_authorization_snapshots', 'user_id'],
        ['professional_dispatch_snapshots', 'user_id'],
        ['referral_code_meta', 'user_id'],
        ['referral_credits', 'user_id'],
        ['referral_notes', 'author_user_id'],
        ['referral_payout_bonuses', 'contractor_user_id'],
        ['referral_relationships', 'referrer_user_id'],
        ['referral_relationships', 'referred_user_id'],
      ];
      const dependentDeletes = [];
      for (const [table, col] of deleteOwned) {
        const n = await safeDelete(table, col);
        if (n) dependentDeletes.push({ table, col, deleted: n });
      }
      financialNote.push({ dependentDeletes });

      // Delete users — remaining FK cascades handle jobs/properties/payments/etc.
      const del = await client.query(
        `DELETE FROM users WHERE id = ANY($1::int[]) RETURNING id, email, role`,
        [deleteIds]
      );
      console.log(`\nDeleted users: ${del.rowCount}`);
      for (const r of del.rows) console.log(`  deleted ${r.id} ${r.role} ${r.email}`);
    } else {
      console.log('\nNo users to delete.');
    }

    // Final verification
    const { rows: finalUsers } = await client.query(
      `SELECT id, role, email, is_admin, admin_role_preset FROM users ORDER BY role, LOWER(email)`
    );
    if (finalUsers.length !== 3) {
      throw new Error(`Expected 3 login users after cleanup, found ${finalUsers.length}`);
    }
    for (const k of KEEP) {
      const hit = finalUsers.find((u) => String(u.email).toLowerCase() === k.email);
      if (!hit) throw new Error(`Missing keep account ${k.email}`);
      if (hit.role !== k.role) throw new Error(`Wrong role for ${k.email}: ${hit.role}`);
    }

    await client.query('COMMIT');

    const afterPath = path.join(
      reportDir(),
      `fixbridge-user-cleanup-after-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(
      afterPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          finalUsers: finalUsers.map((u) => ({
            id: u.id,
            email: u.email,
            role: u.role,
            adminRolePreset: u.admin_role_preset,
          })),
          keepIds,
          deletedCount: deleteIds.length,
          financialNote,
          supportSenderPreserved: 'support@fixbridge.us (env/config — not a users row)',
        },
        null,
        2
      )
    );
    console.log(`\nAfter report: ${afterPath}`);
    console.log('CLEANUP_EXECUTE_OK');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('CLEANUP_FAILED', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
