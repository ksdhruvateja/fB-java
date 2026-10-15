/**
 * FixBridge Commercial: shared rules (numbering, timeline, exceptions, permissions, readiness and
 * invoice checks, outbound messages). Routes stay thin and call into these.
 */
import { sendMail } from '../mail.js';
import { canSeeMoney, isOffice } from './auth.js';

export const PLAN_SEATS = { network: 1, essentials: 3, team: 10 };
export const PLAN_PRICES = { network: 0, essentials: 99, team: 199 };
export const EXTRA_SEAT_PRICE = 15;
export const FOUNDING_LIMIT = 10;
export const FOUNDING_PRICE = 49;

export const JOB_STATUSES = [
  'received', 'accepted', 'in_progress', 'proposal_needed', 'awaiting_approval', 'return_visit_needed',
  'work_complete', 'completed', 'invoiced', 'paid', 'declined', 'cancelled',
];
export const VISIT_OUTCOMES = ['completed', 'diagnosis_only', 'parts_needed', 'return_visit', 'no_access', 'awaiting_approval'];
const OUTCOME_JOB_STATUS = {
  completed: 'work_complete',
  diagnosis_only: 'proposal_needed',
  parts_needed: 'return_visit_needed',
  return_visit: 'return_visit_needed',
  no_access: 'return_visit_needed',
  awaiting_approval: 'awaiting_approval',
};
export const outcomeJobStatus = (outcome) => OUTCOME_JOB_STATUS[outcome] || 'in_progress';

export const num = (v) => (v == null || v === '' ? null : Number(v));
export const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
export const clean = (s, max = 4000) => String(s ?? '').trim().slice(0, max);

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export async function tx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function nextNumber(db, companyId, kind) {
  const column = kind === 'invoice' ? 'next_invoice_seq' : 'next_job_seq';
  const { rows } = await db.query(
    `UPDATE commercial_companies SET ${column} = ${column} + 1 WHERE id=$1 RETURNING ${column} - 1 AS seq`,
    [companyId]
  );
  return `${kind === 'invoice' ? 'INV' : 'J'}-${rows[0].seq}`;
}

export async function logEvent(db, job, kind, summary, data = {}, actorId = null, occurredAt = null) {
  await db.query(
    `INSERT INTO commercial_job_events (company_id, job_id, kind, summary, data, actor_user_id, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, NOW()))`,
    [job.company_id, job.id, kind, summary, JSON.stringify(data || {}), actorId, occurredAt]
  );
}

/** The person exceptions go to when no one is named: the company's default, else its first owner. */
export async function defaultAssignee(db, companyId) {
  const { rows } = await db.query(
    `SELECT COALESCE(
       (SELECT c.default_assignee_user_id FROM commercial_companies c
          JOIN commercial_users u ON u.id = c.default_assignee_user_id AND u.active
         WHERE c.id=$1),
       (SELECT id FROM commercial_users WHERE company_id=$1 AND role='owner' AND active ORDER BY id LIMIT 1)
     ) AS id`,
    [companyId]
  );
  return rows[0]?.id || null;
}

/** Opens an exception unless one with the same dedupe key is already open. */
export async function openException(db, companyId, { jobId = null, invoiceId = null, kind, title, detail = '', dedupeKey = null, assignedUserId = null }) {
  const assignee = assignedUserId || (await defaultAssignee(db, companyId));
  const { rows } = await db.query(
    `INSERT INTO commercial_exceptions (company_id, job_id, invoice_id, kind, title, detail, assigned_user_id, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL DO NOTHING
     RETURNING *`,
    [companyId, jobId, invoiceId, kind, clean(title, 300), clean(detail, 4000), assignee, dedupeKey]
  );
  return rows[0] || null;
}

export async function resolveExceptions(db, companyId, dedupeKey, note, userId) {
  await db.query(
    `UPDATE commercial_exceptions SET status='resolved', resolution_note=$3, resolved_by=$4, resolved_at=NOW()
      WHERE company_id=$1 AND dedupe_key=$2 AND status='open'`,
    [companyId, dedupeKey, note, userId]
  );
}

