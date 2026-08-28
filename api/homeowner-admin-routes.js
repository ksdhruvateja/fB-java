/**
 * Admin homeowner profile workspace — stats, notes, activity.
 */
import { clampString } from './security.js';
import { isPaidHomeCarePlan } from './subscription-catalog.js';
import { getHomeCareConfig, reportEligibilityMs } from './homecare-config.js';

export async function initHomeownerAdminSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homeowner_internal_notes (
      id                  BIGSERIAL PRIMARY KEY,
      homeowner_user_id   INT NOT NULL,
      admin_user_id       INT NOT NULL,
      admin_name          TEXT,
      note                TEXT NOT NULL,
      related_job_id      BIGINT,
      related_ticket_id   BIGINT,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_internal_notes_user
    ON homeowner_internal_notes(homeowner_user_id, created_at DESC)
  `);
}

function invoiceStatusBadge(status) {
  return String(status || 'draft').toLowerCase();
}

export function registerHomeownerAdminRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
  app.get('/api/admin/homeowners/:userId/notes', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const { rows } = await pool.query(
        `SELECT * FROM homeowner_internal_notes WHERE homeowner_user_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [userId]
      );
      res.json({
        ok: true,
        notes: rows.map((r) => ({
          id: Number(r.id),
          homeownerUserId: Number(r.homeowner_user_id),
          adminUserId: Number(r.admin_user_id),
          adminName: r.admin_name,
          note: r.note,
          relatedJobId: r.related_job_id != null ? Number(r.related_job_id) : null,
          relatedTicketId: r.related_ticket_id != null ? Number(r.related_ticket_id) : null,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      console.error('homeowner notes list:', e);
      res.status(500).json({ ok: false, message: 'Could not load notes.' });
    }
  });

  app.post('/api/admin/homeowners/:userId/notes', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const note = clampString(req.body?.note, 8000);
      if (!note) return res.status(400).json({ ok: false, message: 'Note is required.' });
      const relatedJobId = req.body?.relatedJobId != null ? Number(req.body.relatedJobId) : null;
      const relatedTicketId = req.body?.relatedTicketId != null ? Number(req.body.relatedTicketId) : null;
      const { rows } = await pool.query(
        `INSERT INTO homeowner_internal_notes (homeowner_user_id, admin_user_id, admin_name, note, related_job_id, related_ticket_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [userId, req.authUser.id, req.authUser.name || req.authUser.email, note, relatedJobId, relatedTicketId]
      );
      res.json({
        ok: true,
        note: {
          id: Number(rows[0].id),
          note: rows[0].note,
          adminName: rows[0].admin_name,
          relatedJobId,
          relatedTicketId,
          createdAt: rows[0].created_at,
        },
      });
    } catch (e) {
      console.error('homeowner note create:', e);
      res.status(500).json({ ok: false, message: 'Could not save note.' });
    }
  });
}

export async function loadHomeownerProfileExtras(pool, userId) {
  const stats = {
    activeJobs: 0,
    totalJobs: 0,
    openQuotes: 0,
    outstandingBalance: 0,
    totalPaid: 0,
    openTickets: 0,
    properties: 0,
  };

  const { rows: jobStats } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled','canceled','closed'))::int AS active
     FROM managed_jobs WHERE homeowner_user_id=$1`,
    [userId]
  );
  stats.totalJobs = jobStats[0]?.total || 0;
  stats.activeJobs = jobStats[0]?.active || 0;

  const { rows: propCount } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM properties WHERE owner_user_id=$1`,
    [userId]
  );
  stats.properties = propCount[0]?.n || 0;

  const { rows: quoteStats } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM proposals p
     JOIN managed_jobs j ON j.id = p.job_id
     WHERE j.homeowner_user_id=$1 AND LOWER(p.status) IN ('sent','viewed','draft')`,
    [userId]
  );
  stats.openQuotes = quoteStats[0]?.n || 0;

  const { rows: invStats } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('paid','void','cancelled') THEN amount_due ELSE 0 END), 0) AS outstanding,
       COALESCE(SUM(paid), 0) AS paid_total
     FROM homeowner_invoices WHERE homeowner_user_id=$1`,
    [userId]
  );
  stats.outstandingBalance = Number(invStats[0]?.outstanding || 0);
  stats.totalPaid = Number(invStats[0]?.paid_total || 0);

  try {
    const { rows: tix } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM support_tickets
       WHERE user_id=$1 AND status NOT IN ('resolved','closed')`,
      [userId]
    );
    stats.openTickets = tix[0]?.n || 0;
  } catch {
    stats.openTickets = 0;
  }

  const { rows: quotes } = await pool.query(
    `SELECT p.id, p.quote_number, p.job_id, p.status, p.retail_amount, p.document_totals,
            p.created_at, p.published_at, p.approved_at, j.title, j.category
     FROM proposals p
     JOIN managed_jobs j ON j.id = p.job_id
     WHERE j.homeowner_user_id=$1
     ORDER BY p.created_at DESC LIMIT 100`,
    [userId]
  );

  const { rows: invoices } = await pool.query(
    `SELECT hi.*, p.quote_number
     FROM homeowner_invoices hi
     LEFT JOIN proposals p ON p.id = hi.proposal_id
     WHERE hi.homeowner_user_id=$1
     ORDER BY hi.created_at DESC LIMIT 100`,
    [userId]
  );

  const { rows: tickets } = await pool.query(
    `SELECT id, ticket_number, subject, category, priority, status, created_at, updated_at
     FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );

  const activity = [];

  const { rows: users } = await pool.query(`SELECT created_at FROM users WHERE id=$1`, [userId]);
  if (users[0]?.created_at) {
    activity.push({ at: users[0].created_at, action: 'Account created', detail: null });
  }

  for (const p of await pool.query(
    `SELECT created_at, label FROM properties WHERE owner_user_id=$1 ORDER BY created_at ASC LIMIT 20`,
    [userId]
  ).then((r) => r.rows)) {
    activity.push({ at: p.created_at, action: 'Property added', detail: p.label });
  }

  for (const j of await pool.query(
    `SELECT created_at, booking_id, title FROM managed_jobs WHERE homeowner_user_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [userId]
  ).then((r) => r.rows)) {
    activity.push({ at: j.created_at, action: 'Service requested', detail: j.booking_id || j.title });
  }

  try {
    for (const a of await pool.query(
      `SELECT created_at, action, detail FROM audit_logs
       WHERE entity_type IN ('job','invoice','proposal','payment') AND detail::text LIKE $1
       ORDER BY created_at DESC LIMIT 40`,
      [`%${userId}%`]
    ).then((r) => r.rows)) {
      activity.push({ at: a.created_at, action: a.action, detail: typeof a.detail === 'object' ? JSON.stringify(a.detail) : a.detail });
    }
  } catch {
    /* audit optional */
  }

  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const { rows: userRow } = await pool.query(
    `SELECT plan_code, current_period_end FROM users WHERE id=$1`,
    [userId]
  );
  const planCode = userRow[0]?.plan_code || null;
  let subscriptionStatus = null;
  let proStartedAt = null;
  try {
    const { rows: subs } = await pool.query(
      `SELECT status, created_at, current_period_end FROM subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    subscriptionStatus = subs[0]?.status || null;
    proStartedAt = subs[0]?.created_at || null;
  } catch {
    /* optional */
  }
  const { rows: recurring } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM recurring_services WHERE owner_user_id=$1 AND status='active'`,
    [userId]
  );
  const { rows: household } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM household_memberships hm
     JOIN properties p ON p.id = hm.property_id WHERE p.owner_user_id=$1`,
    [userId]
  );
  const { rows: reports } = await pool.query(
    `SELECT generated_at FROM home_health_reports WHERE owner_user_id=$1 ORDER BY generated_at DESC LIMIT 1`,
    [userId]
  );
  const config = await getHomeCareConfig(pool);
  const lastReportAt = reports[0]?.generated_at || null;
  let reportEligible = false;
  if (isPaidHomeCarePlan(planCode) && config.homeHealthReport.enabled) {
    if (!lastReportAt) reportEligible = true;
    else {
      const last = new Date(lastReportAt).getTime();
      reportEligible = Date.now() - last >= reportEligibilityMs(config);
    }
  }

  const homeCarePro = {
    planCode,
    isPro: isPaidHomeCarePlan(planCode),
    subscriptionStatus,
    proStartedAt,
    renewalAt: userRow[0]?.current_period_end || null,
    recurringServicesCount: recurring[0]?.n || 0,
    householdMembersCount: household[0]?.n || 0,
    lastReportAt,
    reportEligible,
  };

  return {
    stats,
    homeCarePro,
    quotes: quotes.map((q) => ({
      id: Number(q.id),
      quoteNumber: q.quote_number,
      jobId: Number(q.job_id),
      service: q.title || q.category,
      amount: q.retail_amount != null ? Number(q.retail_amount) : null,
      status: q.status,
      createdAt: q.created_at,
      sentAt: q.published_at,
      acceptedAt: q.approved_at,
    })),
    invoices: invoices.map((inv) => ({
      id: Number(inv.id),
      invoiceNumber: inv.invoice_number,
      quoteNumber: inv.quote_number,
      proposalId: inv.proposal_id != null ? Number(inv.proposal_id) : null,
      jobId: Number(inv.job_id),
      total: Number(inv.total || 0),
      paid: Number(inv.paid || 0),
      amountDue: Number(inv.amount_due || 0),
      status: invoiceStatusBadge(inv.status),
      dueDate: inv.due_date,
      createdAt: inv.created_at,
    })),
    tickets: tickets.map((t) => ({
      id: Number(t.id),
      ticketNumber: t.ticket_number,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
    activity: activity.slice(0, 50),
  };
}
