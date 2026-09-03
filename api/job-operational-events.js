/**
 * Job operational event hooks for dispatch, technician assignment, and milestones.
 * Notification wiring can subscribe to these records later.
 */

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
  return rows[0] || null;
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
