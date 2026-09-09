import { brand } from './brand.js';
import { clampString } from './security.js';

export const TICKET_STATUSES = [
  'open',
  'in_review',
  'waiting_for_customer',
  'waiting_for_contractor',
  'waiting_for_admin',
  'resolved',
  'closed',
];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const LEGACY_STATUS_MAP = {
  in_progress: 'in_review',
};

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

function normalizeStatus(status) {
  const s = String(status || 'open').toLowerCase().replace(/\s+/g, '_');
  return LEGACY_STATUS_MAP[s] || s;
}

function normalizePriority(priority) {
  const p = String(priority || 'normal').toLowerCase();
  return TICKET_PRIORITIES.includes(p) ? p : 'normal';
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
      category        TEXT,
      priority        TEXT NOT NULL DEFAULT 'normal',
      assigned_to     TEXT,
      related_property_id BIGINT,
      related_job_id  BIGINT,
      related_quote_id BIGINT,
      related_invoice_id BIGINT,
      related_payment_id BIGINT,
      context         JSONB,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ
    )
  `);

  const alters = [
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT',
    "ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'",
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS related_property_id BIGINT',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS related_quote_id BIGINT',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS related_invoice_id BIGINT',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS related_payment_id BIGINT',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ',
    'ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ',
  ];
  for (const sql of alters) {
    try {
      await pool.query(sql);
    } catch {
      /* column may exist with different constraints in pg-mem */
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id              BIGSERIAL PRIMARY KEY,
      ticket_id       BIGINT NOT NULL,
      sender_user_id  INT,
      sender_role     TEXT NOT NULL,
      sender_name     TEXT,
      message         TEXT NOT NULL,
      is_internal     BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_attachments (
      id              BIGSERIAL PRIMARY KEY,
      ticket_id       BIGINT NOT NULL,
      message_id      BIGINT,
      file_url        TEXT NOT NULL,
      file_name       TEXT NOT NULL,
      mime_type       TEXT,
      uploaded_by     INT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_ticket_activity (
      id              BIGSERIAL PRIMARY KEY,
      ticket_id       BIGINT NOT NULL,
      actor_user_id   INT,
      actor_role      TEXT,
      action          TEXT NOT NULL,
      old_value       TEXT,
      new_value       TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
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

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at ASC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_ticket_activity_ticket ON support_ticket_activity(ticket_id, created_at ASC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_ticket ON ticket_deliveries(ticket_id)`);
}

async function nextTicketNumber(pool) {
  const { rows } = await pool.query(
    `SELECT ticket_number FROM support_tickets WHERE ticket_number LIKE 'FBT-%' ORDER BY id DESC LIMIT 1`
  );
  let seq = 10001;
  if (rows[0]?.ticket_number) {
    const n = Number.parseInt(String(rows[0].ticket_number).replace(/^FBT-/, ''), 10);
    if (Number.isFinite(n) && n >= 10001) seq = n + 1;
  }
  return `FBT-${seq}`;
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
    '— User —',
    `Name: ${ticket.user_name || '—'}`,
    `Email: ${ticket.user_email}`,
    `Phone: ${ticket.user_phone || '—'}`,
    `User ID: ${ticket.user_id}`,
    `Role: ${ticket.user_role || '—'}`,
    '',
    '— Message —',
    `Subject: ${ticket.subject}`,
    ticket.message,
    '',
    '— Ticket —',
    `Ticket ID: ${ticket.ticket_number}`,
    `Category: ${ticket.category || '—'}`,
    `Priority: ${ticket.priority || 'normal'}`,
    `Channel: ${channelLabel}`,
    `Submitted: ${fmtDateTime(ticket.created_at)}`,
    ticket.related_job_id ? `Related job ID: ${ticket.related_job_id}` : null,
    '',
    '— Auto-attached context —',
    ...contextSummaryLines(context),
    '',
    'Open the Admin Support panel to view and reply.',
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
    category: r.category || null,
    priority: normalizePriority(r.priority),
    assignedTo: r.assigned_to || null,
    relatedPropertyId: r.related_property_id != null ? Number(r.related_property_id) : null,
    relatedJobId: r.related_job_id != null ? Number(r.related_job_id) : null,
    relatedQuoteId: r.related_quote_id != null ? Number(r.related_quote_id) : null,
    relatedInvoiceId: r.related_invoice_id != null ? Number(r.related_invoice_id) : null,
    relatedPaymentId: r.related_payment_id != null ? Number(r.related_payment_id) : null,
    context: r.context,
    status: normalizeStatus(r.status),
    createdAt: isoNow(r.created_at),
    updatedAt: isoNow(r.updated_at),
    resolvedAt: r.resolved_at ? isoNow(r.resolved_at) : null,
    closedAt: r.closed_at ? isoNow(r.closed_at) : null,
  };
}

