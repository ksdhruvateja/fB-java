import { recordDiySafetyEvent, listDiySafetyEvents } from './diy-safety-events.js';
import {
  classifyDiyRiskLevel,
  detectPromptInjection,
  isEmergencyHazard,
} from './diy-safety.js';

const FEEDBACK_RATINGS = new Set(['helpful', 'not_helpful', 'unsafe']);
const INCIDENT_TYPES = new Set([
  'safety_concern',
  'injury',
  'property_damage',
  'gas_event',
  'electrical_event',
  'fire_smoke',
  'water_damage',
  'biohazard',
  'other_serious',
]);

function clampString(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function registerDiySafetyRoutes(app, { pool, requireAuth, requireAdmin, requirePermission }) {
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  app.post('/api/homeowner/diy-safety/feedback', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const rating = clampString(req.body?.rating, 40).toLowerCase();
      if (!FEEDBACK_RATINGS.has(rating)) {
        return res.status(400).json({ ok: false, message: 'Invalid feedback rating.' });
      }
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      if (jobId != null && Number.isFinite(jobId)) {
        const { rows } = await pool.query(
          `SELECT homeowner_user_id, diy_risk_level FROM managed_jobs WHERE id=$1`,
          [jobId]
        );
        if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
        if (
          req.authUser.role !== 'admin' &&
          Number(rows[0].homeowner_user_id) !== Number(req.authUser.id)
        ) {
          return res.status(403).json({ ok: false, message: 'Not allowed.' });
        }
      }
      const eventType = rating === 'unsafe' ? 'unsafe_feedback' : 'ai_feedback';
      const row = await recordDiySafetyEvent(pool, {
        userId: req.authUser.id,
        jobId: Number.isFinite(jobId) ? jobId : null,
        eventType,
        feedbackRating: rating,
        riskLevel: req.body?.riskLevel || null,
        description: req.body?.message || null,
        metadata: {
          messageIndex: req.body?.messageIndex ?? null,
          chatExcerpt: clampString(req.body?.chatExcerpt, 500) || null,
        },
        req,
      });
      if (rating === 'unsafe' && Number.isFinite(jobId)) {
        await pool.query(
          `UPDATE managed_jobs SET diy_risk_level='yellow', updated_at=NOW() WHERE id=$1`,
          [jobId]
        );
      }
      return res.json({ ok: true, eventId: Number(row.id), createdAt: row.created_at });
    } catch (e) {
      console.error('diy safety feedback:', e);
      return res.status(500).json({ ok: false, message: 'Could not save feedback.' });
    }
  });

  app.post('/api/homeowner/diy-safety/stop', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      if (!Number.isFinite(jobId)) {
        return res.status(400).json({ ok: false, message: 'jobId is required.' });
      }
      const { rows } = await pool.query(
        `SELECT homeowner_user_id, diy_risk_level FROM managed_jobs WHERE id=$1`,
        [jobId]
      );
      const job = rows[0];
      if (!job) return res.status(404).json({ ok: false, message: 'Job not found.' });
      if (req.authUser.role !== 'admin' && Number(job.homeowner_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      await recordDiySafetyEvent(pool, {
        userId: req.authUser.id,
        jobId,
        eventType: 'professional_escalation',
        previousRiskLevel: job.diy_risk_level,
        riskLevel: 'yellow',
        riskReasonCodes: ['USER_STOP'],
        metadata: { source: 'stop_diy_button' },
        req,
      });
      return res.json({ ok: true, message: 'Professional escalation recorded.' });
    } catch (e) {
      console.error('diy safety stop:', e);
      return res.status(500).json({ ok: false, message: 'Could not record stop action.' });
    }
  });

  app.post('/api/homeowner/diy-safety/incident', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const incidentType = clampString(req.body?.incidentType, 60).toLowerCase();
      if (!INCIDENT_TYPES.has(incidentType)) {
        return res.status(400).json({ ok: false, message: 'Invalid incident type.' });
      }
      const description = clampString(req.body?.description, 4000);
      if (!description) {
        return res.status(400).json({ ok: false, message: 'Description is required.' });
      }
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      if (jobId != null && Number.isFinite(jobId)) {
        const { rows } = await pool.query(
          `SELECT homeowner_user_id FROM managed_jobs WHERE id=$1`,
          [jobId]
        );
        if (!rows[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
        if (
          req.authUser.role !== 'admin' &&
          Number(rows[0].homeowner_user_id) !== Number(req.authUser.id)
        ) {
          return res.status(403).json({ ok: false, message: 'Not allowed.' });
        }
      }
      const row = await recordDiySafetyEvent(pool, {
        userId: req.authUser.id,
        jobId: Number.isFinite(jobId) ? jobId : null,
        eventType: 'incident_report',
        incidentType,
        description,
        metadata: { status: 'open' },
        req,
      });
      return res.json({ ok: true, eventId: Number(row.id), createdAt: row.created_at });
    } catch (e) {
      console.error('diy safety incident:', e);
      return res.status(500).json({ ok: false, message: 'Could not submit incident report.' });
    }
  });

  app.get('/api/admin/diy-safety/events', requireAuth, requireAdmin, need('homeowners.view'), async (req, res) => {
    try {
      const userId = req.query.userId != null ? Number(req.query.userId) : null;
      const jobId = req.query.jobId != null ? Number(req.query.jobId) : null;
      const priority = req.query.priority === 'true';
      const eventTypes = priority
        ? ['unsafe_feedback', 'incident_report', 'prompt_injection_blocked', 'risk_escalation']
        : null;
      const rows = await listDiySafetyEvents(pool, {
        userId: Number.isFinite(userId) ? userId : null,
        jobId: Number.isFinite(jobId) ? jobId : null,
        eventTypes,
        limit: Number(req.query.limit) || 100,
      });
      return res.json({
        ok: true,
        events: rows.map((r) => ({
          id: Number(r.id),
          userId: Number(r.user_id),
          jobId: r.job_id != null ? Number(r.job_id) : null,
          eventType: r.event_type,
          riskLevel: r.risk_level,
          previousRiskLevel: r.previous_risk_level,
          riskReasonCodes:
            typeof r.risk_reason_codes === 'string'
              ? JSON.parse(r.risk_reason_codes)
              : r.risk_reason_codes,
          feedbackRating: r.feedback_rating,
          incidentType: r.incident_type,
          description: r.description,
          metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      console.error('admin diy safety events:', e);
      return res.status(500).json({ ok: false, message: 'Could not load safety events.' });
    }
  });
}

export { classifyDiyRiskLevel, detectPromptInjection, isEmergencyHazard };
