/**
 * Service reminder eligibility + delivery (in-app + email).
 * Invoke via processDueServiceReminders() from a scheduler — NOT from request handlers.
 */
import { getHomeCareConfig } from './homecare-config.js';
import { sendEmailSafe } from './notify.js';
import { brand } from './brand.js';
import {
  resolveServiceAtUtc,
  formatServiceWhenInTimezone,
  serviceAtLegacyUtc,
} from './property-timezone.js';

const MATERIAL_RESCHEDULE_MS = 60 * 60 * 1000; // 1 hour
const MAX_EMAIL_ATTEMPTS = 5;

export async function initServiceReminderSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_reminder_eligibility (
      id                  BIGSERIAL PRIMARY KEY,
      job_id              INT NOT NULL UNIQUE,
      homeowner_user_id   INT NOT NULL,
      property_id         INT,
      recurring_service_id INT,
      service_at          TIMESTAMPTZ NOT NULL,
      reminder_lead_hours INT NOT NULL DEFAULT 24,
      schedule_version    INT NOT NULL DEFAULT 1,
      status              TEXT NOT NULL DEFAULT 'pending',
      in_app_sent_at      TIMESTAMPTZ,
      email_sent_at       TIMESTAMPTZ,
      email_attempts      INT NOT NULL DEFAULT 0,
      processing_token    TEXT,
      processing_started_at TIMESTAMPTZ,
      last_error          TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE service_reminder_eligibility ADD COLUMN IF NOT EXISTS schedule_version INT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE service_reminder_eligibility ADD COLUMN IF NOT EXISTS email_attempts INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE service_reminder_eligibility ADD COLUMN IF NOT EXISTS processing_token TEXT`);
  await pool.query(`ALTER TABLE service_reminder_eligibility ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE service_reminder_eligibility ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_service_reminder_pending
    ON service_reminder_eligibility (status, service_at)
    WHERE status = 'pending'
  `);
}

export const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'closed',
  'canceled',
  'cancelled',
  'refunded',
  'disputed',
]);


export function serviceAtFromJob(job) {
  const dateStr = job?.preferred_date ? String(job.preferred_date).slice(0, 10) : null;
  if (!dateStr) return null;
  return serviceAtLegacyUtc(dateStr, job.preferred_time_slot);
}

export function isReminderDue(eligibility, asOf = new Date()) {
  if (!eligibility || eligibility.status !== 'pending') return false;
  const serviceAt = new Date(eligibility.service_at);
  if (Number.isNaN(serviceAt.getTime()) || serviceAt.getTime() <= asOf.getTime()) return false;
  const leadMs = (Number(eligibility.reminder_lead_hours) || 24) * 60 * 60 * 1000;
  const windowStart = new Date(serviceAt.getTime() - leadMs);
  return asOf.getTime() >= windowStart.getTime();
}

function formatServiceWhen(serviceAt, timeSlot, timeZone) {
  return formatServiceWhenInTimezone(serviceAt, timeSlot, timeZone);
}

function appBaseUrl() {
  return (
    process.env.APP_URL?.trim() ||
    process.env.URL?.trim() ||
    brand.domain?.replace(/\/$/, '') ||
    'https://fixbridge.netlify.app'
  );
}

function resolveAsOf(options = {}) {
  if (options.asOf) {
    if (process.env.ALLOW_REMINDER_TEST_CLOCK === '1' || process.env.NODE_ENV !== 'production') {
      return new Date(options.asOf);
    }
  }
  return new Date();
}

/**
 * Reset reminder when appointment time materially changes (v1 reschedule rule).
 */
export async function resetReminderOnReschedule(pool, job, previousServiceAt) {
  if (!job?.id) return null;
  const { serviceAt: newAt, timezone, mode } = await resolveServiceAtUtc(pool, job);
  if (!newAt) {
    if (mode === 'missing_date') return null;
    console.warn('[service-reminder] reschedule skipped — no service_at', { jobId: job.id, mode });
    return null;
  }
  const prev = previousServiceAt ? new Date(previousServiceAt) : null;
  if (prev && Math.abs(newAt.getTime() - prev.getTime()) < MATERIAL_RESCHEDULE_MS) {
    return null;
  }
  if (newAt.getTime() <= Date.now()) {
    await cancelServiceReminderForJob(pool, job.id);
    return null;
  }

  const { rows } = await pool.query(
    `UPDATE service_reminder_eligibility SET
       service_at=$2,
       schedule_version=schedule_version + 1,
       status='pending',
       in_app_sent_at=NULL,
       email_sent_at=NULL,
       email_attempts=0,
       processing_token=NULL,
       processing_started_at=NULL,
       last_error=NULL,
       updated_at=NOW()
     WHERE job_id=$1 AND status IN ('pending','sent')
     RETURNING *`,
    [job.id, newAt]
  );
  if (rows[0]) return rows[0];
  return upsertServiceReminderEligibility(pool, job, {
    recurringServiceId: job.source_recurring_service_id,
    propertyTimezone: timezone,
  });
}

export async function upsertServiceReminderEligibility(
  pool,
  job,
  { recurringServiceId = null, propertyTimezone = null } = {}
) {
  if (!job?.id || !job.homeowner_user_id) return null;
  if (TERMINAL_JOB_STATUSES.has(String(job.status || '').toLowerCase())) {
    await cancelServiceReminderForJob(pool, job.id);
    return null;
  }

  const { serviceAt, timezone, mode } = await resolveServiceAtUtc(pool, {
    ...job,
    property_timezone: propertyTimezone || job.property_timezone,
  });
  if (!serviceAt || serviceAt.getTime() <= Date.now()) {
    if (job.property_id && mode === 'legacy_utc') {
      console.warn('[service-reminder] property missing timezone — using legacy UTC slot', {
        jobId: job.id,
        propertyId: job.property_id,
      });
    }
    if (!serviceAt) return null;
    if (serviceAt.getTime() <= Date.now()) return null;
  }

  const config = await getHomeCareConfig(pool);
  if (!config.recurring?.remindersEnabled) return null;

  const leadHours = config.recurring.reminderLeadHours ?? 24;

  const { rows } = await pool.query(
    `INSERT INTO service_reminder_eligibility
      (job_id, homeowner_user_id, property_id, recurring_service_id, service_at, reminder_lead_hours, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')
     ON CONFLICT (job_id) DO UPDATE SET
       property_id=EXCLUDED.property_id,
       recurring_service_id=COALESCE(EXCLUDED.recurring_service_id, service_reminder_eligibility.recurring_service_id),
       service_at=EXCLUDED.service_at,
       reminder_lead_hours=EXCLUDED.reminder_lead_hours,
       status=CASE
         WHEN service_reminder_eligibility.status='cancelled' THEN 'cancelled'
         WHEN service_reminder_eligibility.in_app_sent_at IS NOT NULL
           AND service_reminder_eligibility.email_sent_at IS NOT NULL THEN 'sent'
         WHEN ABS(EXTRACT(EPOCH FROM (service_reminder_eligibility.service_at - EXCLUDED.service_at))) >= 3600 THEN 'pending'
         ELSE service_reminder_eligibility.status
       END,
       in_app_sent_at=CASE
         WHEN ABS(EXTRACT(EPOCH FROM (service_reminder_eligibility.service_at - EXCLUDED.service_at))) >= 3600 THEN NULL
         ELSE service_reminder_eligibility.in_app_sent_at
       END,
       email_sent_at=CASE
         WHEN ABS(EXTRACT(EPOCH FROM (service_reminder_eligibility.service_at - EXCLUDED.service_at))) >= 3600 THEN NULL
         ELSE service_reminder_eligibility.email_sent_at
       END,
       schedule_version=CASE
         WHEN ABS(EXTRACT(EPOCH FROM (service_reminder_eligibility.service_at - EXCLUDED.service_at))) >= 3600
           THEN service_reminder_eligibility.schedule_version + 1
         ELSE service_reminder_eligibility.schedule_version
       END,
       updated_at=NOW()
     RETURNING *`,
    [job.id, job.homeowner_user_id, job.property_id || null, recurringServiceId, serviceAt, leadHours]
  );
  return rows[0] || null;
}

export async function cancelServiceReminderForJob(pool, jobId) {
  await pool.query(
    `UPDATE service_reminder_eligibility SET status='cancelled', updated_at=NOW(), processing_token=NULL WHERE job_id=$1`,
    [jobId]
  );
}

async function claimEligibleRow(pool, asOf) {
  const token = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const { rows } = await pool.query(
    `WITH candidate AS (
       SELECT e.id
       FROM service_reminder_eligibility e
       JOIN managed_jobs j ON j.id = e.job_id
       WHERE e.status = 'pending'
         AND LOWER(j.status) NOT IN ('completed','closed','canceled','cancelled','refunded','disputed')
         AND e.service_at > $1::timestamptz
         AND e.service_at <= $1::timestamptz + (e.reminder_lead_hours * INTERVAL '1 hour')
         AND (e.in_app_sent_at IS NULL OR e.email_sent_at IS NULL)
         AND (e.processing_token IS NULL OR e.processing_started_at < $1::timestamptz - INTERVAL '10 minutes')
       ORDER BY e.service_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE service_reminder_eligibility e
     SET processing_token=$2,
         processing_started_at=$1::timestamptz,
         updated_at=$1::timestamptz
     FROM candidate c
     WHERE e.id = c.id
     RETURNING e.*`,
    [asOf, token]
  );
  if (!rows[0]) return null;

  const { rows: joined } = await pool.query(
    `SELECT e.*, j.title, j.category, j.preferred_time_slot, j.status AS job_status,
            u.email, u.name AS homeowner_name, p.timezone AS property_timezone
     FROM service_reminder_eligibility e
     JOIN managed_jobs j ON j.id = e.job_id
     JOIN users u ON u.id = e.homeowner_user_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.id=$1`,
    [rows[0].id]
  );
  return joined[0] || null;
}

async function releaseClaim(pool, id, token) {
  await pool.query(
    `UPDATE service_reminder_eligibility SET processing_token=NULL, processing_started_at=NULL, updated_at=NOW()
     WHERE id=$1 AND processing_token=$2`,
    [id, token]
  );
}

async function processOneReminder(pool, row) {
  const token = row.processing_token;
  const whenLabel = formatServiceWhen(row.service_at, row.preferred_time_slot, row.property_timezone);
  const serviceLabel = row.title || row.category || 'home service';
  const message = `Your ${serviceLabel} is scheduled for ${whenLabel}.`;
  const result = { jobId: row.job_id, inApp: false, email: false, skipped: false };

  if (TERMINAL_JOB_STATUSES.has(String(row.job_status).toLowerCase())) {
    await pool.query(`UPDATE service_reminder_eligibility SET status='cancelled', processing_token=NULL WHERE id=$1`, [row.id]);
    result.skipped = true;
    return result;
  }

  const serviceAt = new Date(row.service_at);
  if (serviceAt.getTime() <= Date.now()) {
    await pool.query(`UPDATE service_reminder_eligibility SET status='cancelled', processing_token=NULL WHERE id=$1`, [row.id]);
    result.skipped = true;
    return result;
  }

  if (!isReminderDue(row, new Date())) {
    await releaseClaim(pool, row.id, token);
    result.skipped = true;
    return result;
  }

  if (!row.in_app_sent_at) {
    await pool.query(
      `INSERT INTO notifications (user_id, job_id, type, title, message)
       VALUES ($1,$2,'service_reminder',$3,$4)`,
      [row.homeowner_user_id, row.job_id, 'Upcoming service reminder', message]
    );
    await pool.query(
      `UPDATE service_reminder_eligibility SET in_app_sent_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [row.id]
    );
    result.inApp = true;
  }

  if (!row.email_sent_at && row.email && (row.email_attempts || 0) < MAX_EMAIL_ATTEMPTS) {
    try {
      await sendEmailSafe({
        to: row.email,
        subject: `${brand.productName} reminder — ${serviceLabel}`,
        html: `<p>Hi ${row.homeowner_name || 'there'},</p>
<p>This is a reminder that your <strong>${serviceLabel}</strong> is scheduled for <strong>${whenLabel}</strong>.</p>
<p><a href="${appBaseUrl()}/?job=${row.job_id}">View your service in FixBridge</a></p>`,
      });
      await pool.query(
        `UPDATE service_reminder_eligibility SET email_sent_at=NOW(), email_attempts=email_attempts+1, last_error=NULL, updated_at=NOW() WHERE id=$1`,
        [row.id]
      );
      result.email = true;
    } catch (e) {
      console.error('[service-reminder] email failed', { jobId: row.job_id, error: e.message });
      await pool.query(
        `UPDATE service_reminder_eligibility SET email_attempts=email_attempts+1, last_error=$2, updated_at=NOW() WHERE id=$1`,
        [row.id, String(e.message || 'email_failed').slice(0, 200)]
      );
    }
  }

  const { rows: fresh } = await pool.query(`SELECT * FROM service_reminder_eligibility WHERE id=$1`, [row.id]);
  const f = fresh[0];
  if (f?.in_app_sent_at && f?.email_sent_at) {
    await pool.query(
      `UPDATE service_reminder_eligibility SET status='sent', processing_token=NULL, updated_at=NOW() WHERE id=$1`,
      [row.id]
    );
  } else {
    await releaseClaim(pool, row.id, token);
  }

  return result;
}

