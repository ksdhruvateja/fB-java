import { createInAppNotification } from '../in-app-notifications.js';

/*
 * Maintenance reminders tied to a repair case. When a repair is finished (homeowner DIY marked
 * "fixed", or a professional completes the job) Fixera adds to the property's maintenance
 * calendar (properties.health_profile.maintenance):
 *   - a check that this repair is holding, and
 *   - the follow-up maintenance the assessment recommended for this specific issue.
 * Each item records the issue, the repair and why it matters, so the reminder is relevant.
 * Due items produce one in-app notification. Completing a recurring item schedules the next one.
 */

export const MAINTENANCE_SOURCE = 'FIXERA';
const MAX_ITEMS = 100;
const REMIND_DAYS_BEFORE = 3;

function parse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function addDays(isoDate, days) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

const SYSTEM_LABELS = {
  hvac: 'HVAC',
  water_heater: 'Plumbing',
  plumbing: 'Plumbing',
  roof: 'Roof',
  electrical: 'Electrical',
  appliance: 'Appliances',
  exterior: 'Exterior',
};

/**
 * Builds the maintenance items for a finished repair. Pure; exported for tests.
 * `source` is 'HOMEOWNER_DIY' or 'PROFESSIONAL'.
 */
export function buildFollowUpMaintenanceItems({ jobId, jobTitle, category, assessment, repairSummary, completedAt, source }) {
  const a = parse(assessment, {}) || {};
  const date = String(completedAt || new Date().toISOString()).slice(0, 10);
  const issue = String(a.summary || jobTitle || category || 'Repair').slice(0, 160);
  const repair = String(repairSummary || (source === 'PROFESSIONAL' ? 'Completed by a FixBridge professional' : 'Homeowner DIY repair')).slice(0, 160);
  const fallbackSystem = SYSTEM_LABELS[String(category || '').toLowerCase()] || (category ? String(category).slice(0, 40) : undefined);
  const items = [];

  items.push({
    id: `fixera-${jobId}-recheck`,
    label: `Check the ${String(jobTitle || category || 'repair').slice(0, 60)} repair is holding`,
    dueDate: addDays(date, source === 'PROFESSIONAL' ? 30 : 14),
    system: fallbackSystem,
    completed: false,
    skipped: false,
    source: MAINTENANCE_SOURCE,
    kind: 'repair_check',
    reason: source === 'PROFESSIONAL'
      ? 'Confirm the professional repair is still working; report problems while any workmanship warranty applies.'
      : 'A DIY repair can loosen or leak again in the first weeks. If the problem is back, request a professional.',
    relatedJobId: Number(jobId),
    issue,
    repair,
    recurrenceDays: null,
  });

  for (const m of Array.isArray(a.follow_up_maintenance) ? a.follow_up_maintenance.slice(0, 4) : []) {
    if (!m || !m.task || !Number.isFinite(Number(m.interval_days))) continue;
    const days = Math.max(7, Math.min(Number(m.interval_days), 3650));
    items.push({
      id: `fixera-${jobId}-${slug(m.task)}`,
      label: String(m.task).slice(0, 120),
      dueDate: addDays(date, days),
      system: SYSTEM_LABELS[m.system] || fallbackSystem,
      completed: false,
      skipped: false,
      source: MAINTENANCE_SOURCE,
      kind: 'preventive',
      reason: String(m.reason || `Helps prevent: ${issue}`).slice(0, 240),
      relatedJobId: Number(jobId),
      issue,
      repair,
      recurrenceDays: days,
    });
  }
  return items.filter((item) => item.dueDate);
}

/** Merges items into the calendar, replacing open items with the same id. */
export function mergeMaintenanceItems(existing, items) {
  const list = Array.isArray(existing) ? [...existing] : [];
  for (const item of items) {
    const idx = list.findIndex((m) => m && m.id === item.id);
    if (idx >= 0) {
      if (list[idx].completed || list[idx].skipped) continue;
      list[idx] = { ...list[idx], ...item, reminderSentAt: list[idx].reminderSentAt || null };
    } else {
      list.push(item);
    }
  }
  return list
    .sort((x, y) => String(x?.dueDate || '9999').localeCompare(String(y?.dueDate || '9999')))
    .slice(0, MAX_ITEMS);
}

export async function scheduleFollowUpMaintenance(pool, { job, assessment, repairSummary, completedAt, source }) {
  if (!job?.property_id) return [];
  const items = buildFollowUpMaintenanceItems({
    jobId: job.id,
    jobTitle: job.title,
    category: job.category,
    assessment: assessment ?? job.ai_assessment,
    repairSummary,
    completedAt,
    source,
  });
  if (!items.length) return [];
  const { rows } = await pool.query(`SELECT health_profile FROM properties WHERE id=$1`, [job.property_id]);
  if (!rows[0]) return [];
  const health = parse(rows[0].health_profile, {}) || {};
  health.maintenance = mergeMaintenanceItems(health.maintenance, items);
  await pool.query(`UPDATE properties SET health_profile=$1 WHERE id=$2`, [JSON.stringify(health), job.property_id]);
  return items;
}

