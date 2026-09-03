/**
 * Job disputes — homeowner report-problem, admin workspace, payout holds, audit trail.
 */
import { writeAudit } from './audit.js';
import { applyPaymentRiskToPayouts } from './payment-settlement.js';
import { createInAppNotification, notifyAdmins } from './in-app-notifications.js';
import { recordJobOperationalEvent } from './job-operational-events.js';
import { clampString } from './security.js';
import { saveAttachment, MAX_ATTACHMENT_BYTES } from './attachment-storage.js';

export const DISPUTE_CATEGORIES = {
  work_incomplete: 'Work incomplete',
  problem_still_exists: 'Problem still exists',
  new_damage: 'New damage',
  incorrect_work: 'Incorrect work',
  billing_concern: 'Billing concern',
  contractor_conduct: 'Contractor conduct',
  other: 'Other',
};

export const DISPUTE_STATUSES = new Set([
  'open',
  'under_review',
  'awaiting_customer',
  'awaiting_contractor',
  'resolved',
  'closed',
]);

const COMPLETED_JOB_STATUSES = new Set([
  'work_completed',
  'customer_review_pending',
  'admin_review_pending',
  'payout_pending',
  'paid_out',
  'closed',
  'completed',
  'disputed',
]);

const ADMIN_ACTIONS = new Set([
  'request_homeowner_info',
  'request_contractor_info',
  'approve_rework',
  'partial_refund',
  'full_refund',
  'release_payout',
  'partial_payout',
  'close_dispute',
  'set_status',
]);

function normalizeStatus(s) {
  const v = String(s || 'open').toLowerCase().replace(/\s+/g, '_');
  return DISPUTE_STATUSES.has(v) ? v : 'open';
}

function serializeDispute(row, extras = {}) {
  const meta = typeof row.meta === 'string' ? JSON.parse(row.meta || '{}') : row.meta || {};
  return {
    id: Number(row.id),
    jobId: row.job_id != null ? Number(row.job_id) : null,
    paymentId: row.payment_id != null ? Number(row.payment_id) : null,
    amount: row.amount != null ? Number(row.amount) : null,
    category: row.category || meta.category || null,
    reason: row.reason || null,
    description: row.description || meta.description || null,
    preferredResolution: row.preferred_resolution || meta.preferredResolution || null,
    status: normalizeStatus(row.status),
    openedByUserId: row.opened_by_user_id != null ? Number(row.opened_by_user_id) : null,
    openedByRole: row.opened_by_role || null,
    homeownerUserId: row.homeowner_user_id != null ? Number(row.homeowner_user_id) : null,
    contractorUserId: row.contractor_user_id != null ? Number(row.contractor_user_id) : null,
    assignedEmployeeId: row.assigned_employee_id != null ? Number(row.assigned_employee_id) : null,
    stripeDisputeId: row.stripe_dispute_id || null,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    ...extras,
  };
}

async function logDisputeEvent(pool, {
  disputeId,
  actorUserId,
  actorRole,
  action,
  reason = null,
  beforeState = null,
  afterState = null,
}) {
  await pool.query(
    `INSERT INTO dispute_events
       (dispute_id, actor_user_id, actor_role, action, reason, before_state, after_state)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      disputeId,
      actorUserId,
      actorRole,
      action,
      reason ? clampString(reason, 1000) : null,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
    ],
  );
}

async function loadPayoutState(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT id, status, net_amount_cents, stripe_transfer_id, hold_reason, held_at, paid_at
     FROM contractor_payouts WHERE job_id=$1 ORDER BY created_at DESC`,
    [jobId],
  );
  const latest = rows[0] || null;
  const alreadyPaid =
    rows.some(
      (r) =>
        r.status === 'paid' ||
        r.status === 'processing' ||
        (r.stripe_transfer_id && String(r.stripe_transfer_id).length > 0),
    );
  return { payouts: rows, latest, alreadyPaid };
}

