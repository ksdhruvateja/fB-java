/**
 * Unified property timeline — references existing records, no duplicate history store.
 */
import { assertPropertyAccess } from './property-access.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function eventSortKey(ev) {
  return new Date(ev.occurredAt || ev.date || 0).getTime();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isFutureDate(iso) {
  if (!iso) return false;
  return String(iso).slice(0, 10) >= todayIso();
}

function isPastDate(iso) {
  if (!iso) return false;
  return String(iso).slice(0, 10) < todayIso();
}

const COMPLETE_STATUSES = new Set(['completed', 'closed', 'work_completed', 'paid_out', 'payout_pending']);
const CANCEL_STATUSES = new Set(['canceled', 'cancelled']);
const ACTIVE_JOB_STATUSES = new Set([
  'draft',
  'awaiting_bid',
  'contractor_accepted',
  'diagnosing',
  'approved',
  'scheduled',
  'contractor_en_route',
  'work_started',
  'change_order_pending',
  'customer_review_pending',
]);

/**
 * @returns {Promise<{ upcoming: object[], recent: object[] } | null>}
 */
export async function buildPropertyTimeline(pool, propertyId, userId, { limit = 80 } = {}) {
  const access = await assertPropertyAccess(pool, propertyId, userId);
  if (!access) return null;

  const ownerId = Number(access.owner_user_id);
  const upcoming = [];
  const recent = [];

  const { rows: jobs } = await pool.query(
    `SELECT j.id, j.booking_id, j.title, j.category, j.status, j.created_at, j.updated_at,
            j.preferred_date, j.preferred_time_slot, j.source_recurring_service_id,
            j.customer_retail_estimate_high, j.assigned_contractor_user_id, j.completion_report,
            u.name AS contractor_name, u.company_name AS contractor_company
     FROM managed_jobs j
     LEFT JOIN users u ON u.id = j.assigned_contractor_user_id
     WHERE j.property_id = $1 AND j.homeowner_user_id = $2
     ORDER BY j.created_at DESC LIMIT 60`,
    [propertyId, ownerId]
  );

  for (const j of jobs) {
    const report = parseJson(j.completion_report, {}) || {};
    const amount =
      j.customer_retail_estimate_high != null ? Number(j.customer_retail_estimate_high) : null;
    const contractor = j.contractor_company || j.contractor_name || null;
    const status = String(j.status).toLowerCase();
    const isComplete = COMPLETE_STATUSES.has(status);
    const isCancelled = CANCEL_STATUSES.has(status);
    const visitDate = j.preferred_date ? String(j.preferred_date).slice(0, 10) : null;

    const base = {
      id: `job-${j.id}`,
      title: j.title || j.category || 'Service request',
      subtitle: contractor,
      amount,
      status: j.status,
      relatedJobId: Number(j.id),
      bookingId: j.booking_id,
      category: j.category,
      beforePhotoUrl: report.beforePhotoUrl || null,
      afterPhotoUrl: report.afterPhotoUrl || null,
      summary: report.summary || null,
      preferredTimeWindow: j.preferred_time_slot || null,
      fromRecurring: j.source_recurring_service_id != null,
    };

    if (isCancelled) {
      recent.push({
        ...base,
        type: 'service_cancelled',
        occurredAt: j.updated_at || j.created_at,
        section: 'recent',
      });
    } else if (!isComplete && visitDate && isFutureDate(visitDate)) {
      const confirmed = ['scheduled', 'approved', 'contractor_en_route', 'work_started'].includes(status);
      upcoming.push({
        ...base,
        type: j.source_recurring_service_id
          ? confirmed
            ? 'recurring_visit_scheduled'
            : 'recurring_visit_requested'
          : confirmed
            ? 'scheduled_service_confirmed'
            : 'scheduled_service',
        occurredAt: `${visitDate}T09:00:00.000Z`,
        section: 'upcoming',
      });
    } else if (!isComplete && !visitDate && ACTIVE_JOB_STATUSES.has(status)) {
      upcoming.push({
        ...base,
        type: 'service_requested',
        occurredAt: j.created_at,
        section: 'upcoming',
      });
    } else {
      recent.push({
        ...base,
        type: isComplete ? 'service_completed' : 'service_request',
        occurredAt: isComplete ? report.completedAt || j.updated_at || j.created_at : j.created_at,
        section: 'recent',
      });
    }
  }

  const { rows: recurring } = await pool.query(
    `SELECT * FROM recurring_services WHERE property_id=$1 AND owner_user_id=$2 ORDER BY next_service_date ASC NULLS LAST`,
    [propertyId, ownerId]
  );

  const activeRecurringJobIds = new Set(
    jobs
      .filter((j) => {
        if (!j.source_recurring_service_id) return false;
        const st = String(j.status).toLowerCase();
        if (COMPLETE_STATUSES.has(st) || CANCEL_STATUSES.has(st)) return false;
        const visitDate = j.preferred_date ? String(j.preferred_date).slice(0, 10) : null;
        return !visitDate || isFutureDate(visitDate) || ACTIVE_JOB_STATUSES.has(st);
      })
      .map((j) => Number(j.source_recurring_service_id))
  );

  for (const r of recurring) {
    const meta = parseJson(r.metadata, {}) || {};
    const skipped = Array.isArray(meta.skippedDates) ? meta.skippedDates : [];
    for (const sd of skipped) {
      recent.push({
        id: `recurring-skip-${r.id}-${sd}`,
        type: 'recurring_skipped',
        occurredAt: `${sd}T12:00:00.000Z`,
        title: `Skipped ${r.service_type === 'recurring_landscaping' ? 'landscaping' : 'cleaning'}`,
        status: 'skipped',
        relatedRecurringId: Number(r.id),
        section: 'recent',
      });
    }
    if (r.status === 'active' && r.next_service_date && !activeRecurringJobIds.has(Number(r.id))) {
      upcoming.push({
        id: `recurring-plan-${r.id}`,
        type: 'recurring_plan',
        occurredAt: `${String(r.next_service_date).slice(0, 10)}T09:00:00.000Z`,
        title:
          r.service_type === 'recurring_landscaping'
            ? 'Recurring landscaping plan'
            : 'Recurring cleaning plan',
        subtitle: `${r.recurrence} — request next visit to schedule`,
        status: 'plan_active',
        relatedRecurringId: Number(r.id),
        preferredTimeWindow: r.preferred_time_window,
        section: 'upcoming',
      });
    }
  }

  const { rows: props } = await pool.query(`SELECT health_profile FROM properties WHERE id=$1`, [propertyId]);
  const health = parseJson(props[0]?.health_profile, {}) || {};
  const seenJobIds = new Set(jobs.map((j) => Number(j.id)));

  for (const m of (health.maintenance || []).slice(0, 20)) {
    if (!m || m.completed) continue;
    const due = m.dueDate ? String(m.dueDate).slice(0, 10) : null;
    if (due && isFutureDate(due)) {
      upcoming.push({
        id: `maint-${m.label}-${due}`,
        type: 'maintenance_due',
        occurredAt: `${due}T12:00:00.000Z`,
        title: m.label || 'Maintenance',
        subtitle: m.system || 'Upkeep',
        status: 'due',
        section: 'upcoming',
      });
    } else if (due && isPastDate(due)) {
      upcoming.push({
        id: `maint-overdue-${m.label}-${due}`,
        type: 'maintenance_overdue',
        occurredAt: `${due}T12:00:00.000Z`,
        title: m.label || 'Maintenance',
        subtitle: 'Overdue',
        status: 'overdue',
        section: 'upcoming',
      });
    }
  }

  for (const ps of (health.previousServices || []).slice(0, 30)) {
    if (ps.relatedJobId && seenJobIds.has(Number(ps.relatedJobId))) continue;
    recent.push({
      id: `history-${ps.id || ps.date}`,
      type: 'service_history',
      occurredAt: ps.date ? `${ps.date}T12:00:00.000Z` : null,
      title: ps.title || ps.system || 'Service',
      subtitle: ps.notes || null,
      status: 'completed',
      section: 'recent',
    });
  }

  try {
    const { rows: docs } = await pool.query(
      `SELECT id, title, category, created_at FROM property_documents
       WHERE property_id=$1 AND owner_user_id=$2 ORDER BY created_at DESC LIMIT 20`,
      [propertyId, ownerId]
    );
    for (const d of docs) {
      recent.push({
        id: `doc-${d.id}`,
        type: 'document',
        occurredAt: d.created_at,
        title: d.title || d.category || 'Document',
        category: d.category,
        relatedDocumentId: Number(d.id),
        section: 'recent',
      });
    }
  } catch {
    /* optional */
  }

  try {
    const { rows: reports } = await pool.query(
      `SELECT id, generated_at FROM home_health_reports
       WHERE property_id=$1 AND owner_user_id=$2 ORDER BY generated_at DESC LIMIT 5`,
      [propertyId, ownerId]
    );
    for (const hr of reports) {
      recent.push({
        id: `report-${hr.id}`,
        type: 'home_health_report',
        occurredAt: hr.generated_at,
        title: 'Annual Home Health Report',
        status: 'completed',
        section: 'recent',
      });
    }
  } catch {
    /* optional */
  }

  upcoming.sort((a, b) => eventSortKey(a) - eventSortKey(b));
  recent.sort((a, b) => eventSortKey(b) - eventSortKey(a));

  const half = Math.ceil(limit / 2);
  return {
    upcoming: upcoming.slice(0, half),
    recent: recent.slice(0, half),
    events: [...upcoming.slice(0, half), ...recent.slice(0, half)],
  };
}
