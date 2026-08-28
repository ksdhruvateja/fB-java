import crypto from 'crypto';
import { isPaidHomeCarePlan } from './subscription-catalog.js';
import {
  createRequireHomeCareFeature,
  entitlementDeniedPayload,
  getHomeCareConfig,
  isRecurrenceAllowed,
  isRecurringServiceTypeAllowed,
  reportEligibilityMs,
  resolveFeatureEntitlement,
} from './homecare-config.js';
import { buildPropertyAIContext, sanitizeQuoteForSecondOpinion } from './property-ai-context.js';
import { chatWithCustomer } from './ai.js';

function addRecurrenceDays(dateStr, recurrence) {
  const d = new Date(dateStr || Date.now());
  if (Number.isNaN(d.getTime())) return null;
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'biweekly') d.setDate(d.getDate() + 14);
  else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function serializeRecurring(row) {
  return {
    id: Number(row.id),
    propertyId: Number(row.property_id),
    serviceType: row.service_type,
    recurrence: row.recurrence,
    preferredDay: row.preferred_day || null,
    preferredTimeWindow: row.preferred_time_window || null,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    status: row.status,
    nextServiceDate: row.next_service_date ? String(row.next_service_date).slice(0, 10) : null,
    assignedContractorUserId: row.assigned_contractor_user_id != null ? Number(row.assigned_contractor_user_id) : null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertPropertyOwner(pool, propertyId, userId) {
  const { rows } = await pool.query(`SELECT id FROM properties WHERE id=$1 AND owner_user_id=$2`, [
    propertyId,
    userId,
  ]);
  return Boolean(rows[0]);
}

export function registerHomeCareProRoutes(app, { pool, requireAuth, requireAdmin }) {
  const requireHomeCareFeature = createRequireHomeCareFeature(pool);
  // ── Recurring services ───────────────────────────────────────────────────
  app.get('/api/recurring-services', requireAuth, async (req, res) => {
    try {
      const gate = await resolveFeatureEntitlement(pool, {
        user: req.authUser,
        feature: 'recurring_cleaning',
      });
      if (!gate.allowed) {
        return res.status(403).json(entitlementDeniedPayload(gate));
      }
      const { rows } = await pool.query(
        `SELECT rs.* FROM recurring_services rs
         JOIN properties p ON p.id = rs.property_id
         WHERE p.owner_user_id = $1
         ORDER BY rs.next_service_date ASC NULLS LAST, rs.created_at DESC`,
        [req.authUser.id]
      );
      res.json({ ok: true, services: rows.map(serializeRecurring) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load recurring services.' });
    }
  });

  app.post('/api/recurring-services', requireAuth, requireHomeCareFeature('recurring_cleaning'), async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      const b = req.body || {};
      const propertyId = Number(b.propertyId);
      const serviceType = String(b.serviceType || '').trim();
      const recurrence = String(b.recurrence || '').trim();
      if (!propertyId || !isRecurringServiceTypeAllowed(config, serviceType) || !isRecurrenceAllowed(config, recurrence)) {
        return res.status(400).json({ ok: false, message: 'Invalid recurring service request.' });
      }
      if (!(await assertPropertyOwner(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const startDate = b.startDate || new Date().toISOString().slice(0, 10);
      const nextServiceDate = addRecurrenceDays(startDate, recurrence);
      const { rows } = await pool.query(
        `INSERT INTO recurring_services
          (owner_user_id, property_id, service_type, recurrence, preferred_day, preferred_time_window,
           start_date, status, next_service_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)
         RETURNING *`,
        [
          req.authUser.id,
          propertyId,
          serviceType,
          recurrence,
          b.preferredDay ? String(b.preferredDay).slice(0, 40) : null,
          b.preferredTimeWindow ? String(b.preferredTimeWindow).slice(0, 40) : null,
          startDate,
          startDate,
          b.notes ? String(b.notes).slice(0, 500) : null,
        ]
      );
      res.json({ ok: true, service: serializeRecurring(rows[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not create recurring service.' });
    }
  });

  app.patch('/api/recurring-services/:id', requireAuth, requireHomeCareFeature('recurring_cleaning'), async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      const id = Number(req.params.id);
      const b = req.body || {};
      const { rows: existing } = await pool.query(
        `SELECT * FROM recurring_services WHERE id=$1 AND owner_user_id=$2`,
        [id, req.authUser.id]
      );
      if (!existing[0]) return res.status(404).json({ ok: false, message: 'Recurring service not found.' });
      const status = b.status != null ? String(b.status) : existing[0].status;
      if (!['active', 'paused', 'cancelled'].includes(status)) {
        return res.status(400).json({ ok: false, message: 'Invalid status.' });
      }
      const recurrence = b.recurrence ? String(b.recurrence) : existing[0].recurrence;
      if (b.recurrence && !isRecurrenceAllowed(config, recurrence)) {
        return res.status(400).json({ ok: false, message: 'Invalid recurrence.' });
      }
      const { rows } = await pool.query(
        `UPDATE recurring_services SET
           recurrence=COALESCE($3, recurrence),
           preferred_day=COALESCE($4, preferred_day),
           preferred_time_window=COALESCE($5, preferred_time_window),
           status=$6,
           notes=COALESCE($7, notes),
           next_service_date=COALESCE($8, next_service_date),
           updated_at=NOW()
         WHERE id=$1 AND owner_user_id=$2
         RETURNING *`,
        [
          id,
          req.authUser.id,
          b.recurrence || null,
          b.preferredDay != null ? String(b.preferredDay).slice(0, 40) : null,
          b.preferredTimeWindow != null ? String(b.preferredTimeWindow).slice(0, 40) : null,
          status,
          b.notes != null ? String(b.notes).slice(0, 500) : null,
          b.nextServiceDate || null,
        ]
      );
      res.json({ ok: true, service: serializeRecurring(rows[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not update recurring service.' });
    }
  });

  // ── Maintenance items (health_profile.maintenance) ───────────────────────
  app.put('/api/properties/:id/maintenance', requireAuth, requireHomeCareFeature('maintenance_calendar'), async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const items = Array.isArray(req.body?.maintenance) ? req.body.maintenance : null;
      if (!items) return res.status(400).json({ ok: false, message: 'maintenance array required.' });
      const { rows } = await pool.query(`SELECT * FROM properties WHERE id=$1 AND owner_user_id=$2`, [
        propertyId,
        req.authUser.id,
      ]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Property not found.' });
      const health = (() => {
        try {
          return typeof rows[0].health_profile === 'string'
            ? JSON.parse(rows[0].health_profile)
            : rows[0].health_profile || {};
        } catch {
          return {};
        }
      })();
      const sanitized = items.slice(0, 100).map((m) => ({
        label: String(m.label || '').slice(0, 120),
        dueDate: m.dueDate ? String(m.dueDate).slice(0, 20) : '',
        system: m.system ? String(m.system).slice(0, 40) : undefined,
        completed: Boolean(m.completed),
        skipped: Boolean(m.skipped),
      }));
      health.maintenance = sanitized;
      await pool.query(`UPDATE properties SET health_profile=$1 WHERE id=$2`, [
        JSON.stringify(health),
        propertyId,
      ]);
      res.json({ ok: true, maintenance: sanitized });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not save maintenance.' });
    }
  });

  // ── Household sharing ────────────────────────────────────────────────────
  app.get('/api/household/:propertyId', requireAuth, requireHomeCareFeature('household_sharing'), async (req, res) => {
    try {
      const propertyId = Number(req.params.propertyId);
      if (!(await assertPropertyOwner(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows: members } = await pool.query(
        `SELECT hm.*, u.name, u.email FROM household_memberships hm
         JOIN users u ON u.id = hm.user_id
         WHERE hm.property_id=$1 ORDER BY hm.created_at ASC`,
        [propertyId]
      );
      const { rows: invites } = await pool.query(
        `SELECT id, invite_email, permission_level, status, expires_at, created_at
         FROM household_invitations
         WHERE property_id=$1 AND owner_user_id=$2 AND status='pending'
         ORDER BY created_at DESC`,
        [propertyId, req.authUser.id]
      );
      res.json({
        ok: true,
        members: members.map((m) => ({
          id: Number(m.id),
          userId: Number(m.user_id),
          name: m.name,
          email: m.email,
          role: m.role,
          createdAt: m.created_at,
        })),
        invitations: invites.map((i) => ({
          id: Number(i.id),
          email: i.invite_email,
          role: i.permission_level,
          status: i.status,
          expiresAt: i.expires_at,
          createdAt: i.created_at,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load household.' });
    }
  });

  app.post('/api/household/:propertyId/invite', requireAuth, requireHomeCareFeature('household_sharing'), async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      const propertyId = Number(req.params.propertyId);
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      const role = String(req.body?.role || 'viewer').trim();
      const allowedRoles = Object.entries(config.household.roles || {})
        .filter(([, on]) => on)
        .map(([r]) => r);
      if (!email || !allowedRoles.includes(role)) {
        return res.status(400).json({ ok: false, message: 'Valid email and role required.' });
      }
      if (!(await assertPropertyOwner(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows: memberCount } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM household_memberships WHERE property_id=$1`,
        [propertyId]
      );
      const { rows: pendingCount } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM household_invitations
         WHERE property_id=$1 AND owner_user_id=$2 AND status='pending'`,
        [propertyId, req.authUser.id]
      );
      const total = (memberCount[0]?.n || 0) + (pendingCount[0]?.n || 0);
      if (total >= config.household.maxMembersPerProperty) {
        return res.status(409).json({
          ok: false,
          message: `Household limit reached (${config.household.maxMembersPerProperty} members).`,
        });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(
        Date.now() + config.household.inviteExpirationDays * 24 * 60 * 60 * 1000
      );
      const { rows } = await pool.query(
        `INSERT INTO household_invitations
          (property_id, owner_user_id, invite_email, permission_level, token, expires_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [propertyId, req.authUser.id, email, role, token, expiresAt]
      );
      if (!rows[0]) {
        return res.status(409).json({ ok: false, message: 'Invitation already pending for this email.' });
      }
      res.json({
        ok: true,
        invitation: {
          id: Number(rows[0].id),
          email: rows[0].invite_email,
          role: rows[0].permission_level,
          expiresAt: rows[0].expires_at,
          acceptPath: `/household/accept?token=${token}`,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not send invitation.' });
    }
  });

  app.post('/api/household/accept', requireAuth, async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim();
      if (!token) return res.status(400).json({ ok: false, message: 'Token required.' });
      const { rows } = await pool.query(
        `SELECT * FROM household_invitations WHERE token=$1 AND status='pending'`,
        [token]
      );
      const invite = rows[0];
      if (!invite) return res.status(404).json({ ok: false, message: 'Invitation not found.' });
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        await pool.query(`UPDATE household_invitations SET status='expired' WHERE id=$1`, [invite.id]);
        return res.status(410).json({ ok: false, message: 'Invitation expired.' });
      }
      const ownerPlan = await pool.query(`SELECT plan_code FROM users WHERE id=$1`, [invite.owner_user_id]);
      if (!isPaidHomeCarePlan(ownerPlan.rows[0]?.plan_code)) {
        return res.status(403).json({
          ok: false,
          code: 'PRO_SUBSCRIPTION_REQUIRED',
          feature: 'household_sharing',
          message: 'Property owner no longer has HomeCare Pro.',
        });
      }
      await pool.query(
        `INSERT INTO household_memberships (property_id, user_id, role, invited_by_user_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (property_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
        [invite.property_id, req.authUser.id, invite.permission_level, invite.owner_user_id]
      );
      await pool.query(`UPDATE household_invitations SET status='accepted' WHERE id=$1`, [invite.id]);
      res.json({ ok: true, propertyId: Number(invite.property_id), role: invite.permission_level });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not accept invitation.' });
    }
  });

  app.delete('/api/household/:propertyId/members/:memberId', requireAuth, requireHomeCareFeature('household_sharing'), async (req, res) => {
    try {
      const propertyId = Number(req.params.propertyId);
      const memberId = Number(req.params.memberId);
      if (!(await assertPropertyOwner(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      await pool.query(`DELETE FROM household_memberships WHERE id=$1 AND property_id=$2`, [memberId, propertyId]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not remove member.' });
    }
  });

  app.delete('/api/household/invitations/:inviteId', requireAuth, requireHomeCareFeature('household_sharing'), async (req, res) => {
    try {
      const inviteId = Number(req.params.inviteId);
      await pool.query(
        `UPDATE household_invitations SET status='revoked'
         WHERE id=$1 AND owner_user_id=$2`,
        [inviteId, req.authUser.id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not revoke invitation.' });
    }
  });

  // ── Annual Home Health Report ────────────────────────────────────────────
  app.get('/api/properties/:id/home-health-report', requireAuth, requireHomeCareFeature('annual_health_report'), async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT * FROM home_health_reports
         WHERE property_id=$1 AND owner_user_id=$2
         ORDER BY generated_at DESC LIMIT 1`,
        [propertyId, req.authUser.id]
      );
      if (!rows[0]) return res.json({ ok: true, report: null });
      res.json({
        ok: true,
        report: {
          id: Number(rows[0].id),
          propertyId: Number(rows[0].property_id),
          generatedAt: rows[0].generated_at,
          content: rows[0].content,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load report.' });
    }
  });

  app.post('/api/properties/:id/home-health-report', requireAuth, requireHomeCareFeature('annual_health_report'), async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      if (!config.homeHealthReport.enabled) {
        return res.status(403).json({
          ok: false,
          code: 'FEATURE_DISABLED',
          feature: 'annual_health_report',
          message: 'Annual Home Health Report is currently unavailable.',
        });
      }
      const propertyId = Number(req.params.id);
      if (!(await assertPropertyOwner(pool, propertyId, req.authUser.id))) {
        return res.status(404).json({ ok: false, message: 'Property not found.' });
      }
      const { rows: recent } = await pool.query(
        `SELECT generated_at FROM home_health_reports
         WHERE property_id=$1 AND owner_user_id=$2
         ORDER BY generated_at DESC LIMIT 1`,
        [propertyId, req.authUser.id]
      );
      if (recent[0]) {
        const last = new Date(recent[0].generated_at).getTime();
        const intervalMs = reportEligibilityMs(config);
        if (Date.now() - last < intervalMs) {
          return res.status(429).json({
            ok: false,
            message: `A home health report was generated within the last ${config.homeHealthReport.minDaysBetweenReports} days.`,
            nextEligibleAt: new Date(last + intervalMs).toISOString(),
          });
        }
      }
      const ctx = await buildPropertyAIContext(pool, propertyId, req.authUser.id);
      if (!ctx) return res.status(404).json({ ok: false, message: 'Property not found.' });
      const prompt = `You are a home maintenance advisor. Generate an annual AI Home Health Report based ONLY on the property information below.
Do NOT claim this is a professional inspection. Use sections: Home Overview, Systems to Watch, Maintenance Completed, Upcoming Maintenance, Recurring Issues, Warranty Opportunities, Recommended Priorities, Home Health Summary.
Property context:
${ctx.text}`;
      const ai = await chatWithCustomer({ messages: [{ role: 'user', content: prompt }] });
      const content = {
        sections: {
          raw: ai?.reply || 'Report could not be generated.',
        },
        disclaimer:
          'AI-generated based on information available in FixBridge. This is not a professional home inspection.',
        generatedAt: new Date().toISOString(),
      };
      const { rows } = await pool.query(
        `INSERT INTO home_health_reports (property_id, owner_user_id, report_year, content)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [propertyId, req.authUser.id, new Date().getFullYear(), JSON.stringify(content)]
      );
      res.json({
        ok: true,
        report: {
          id: Number(rows[0].id),
          propertyId,
          generatedAt: rows[0].generated_at,
          content,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not generate report.' });
    }
  });

  // ── AI Quote Second Opinion ──────────────────────────────────────────────
  app.post('/api/managed/jobs/:id/quote-second-opinion', requireAuth, requireHomeCareFeature('quote_second_opinion'), async (req, res) => {
    try {
      const config = await getHomeCareConfig(pool);
      if (!config.quoteSecondOpinion.enabled) {
        return res.status(403).json({
          ok: false,
          code: 'FEATURE_DISABLED',
          feature: 'quote_second_opinion',
          message: 'Quote Second Opinion is currently unavailable.',
        });
      }
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      const job = jobs[0];
      if (!job) return res.status(404).json({ ok: false, message: 'Job not found.' });
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows: proposals } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      const proposal = proposals[0];
      if (!proposal) return res.status(404).json({ ok: false, message: 'No quote found for this job.' });
      const safeQuote = sanitizeQuoteForSecondOpinion(
        {
          ...proposal,
          lineItems: (() => {
            try {
              return typeof proposal.line_items === 'string' ? JSON.parse(proposal.line_items) : proposal.line_items;
            } catch {
              return [];
            }
          })(),
          totalAmount: proposal.total_amount,
        },
        job
      );
      let propertyContext = '';
      if (job.property_id) {
        const ctx = await buildPropertyAIContext(pool, job.property_id, req.authUser.id);
        propertyContext = ctx?.text || '';
      }
      const prompt = `Provide a homeowner-friendly second opinion on this FixBridge service quote. Be advisory only.
Never mention contractor internal costs, margins, or admin notes.
Return JSON with keys: summary, scopeReview, pricingContext, thingsToAsk, recommendation.
Quote: ${JSON.stringify(safeQuote)}
Property context: ${propertyContext}`;
      const ai = await chatWithCustomer({ messages: [{ role: 'user', content: prompt }] });
      let parsed = null;
      try {
        const text = ai?.reply || '';
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { summary: text };
      } catch {
        parsed = { summary: ai?.reply || 'Analysis unavailable.' };
      }
      const result = {
        ...parsed,
        disclaimer:
          'AI guidance is informational. The official FixBridge quote remains the actual quote for approval and payment.',
        generatedAt: new Date().toISOString(),
      };
      await pool.query(`UPDATE managed_jobs SET quote_second_opinion=$1 WHERE id=$2`, [
        JSON.stringify(result),
        jobId,
      ]);
      res.json({ ok: true, opinion: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not generate second opinion.' });
    }
  });

  // ── Subscription status (homeowner) ────────────────────────────────────
  app.get('/api/homecare/subscription-status', requireAuth, async (req, res) => {
    try {
      const { rows: subs } = await pool.query(
        `SELECT plan_code, status, current_period_end, created_at
         FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3`,
        [req.authUser.id]
      );
      const active = subs.find((s) => s.status === 'active');
      res.json({
        ok: true,
        planCode: req.authUser.planCode || 'free',
        isPro: isPaidHomeCarePlan(req.authUser.planCode),
        subscription: active
          ? {
              planCode: active.plan_code,
              status: active.status,
              currentPeriodEnd: active.current_period_end,
            }
          : null,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load subscription status.' });
    }
  });
}