export async function initDisputeSchema(pool) {
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS category TEXT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS preferred_resolution TEXT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS opened_by_user_id INT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS opened_by_role TEXT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS homeowner_user_id INT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS contractor_user_id INT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS assigned_employee_id INT`);
  await pool.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispute_events (
      id SERIAL PRIMARY KEY,
      dispute_id INT NOT NULL,
      actor_user_id INT,
      actor_role TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      before_state JSONB,
      after_state JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON dispute_events (dispute_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispute_attachments (
      id SERIAL PRIMARY KEY,
      dispute_id INT NOT NULL,
      file_name TEXT,
      mime_type TEXT,
      storage_provider TEXT DEFAULT 'neon',
      storage_key TEXT,
      storage_data TEXT,
      size_bytes INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function openDisputeForJob(pool, {
  job,
  actorUser,
  category,
  description,
  preferredResolution,
  reason,
  attachments = [],
  paymentId = null,
  amount = null,
}) {
  const { rows: existing } = await pool.query(
    `SELECT * FROM disputes
     WHERE job_id=$1 AND status NOT IN ('resolved','closed')
     ORDER BY created_at DESC LIMIT 1`,
    [job.id],
  );
  if (existing[0]) {
    return { ok: false, status: 409, code: 'dispute_already_open', dispute: serializeDispute(existing[0]) };
  }

  const cat = DISPUTE_CATEGORIES[category] ? category : 'other';
  const meta = {
    category: cat,
    description: clampString(description, 5000),
    preferredResolution: clampString(preferredResolution, 500),
  };

  const { rows } = await pool.query(
    `INSERT INTO disputes
       (payment_id, job_id, amount, reason, category, description, preferred_resolution,
        status, meta, opened_by_user_id, opened_by_role, homeowner_user_id, contractor_user_id,
        assigned_employee_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13,NOW())
     RETURNING *`,
    [
      paymentId,
      job.id,
      amount,
      clampString(reason || DISPUTE_CATEGORIES[cat], 500),
      cat,
      meta.description,
      meta.preferredResolution,
      JSON.stringify(meta),
      actorUser.id,
      actorUser.role,
      job.homeowner_user_id,
      job.assigned_contractor_user_id || null,
      job.assigned_employee_id || null,
    ],
  );
  const dispute = rows[0];

  for (const att of attachments.slice(0, 5)) {
    const saved = await saveAttachment(pool, {
      namespace: 'dispute',
      entityId: dispute.id,
      fileName: att.fileName,
      mimeType: att.mimeType,
      data: att.data,
    });
    if (saved.ok) {
      await pool.query(
        `INSERT INTO dispute_attachments
           (dispute_id, file_name, mime_type, storage_provider, storage_key, storage_data, size_bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          dispute.id,
          saved.fileName,
          saved.mimeType,
          saved.provider,
          saved.storageKey,
          saved.storageData,
          saved.sizeBytes,
        ],
      );
    }
  }

  const payoutState = await loadPayoutState(pool, job.id);
  let holdResult = { held: [], flagged: [] };
  if (!payoutState.alreadyPaid) {
    holdResult = await applyPaymentRiskToPayouts(pool, job.id, {
      reason: `Dispute opened: ${DISPUTE_CATEGORIES[cat]}`,
      actorUserId: actorUser.id,
    });
  }

  await logDisputeEvent(pool, {
    disputeId: dispute.id,
    actorUserId: actorUser.id,
    actorRole: actorUser.role,
    action: 'dispute_opened',
    reason: meta.description,
    afterState: {
      status: 'open',
      category: cat,
      payoutHeld: holdResult.held.length > 0,
      contractorAlreadyPaid: payoutState.alreadyPaid,
    },
  });

  await recordJobOperationalEvent(pool, {
    jobId: job.id,
    eventType: 'dispute_opened',
    contractorUserId: job.assigned_contractor_user_id,
    employeeId: job.assigned_employee_id,
    actorUserId: actorUser.id,
    detail: { disputeId: dispute.id, category: cat },
  });

  await notifyAdmins(pool, {
    type: 'dispute_opened',
    title: 'Dispute opened',
    message: `Job FB-${job.id}: ${DISPUTE_CATEGORIES[cat]}`,
    jobId: job.id,
    entityType: 'dispute',
    entityId: dispute.id,
    actionUrl: `/admin?tab=disputes&dispute=${dispute.id}`,
    metadata: { category: cat, contractorAlreadyPaid: payoutState.alreadyPaid },
  });

  if (job.homeowner_user_id) {
    await createInAppNotification(pool, {
      userId: job.homeowner_user_id,
      userRole: 'homeowner',
      type: 'dispute_update',
      title: 'We received your report',
      message: 'Our team is reviewing your service concern.',
      jobId: job.id,
      entityType: 'dispute',
      entityId: dispute.id,
      actionUrl: `/homeowner?job=${job.id}`,
    });
  }

  await writeAudit(pool, actorUser.id, 'dispute_opened', 'managed_job', job.id, {
    disputeId: dispute.id,
    category: cat,
    payoutHeld: holdResult.held.length,
    contractorAlreadyPaid: payoutState.alreadyPaid,
  });

  return {
    ok: true,
    dispute: serializeDispute(dispute, {
      payoutState: {
        alreadyPaid: payoutState.alreadyPaid,
        held: holdResult.held.length > 0,
        latestStatus: payoutState.latest?.status || null,
      },
    }),
  };
}

