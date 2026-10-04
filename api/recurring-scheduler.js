import { calendarDate, addRecurrenceDays } from './recurring-calendar.js';
import { getHomeCareConfig, isRecurrenceAllowed, isRecurringServiceTypeAllowed, resolveFeatureEntitlement } from './homecare-config.js';
import { offeringById } from './service-offerings.js';
import { getHomeCareEntitlement } from './subscription-state.js';
import { notifyAdmins } from './in-app-notifications.js';

export function recurringMetadata(row) {
  try { return typeof row?.metadata === 'string' ? JSON.parse(row.metadata) : row?.metadata || {}; } catch { return {}; }
}

export async function assignedOccurrence(client, row, date) {
  if (!date) return false;
  return Boolean((await client.query(`SELECT id FROM managed_jobs WHERE source_recurring_service_id=$1 AND preferred_date=$2 AND status <> 'canceled' AND (assigned_contractor_user_id IS NOT NULL OR status <> 'awaiting_contractor') LIMIT 1`, [row.id,date])).rows.length);
}

// Call while holding the recurring row lock. Only unassigned, generated coordination
// requests are cancelled; already assigned work remains for Admin/customer review.
export async function cancelPendingOccurrences(client, row, date = null) {
  const meta = recurringMetadata(row);
  const pending = { ...(meta.queuedOccurrences || {}) };
  if (meta.adminJobId && calendarDate(row.start_date)) pending[calendarDate(row.start_date)] = meta.adminJobId;
  for (const [occurrenceDate, jobId] of Object.entries(pending)) {
    if (date && occurrenceDate !== date) continue;
    await client.query(`UPDATE managed_jobs SET status='canceled', updated_at=NOW()
      WHERE id=$1 AND source_recurring_service_id=$2 AND status='awaiting_contractor'
        AND assigned_contractor_user_id IS NULL`, [jobId, row.id]);
  }
}

