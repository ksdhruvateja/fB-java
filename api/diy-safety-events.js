/**
 * DIY safety audit events — feedback, escalations, incidents (append-only).
 */

function requestMeta(req) {
  return {
    ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.socket?.remoteAddress || null,
    userAgent: req?.headers?.['user-agent'] || null,
    sourceRoute: req?.originalUrl || req?.url || null,
  };
}

export async function recordDiySafetyEvent(pool, {
  userId,
  jobId = null,
  eventType,
  riskLevel = null,
  previousRiskLevel = null,
  riskReasonCodes = null,
  feedbackRating = null,
  incidentType = null,
  description = null,
  metadata = null,
  req = null,
}) {
  const meta = req ? requestMeta(req) : {};
  const { rows } = await pool.query(
    `INSERT INTO diy_safety_events (
       user_id, job_id, event_type, risk_level, previous_risk_level,
       risk_reason_codes, feedback_rating, incident_type, description,
       metadata, ip_address, user_agent, source_route
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, created_at`,
    [
      userId,
      jobId,
      eventType,
      riskLevel,
      previousRiskLevel,
      riskReasonCodes ? JSON.stringify(riskReasonCodes) : null,
      feedbackRating,
      incidentType,
      description ? String(description).slice(0, 4000) : null,
      metadata ? JSON.stringify(metadata) : null,
      meta.ipAddress || null,
      meta.userAgent || null,
      meta.sourceRoute || null,
    ]
  );
  return rows[0];
}

export async function listDiySafetyEvents(pool, { userId = null, jobId = null, limit = 100, eventTypes = null } = {}) {
  const params = [];
  const clauses = [];
  if (userId != null) {
    params.push(userId);
    clauses.push(`user_id=$${params.length}`);
  }
  if (jobId != null) {
    params.push(jobId);
    clauses.push(`job_id=$${params.length}`);
  }
  if (Array.isArray(eventTypes) && eventTypes.length) {
    params.push(eventTypes);
    clauses.push(`event_type = ANY($${params.length})`);
  }
  params.push(Math.min(limit, 500));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM diy_safety_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}