export function registerDisputeRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, pushStatus }) {
  app.post('/api/managed/jobs/:id/report-problem', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
      const job = jobs[0];
      if (Number(job.homeowner_user_id) !== Number(req.authUser.id) && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      if (!COMPLETED_JOB_STATUSES.has(String(job.status))) {
        return res.status(400).json({
          ok: false,
          code: 'job_not_completed',
          message: 'Disputes can only be opened for completed or in-review jobs.',
        });
      }

      const category = String(req.body?.category || 'other').toLowerCase();
      const description = String(req.body?.description || '').trim();
      if (!description) {
        return res.status(400).json({ ok: false, message: 'Please describe the problem.' });
      }

      const attachments = [];
      if (Array.isArray(req.body?.attachments)) {
        for (const a of req.body.attachments.slice(0, 5)) {
          const data = String(a?.data || a?.base64 || '');
          if (!data || data.length > MAX_ATTACHMENT_BYTES * 1.4) continue;
          attachments.push({
            fileName: a.fileName || a.name || 'attachment',
            mimeType: a.mimeType || a.type || 'application/octet-stream',
            data,
          });
        }
      }

      const { rows: payRows } = await pool.query(
        `SELECT id, amount FROM payments WHERE job_id=$1 AND status='succeeded' ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );

      const result = await openDisputeForJob(pool, {
        job,
        actorUser: req.authUser,
        category,
        description,
        preferredResolution: req.body?.preferredResolution,
        reason: req.body?.reason,
        attachments,
        paymentId: payRows[0]?.id || null,
        amount: payRows[0]?.amount != null ? Number(payRows[0].amount) : null,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json(result);
      }

      if (pushStatus && job.status !== 'disputed') {
        await pushStatus(pool, jobId, job.status, 'disputed', req.authUser.id, 'Homeowner reported a problem');
      }

      return res.json(result);
    } catch (e) {
      console.error('report-problem:', e);
      return res.status(500).json({ ok: false, message: 'Could not submit report.' });
    }
  });

  app.get('/api/managed/jobs/:id/dispute', requireAuth, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      const { rows: jobs } = await pool.query(`SELECT homeowner_user_id FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const allowed =
        req.authUser.role === 'admin' || Number(jobs[0].homeowner_user_id) === Number(req.authUser.id);
      if (!allowed) return res.status(403).json({ ok: false, message: 'Not allowed.' });

      const { rows } = await pool.query(
        `SELECT * FROM disputes WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId],
      );
      return res.json({ ok: true, dispute: rows[0] ? serializeDispute(rows[0]) : null });
    } catch (e) {
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/disputes', requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status ? normalizeStatus(req.query.status) : null;
      let sql = `SELECT d.*, j.title AS job_title, j.category AS job_category,
                        hu.name AS homeowner_name, hu.email AS homeowner_email,
                        cu.name AS contractor_name
                 FROM disputes d
                 LEFT JOIN managed_jobs j ON j.id = d.job_id
                 LEFT JOIN users hu ON hu.id = d.homeowner_user_id
                 LEFT JOIN users cu ON cu.id = d.contractor_user_id
                 WHERE 1=1`;
      const params = [];
      if (status) {
        params.push(status);
        sql += ` AND d.status=$${params.length}`;
      } else {
        sql += ` AND d.status NOT IN ('closed')`;
      }
      sql += ` ORDER BY d.created_at DESC LIMIT 100`;
      const { rows } = await pool.query(sql, params);
      return res.json({
        ok: true,
        disputes: rows.map((r) =>
          serializeDispute(r, {
            jobTitle: r.job_title,
            jobCategory: r.job_category,
            homeownerName: r.homeowner_name,
            homeownerEmail: r.homeowner_email,
            contractorName: r.contractor_name,
          }),
        ),
      });
    } catch (e) {
      console.error('list disputes:', e);
      return res.status(500).json({ ok: false, message: 'Could not load disputes.' });
    }
  });

  app.get('/api/admin/disputes/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT d.*,
                j.title AS job_title,
                j.category AS job_category,
                j.description AS job_description,
                j.status AS job_status,
                j.completion_report,
                j.contact_phone AS job_contact_phone,
                hu.name AS homeowner_name,
                hu.email AS homeowner_email,
                hu.phone AS homeowner_phone,
                cu.name AS contractor_name,
                cu.email AS contractor_email,
                emp.full_name AS technician_name
         FROM disputes d
         LEFT JOIN managed_jobs j ON j.id = d.job_id
         LEFT JOIN users hu ON hu.id = d.homeowner_user_id
         LEFT JOIN users cu ON cu.id = d.contractor_user_id
         LEFT JOIN contractor_employees emp ON emp.id = j.assigned_employee_id
         WHERE d.id=$1`,
        [id],
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Dispute not found.' });
      const row = rows[0];

      const { rows: events } = await pool.query(
        `SELECT e.*, u.name AS actor_name FROM dispute_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         WHERE e.dispute_id=$1 ORDER BY e.created_at ASC`,
        [id],
      );
      const { rows: atts } = await pool.query(
        `SELECT id, file_name, mime_type, size_bytes, created_at FROM dispute_attachments WHERE dispute_id=$1`,
        [id],
      );

      const payoutState = row.job_id ? await loadPayoutState(pool, row.job_id) : { payouts: [], latest: null, alreadyPaid: false };

      const { rows: proposals } = row.job_id
        ? await pool.query(`SELECT id, quote_number, status, retail_amount, version_number, quote_option_label
                            FROM proposals WHERE job_id=$1 ORDER BY created_at DESC`, [row.job_id])
        : { rows: [] };

      const { rows: invoices } = row.job_id
        ? await pool.query(`SELECT id, invoice_number, status, amount_due FROM homeowner_invoices WHERE job_id=$1`, [
            row.job_id,
          ])
        : { rows: [] };

      const { rows: payments } = row.job_id
        ? await pool.query(`SELECT id, amount, status, created_at FROM payments WHERE job_id=$1 ORDER BY created_at DESC`, [
            row.job_id,
          ])
        : { rows: [] };

      const { loadJobTimeline } = await import('./job-operational-events.js');
      const timeline = row.job_id ? await loadJobTimeline(pool, row.job_id) : [];

      return res.json({
        ok: true,
        dispute: serializeDispute(row, {
          jobTitle: row.job_title,
          jobCategory: row.job_category,
          jobDescription: row.job_description,
          jobStatus: row.job_status,
          completionReport: row.completion_report,
          homeownerName: row.homeowner_name,
          homeownerEmail: row.homeowner_email,
          homeownerPhone: row.homeowner_phone || row.job_contact_phone,
          contractorName: row.contractor_name,
          contractorEmail: row.contractor_email,
          technicianName: row.technician_name,
        }),
        events: events.map((e) => ({
          id: e.id,
          action: e.action,
          reason: e.reason,
          actorUserId: e.actor_user_id,
          actorRole: e.actor_role,
          actorName: e.actor_name,
          beforeState: e.before_state,
          afterState: e.after_state,
          createdAt: e.created_at,
        })),
        attachments: atts,
        payoutState: {
          alreadyPaid: payoutState.alreadyPaid,
          payouts: payoutState.payouts,
        },
        quotes: proposals,
        invoices,
        payments,
        timeline,
      });
    } catch (e) {
      console.error('get dispute:', e);
      return res.status(500).json({ ok: false, message: 'Could not load dispute.' });
    }
  });

  app.post('/api/admin/disputes/:id/actions', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const action = String(req.body?.action || '').toLowerCase();
      const reason = String(req.body?.reason || '').trim();
      if (!ADMIN_ACTIONS.has(action)) {
        return res.status(400).json({ ok: false, message: 'Unsupported action.' });
      }

      const { rows } = await pool.query(`SELECT * FROM disputes WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Dispute not found.' });
      const before = serializeDispute(rows[0]);
      let afterStatus = before.status;

      if (action === 'request_homeowner_info') afterStatus = 'awaiting_customer';
      else if (action === 'request_contractor_info') afterStatus = 'awaiting_contractor';
      else if (action === 'approve_rework') afterStatus = 'under_review';
      else if (action === 'close_dispute') afterStatus = 'closed';
      else if (action === 'set_status' && req.body?.status) afterStatus = normalizeStatus(req.body.status);
      else if (action === 'partial_refund' || action === 'full_refund') afterStatus = 'under_review';
      else if (action === 'release_payout' || action === 'partial_payout') afterStatus = before.status;

      if (action === 'release_payout' && before.jobId) {
        const { rows: held } = await pool.query(
          `SELECT id FROM contractor_payouts WHERE job_id=$1 AND status='on_hold'`,
          [before.jobId],
        );
        for (const p of held) {
          await pool.query(
            `UPDATE contractor_payouts SET status='pending_approval', hold_reason=NULL, held_at=NULL, updated_at=NOW() WHERE id=$1`,
            [p.id],
          );
        }
      }

      const { rows: updated } = await pool.query(
        `UPDATE disputes SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [afterStatus, id],
      );

      if (action === 'close_dispute' || action === 'set_status' && afterStatus === 'resolved') {
        await writeAudit(pool, req.authUser.id, 'dispute_resolved', 'dispute', id, { action, reason });
      }

      await logDisputeEvent(pool, {
        disputeId: id,
        actorUserId: req.authUser.id,
        actorRole: req.authUser.role,
        action,
        reason: reason || null,
        beforeState: before,
        afterState: serializeDispute(updated[0]),
      });

      if (before.homeownerUserId) {
        await createInAppNotification(pool, {
          userId: before.homeownerUserId,
          userRole: 'homeowner',
          type: 'dispute_update',
          title: 'Dispute update',
          message: reason || `Your service concern status is now: ${afterStatus.replace(/_/g, ' ')}`,
          jobId: before.jobId,
          entityType: 'dispute',
          entityId: id,
          actionUrl: `/homeowner?job=${before.jobId}`,
        });
      }

      return res.json({ ok: true, dispute: serializeDispute(updated[0]) });
    } catch (e) {
      console.error('dispute action:', e);
      return res.status(500).json({ ok: false, message: 'Could not perform action.' });
    }
  });

  // Enhanced admin create (replaces bare platform-routes insert)
  app.post('/api/admin/disputes', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.body?.jobId);
      if (!jobId) return res.status(400).json({ ok: false, message: 'jobId required.' });
      const { rows: jobs } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });

      const result = await openDisputeForJob(pool, {
        job: jobs[0],
        actorUser: req.authUser,
        category: req.body?.category || 'other',
        description: req.body?.description || req.body?.reason || 'Admin opened dispute',
        preferredResolution: req.body?.preferredResolution,
        reason: req.body?.reason,
        paymentId: req.body?.paymentId || null,
        amount: req.body?.amount != null ? Number(req.body.amount) : null,
      });

      if (!result.ok) return res.status(result.status || 400).json(result);

      if (pushStatus && jobs[0].status !== 'disputed') {
        await pushStatus(pool, jobId, jobs[0].status, 'disputed', req.authUser.id, 'Dispute opened by admin');
      }

      return res.json(result);
    } catch (e) {
      console.error('admin create dispute:', e);
      return res.status(500).json({ ok: false, message: 'Could not open dispute.' });
    }
  });
}