/** A job the user may see: same company, and for technicians, assigned to them or visited by them. */
export async function loadJobFor(db, user, jobId, { forUpdate = false } = {}) {
  const id = Number(jobId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows } = await db.query(
    `SELECT * FROM commercial_jobs WHERE id=$1 AND company_id=$2 ${forUpdate ? 'FOR UPDATE' : ''}`,
    [id, user.company_id]
  );
  const job = rows[0];
  if (!job) return null;
  if (!isOffice(user) && !(await technicianOnJob(db, user, job))) return null;
  return job;
}

async function technicianOnJob(db, user, job) {
  if ((job.assigned_user_ids || []).map(Number).includes(Number(user.id))) return true;
  const { rows } = await db.query(
    'SELECT 1 FROM commercial_visits WHERE job_id=$1 AND company_id=$2 AND technician_user_id=$3 LIMIT 1',
    [job.id, job.company_id, user.id]
  );
  return rows.length > 0;
}

const MONEY_FIELDS = ['nte_amount', 'authorized_amount'];

/** Job as the user may see it: money removed for people without financial access. */
export function presentJob(job, user) {
  const out = { ...job };
  for (const key of ['nte_amount', 'authorized_amount']) out[key] = out[key] == null ? null : Number(out[key]);
  if (!canSeeMoney(user)) {
    for (const key of MONEY_FIELDS) delete out[key];
    out.money_hidden = true;
  }
  return out;
}

export function presentProposal(p, user) {
  const out = { ...p, total: Number(p.total) };
  if (!canSeeMoney(user)) {
    out.total = null;
    out.labor_lines = (p.labor_lines || []).map(({ description, hours }) => ({ description, hours }));
    out.material_lines = (p.material_lines || []).map(({ description, quantity }) => ({ description, quantity }));
    out.money_hidden = true;
  }
  return out;
}

export function lineTotal(lines, qtyKey, priceKey) {
  return round2((lines || []).reduce((sum, l) => sum + Number(l[qtyKey] || 0) * Number(l[priceKey] || 0), 0));
}

export function normalizeLaborLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 50).map((l) => ({
    description: clean(l?.description, 300),
    hours: Math.max(0, Number(l?.hours) || 0),
    rate: Math.max(0, Number(l?.rate) || 0),
  })).filter((l) => l.description || l.hours);
}

export function normalizeMaterialLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 100).map((l) => ({
    description: clean(l?.description, 300),
    quantity: Math.max(0, Number(l?.quantity) || 0),
    unit_cost: Math.max(0, Number(l?.unit_cost) || 0),
  })).filter((l) => l.description || l.quantity);
}

export function proposalTotal(labor, materials) {
  return round2(lineTotal(labor, 'hours', 'rate') + lineTotal(materials, 'quantity', 'unit_cost'));
}

/** Current authorized amount: the latest approved amount, else the original NTE. */
export function authorizedLimit(job) {
  const value = job.authorized_amount ?? job.nte_amount;
  return value == null ? null : Number(value);
}

// ── Completion package ───────────────────────────────────────────────────────
export function completionChecks({ job, visits, files, approvals, customer }, { signoffName = '' } = {}) {
  const checks = [];
  const add = (code, ok, label, detail = '', severity = 'blocking') => checks.push({ code, ok, label, detail, severity });
  const completedVisits = visits.filter((v) => v.outcome === 'completed');
  add('completed_visit', completedVisits.length > 0, 'A technician checked out with the work completed',
    completedVisits.length ? '' : 'No visit has the outcome “Completed” yet.');
  const active = visits.filter((v) => v.status === 'en_route' || v.status === 'on_site');
  add('no_active_visits', active.length === 0, 'No technician is still on the way or on site',
    active.length ? `${active.length} visit(s) still open.` : '');
  const notes = visits.some((v) => clean(v.work_performed));
  add('work_notes', notes, 'Work performed is written up', notes ? '' : 'Add what was done at check-out.');
  const needPhotos = customer ? customer.requires_completion_photos !== false : true;
  const afterPhotos = files.filter((f) => f.kind === 'photo' && (f.stage === 'after' || f.stage === 'completion'));
  add('completion_photos', !needPhotos || afterPhotos.length > 0, 'Completion (after) photos attached',
    needPhotos && !afterPhotos.length ? 'Add at least one “after” photo.' : '', needPhotos ? 'blocking' : 'warning');
  if (job.checkin_method && job.checkin_method !== 'none') {
    const pending = visits.filter((v) => v.arrived_at && v.external_checkin_status === 'pending');
    const failedUndocumented = visits.filter((v) => ['failed', 'exception'].includes(v.external_checkin_status) && !clean(v.external_checkin_note));
    add('external_checkin', pending.length === 0 && failedUndocumented.length === 0, 'Customer check-in recorded for every visit',
      pending.length ? `${pending.length} visit(s) have no confirmation or recorded failure.` : failedUndocumented.length ? 'Explain the failed check-in.' : '');
  }
  const openApprovals = approvals.filter((a) => a.status === 'pending' || a.status === 'needs_review');
  add('authorizations', openApprovals.length === 0, 'No authorization is still waiting for a decision',
    openApprovals.length ? `${openApprovals.length} waiting.` : '');
  if (customer?.requires_signoff) {
    const name = clean(signoffName || job.signoff_name);
    add('signoff', Boolean(name), 'Customer sign-off name recorded', name ? '' : 'Enter who signed off on site.');
  }
  return checks;
}