/**
 * Sanitizes a homeowner's maintenance list (PUT /api/properties/:id/maintenance) while keeping
 * the Fixera fields of existing items. When a recurring Fixera item is newly completed, the next
 * occurrence is added.
 */
export function sanitizeMaintenanceUpdate(previous, items) {
  const priorList = (Array.isArray(previous) ? previous : []).filter((m) => m?.id);
  const before = new Map(priorList.map((m) => [m.id, m]));
  // Clients that drop unknown fields still send label and due date; match on those too.
  const byLabel = new Map(priorList.map((m) => [`${m.label}|${m.dueDate}`, m]));
  const out = items.filter((m) => m && typeof m === 'object').slice(0, MAX_ITEMS).map((m) => {
    const prior = (m.id ? before.get(String(m.id)) : null) || byLabel.get(`${String(m.label || '').slice(0, 120)}|${m.dueDate ? String(m.dueDate).slice(0, 20) : ''}`) || null;
    const base = {
      label: String(m.label || '').slice(0, 120),
      dueDate: m.dueDate ? String(m.dueDate).slice(0, 20) : '',
      system: m.system ? String(m.system).slice(0, 40) : undefined,
      // A client that omits these flags keeps the stored value instead of reopening the item.
      completed: m.completed === undefined && prior ? Boolean(prior.completed) : Boolean(m.completed),
      skipped: m.skipped === undefined && prior ? Boolean(prior.skipped) : Boolean(m.skipped),
    };
    if (!prior) return base;
    // Fixera metadata is server-owned: kept from the stored item, never taken from the client.
    return {
      ...base,
      id: prior.id,
      source: prior.source,
      kind: prior.kind,
      reason: prior.reason,
      relatedJobId: prior.relatedJobId,
      issue: prior.issue,
      repair: prior.repair,
      recurrenceDays: prior.recurrenceDays ?? null,
      reminderSentAt: prior.reminderSentAt || null,
      completedAt: base.completed ? prior.completedAt || new Date().toISOString() : null,
    };
  });
  const next = [];
  for (const m of out) {
    const prior = m.id ? before.get(m.id) : null;
    if (prior && m.completed && !prior.completed && m.recurrenceDays) {
      const from = new Date().toISOString().slice(0, 10);
      const nextId = `${String(m.id).replace(/~\d{4}-\d{2}-\d{2}$/, '')}~${addDays(from, m.recurrenceDays)}`;
      if (!out.some((x) => x.id === nextId)) {
        next.push({ ...m, id: nextId, dueDate: addDays(from, m.recurrenceDays), completed: false, skipped: false, reminderSentAt: null, completedAt: null });
      }
    }
  }
  return [...out, ...next].slice(0, MAX_ITEMS);
}

/** Sends one in-app reminder per Fixera maintenance item that is due within a few days. */
export async function processDueMaintenanceReminders(pool, { asOf = new Date(), maxProperties = 200 } = {}) {
  const today = asOf.toISOString().slice(0, 10);
  const horizon = addDays(today, REMIND_DAYS_BEFORE);
  const { rows } = await pool.query(
    `SELECT id, owner_user_id, health_profile FROM properties
      WHERE health_profile IS NOT NULL
        AND jsonb_typeof(health_profile->'maintenance') = 'array'
        AND health_profile->'maintenance' @> '[{"source":"FIXERA"}]'::jsonb
      ORDER BY id
      LIMIT $1`,
    [maxProperties]
  );
  let sent = 0;
  for (const row of rows) {
    const health = parse(row.health_profile, {}) || {};
    const list = Array.isArray(health.maintenance) ? health.maintenance : [];
    let changed = false;
    for (const item of list) {
      if (!item || item.source !== MAINTENANCE_SOURCE || item.completed || item.skipped || item.reminderSentAt) continue;
      if (!item.dueDate || item.dueDate > horizon) continue;
      const overdue = item.dueDate < today;
      const created = await createInAppNotification(pool, {
        userId: row.owner_user_id,
        userRole: 'homeowner',
        jobId: item.relatedJobId || null,
        type: 'maintenance_reminder',
        title: `${overdue ? 'Maintenance overdue' : 'Maintenance due'}: ${item.label}`,
        message: [item.reason, item.issue ? `Related repair: ${item.issue}` : ''].filter(Boolean).join(' '),
        entityType: 'property',
        entityId: row.id,
        metadata: { maintenanceId: item.id, dueDate: item.dueDate, relatedJobId: item.relatedJobId || null },
      });
      if (created) {
        item.reminderSentAt = new Date().toISOString();
        changed = true;
        sent += 1;
      }
    }
    if (changed) {
      await pool.query(`UPDATE properties SET health_profile=$1 WHERE id=$2`, [JSON.stringify({ ...health, maintenance: list }), row.id]);
    }
  }
  return { sent, propertiesChecked: rows.length };
}