function rowToMessage(r) {
  return {
    id: Number(r.id),
    ticketId: Number(r.ticket_id),
    senderUserId: r.sender_user_id != null ? Number(r.sender_user_id) : null,
    senderRole: r.sender_role,
    senderName: r.sender_name,
    message: r.message,
    isInternal: Boolean(r.is_internal),
    createdAt: isoNow(r.created_at),
  };
}

function rowToActivity(r) {
  return {
    id: Number(r.id),
    ticketId: Number(r.ticket_id),
    actorUserId: r.actor_user_id != null ? Number(r.actor_user_id) : null,
    actorRole: r.actor_role,
    action: r.action,
    oldValue: r.old_value,
    newValue: r.new_value,
    createdAt: isoNow(r.created_at),
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

async function logActivity(pool, ticketId, actor, action, oldValue, newValue) {
  await pool.query(
    `INSERT INTO support_ticket_activity (ticket_id, actor_user_id, actor_role, action, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [ticketId, actor?.id || null, actor?.role || null, action, oldValue || null, newValue || null]
  );
}

async function loadTicketMessages(pool, ticketId, includeInternal = false) {
  const { rows } = await pool.query(
    `SELECT * FROM support_ticket_messages
     WHERE ticket_id=$1 ${includeInternal ? '' : 'AND is_internal=false'}
     ORDER BY created_at ASC, id ASC`,
    [ticketId]
  );
  if (rows.length === 0) {
    const { rows: ticketRows } = await pool.query(`SELECT * FROM support_tickets WHERE id=$1`, [ticketId]);
    if (ticketRows[0]?.message) {
      await pool.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, sender_name, message, is_internal)
         VALUES ($1,$2,$3,$4,$5,false)`,
        [
          ticketId,
          ticketRows[0].user_id,
          ticketRows[0].user_role || 'homeowner',
          ticketRows[0].user_name,
          ticketRows[0].message,
        ]
      );
      const { rows: migrated } = await pool.query(
        `SELECT * FROM support_ticket_messages WHERE ticket_id=$1 AND is_internal=false ORDER BY created_at ASC`,
        [ticketId]
      );
      return migrated.map(rowToMessage);
    }
  }
  return rows.map(rowToMessage);
}

async function loadTicketActivity(pool, ticketId) {
  const { rows } = await pool.query(
    `SELECT * FROM support_ticket_activity WHERE ticket_id=$1 ORDER BY created_at ASC, id ASC`,
    [ticketId]
  );
  return rows.map(rowToActivity);
}

async function loadTicketDeliveries(pool, ticketId) {
  const { rows } = await pool.query(
    `SELECT * FROM ticket_deliveries WHERE ticket_id=$1 ORDER BY sent_at ASC, id ASC`,
    [ticketId]
  );
  return rows.map(rowToDelivery);
}

async function notifyTicketUser(pool, userId, title, message) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message) VALUES ($1,'support_ticket',$2,$3)`,
      [userId, title, message]
    );
  } catch {
    /* notifications table optional */
  }
}

async function notifyAdmins(pool, title, message) {
  try {
    const { rows: admins } = await pool.query(
      `SELECT id FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
    );
    for (const admin of admins) {
      await notifyTicketUser(pool, admin.id, title, message);
    }
  } catch {
    /* ignore */
  }
}

async function canAccessTicket(pool, authUser, ticket) {
  if (authUser.role === 'admin') return true;
  if (Number(ticket.user_id) === Number(authUser.id)) return true;
  if (authUser.role === 'contractor') {
    if (Number(ticket.user_id) === Number(authUser.id)) return true;
    if (ticket.related_job_id) {
      const { rows } = await pool.query(
        `SELECT id FROM managed_jobs WHERE id=$1 AND assigned_contractor_user_id=$2`,
        [ticket.related_job_id, authUser.id]
      );
      if (rows[0]) return true;
    }
  }
  return false;
}

async function loadTicketByNumber(pool, ticketNumber) {
  const { rows } = await pool.query(`SELECT * FROM support_tickets WHERE ticket_number=$1`, [ticketNumber]);
  return rows[0] || null;
}