// ── Invoice checks ───────────────────────────────────────────────────────────
export function invoiceChecks({ invoice, job, proposals, approvals, otherInvoices }) {
  const checks = [];
  const add = (code, ok, label, detail = '', severity = 'blocking') => checks.push({ code, ok, label, detail, severity });
  const portal = invoice.submission_method === 'portal';
  add('recipient', portal || /\S+@\S+\.\S+/.test(invoice.recipient), 'Recipient is set',
    portal ? 'Submitted through the customer portal.' : invoice.recipient ? '' : 'Add the billing email from the customer profile.');
  add('wo_reference', Boolean(clean(invoice.wo_reference)), 'Work order number on the invoice');
  const limit = authorizedLimit(job);
  const total = Number(invoice.total || 0);
  if (limit == null) add('within_authorized', true, 'Within the authorized amount', 'No NTE on file for this job.', 'warning');
  else add('within_authorized', total <= limit + 0.005, 'Within the authorized amount',
    total > limit ? `Invoice $${total.toFixed(2)} is over the authorized $${limit.toFixed(2)}. Get an NTE increase approved first.` : `Authorized: $${limit.toFixed(2)}.`);
  const pending = proposals.filter((p) => p.status === 'submitted') .length + approvals.filter((a) => a.status === 'pending' || a.status === 'needs_review').length;
  add('change_orders', pending === 0, 'Change orders and proposals are decided', pending ? 'Additional work is still waiting for authorization.' : '');
  const lines = invoice.lines || [];
  const linesOk = lines.length > 0 && lines.every((l) => clean(l.description) && Number(l.quantity) > 0) && total > 0;
  add('lines', linesOk, 'Line items have descriptions, quantities and a total above $0');
  add('labor_materials', lines.some((l) => l.type === 'labor' || l.type === 'material'), 'Labor and materials are itemized', '', 'warning');
  add('completion', Boolean(job.completion_finalized_at), 'Completion package finalized',
    job.completion_finalized_at ? '' : 'Finalize the completion package first.');
  add('service_dates', Boolean(clean(invoice.service_dates)), 'Service dates on the invoice');
  const dupes = otherInvoices.filter((o) => o.id !== invoice.id && o.status !== 'void');
  add('duplicate', dupes.length === 0, 'Not already billed',
    dupes.length ? `Already invoiced as ${dupes.map((d) => d.invoice_number).join(', ')}. Void the other invoice first.` : '');
  return checks;
}

export const failingBlocking = (checks) => checks.filter((c) => !c.ok && c.severity === 'blocking');

export function invoiceTotals(lines, tax = 0) {
  const subtotal = round2((lines || []).reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0));
  return { subtotal, tax: round2(tax), total: round2(subtotal + Number(tax || 0)) };
}

export function normalizeInvoiceLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 100).map((l) => ({
    type: ['labor', 'material', 'trip', 'other'].includes(l?.type) ? l.type : 'other',
    description: clean(l?.description, 300),
    quantity: Math.max(0, Number(l?.quantity) || 0),
    unit_price: Math.max(0, Number(l?.unit_price) || 0),
  }));
}

// ── Templates and outbound messages ──────────────────────────────────────────
export function fillTemplate(format, values) {
  return String(format || '').replace(/\{(\w+)\}/g, (_, key) => clean(values[key] ?? '', 200)).replace(/\s+-\s+(?=-|$)/g, ' ').trim();
}