/**
 * Process due reminders. Safe for concurrent workers (SKIP LOCKED claims).
 */
export async function processDueServiceReminders(pool, options = {}) {
  const asOf = resolveAsOf(options);
  const config = await getHomeCareConfig(pool);
  if (!config.recurring?.remindersEnabled) {
    console.log('[service-reminder] skipped — reminders disabled in HomeCare config');
    return { processed: 0, sentInApp: 0, sentEmail: 0, skipped: 0, evaluated: 0, reason: 'reminders_disabled' };
  }

  console.log('[service-reminder] processor started', { asOf: asOf.toISOString() });

  let processed = 0;
  let sentInApp = 0;
  let sentEmail = 0;
  let skipped = 0;
  let evaluated = 0;
  const maxBatch = Number(options.maxBatch || 50);

  for (let i = 0; i < maxBatch; i++) {
    const row = await claimEligibleRow(pool, asOf);
    if (!row) break;
    evaluated += 1;
    const r = await processOneReminder(pool, row);
    if (r.skipped) skipped += 1;
    else processed += 1;
    if (r.inApp) sentInApp += 1;
    if (r.email) sentEmail += 1;
  }

  console.log('[service-reminder] processor finished', { processed, sentInApp, sentEmail, skipped, evaluated });
  return { processed, sentInApp, sentEmail, skipped, evaluated, reason: null };
}

