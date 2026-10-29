/**
 * One-shot: cancel pending service-reminder eligibility rows (stops reminder emails).
 * Does not delete history — only pending → cancelled.
 */
import pg from 'pg';
import { postgresSslOptions } from '../api/db-ssl.js';

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.log('No DB URL — skip queue clear');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url, ssl: postgresSslOptions() });
try {
  const before = await pool.query(
    `SELECT COUNT(*)::int AS c FROM service_reminder_eligibility WHERE status='pending'`
  );
  const cancelled = await pool.query(
    `UPDATE service_reminder_eligibility
     SET status='cancelled', processing_token=NULL, updated_at=NOW()
     WHERE status='pending'
     RETURNING id`
  );
  console.log(`pending_reminders_before=${before.rows[0]?.c || 0}`);
  console.log(`pending_reminders_cancelled=${cancelled.rowCount}`);
} catch (e) {
  console.log(`queue_clear_note=${e.message}`);
} finally {
  await pool.end();
}