/**
 * Sends (or records) one outbound message. The idempotency key makes a second send of the same
 * thing a no-op unless resend is explicitly asked for with a reason.
 */
export async function deliverMessage(db, company, { jobId, kind, channel, recipient, subject, body, idempotencyKey, reference = '', resendReason = '', userId }) {
  let key = idempotencyKey;
  const existing = await db.query(
    `SELECT * FROM commercial_messages WHERE company_id=$1 AND (idempotency_key=$2 OR idempotency_key LIKE $2 || ':resend:%')
      ORDER BY id DESC`,
    [company.id, idempotencyKey]
  );
  const delivered = existing.rows.find((m) => m.status === 'sent' || m.status === 'recorded');
  if (delivered && !resendReason) {
    throw new HttpError(409, `Already ${delivered.status === 'sent' ? 'sent' : 'recorded'} on ${new Date(delivered.created_at).toLocaleString('en-US')}. To send again, give a reason.`, { message: delivered });
  }
  if (existing.rows.length) key = `${idempotencyKey}:resend:${existing.rows.length}`;

  const inserted = await db.query(
    `INSERT INTO commercial_messages (company_id, job_id, kind, channel, recipient, subject, body, status, reference, idempotency_key, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'sending',$8,$9,$10)
     ON CONFLICT (company_id, idempotency_key) DO NOTHING RETURNING *`,
    [company.id, jobId, kind, channel, clean(recipient, 500), clean(subject, 300), clean(body, 20000), clean(reference, 300) + (resendReason ? ` (resend: ${clean(resendReason, 200)})` : ''), key, userId]
  );
  if (!inserted.rows[0]) throw new HttpError(409, 'This message is already being sent.');
  const msg = inserted.rows[0];

  if (channel !== 'email') {
    const { rows } = await db.query(`UPDATE commercial_messages SET status='recorded' WHERE id=$1 RETURNING *`, [msg.id]);
    return { ok: true, message: rows[0] };
  }
  const recipients = String(recipient || '').split(/[,;\s]+/).filter((r) => /\S+@\S+\.\S+/.test(r));
  if (!recipients.length) {
    await db.query(`UPDATE commercial_messages SET status='failed', error='No valid recipient' WHERE id=$1`, [msg.id]);
    return { ok: false, error: 'No valid recipient email.', message: { ...msg, status: 'failed' } };
  }
  const result = await sendMail({
    to: recipients.join(', '),
    subject,
    text: body,
    replyTo: company.email || undefined,
    headers: { 'X-FixBridge-Commercial': `${company.id}:${kind}` },
  });
  const status = result.ok ? 'sent' : 'failed';
  const { rows } = await db.query(
    `UPDATE commercial_messages SET status=$2, error=$3 WHERE id=$1 RETURNING *`,
    [msg.id, status, result.ok ? (result.simulated ? 'simulated (outbound email disabled)' : '') : clean(result.message, 500)]
  );
  return { ok: result.ok, error: result.ok ? '' : result.message, message: rows[0] };
}

export function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function invoiceEmailBody({ company, job, invoice }) {
  const lines = (invoice.lines || []).map((l) => `  ${l.description} — ${l.quantity} × ${money(l.unit_price)} = ${money(Number(l.quantity) * Number(l.unit_price))}`);
  return [
    `Invoice ${invoice.invoice_number} from ${company.name}`,
    '',
    `Work order: ${invoice.wo_reference}`,
    job.po_number ? `PO: ${job.po_number}` : '',
    `Site: ${[job.site_name, job.site_address].filter(Boolean).join(', ')}`,
    `Service dates: ${invoice.service_dates}`,
    '',
    ...lines,
    '',
    `Subtotal: ${money(invoice.subtotal)}`,
    Number(invoice.tax) ? `Tax: ${money(invoice.tax)}` : '',
    `Total due: ${money(invoice.total)}`,
    invoice.notes ? `\n${invoice.notes}` : '',
    '',
    `Completion: ${clean(job.completion_summary) || 'Work completed as described above.'}`,
    '',
    `${company.name}${company.phone ? ` · ${company.phone}` : ''}${company.email ? ` · ${company.email}` : ''}`,
  ].filter((l) => l !== '').join('\n');
}

