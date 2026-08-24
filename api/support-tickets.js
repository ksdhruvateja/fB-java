import { brand } from './brand.js';
import { clampString } from './security.js';

function isoNow(d) {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : String(d);
}

function fmtDateTime(d) {
  try {
    return new Date(isoNow(d)).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoNow(d);
  }
}

export async function initSupportTicketSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id              BIGSERIAL PRIMARY KEY,
      ticket_number   TEXT UNIQUE NOT NULL,
      user_id         INT NOT NULL,
      user_role       TEXT,
      user_name       TEXT,
      user_email      TEXT NOT NULL,
      user_phone      TEXT,
      channel         TEXT NOT NULL,
      subject         TEXT NOT NULL,
      message         TEXT NOT NULL,
      related_job_id  BIGINT,
      context         JSONB,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_deliveries (
      id                 BIGSERIAL PRIMARY KEY,
      ticket_id          BIGINT NOT NULL,
      delivery_type      TEXT NOT NULL,
      recipient_role     TEXT NOT NULL,
      recipient_address  TEXT NOT NULL,
      subject            TEXT,
      body               TEXT NOT NULL,
      status             TEXT NOT NULL DEFAULT 'sent',
      sent_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_ticket ON ticket_deliveries(ticket_id)
  `);
}

async function nextTicketNumber(pool) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `FB-TKT-${day}-`;
  const { rows } = await pool.query(
    `SELECT ticket_number FROM support_tickets
     WHERE ticket_number LIKE $1
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (rows[0]?.ticket_number) {
    const tail = String(rows[0].ticket_number).slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

async function gatherUserContext(pool, userId) {
  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id=$1', [userId]);
  const user = userRows[0] || null;

  const { rows: properties } = await pool.query(
    `SELECT id, label, address_line1, city, state, zip, year_built, beds, baths, sqft
     FROM properties WHERE owner_user_id=$1 ORDER BY created_at ASC LIMIT 10`,
    [userId]
  );

  const { rows: jobs } = await pool.query(
    `SELECT id, booking_id, status, category, title, created_at, updated_at
     FROM managed_jobs WHERE homeowner_user_id=$1
     ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 8`,
    [userId]
  );

  return {
    capturedAt: new Date().toISOString(),
    profile: user
      ? {
          id: Number(user.id),
          name: user.name || null,
          email: user.email || null,
          phone: user.phone || null,
          planCode: user.plan_code || user.planCode || null,
          role: user.role || 'homeowner',
        }
      : { id: userId },
    properties: properties.map((p) => ({
      id: Number(p.id),
      label: p.label,
      addressLine1: p.address_line1,
      city: p.city,
      state: p.state,
      zip: p.zip,
      yearBuilt: p.year_built != null ? Number(p.year_built) : null,
      beds: p.beds != null ? Number(p.beds) : null,
      baths: p.baths != null ? Number(p.baths) : null,
      sqft: p.sqft != null ? Number(p.sqft) : null,
    })),
    recentJobs: jobs.map((j) => ({
      id: Number(j.id),
      bookingId: j.booking_id,
      status: j.status,
      category: j.category,
      title: j.title,
      createdAt: isoNow(j.created_at),
      updatedAt: isoNow(j.updated_at),
    })),
  };
}

function contextSummaryLines(context) {
  const lines = [];
  if (context?.profile) {
    const p = context.profile;
    lines.push(`Name: ${p.name || '—'}`);
    lines.push(`Email: ${p.email || '—'}`);
    lines.push(`Phone: ${p.phone || '—'}`);
    lines.push(`Plan: ${p.planCode || 'standard'}`);
  }
  if (Array.isArray(context?.properties) && context.properties.length) {
    lines.push('');
    lines.push('Properties on file:');
    for (const prop of context.properties) {
      lines.push(
        `  • ${prop.label || prop.addressLine1 || `Home #${prop.id}`} — ${[prop.addressLine1, prop.city, prop.state, prop.zip].filter(Boolean).join(', ')}`
      );
    }
  }
  if (Array.isArray(context?.recentJobs) && context.recentJobs.length) {
    lines.push('');
    lines.push('Recent service requests:');
    for (const job of context.recentJobs) {
      lines.push(
        `  • ${job.bookingId || `Job #${job.id}`} — ${job.title || job.category || 'Request'} (${job.status})`
      );
    }
  }
  return lines;
}

function buildHomeownerEmailBody(ticket, context) {
  const channelLabel = ticket.channel === 'assistant' ? 'FixBridge Assistant' : 'Help & Support';
  const lines = [
    `${brand.productName} — Request received`,
    '',
    `Hello ${ticket.user_name || 'there'},`,
    '',
    `We received your ${channelLabel} message and created support ticket ${ticket.ticket_number}.`,
    '',
    '— Your message —',
    ticket.subject,
    ticket.message,
    '',
    '— Ticket details —',
    `Ticket ID: ${ticket.ticket_number}`,
    `Submitted: ${fmtDateTime(ticket.created_at)}`,
    `Channel: ${channelLabel}`,
    `Status: ${ticket.status}`,
    '',
    '— Profile & account snapshot included —',
    ...contextSummaryLines(context),
    '',
    `Our team will review your request. You can reference ticket ${ticket.ticket_number} in any follow-up.`,
    '',
    `${brand.productName} Support`,
    brand.supportEmail,
  ];
  return lines.join('\n');
}

function buildAdminEmailBody(ticket, context) {
  const channelLabel = ticket.channel === 'assistant' ? 'Assistant' : 'Help';
  const lines = [
    `[ADMIN] New ${channelLabel} ticket — ${ticket.ticket_number}`,
    '',
    '— Homeowner —',
    `Name: ${ticket.user_name || '—'}`,
    `Email: ${ticket.user_email}`,
    `Phone: ${ticket.user_phone || '—'}`,
    `User ID: ${ticket.user_id}`,
    '',
    '— Message —',
    `Subject: ${ticket.subject}`,
    ticket.message,
    '',
    '— Ticket —',
    `Ticket ID: ${ticket.ticket_number}`,
    `Channel: ${channelLabel}`,
    `Submitted: ${fmtDateTime(ticket.created_at)}`,
    ticket.related_job_id ? `Related job ID: ${ticket.related_job_id}` : null,
    '',
    '— Auto-attached context —',
    ...contextSummaryLines(context),
    '',
    'Open the Admin Support Tickets panel to view full delivery logs.',
  ].filter(Boolean);
  return lines.join('\n');
}

function buildSmsBody(ticket) {
  return `${brand.productName}: Ticket ${ticket.ticket_number} received. Email confirmation sent to ${ticket.user_email}.`;
}

function rowToTicket(r) {
  return {
    id: Number(r.id),
    ticketNumber: r.ticket_number,
    userId: Number(r.user_id),
    userRole: r.user_role,
    userName: r.user_name,
    userEmail: r.user_email,
    userPhone: r.user_phone,
    channel: r.channel,
    subject: r.subject,
    message: r.message,
    relatedJobId: r.related_job_id != null ? Number(r.related_job_id) : null,
    context: r.context,
    status: r.status,
    createdAt: isoNow(r.created_at),
    updatedAt: isoNow(r.updated_at),
  };
}

function rowToDelivery(r) {
  return {
    id: Number(r.id),
    ticketId: Number(r.ticket_id),
    deliveryType: r.delivery_type,
    recipientRole: r.recipient_role,
    recipientAddress: r.recipient_address,
    subject: r.subject,
    body: r.body,
    status: r.status,
    sentAt: isoNow(r.sent_at),
  };
}

async function loadTicketDeliveries(pool, ticketId) {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_deliveries WHERE ticket_id=$1 ORDER BY sent_at ASC, id ASC`,
    [ticketId]
  );
  return rows.map(rowToDelivery);
}

async function createSupportTicket(pool, authUser, payload) {
  const channel = payload.channel === 'assistant' ? 'assistant' : 'help';
  const subject = clampString(payload.subject, 200);
  const message = clampString(payload.message, 8000);
  const relatedJobId =
    payload.relatedJobId != null && Number.isFinite(Number(payload.relatedJobId))
      ? Number(payload.relatedJobId)
      : null;

  if (!subject || !message) {
    const err = new Error('Subject and message are required.');
    err.status = 400;
    throw err;
  }

  const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id=$1', [authUser.id]);
  const u = userRows[0];
  const context = await gatherUserContext(pool, authUser.id);
  const ticketNumber = await nextTicketNumber(pool);
  const userEmail = u?.email || authUser.email;
  const userPhone = u?.phone || null;
  const userName = u?.name || authUser.email;

  const { rows } = await pool.query(
    `INSERT INTO support_tickets
      (ticket_number, user_id, user_role, user_name, user_email, user_phone, channel, subject, message, related_job_id, context, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')
     RETURNING *`,
    [
      ticketNumber,
      authUser.id,
      authUser.role || u?.role || 'homeowner',
      userName,
      userEmail,
      userPhone,
      channel,
      subject,
      message,
      relatedJobId,
      JSON.stringify(context),
    ]
  );
  const ticket = rowToTicket(rows[0]);
  const deliveries = [];

  const homeownerSubject = `[${brand.productName}] Ticket ${ticketNumber} — we received your message`;
  const homeownerBody = buildHomeownerEmailBody(ticket, context);
  const { rows: hoMail } = await pool.query(
    `INSERT INTO ticket_deliveries
      (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
     VALUES ($1,'email','homeowner',$2,$3,$4,'sent')
     RETURNING *`,
    [ticket.id, userEmail, homeownerSubject, homeownerBody]
  );
  deliveries.push(rowToDelivery(hoMail[0]));

  const { rows: admins } = await pool.query(
    `SELECT id, email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
  );
  const adminSubject = `[${brand.productName} Admin] New ticket ${ticketNumber}`;
  const adminBody = buildAdminEmailBody(ticket, context);

  for (const admin of admins) {
    const adminEmail = admin.email;
    if (!adminEmail) continue;
    const { rows: adMail } = await pool.query(
      `INSERT INTO ticket_deliveries
        (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
       VALUES ($1,'email','admin',$2,$3,$4,'sent')
       RETURNING *`,
      [ticket.id, adminEmail, adminSubject, adminBody]
    );
    deliveries.push(rowToDelivery(adMail[0]));

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'support_ticket', $2, $3)`,
      [
        admin.id,
        `Support ticket ${ticketNumber}`,
        `${userName} (${channel}) — ${subject}`,
      ]
    );
  }

  if (userPhone?.trim()) {
    const smsBody = buildSmsBody(ticket);
    const { rows: smsRows } = await pool.query(
      `INSERT INTO ticket_deliveries
        (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
       VALUES ($1,'sms','homeowner',$2,$3,$4,'sent')
       RETURNING *`,
      [ticket.id, userPhone.trim(), `${brand.productName} ticket confirmation`, smsBody]
    );
    deliveries.push(rowToDelivery(smsRows[0]));
  }

  return { ticket, deliveries, context };
}

export function registerSupportTicketRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.post('/api/support/tickets', requireAuth, async (req, res) => {
    try {
      const result = await createSupportTicket(pool, req.authUser, req.body || {});
      return res.json({
        ok: true,
        ticket: result.ticket,
        deliveries: result.deliveries,
        context: result.context,
        supportEmail: brand.supportEmail,
      });
    } catch (e) {
      console.error('create support ticket:', e);
      return res.status(e.status || 500).json({
        ok: false,
        message: e.message || 'Could not create support ticket.',
      });
    }
  });

  app.post('/api/support/messages', requireAuth, async (req, res) => {
    try {
      const result = await createSupportTicket(pool, req.authUser, {
        channel: 'help',
        subject: req.body?.subject,
        message: req.body?.message,
        relatedJobId: req.body?.relatedJob,
      });
      return res.json({
        ok: true,
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        createdAt: result.ticket.createdAt,
        deliveries: result.deliveries,
        supportEmail: brand.supportEmail,
      });
    } catch (e) {
      console.error('support message:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not save support message.' });
    }
  });

  app.get('/api/support/tickets', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [req.authUser.id]
      );
      return res.json({ ok: true, tickets: rows.map(rowToTicket) });
    } catch (e) {
      console.error('list support tickets:', e);
      return res.status(500).json({ ok: false, message: 'Could not load tickets.' });
    }
  });

  app.get('/api/support/tickets/:ticketNumber', requireAuth, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const { rows } = await pool.query(
        `SELECT * FROM support_tickets WHERE ticket_number=$1 AND user_id=$2`,
        [ticketNumber, req.authUser.id]
      );
      if (!rows[0]) {
        return res.status(404).json({ ok: false, message: 'Ticket not found.' });
      }
      const ticket = rowToTicket(rows[0]);
      const deliveries = await loadTicketDeliveries(pool, ticket.id);
      return res.json({ ok: true, ticket, deliveries, context: ticket.context });
    } catch (e) {
      console.error('get support ticket:', e);
      return res.status(500).json({ ok: false, message: 'Could not load ticket.' });
    }
  });

  app.get('/api/admin/support/tickets', requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
      const params = [];
      let where = '';
      if (status && status !== 'all') {
        params.push(status);
        where = `WHERE status=$1`;
      }
      const { rows } = await pool.query(
        `SELECT * FROM support_tickets ${where} ORDER BY created_at DESC LIMIT 100`,
        params
      );
      return res.json({ ok: true, tickets: rows.map(rowToTicket) });
    } catch (e) {
      console.error('admin list support tickets:', e);
      return res.status(500).json({ ok: false, message: 'Could not load tickets.' });
    }
  });

  app.get('/api/admin/support/tickets/:ticketNumber', requireAdmin, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const { rows } = await pool.query(`SELECT * FROM support_tickets WHERE ticket_number=$1`, [ticketNumber]);
      if (!rows[0]) {
        return res.status(404).json({ ok: false, message: 'Ticket not found.' });
      }
      const ticket = rowToTicket(rows[0]);
      const deliveries = await loadTicketDeliveries(pool, ticket.id);
      return res.json({ ok: true, ticket, deliveries, context: ticket.context });
    } catch (e) {
      console.error('admin get support ticket:', e);
      return res.status(500).json({ ok: false, message: 'Could not load ticket.' });
    }
  });

  app.patch('/api/admin/support/tickets/:ticketNumber', requireAdmin, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
        return res.status(400).json({ ok: false, message: 'Invalid status.' });
      }
      const { rows } = await pool.query(
        `UPDATE support_tickets SET status=$1, updated_at=NOW()
         WHERE ticket_number=$2 RETURNING *`,
        [status, ticketNumber]
      );
      if (!rows[0]) {
        return res.status(404).json({ ok: false, message: 'Ticket not found.' });
      }
      return res.json({ ok: true, ticket: rowToTicket(rows[0]) });
    } catch (e) {
      console.error('admin update support ticket:', e);
      return res.status(500).json({ ok: false, message: 'Could not update ticket.' });
    }
  });
}
