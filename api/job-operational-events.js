/**
 * Job operational event hooks for dispatch, technician assignment, and milestones.
 */
import { createInAppNotification } from './in-app-notifications.js';

export const JOB_OPERATIONAL_EVENT_TYPES = [
  'contractor_assigned',
  'technician_assigned',
  'contractor_dispatched',
  'job_started',
  'job_completed',
];

export async function recordJobOperationalEvent(pool, {
  jobId,
  eventType,
  contractorUserId = null,
  employeeId = null,
  actorUserId = null,
  detail = {},
}) {
  if (!jobId || !eventType) return null;
  const { rows } = await pool.query(
    `INSERT INTO job_operational_events
       (job_id, event_type, contractor_user_id, employee_id, actor_user_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      jobId,
      eventType,
      contractorUserId,
      employeeId,
      actorUserId,
      JSON.stringify(detail || {}),
    ]
  );
  const recorded = rows[0] || null;
  try {
    await notifyOperationalEvent(pool, {
      jobId,
      eventType,
      contractorUserId,
      employeeId,
      detail,
    });
  } catch {
    /* non-fatal */
  }
  return recorded;
}

async function notifyOperationalEvent(pool, { jobId, eventType, contractorUserId, employeeId, detail }) {
  const { rows: jobs } = await pool.query(
    `SELECT id, homeowner_user_id, assigned_contractor_user_id, title, booking_id FROM managed_jobs WHERE id=$1`,
    [jobId],
  );
  const job = jobs[0];
  if (!job) return;
  const homeownerId = Number(job.homeowner_user_id);
  const contractorId = Number(contractorUserId || job.assigned_contractor_user_id || 0);
  const employeeName = detail?.employeeName || detail?.technicianName || null;
  const companyName = detail?.companyName || null;
  const booking = job.booking_id || `FB-${jobId}`;

  const homeownerCopy = {
    contractor_assigned: {
      type: 'contractor_assigned',
      title: 'Contractor assigned',
      message: companyName
        ? `${companyName} has been assigned to ${booking}.`
        : `A contractor has been assigned to ${booking}.`,
      focus: 'tracking',
    },
    technician_assigned: {
      type: 'technician_assigned',
      title: 'Technician assigned',
      message: employeeName
        ? `${employeeName} is assigned to your visit for ${booking}.`
        : `A technician has been assigned to ${booking}.`,
      focus: 'tracking',
    },
    contractor_dispatched: {
      type: 'contractor_dispatched',
      title: 'Contractor dispatched',
      message: `Your professional is on the way for ${booking}.`,
      focus: 'tracking',
    },
    technician_arrived: {
      type: 'technician_arrived',
      title: 'Technician arrived',
      message: employeeName ? `${employeeName} has arrived on site.` : `Your technician has arrived for ${booking}.`,
      focus: 'tracking',
    },
    job_started: {
      type: 'job_started',
      title: 'Work started',
      message: `Work has started on ${booking}.`,
      focus: 'tracking',
    },
    job_completed: {
      type: 'job_completed',
      title: 'Job completed',
      message: `${job.title || 'Your service'} is complete — review and confirm when ready.`,
      focus: 'completion',
    },
  }[eventType];

  if (homeownerCopy && homeownerId) {
    await createInAppNotification(pool, {
      userId: homeownerId,
      userRole: 'homeowner',
      jobId,
      type: homeownerCopy.type,
      title: homeownerCopy.title,
      message: homeownerCopy.message,
      entityType: 'job',
      entityId: jobId,
      metadata: { focus: homeownerCopy.focus, employeeId, contractorUserId: contractorId || null },
    });
  }

  if (contractorId && ['contractor_assigned', 'technician_assigned', 'contractor_dispatched'].includes(eventType)) {
    await createInAppNotification(pool, {
      userId: contractorId,
      userRole: 'contractor',
      jobId,
      type: eventType === 'contractor_assigned' ? 'job_assigned' : eventType,
      title: eventType === 'contractor_assigned' ? 'Job assigned' : homeownerCopy?.title || 'Job update',
      message:
        eventType === 'contractor_assigned'
          ? `You have been assigned ${booking}.`
          : homeownerCopy?.message || `Update on ${booking}.`,
      entityType: 'job',
      entityId: jobId,
    });
  }
}

export async function loadJobTimeline(pool, jobId) {
  const { rows: statusRows } = await pool.query(
    `SELECT h.*, u.name AS actor_name
     FROM job_status_history h
     LEFT JOIN users u ON u.id = h.actor_user_id
     WHERE h.job_id=$1
     ORDER BY h.created_at ASC`,
    [jobId]
  );
  const { rows: opRows } = await pool.query(
    `SELECT e.*, u.name AS actor_name,
            emp.full_name AS employee_name
     FROM job_operational_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     LEFT JOIN contractor_employees emp ON emp.id = e.employee_id
     WHERE e.job_id=$1
     ORDER BY e.created_at ASC`,
    [jobId]
  );
  const events = [
    ...statusRows.map((r) => ({
      kind: 'status',
      at: r.created_at,
      label: r.note || r.to_status,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      actorName: r.actor_name || null,
      actorUserId: r.actor_user_id,
    })),
    ...opRows.map((r) => ({
      kind: 'operational',
      at: r.created_at,
      eventType: r.event_type,
      label: operationalEventLabel(r.event_type, r.employee_name, r.detail),
      contractorUserId: r.contractor_user_id,
      employeeId: r.employee_id,
      employeeName: r.employee_name || null,
      actorName: r.actor_name || null,
      actorUserId: r.actor_user_id,
      detail: typeof r.detail === 'object' ? r.detail : null,
    })),
  ];
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

function operationalEventLabel(eventType, employeeName, detail) {
  const parsed = detail && typeof detail === 'object' ? detail : {};
  switch (eventType) {
    case 'contractor_assigned':
      return parsed.companyName ? `${parsed.companyName} assigned` : 'Contractor assigned';
    case 'technician_assigned':
      return employeeName ? `${employeeName} selected as technician` : 'Technician assigned';
    case 'technician_arrived':
      return employeeName ? `${employeeName} arrived on site` : 'Technician arrived';
    case 'contractor_dispatched':
      return employeeName ? `${employeeName} dispatched` : 'Contractor dispatched';
    case 'job_started':
      return employeeName ? `Work started — ${employeeName}` : 'Job started';
    case 'job_completed':
      return employeeName ? `Job completed — ${employeeName}` : 'Job completed';
    default:
      return String(eventType || 'Event').replace(/_/g, ' ');
  }
}

export function homeownerStatusLabel(jobStatus, hasTechnician = false) {
  const s = String(jobStatus || '').toLowerCase();
  if (['work_completed', 'customer_review_pending', 'payout_pending', 'paid_out', 'closed'].includes(s)) {
    return 'Service completed';
  }
  if (s === 'work_started' || s === 'change_order_pending') return 'Work in progress';
  if (s === 'contractor_en_route') return 'On the way';
  if (['scheduled', 'approved', 'contractor_accepted', 'awaiting_bid', 'bid_received'].includes(s) && hasTechnician) {
    return 'Professional assigned';
  }
  if (['contractor_invited', 'contractor_accepted', 'scheduled', 'approved'].includes(s)) {
    return 'Professional assigned';
  }
  return 'Request received';
}