async function createSupportTicket(pool, authUser, payload) {
  const channel = payload.channel === 'assistant' ? 'assistant' : 'help';
  const subject = clampString(payload.subject, 200);
  const message = clampString(payload.message, 8000);
  const category = clampString(payload.category, 80) || 'Other';
  const priority = normalizePriority(payload.priority);
  const relatedJobId = payload.relatedJobId != null && Number.isFinite(Number(payload.relatedJobId)) ? Number(payload.relatedJobId) : null;
  const relatedPropertyId = payload.relatedPropertyId != null && Number.isFinite(Number(payload.relatedPropertyId)) ? Number(payload.relatedPropertyId) : null;
  const relatedQuoteId = payload.relatedQuoteId != null && Number.isFinite(Number(payload.relatedQuoteId)) ? Number(payload.relatedQuoteId) : null;
  const relatedInvoiceId = payload.relatedInvoiceId != null && Number.isFinite(Number(payload.relatedInvoiceId)) ? Number(payload.relatedInvoiceId) : null;
  const relatedPaymentId = payload.relatedPaymentId != null && Number.isFinite(Number(payload.relatedPaymentId)) ? Number(payload.relatedPaymentId) : null;

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
  const userRole = authUser.role || u?.role || 'homeowner';

  const { rows } = await pool.query(
    `INSERT INTO support_tickets
      (ticket_number, user_id, user_role, user_name, user_email, user_phone, channel, subject, message,
       category, priority, related_property_id, related_job_id, related_quote_id, related_invoice_id, related_payment_id, context, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'open')
     RETURNING *`,
    [
      ticketNumber,
      authUser.id,
      userRole,
      userName,
      userEmail,
      userPhone,
      channel,
      subject,
      message,
      category,
      priority,
      relatedPropertyId,
      relatedJobId,
      relatedQuoteId,
      relatedInvoiceId,
      relatedPaymentId,
      JSON.stringify(context),
    ]
  );
  const ticketRow = rows[0];
  const ticket = rowToTicket(ticketRow);

  await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, sender_name, message, is_internal)
     VALUES ($1,$2,$3,$4,$5,false)`,
    [ticket.id, authUser.id, userRole, userName, message]
  );
  await logActivity(pool, ticket.id, authUser, 'created', null, ticketNumber);

  const deliveries = [];
  const homeownerSubject = `[${brand.productName}] Ticket ${ticketNumber} — we received your message`;
  const homeownerBody = buildHomeownerEmailBody(ticketRow, context);
  const { rows: hoMail } = await pool.query(
    `INSERT INTO ticket_deliveries (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
     VALUES ($1,'email','homeowner',$2,$3,$4,'sent') RETURNING *`,
    [ticket.id, userEmail, homeownerSubject, homeownerBody]
  );
  deliveries.push(rowToDelivery(hoMail[0]));

  const { rows: admins } = await pool.query(
    `SELECT id, email, name FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
  );
  const adminSubject = `[${brand.productName} Admin] New ticket ${ticketNumber}`;
  const adminBody = buildAdminEmailBody(ticketRow, context);

  for (const admin of admins) {
    if (!admin.email) continue;
    const { rows: adMail } = await pool.query(
      `INSERT INTO ticket_deliveries (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
       VALUES ($1,'email','admin',$2,$3,$4,'sent') RETURNING *`,
      [ticket.id, admin.email, adminSubject, adminBody]
    );
    deliveries.push(rowToDelivery(adMail[0]));
    await notifyTicketUser(pool, admin.id, `Support ticket ${ticketNumber}`, `${userName} — ${subject}`);
  }

  if (userPhone?.trim()) {
    const smsBody = buildSmsBody(ticketRow);
    const { rows: smsRows } = await pool.query(
      `INSERT INTO ticket_deliveries (ticket_id, delivery_type, recipient_role, recipient_address, subject, body, status)
       VALUES ($1,'sms','homeowner',$2,$3,$4,'sent') RETURNING *`,
      [ticket.id, userPhone.trim(), `${brand.productName} ticket confirmation`, smsBody]
    );
    deliveries.push(rowToDelivery(smsRows[0]));
  }

  return { ticket, deliveries, context };
}