export async function queueRecurringOccurrence(pool, { recurringServiceId, ownerUserId = null, expectedDate = null, horizon = null, asOf = calendarDate(new Date()) }) {
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM recurring_services WHERE id=$1 FOR UPDATE', [recurringServiceId])).rows[0];
    if (!row || (ownerUserId != null && Number(row.owner_user_id) !== Number(ownerUserId))) {
      result = { ok: false, message: 'Recurring service not found.' };
    } else {
      const meta = recurringMetadata(row);
      let nextDate = calendarDate(row.next_service_date);
      if (!expectedDate) {
        for (let i=0; i<52 && nextDate && nextDate<asOf && meta.queuedOccurrences?.[nextDate]; i++) {
          nextDate = addRecurrenceDays(nextDate, row.recurrence, row.start_date);
        }
        if (nextDate !== calendarDate(row.next_service_date)) {
          await client.query('UPDATE recurring_services SET next_service_date=$2, updated_at=NOW() WHERE id=$1', [row.id,nextDate]);
          row.next_service_date = nextDate;
        }
      }
      const date = expectedDate || nextDate;
      const previousJob = meta.queuedOccurrences?.[date];
      if (!['active','pricing_required'].includes(row.status)) result = { ok: false, message: 'Recurring service is not active.' };
      else if (previousJob) result = { ok: true, created: false, jobId: Number(previousJob), nextServiceDate: calendarDate(row.next_service_date) };
      else if (!date || (expectedDate && date !== calendarDate(row.next_service_date)) || (horizon && date > horizon)) result = { ok: false, message: 'The next occurrence is not due for coordination.' };
      else {
        const config = await getHomeCareConfig(pool);
        const offering = meta.offeringId ? offeringById(config, meta.offeringId) : null;
        const user = (await client.query('SELECT id, role FROM users WHERE id=$1', [row.owner_user_id])).rows[0];
        const property = (await client.query('SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2', [row.property_id, row.owner_user_id])).rows[0];
        const feature = row.service_type === 'recurring_landscaping' ? 'recurring_landscaping' : 'recurring_cleaning';
        const entitlement = user ? await getHomeCareEntitlement(pool, row.owner_user_id) : null;
        const gate = user ? await resolveFeatureEntitlement(pool, { user:{...user, homeCareSubscription:{isPro:Boolean(entitlement?.hasAccess)}}, feature }) : null;
        if (!property || !gate?.allowed || !isRecurringServiceTypeAllowed(config, row.service_type) || !isRecurrenceAllowed(config, row.recurrence) || (offering && (!offering.active || !offering.subscriptionEligible || !offering.frequencies.includes(row.recurrence)))) {
          result = { ok: false, message: 'Recurring service eligibility or property access is unavailable.' };
        } else {
          // First setup may already have queued this date for pricing. Reuse it.
          const existing = (await client.query(`SELECT id FROM managed_jobs WHERE source_recurring_service_id=$1 AND preferred_date=$2 ORDER BY id LIMIT 1`, [row.id, date])).rows[0];
          const label = meta.serviceName || (row.service_type === 'recurring_landscaping' ? 'Landscaping' : row.service_type === 'recurring_cleaning' ? 'Cleaning' : row.service_type.replace(/^recurring_/, '').replace(/_/g, ' '));
          const job = existing || (await client.query(`INSERT INTO managed_jobs
            (homeowner_user_id, property_id, job_mode, status, category, title, description, full_address, city_state_zip, preferred_date, preferred_time_slot, source_recurring_service_id)
            VALUES ($1,$2,'managed','awaiting_contractor',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [row.owner_user_id, row.property_id, meta.category || label, `Recurring: ${label}`.slice(0,180),
              `Upcoming recurring service: ${label}. Frequency: ${row.recurrence}. Requested date: ${date}. Admin coordination and contractor pricing required. No contractor assigned and no visit charge authorized. ${row.notes || ''}`.slice(0,2000),
              property.address_line1 || null, [property.city, property.state, property.zip].filter(Boolean).join(', '), date, row.preferred_time_window || null, row.id])).rows[0];
          meta.queuedOccurrences = { ...(meta.queuedOccurrences || {}), [date]: Number(job.id) };
          const nextDate = date; // Keep the queued upcoming occurrence visible for skip/reschedule.
          await client.query('UPDATE recurring_services SET metadata=$2, next_service_date=$3, updated_at=NOW() WHERE id=$1', [row.id, JSON.stringify(meta), nextDate]);
          result = { ok: true, created: !existing, jobId: Number(job.id), nextServiceDate: nextDate, recurringServiceId: Number(row.id), date };
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if (result.created) await notifyAdmins(pool, { type: 'recurring_service_upcoming', title: 'Upcoming recurring service', message: `Service requested for ${result.date}. Review pricing, coordinate a contractor and assign the visit.`, jobId: result.jobId, entityType: 'recurring_service', entityId: result.recurringServiceId, actionUrl: `/admin?job=${result.jobId}` }).catch(error => console.error('recurring admin notification:', error.message));
  return result;
}

export async function processUpcomingRecurringServices(pool, { asOf = new Date() } = {}) {
  const config = await getHomeCareConfig(pool);
  const horizonDate = new Date(asOf); horizonDate.setUTCDate(horizonDate.getUTCDate() + config.recurring.leadTimeDays);
  const horizon = calendarDate(horizonDate);
  const rows = (await pool.query(`SELECT id, recurrence FROM recurring_services WHERE status IN ('active','pricing_required') AND next_service_date <= $1 ORDER BY next_service_date, id LIMIT 50`, [horizon])).rows;
  const results = [];
  for (const row of rows) {
    results.push(await queueRecurringOccurrence(pool, { recurringServiceId: row.id, horizon, asOf:calendarDate(asOf) }));
  }
  return { considered: rows.length, created: results.filter(row => row.created).length, results, leadTimeDays: config.recurring.leadTimeDays };
}