export function proposalEmailBody({ company, job, proposal }) {
  const labor = (proposal.labor_lines || []).map((l) => `  Labor: ${l.description} — ${l.hours} h × ${money(l.rate)}`);
  const materials = (proposal.material_lines || []).map((l) => `  Material: ${l.description} — ${l.quantity} × ${money(l.unit_cost)}`);
  return [
    `Proposal for work order ${proposal.wo_reference || job.external_wo_number} (version ${proposal.version})`,
    `Site: ${[job.site_name, job.site_address].filter(Boolean).join(', ')}`,
    '',
    `Findings:\n${proposal.findings}`,
    '',
    `Proposed scope:\n${proposal.scope}`,
    proposal.exclusions ? `\nExclusions:\n${proposal.exclusions}` : '',
    proposal.timing ? `\nTiming: ${proposal.timing}` : '',
    '',
    ...labor,
    ...materials,
    '',
    `Total: ${money(proposal.total)}`,
    authorizedLimit(job) != null ? `Current authorized amount (NTE): ${money(authorizedLimit(job))}` : '',
    '',
    'Please reply with written approval (and the approved amount) before we proceed.',
    `${company.name}${company.phone ? ` · ${company.phone}` : ''}`,
  ].filter((l) => l !== '').join('\n');
}

export function acceptanceEmailBody({ company, job }) {
  return [
    `${company.name} has accepted work order ${job.external_wo_number}.`,
    `Site: ${[job.site_name, job.site_address].filter(Boolean).join(', ')}`,
    job.eta_at ? `ETA: ${formatInZone(job.eta_at, job.timezone || company.timezone)}` : '',
    '',
    `${company.name}${company.phone ? ` · ${company.phone}` : ''}`,
  ].filter(Boolean).join('\n');
}

export function formatInZone(date, timeZone) {
  try {
    return new Date(date).toLocaleString('en-US', { timeZone: timeZone || 'America/New_York', dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' });
  } catch {
    return new Date(date).toISOString();
  }
}

// ── Founding offer ───────────────────────────────────────────────────────────
/** Where a company is in its plan: founding trial, founding price, or standard price. */
export function billingTimeline(company, now = new Date()) {
  const seats = (PLAN_SEATS[company.plan] || 1) + Number(company.extra_seats || 0);
  const standard = (PLAN_PRICES[company.plan] || 0) + Number(company.extra_seats || 0) * EXTRA_SEAT_PRICE;
  const base = { plan: company.plan, seats, standard_monthly: standard };
  if (!company.founding_member || company.plan === 'network') return { ...base, phase: 'standard', monthly: standard };
  if (!company.intake_configured_at || !company.first_job_processed_at) {
    return {
      ...base,
      phase: 'waiting',
      monthly: 0,
      waiting_for: [!company.intake_configured_at && 'intake setup', !company.first_job_processed_at && 'first real job'].filter(Boolean),
    };
  }
  const start = new Date(company.trial_started_at || Math.max(new Date(company.intake_configured_at), new Date(company.first_job_processed_at)));
  const trialEnds = new Date(start.getTime() + 30 * 24 * 3600 * 1000);
  const foundingEnds = new Date(trialEnds);
  foundingEnds.setMonth(foundingEnds.getMonth() + 12);
  const foundingMonthly = FOUNDING_PRICE + Number(company.extra_seats || 0) * EXTRA_SEAT_PRICE;
  const phase = now < trialEnds ? 'trial' : now < foundingEnds ? 'founding' : 'standard';
  return {
    ...base,
    phase,
    monthly: phase === 'trial' ? 0 : phase === 'founding' ? foundingMonthly : standard,
    trial_started_at: start.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    founding_price_ends_at: foundingEnds.toISOString(),
    founding_monthly: foundingMonthly,
  };
}

/** Starts the founding trial clock once intake is configured and a real job has been processed. */
export async function maybeStartTrial(db, companyId) {
  await db.query(
    `UPDATE commercial_companies SET trial_started_at = GREATEST(intake_configured_at, first_job_processed_at), updated_at=NOW()
      WHERE id=$1 AND founding_member AND trial_started_at IS NULL
        AND intake_configured_at IS NOT NULL AND first_job_processed_at IS NOT NULL`,
    [companyId]
  );
}