async function addTicketReply(pool, authUser, ticketNumber, messageText, isInternal = false) {
  const ticketRow = await loadTicketByNumber(pool, ticketNumber);
  if (!ticketRow) {
    const err = new Error('Ticket not found.');
    err.status = 404;
    throw err;
  }
  if (!(await canAccessTicket(pool, authUser, ticketRow))) {
    const err = new Error('Ticket not found.');
    err.status = 404;
    throw err;
  }
  if (isInternal && authUser.role !== 'admin') {
    const err = new Error('Forbidden.');
    err.status = 403;
    throw err;
  }

  const message = clampString(messageText, 8000);
  if (!message) {
    const err = new Error('Message is required.');
    err.status = 400;
    throw err;
  }

  const senderRole = authUser.role === 'admin' ? 'admin' : authUser.role || 'homeowner';
  const senderName = authUser.name || authUser.email;

  const { rows } = await pool.query(
    `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, sender_name, message, is_internal)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [ticketRow.id, authUser.id, senderRole, senderName, message, isInternal]
  );

  await pool.query(`UPDATE support_tickets SET updated_at=NOW() WHERE id=$1`, [ticketRow.id]);
  await logActivity(pool, ticketRow.id, authUser, isInternal ? 'internal_note' : 'reply', null, message.slice(0, 120));

  if (!isInternal) {
    if (authUser.role === 'admin') {
      await notifyTicketUser(pool, ticketRow.user_id, `Reply on ${ticketRow.ticket_number}`, message.slice(0, 200));
    } else {
      await notifyAdmins(pool, `Reply on ${ticketRow.ticket_number}`, `${senderName}: ${message.slice(0, 200)}`);
    }
  }

  return rowToMessage(rows[0]);
}

async function updateTicketFields(pool, authUser, ticketNumber, fields) {
  const ticketRow = await loadTicketByNumber(pool, ticketNumber);
  if (!ticketRow) {
    const err = new Error('Ticket not found.');
    err.status = 404;
    throw err;
  }
  if (authUser.role !== 'admin') {
    const err = new Error('Forbidden.');
    err.status = 403;
    throw err;
  }

  const updates = [];
  const params = [];
  let i = 1;

  if (fields.status != null) {
    const status = normalizeStatus(fields.status);
    if (!TICKET_STATUSES.includes(status)) {
      const err = new Error('Invalid status.');
      err.status = 400;
      throw err;
    }
    updates.push(`status=$${i++}`);
    params.push(status);
    if (status === 'resolved') updates.push(`resolved_at=COALESCE(resolved_at, NOW())`);
    if (status === 'closed') updates.push(`closed_at=COALESCE(closed_at, NOW())`);
    await logActivity(pool, ticketRow.id, authUser, 'status_changed', ticketRow.status, status);
    await notifyTicketUser(pool, ticketRow.user_id, `Ticket ${ticketRow.ticket_number} updated`, `Status: ${status}`);
  }

  if (fields.priority != null) {
    const priority = normalizePriority(fields.priority);
    updates.push(`priority=$${i++}`);
    params.push(priority);
    await logActivity(pool, ticketRow.id, authUser, 'priority_changed', ticketRow.priority, priority);
  }

  if (fields.assignedTo !== undefined) {
    updates.push(`assigned_to=$${i++}`);
    params.push(fields.assignedTo || null);
    await logActivity(pool, ticketRow.id, authUser, 'assigned', ticketRow.assigned_to, fields.assignedTo || 'unassigned');
  }

  if (fields.reopen === true) {
    updates.push(`status=$${i++}`);
    params.push('open');
    updates.push(`resolved_at=NULL`);
    updates.push(`closed_at=NULL`);
    await logActivity(pool, ticketRow.id, authUser, 'reopened', ticketRow.status, 'open');
    await notifyTicketUser(pool, ticketRow.user_id, `Ticket ${ticketRow.ticket_number} reopened`, 'Your support ticket was reopened.');
  }

  if (!updates.length) {
    return rowToTicket(ticketRow);
  }

  updates.push('updated_at=NOW()');
  params.push(ticketNumber);
  const { rows } = await pool.query(
    `UPDATE support_tickets SET ${updates.join(', ')} WHERE ticket_number=$${i} RETURNING *`,
    params
  );
  return rowToTicket(rows[0]);
}

async function loadFullTicket(pool, ticketRow, authUser) {
  const includeInternal = authUser.role === 'admin';
  const messages = await loadTicketMessages(pool, ticketRow.id, includeInternal);
  const activity = includeInternal ? await loadTicketActivity(pool, ticketRow.id) : [];
  const deliveries = includeInternal ? await loadTicketDeliveries(pool, ticketRow.id) : [];
  return {
    ticket: rowToTicket(ticketRow),
    messages,
    activity,
    deliveries,
    context: ticketRow.context,
  };
}

export function registerSupportTicketRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
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
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not create support ticket.' });
    }
  });

  app.post('/api/support/messages', requireAuth, async (req, res) => {
    try {
      const result = await createSupportTicket(pool, req.authUser, {
        channel: 'help',
        subject: req.body?.subject,
        message: req.body?.message,
        category: req.body?.category,
        priority: req.body?.priority,
        relatedJobId: req.body?.relatedJob ?? req.body?.relatedJobId,
        relatedPropertyId: req.body?.relatedPropertyId,
        relatedQuoteId: req.body?.relatedQuoteId,
        relatedInvoiceId: req.body?.relatedInvoiceId,
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
      const statusFilter = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
      const params = [req.authUser.id];
      let where = 'WHERE user_id=$1';
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'open') {
          where += ` AND status NOT IN ('resolved','closed')`;
        } else if (statusFilter === 'resolved') {
          where += ` AND status='resolved'`;
        } else if (statusFilter === 'closed') {
          where += ` AND status='closed'`;
        }
      }
      const { rows } = await pool.query(
        `SELECT * FROM support_tickets ${where} ORDER BY updated_at DESC, created_at DESC LIMIT 50`,
        params
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
      const ticketRow = await loadTicketByNumber(pool, ticketNumber);
      if (!ticketRow || !(await canAccessTicket(pool, req.authUser, ticketRow))) {
        return res.status(404).json({ ok: false, message: 'Ticket not found.' });
      }
      const full = await loadFullTicket(pool, ticketRow, req.authUser);
      return res.json({ ok: true, ...full });
    } catch (e) {
      console.error('get support ticket:', e);
      return res.status(500).json({ ok: false, message: 'Could not load ticket.' });
    }
  });

  app.post('/api/support/tickets/:ticketNumber/reply', requireAuth, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const msg = await addTicketReply(pool, req.authUser, ticketNumber, req.body?.message, false);
      return res.json({ ok: true, message: msg });
    } catch (e) {
      console.error('ticket reply:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not send reply.' });
    }
  });

  app.get('/api/admin/support/tickets', requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
      const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
      const params = [];
      const clauses = [];

      if (status && status !== 'all') {
        if (status === 'open') {
          clauses.push(`status NOT IN ('resolved','closed')`);
        } else if (status === 'urgent') {
          clauses.push(`priority='urgent'`);
        } else if (status === 'waiting') {
          clauses.push(`status LIKE 'waiting_%'`);
        } else {
          params.push(status);
          clauses.push(`status=$${params.length}`);
        }
      }

      if (q) {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        clauses.push(`(
          ticket_number ILIKE ${p} OR subject ILIKE ${p} OR user_name ILIKE ${p}
          OR user_email ILIKE ${p} OR user_phone ILIKE ${p}
          OR CAST(related_job_id AS TEXT) ILIKE ${p}
          OR CAST(related_quote_id AS TEXT) ILIKE ${p}
          OR CAST(related_invoice_id AS TEXT) ILIKE ${p}
        )`);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM support_tickets ${where} ORDER BY updated_at DESC, created_at DESC LIMIT 200`,
        params
      );
      return res.json({ ok: true, tickets: rows.map(rowToTicket) });
    } catch (e) {
      console.error('admin list support tickets:', e);
      return res.status(500).json({ ok: false, message: 'Could not load tickets.' });
    }
  });

  app.get('/api/admin/support/tickets/:ticketNumber', requireAuth, requireAdmin, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const ticketRow = await loadTicketByNumber(pool, ticketNumber);
      if (!ticketRow) {
        return res.status(404).json({ ok: false, message: 'Ticket not found.' });
      }
      const full = await loadFullTicket(pool, ticketRow, req.authUser);
      return res.json({ ok: true, ...full });
    } catch (e) {
      console.error('admin get support ticket:', e);
      return res.status(500).json({ ok: false, message: 'Could not load ticket.' });
    }
  });

  app.patch('/api/admin/support/tickets/:ticketNumber', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const ticket = await updateTicketFields(pool, req.authUser, ticketNumber, req.body || {});
      return res.json({ ok: true, ticket });
    } catch (e) {
      console.error('admin update support ticket:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not update ticket.' });
    }
  });

  app.post('/api/admin/support/tickets/:ticketNumber/reply', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const ticketNumber = String(req.params.ticketNumber || '').trim();
      const isInternal = Boolean(req.body?.internal);
      const msg = await addTicketReply(pool, req.authUser, ticketNumber, req.body?.message, isInternal);
      return res.json({ ok: true, message: msg });
    } catch (e) {
      console.error('admin ticket reply:', e);
      return res.status(e.status || 500).json({ ok: false, message: e.message || 'Could not send reply.' });
    }
  });
}