export function verifyReminderCronAuth(req) {
  const secret = process.env.SERVICE_REMINDER_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers['x-service-reminder-secret'] || req.headers['authorization'];
  if (!header) return false;
  if (header === secret) return true;
  if (header === `Bearer ${secret}`) return true;
  return false;
}

export async function getReminderSchedulerStatus(pool) {
  const pollEnabled = process.env.ENABLE_SERVICE_REMINDER_POLL === 'true';
  const cronSecretConfigured = Boolean(process.env.SERVICE_REMINDER_CRON_SECRET?.trim());
  const netlifyScheduled = Boolean(
    process.env.FIXBRIDGE_HOSTING === 'netlify' ||
      process.env.NETLIFY ||
      process.env.NETLIFY_DEV ||
      process.env.NETLIFY_SITE_ID ||
      process.env.CONTEXT === 'production' ||
      /netlify\.app$/i.test(String(process.env.URL || process.env.DEPLOY_URL || ''))
  );
  let pending = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM service_reminder_eligibility WHERE status='pending'`
    );
    pending = rows[0]?.c || 0;
  } catch {
    pending = null;
  }
  const recommendedMode = pollEnabled
    ? 'internal_poll'
    : netlifyScheduled
      ? 'netlify_scheduled_function'
      : cronSecretConfigured
        ? 'external_cron'
        : 'manual_admin_or_unconfigured';
  return {
    deliveryConfigured: true,
    pollWorkerEnabled: pollEnabled,
    cronSecretConfigured,
    netlifyScheduledFunction: netlifyScheduled,
    recommendedMode,
    schedule: '*/15 * * * *',
    pendingEligibility: pending,
    hostingNote:
      'Netlify: use scheduled function process-service-reminders. Persistent Node host: ENABLE_SERVICE_REMINDER_POLL=true.',
  };
}
