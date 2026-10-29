/**
 * FixBridge Commercial API, mounted at /api/commercial. Separate accounts, tokens, tables and
 * admin from the homeowner/contractor marketplace.
 */
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { ensureCommercialSchema } from './schema.js';
import {
  canSeeMoney, hashToken, isOffice, makeCommercialAdminToken, makeCommercialUserToken, newInviteToken,
  requireCommercialAdmin, requireCommercialUser, signedFileUrl, verifyFileSignature,
} from './auth.js';
import { extractDispatch, makeFlag, mergeFlags, unresolvedBlocking, validateJobFields, validTimeZone } from './dispatch-extract.js';
import {
  EXTRA_SEAT_PRICE, FOUNDING_LIMIT, FOUNDING_PRICE, HttpError, JOB_STATUSES, PLAN_PRICES, PLAN_SEATS, VISIT_OUTCOMES,
  acceptanceEmailBody, authorizedLimit, billingTimeline, clean, completionChecks, deliverMessage, failingBlocking,
  fillTemplate, invoiceChecks, invoiceEmailBody, invoiceTotals, loadJobFor, logEvent, maybeStartTrial, nextNumber,
  normalizeInvoiceLines, normalizeLaborLines, normalizeMaterialLines, num, openException, outcomeJobStatus,
  presentJob, presentProposal, proposalEmailBody, proposalTotal, resolveExceptions, round2, tx,
} from './service.js';
import { sendMail } from '../mail.js';
import { verifyGoogleIdToken } from '../google-auth-routes.js';

/** The only Google account allowed to sign in to the commercial admin with Google. */
export const COMMERCIAL_GOOGLE_ADMIN_EMAIL = 'admin@fixbridge.us';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['owner', 'office', 'technician'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf|text\/plain|message\/rfc822)$/;
const SUBMISSION_METHODS = ['email', 'portal', 'mail', 'other'];
const CHECKIN_METHODS = ['none', 'phone_ivr', 'portal', 'code', 'email', 'other'];
const PRIORITIES = ['emergency', 'urgent', 'routine', 'scheduled'];
// Flags that come from the email text itself; editing their field during review settles them.
const TEXT_FLAGS = new Set(['wo_conflict', 'nte_conflict', 'nte_unclear', 'due_unclear', 'due_timezone_assumed', 'priority_unclear', 'checkin_unclear', 'scope_inferred', 'customer_unmatched', 'site_unmatched']);
const EDITABLE_JOB_FIELDS = [
  'external_wo_number', 'po_number', 'dispatcher_name', 'dispatcher_email', 'customer_id', 'billing_customer', 'site_id',
  'site_name', 'site_address', 'contacts', 'scope', 'trade', 'priority', 'due_at', 'timezone', 'nte_amount',
  'approval_conditions', 'billing_instructions', 'access_instructions', 'checkin_method', 'checkin_instructions', 'eta_at',
];

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ ok: false, message: err.message, ...err.extra });
    next(err);
  }
};

function requireOffice(req) {
  if (!isOffice(req.cuser)) throw new HttpError(403, 'Only the owner or office staff can do this.');
}
function requireOwner(req) {
  if (req.cuser.role !== 'owner') throw new HttpError(403, 'Only the company owner can do this.');
}
function intId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Not found.');
  return n;
}
function dateOrNull(value, label) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} is not a valid date.`);
  return d;
}
/** Times sent by a phone that was offline: accept the recorded time if it is plausible. */
function occurredAt(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return new Date();
  const now = Date.now();
  if (d.getTime() > now + 5 * 60 * 1000 || d.getTime() < now - 7 * 24 * 3600 * 1000) return new Date();
  return d;
}
function decodeUpload(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) throw new HttpError(400, 'The file could not be read.');
  const contentType = m[1].toLowerCase();
  if (!FILE_TYPES.test(contentType)) throw new HttpError(400, 'Use a photo, PDF, .eml or .txt file.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_FILE_BYTES) throw new HttpError(413, 'Files can be up to 8 MB.');
  return { contentType, bytes };
}
const publicUser = (u) => ({
  id: u.id, company_id: u.company_id, email: u.email, name: u.name, phone: u.phone, role: u.role,
  can_view_financials: isOffice(u) || u.can_view_financials, active: u.active,
  invited: !u.password_hash && !u.google_sub, last_login_at: u.last_login_at,
  google_linked: Boolean(u.google_sub),
  approval_status: u.approval_status || 'approved',
});

// Join codes avoid look-alike characters (0/O, 1/I/L).
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newJoinCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join('');
}

/** Ensures the company has a join code (creating one on first use) and returns it. */
async function companyJoinCode(db, companyId, regenerate = false) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { rows } = await db.query(
      `UPDATE commercial_companies SET join_code=$2 WHERE id=$1 ${regenerate ? '' : 'AND join_code IS NULL'} RETURNING join_code`,
      [companyId, newJoinCode()]
    ).catch((e) => {
      if (e.code === '23505') return { rows: null }; // code collision: try another
      throw e;
    });
    if (rows === null) continue;
    if (rows[0]) return rows[0].join_code;
    const existing = await db.query('SELECT join_code FROM commercial_companies WHERE id=$1', [companyId]);
    return existing.rows[0]?.join_code || null;
  }
  throw new HttpError(500, 'Could not create a join code. Please try again.');
}

/** Tells the commercial admin (COMMERCIAL_ADMIN_EMAIL) that an account is waiting. Never throws. */
async function notifyAdminOfPendingAccount(user, companyName) {
  const to = String(process.env.COMMERCIAL_ADMIN_EMAIL || '').trim();
  if (!to) return;
  await sendMail({
    to,
    subject: `FixBridge Commercial: ${user.role} account waiting for approval`,
    text: `${user.name} (${user.email}) requested a ${user.role} account for ${companyName}.\n\nReview it in the commercial admin under Account approvals.\n`,
  }).catch(() => {});
}

/**
 * Base URL for links in invites. APP_URL can point at the hosting provider's domain, so links use
 * PUBLIC_SITE_URL when set, otherwise the address the admin or owner is actually using.
 */
function appBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL;
  return String(configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

export function registerCommercialRoutes(app, { pool }) {
  const r = express.Router();
  r.use(wrap(async (_req, _res, next) => {
    await ensureCommercialSchema(pool);
    next();
  }));
  const userAuth = requireCommercialUser(pool);
  const adminAuth = requireCommercialAdmin(pool);
  const authLimiter = rateLimit({
    // Override only for automated tests (they sign in many times from one address).
    windowMs: 15 * 60 * 1000, max: Number(process.env.COMMERCIAL_AUTH_RATE_LIMIT_MAX || 20), standardHeaders: true, legacyHeaders: false,
    handler: (_q, res) => res.status(429).json({ ok: false, message: 'Too many attempts. Please wait a few minutes.' }),
  });
  const applyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
    handler: (_q, res) => res.status(429).json({ ok: false, message: 'Too many applications from this connection. Please try later.' }),
  });

  // ── Public ─────────────────────────────────────────────────────────────────
  r.get('/public/offer', wrap(async (_req, res) => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM commercial_companies WHERE founding_member');
    res.json({
      ok: true,
      plans: { network: { monthly: 0, seats: null }, essentials: { monthly: PLAN_PRICES.essentials, seats: PLAN_SEATS.essentials }, team: { monthly: PLAN_PRICES.team, seats: PLAN_SEATS.team } },
      extra_seat_monthly: EXTRA_SEAT_PRICE,
      founding: { limit: FOUNDING_LIMIT, remaining: Math.max(0, FOUNDING_LIMIT - rows[0].n), monthly: FOUNDING_PRICE },
    });
  }));

  r.post('/pilot-applications', applyLimiter, wrap(async (req, res) => {
    const b = req.body || {};
    const errors = {};
    const company = clean(b.company_name, 200);
    const contact = clean(b.contact_name, 200);
    const email = clean(b.email, 254).toLowerCase();
    if (company.length < 2) errors.company_name = 'Enter your company name.';
    if (contact.length < 2) errors.contact_name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email.';
    const phone = clean(b.phone, 40);
    if (phone && phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number.';
    const trades = (Array.isArray(b.trades) ? b.trades : []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 12);
    if (!trades.length) errors.trades = 'Pick at least one trade.';
    if (!b.consent) errors.consent = 'Please agree so we can contact you about the pilot.';
    if (Object.keys(errors).length) return res.status(400).json({ ok: false, message: 'Please fix the highlighted fields.', errors });
    const plan = ['network', 'essentials', 'team'].includes(b.plan_interest) ? b.plan_interest : 'essentials';
    const dup = await pool.query(
      `SELECT id FROM commercial_pilot_applications WHERE lower(email)=$1 AND status='new' AND created_at > NOW() - INTERVAL '30 days'`,
      [email]
    );
    if (dup.rows.length) return res.json({ ok: true, id: dup.rows[0].id, duplicate: true });
    const { rows } = await pool.query(
      `INSERT INTO commercial_pilot_applications
        (company_name, contact_name, email, phone, trades, service_area, team_size, dispatch_sources, monthly_dispatch_volume, current_tools, plan_interest, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [company, contact, email, phone, trades, clean(b.service_area, 300), clean(b.team_size, 40), clean(b.dispatch_sources, 1000),
        clean(b.monthly_dispatch_volume, 60), clean(b.current_tools, 500), plan, clean(b.message, 3000)]
    );
    res.json({ ok: true, id: rows[0].id });
  }));

  // ── Company sign-in ────────────────────────────────────────────────────────
  r.post('/auth/login', authLimiter, wrap(async (req, res) => {
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = String(req.body?.password || '');
    const { rows } = await pool.query(
      `SELECT u.*, c.status AS company_status FROM commercial_users u JOIN commercial_companies c ON c.id=u.company_id WHERE u.email=$1`,
      [email]
    );
    const user = rows[0];
    const ok = user?.password_hash && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
    return finishCompanyLogin(req, res, user);
  }));

  /** Checks shared by password and Google sign-in, then issues the session. */
  async function finishCompanyLogin(req, res, user) {
    // Each role has its own sign-in page; point people to the right one.
    const wanted = String(req.body?.role || '');
    if (ROLES.includes(wanted) && wanted !== user.role) {
      const names = { owner: 'company owner', office: 'office staff', technician: 'technician' };
      return res.status(403).json({ ok: false, code: 'WRONG_ROLE', role: user.role, message: `This is a ${names[user.role]} account. Use the ${names[user.role]} sign-in.` });
    }
    if (user.approval_status === 'pending') {
      return res.status(403).json({ ok: false, code: 'PENDING_APPROVAL', message: 'Your account is waiting for FixBridge approval. We will email you when it is ready.' });
    }
    if (user.approval_status === 'rejected') {
      return res.status(403).json({ ok: false, code: 'NOT_APPROVED', message: 'This account request was not approved. Contact FixBridge.' });
    }
    // Approval state is reported first (rejection deactivates the account); other inactive
    // accounts keep the generic message.
    if (!user.active) return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
    if (['suspended', 'cancelled'].includes(user.company_status)) {
      return res.status(403).json({ ok: false, message: 'This company account is not active. Contact FixBridge.' });
    }
    await pool.query('UPDATE commercial_users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    return res.json({ ok: true, token: makeCommercialUserToken(user), user: publicUser(user) });
  }

  // ── Google sign-in / sign-up for owners, office staff and technicians ──────
  r.post('/auth/google', authLimiter, wrap(async (req, res) => {
    const verified = await verifyGoogleIdToken(String(req.body?.credential || ''));
    if (!verified.ok) {
      const msg = verified.reason === 'missing'
        ? 'Google sign-in is not set up on this site yet.'
        : verified.reason === 'email_unverified'
          ? 'Your Google email is not verified.'
          : 'Google sign-in failed. Please try again.';
      return res.status(401).json({ ok: false, code: 'GOOGLE_FAILED', message: msg });
    }
    const g = verified.user;
    const { rows } = await pool.query(
      `SELECT u.*, c.status AS company_status FROM commercial_users u JOIN commercial_companies c ON c.id=u.company_id
        WHERE u.google_sub=$1 OR u.email=$2 ORDER BY (u.google_sub=$1) DESC NULLS LAST LIMIT 1`,
      [g.sub, g.email]
    );
    let user = rows[0];
    if (user) {
      if (user.google_sub && user.google_sub !== g.sub) {
        return res.status(403).json({ ok: false, code: 'GOOGLE_MISMATCH', message: 'This account is linked to a different Google account.' });
      }
      if (!user.google_sub) {
        // Save the Google link; an outstanding invite is accepted by signing in with Google.
        const { rows: linked } = await pool.query(
          `UPDATE commercial_users SET google_sub=$2, invite_token_hash=NULL, invite_expires_at=NULL WHERE id=$1 RETURNING *`,
          [user.id, g.sub]
        );
        user = { ...linked[0], company_status: user.company_status };
      }
      return finishCompanyLogin(req, res, user);
    }
    if (req.body?.intent !== 'signup') {
      return res.status(404).json({
        ok: false,
        code: 'NO_ACCOUNT',
        message: `No FixBridge Commercial account uses ${g.email}. Create an account first, or ask your company owner to invite you.`,
      });
    }
    const input = readSignupInput({ ...req.body, email: g.email, name: clean(req.body?.name, 200) || g.name }, { needPassword: false });
    if (input.errors) return res.status(400).json({ ok: false, message: 'Please fix the highlighted fields.', errors: input.errors });
    const { user: created, company } = await createPendingAccount({ ...input, passwordHash: null, googleSub: g.sub });
    await notifyAdminOfPendingAccount(created, company.name);
    res.json({ ok: true, pending: true, message: 'Thanks! Your account is waiting for FixBridge approval. We will email you when you can sign in with Google.' });
  }));

  r.get('/auth/invite', authLimiter, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.email, u.name, c.name AS company_name FROM commercial_users u JOIN commercial_companies c ON c.id=u.company_id
        WHERE u.invite_token_hash=$1 AND u.invite_expires_at > NOW()`,
      [hashToken(req.query.token)]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, message: 'This link has expired or was already used. Ask your company owner for a new one.' });
    res.json({ ok: true, ...rows[0] });
  }));

  // ── Self sign-up: owners register a company; office staff and technicians join one with the
  // company's join code. Every account waits for a FixBridge commercial admin to approve it.
  /** Validates sign-up fields (password optional for Google sign-up). */
  function readSignupInput(b, { needPassword }) {
    const role = ROLES.includes(b.role) ? b.role : null;
    const email = clean(b.email, 254).toLowerCase();
    const name = clean(b.name, 200);
    const phone = clean(b.phone, 40);
    const password = String(b.password || '');
    const companyName = clean(b.company_name, 200);
    const joinCode = clean(b.join_code, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const errors = {};
    if (!role) errors.role = 'Choose an account type.';
    if (name.length < 2) errors.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email.';
    if (phone && phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid phone number.';
    if (needPassword && password.length < 10) errors.password = 'Use at least 10 characters.';
    if (role === 'owner' && companyName.length < 2) errors.company_name = 'Enter your company name.';
    if (role && role !== 'owner' && !joinCode) errors.join_code = 'Enter the join code from your company owner.';
    if (Object.keys(errors).length) return { errors };
    const trades = (Array.isArray(b.trades) ? b.trades : []).map((t) => clean(t, 60)).filter(Boolean).slice(0, 12);
    return { role, email, name, phone, password, companyName, joinCode, trades, serviceArea: clean(b.service_area, 300) };
  }

  /** Creates an account that waits for commercial-admin approval (and, for owners, its company). */
  async function createPendingAccount({ role, email, name, phone, companyName, joinCode, trades, serviceArea, passwordHash, googleSub }) {
    return tx(pool, async (db) => {
      const taken = await db.query('SELECT 1 FROM commercial_users WHERE email=$1', [email]);
      if (taken.rows.length) throw new HttpError(409, 'That email already has a FixBridge Commercial account. Sign in instead.');
      let companyRow;
      if (role === 'owner') {
        const { rows } = await db.query(
          `INSERT INTO commercial_companies (name, email, phone, trades, service_area, plan, status)
           VALUES ($1,$2,$3,$4,$5,'essentials','pending') RETURNING *`,
          [companyName, email, phone, trades, serviceArea]
        );
        companyRow = rows[0];
      } else {
        const { rows } = await db.query('SELECT * FROM commercial_companies WHERE join_code=$1', [joinCode]);
        companyRow = rows[0];
        if (!companyRow) throw new HttpError(404, 'That join code was not found. Check it with your company owner.');
        if (['pending', 'suspended', 'cancelled'].includes(companyRow.status)) {
          throw new HttpError(403, 'This company is not active on FixBridge Commercial yet.');
        }
      }
      const { rows } = await db.query(
        `INSERT INTO commercial_users (company_id, email, name, phone, role, can_view_financials, password_hash, google_sub, approval_status, signup_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending','self_signup') RETURNING *`,
        [companyRow.id, email, name, phone, role, role !== 'technician', passwordHash, googleSub || null]
      );
      return { user: rows[0], company: companyRow };
    });
  }

  // ── Self sign-up: owners register a company; office staff and technicians join one with the
  // company's join code. Every account waits for a FixBridge commercial admin to approve it.
  r.post('/auth/signup', authLimiter, wrap(async (req, res) => {
    const input = readSignupInput(req.body || {}, { needPassword: true });
    if (input.errors) return res.status(400).json({ ok: false, message: 'Please fix the highlighted fields.', errors: input.errors });
    const passwordHash = await bcrypt.hash(input.password, 12);
    const { user, company } = await createPendingAccount({ ...input, passwordHash, googleSub: null });
    await notifyAdminOfPendingAccount(user, company.name);
    res.json({
      ok: true,
      pending: true,
      message: 'Thanks! Your account is waiting for FixBridge approval. We will email you when you can sign in.',
    });
  }));

  r.post('/auth/set-password', authLimiter, wrap(async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 10) return res.status(400).json({ ok: false, message: 'Use at least 10 characters.' });
    const { rows } = await pool.query(
      `UPDATE commercial_users SET password_hash=$2, invite_token_hash=NULL, invite_expires_at=NULL, last_login_at=NOW()
        WHERE invite_token_hash=$1 AND invite_expires_at > NOW() AND active RETURNING *`,
      [hashToken(req.body?.token), await bcrypt.hash(password, 12)]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, message: 'This link has expired or was already used. Ask your company owner for a new one.' });
    if (rows[0].approval_status && rows[0].approval_status !== 'approved') {
      return res.json({ ok: true, pending: true, message: 'Your password is set. Your account is waiting for FixBridge approval; we will email you when you can sign in.' });
    }
    res.json({ ok: true, token: makeCommercialUserToken(rows[0]), user: publicUser(rows[0]) });
  }));

  r.post('/auth/change-password', authLimiter, userAuth, wrap(async (req, res) => {
    const current = String(req.body?.current_password || '');
    const next = String(req.body?.new_password || '');
    if (next.length < 10) throw new HttpError(400, 'Use at least 10 characters for the new password.');
    if (!(await bcrypt.compare(current, req.cuser.password_hash))) throw new HttpError(400, 'Your current password is incorrect.');
    await pool.query('UPDATE commercial_users SET password_hash=$2 WHERE id=$1', [req.cuser.id, await bcrypt.hash(next, 12)]);
    res.json({ ok: true });
  }));

  r.get('/me', userAuth, wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM commercial_companies WHERE id=$1', [req.cuser.company_id]);
    res.json({ ok: true, user: publicUser(req.cuser), company: presentCompany(rows[0], req.cuser) });
  }));

  // ── Today ──────────────────────────────────────────────────────────────────
  r.get('/today', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const cid = u.company_id;
    const tech = !isOffice(u);
    const scope = tech ? `AND ($2::int = ANY(j.assigned_user_ids) OR EXISTS (SELECT 1 FROM commercial_visits v WHERE v.job_id=j.id AND v.technician_user_id=$2))` : 'AND $2::int IS NOT NULL';
    const jobs = (await pool.query(
      `SELECT j.* FROM commercial_jobs j WHERE j.company_id=$1 ${scope} AND j.status NOT IN ('paid','declined','cancelled')
        ORDER BY COALESCE(j.due_at, j.created_at) ASC LIMIT 500`,
      [cid, u.id]
    )).rows;
    const activeVisits = (await pool.query(
      `SELECT v.*, j.job_number, j.external_wo_number, j.site_name, j.site_address FROM commercial_visits v JOIN commercial_jobs j ON j.id=v.job_id
        WHERE v.company_id=$1 AND v.status IN ('en_route','on_site','scheduled') ${tech ? 'AND v.technician_user_id=$2' : 'AND $2::int IS NOT NULL'}
        ORDER BY v.created_at`,
      [cid, u.id]
    )).rows;
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const now = Date.now();
    const open = (s) => !['completed', 'invoiced', 'paid', 'declined', 'cancelled'].includes(s);
    const pick = (fn) => jobs.filter(fn).map((j) => presentJob(j, u));
    const buckets = {
      needs_review: tech ? [] : pick((j) => j.status === 'received' && j.review_status !== 'reviewed'),
      awaiting_acceptance: tech ? [] : pick((j) => j.status === 'received' && j.review_status === 'reviewed'),
      overdue: pick((j) => j.due_at && new Date(j.due_at).getTime() < now && open(j.status) && j.status !== 'work_complete'),
      due_today: pick((j) => j.due_at && new Date(j.due_at).getTime() >= now && new Date(j.due_at) <= endOfDay && open(j.status)),
      return_visits: pick((j) => j.status === 'return_visit_needed' || j.status === 'proposal_needed'),
      awaiting_approval: pick((j) => j.status === 'awaiting_approval'),
      ready_to_close: tech ? [] : pick((j) => j.status === 'work_complete'),
      ready_to_invoice: [],
      assigned_to_me: tech ? pick((j) => ['accepted', 'in_progress', 'return_visit_needed', 'proposal_needed', 'awaiting_approval'].includes(j.status) && (j.assigned_user_ids || []).map(Number).includes(Number(u.id))) : [],
    };
    let invoices = [];
    if (canSeeMoney(u) && !tech) {
      buckets.ready_to_invoice = (await pool.query(
        `SELECT j.* FROM commercial_jobs j WHERE j.company_id=$1 AND j.status='completed'
           AND NOT EXISTS (SELECT 1 FROM commercial_invoices i WHERE i.job_id=j.id AND i.status <> 'void') ORDER BY j.completion_finalized_at`,
        [cid]
      )).rows.map((j) => presentJob(j, u));
      invoices = (await pool.query(
        `SELECT i.*, j.job_number, j.site_name FROM commercial_invoices i JOIN commercial_jobs j ON j.id=i.job_id
          WHERE i.company_id=$1 AND i.status IN ('delivery_failed','disputed','sent','acknowledged','draft') ORDER BY i.updated_at DESC LIMIT 100`,
        [cid]
      )).rows;
    }
    const exceptions = (await pool.query(
      `SELECT e.*, j.job_number FROM commercial_exceptions e LEFT JOIN commercial_jobs j ON j.id=e.job_id
        WHERE e.company_id=$1 AND e.status='open' ${tech ? 'AND e.assigned_user_id=$2' : 'AND $2::int IS NOT NULL'} ORDER BY e.created_at DESC LIMIT 100`,
      [cid, u.id]
    )).rows;
    res.json({
      ok: true,
      buckets,
      active_visits: activeVisits,
      invoice_problems: invoices.filter((i) => i.status === 'delivery_failed' || i.status === 'disputed'),
      unpaid_invoices: invoices.filter((i) => i.status === 'sent' || i.status === 'acknowledged').map((i) => ({ ...i, days_out: i.sent_at ? Math.floor((now - new Date(i.sent_at)) / 86400000) : 0 })),
      draft_invoices: invoices.filter((i) => i.status === 'draft'),
      exceptions,
      my_exceptions: exceptions.filter((e) => e.assigned_user_id === u.id),
    });
  }));

  // ── Jobs ───────────────────────────────────────────────────────────────────
  r.get('/jobs', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const params = [u.company_id, u.id];
    let where = 'j.company_id=$1';
    if (!isOffice(u)) where += ' AND ($2::int = ANY(j.assigned_user_ids) OR EXISTS (SELECT 1 FROM commercial_visits v WHERE v.job_id=j.id AND v.technician_user_id=$2))';
    else where += ' AND $2::int IS NOT NULL';
    const status = String(req.query.status || '');
    if (status === 'open') where += ` AND j.status NOT IN ('paid','declined','cancelled')`;
    else if (status === 'review') where += ` AND j.status='received' AND j.review_status <> 'reviewed'`;
    else if (JOB_STATUSES.includes(status)) { params.push(status); where += ` AND j.status=$${params.length}`; }
    const q = clean(req.query.q, 100);
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where += ` AND (lower(j.job_number) LIKE $${params.length} OR lower(j.external_wo_number) LIKE $${params.length} OR lower(j.site_name) LIKE $${params.length} OR lower(j.site_address) LIKE $${params.length} OR lower(j.dispatcher_name) LIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT j.*, (SELECT COUNT(*)::int FROM commercial_visits v WHERE v.job_id=j.id) AS visit_count
         FROM commercial_jobs j WHERE ${where} ORDER BY j.updated_at DESC LIMIT 300`,
      params
    );
    res.json({ ok: true, jobs: rows.map((j) => presentJob(j, u)) });
  }));

  r.get('/jobs/:id', userAuth, wrap(async (req, res) => {
    const job = await loadJobFor(pool, req.cuser, req.params.id);
    if (!job) throw new HttpError(404, 'Job not found.');
    res.json({ ok: true, ...(await jobBundle(pool, job, req.cuser)) });
  }));

  r.post('/intake/preview', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const company = await loadCompany(pool, req.cuser.company_id);
    const text = String(req.body?.text || '');
    if (text.trim().length < 20) throw new HttpError(400, 'Paste the full dispatch email.');
    const result = extractDispatch({ text, subject: req.body?.subject, from: req.body?.from, timezone: company.timezone });
    res.json({ ok: true, fields: result.fields, flags: result.flags, subject: result.subject, from: result.from });
  }));

  r.post('/intake', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const text = String(req.body?.text || '');
    if (text.trim().length < 20) throw new HttpError(400, 'Paste the full dispatch email, or upload the .eml file.');
    if (text.length > 500_000) throw new HttpError(413, 'This email is too long to read.');
    const attachments = (Array.isArray(req.body?.attachments) ? req.body.attachments : []).slice(0, 10).map((a) => ({ name: clean(a?.name, 200), ...decodeUpload(a?.dataUrl) }));
    const result = await tx(pool, async (db) => {
      const company = await loadCompany(db, u.company_id, true);
      const extracted = extractDispatch({ text, subject: req.body?.subject, from: req.body?.from, timezone: company.timezone });
      const hash = extracted.contentHash;
      const same = await db.query(
        'SELECT id, job_id FROM commercial_dispatch_emails WHERE company_id=$1 AND content_hash=$2 ORDER BY id LIMIT 1',
        [u.company_id, hash]
      );
      if (same.rows[0]?.job_id) {
        return { outcome: 'duplicate_ignored', job_id: same.rows[0].job_id, message: 'This exact email was already processed. Nothing was changed.' };
      }
      const f = extracted.fields;
      const existing = f.external_wo_number ? await findJobByWo(db, u.company_id, f.external_wo_number, f.dispatcher_email) : null;
      const emailRow = (await db.query(
        `INSERT INTO commercial_dispatch_emails (company_id, source, from_address, subject, received_at, raw_text, content_hash, extracted, flags, outcome, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [u.company_id, req.body?.source === 'upload' ? 'upload' : 'paste', extracted.from, extracted.subject,
          extracted.date && !Number.isNaN(new Date(extracted.date).getTime()) ? new Date(extracted.date) : null,
          text, hash, JSON.stringify(f), JSON.stringify(extracted.flags), existing ? 'updated_existing' : 'created', u.id]
      )).rows[0];

      let job; let outcome; let changes = [];
      if (existing) {
        ({ job, changes } = await applyDispatchUpdate(db, existing, f, extracted.flags, u));
        outcome = changes.length ? 'updated_existing' : 'duplicate_no_changes';
      } else {
        job = await createJobFromDispatch(db, company, f, extracted.flags, u);
        outcome = 'created';
      }
      await db.query('UPDATE commercial_dispatch_emails SET job_id=$2, outcome=$3 WHERE id=$1', [emailRow.id, job.id, outcome]);
      for (const a of attachments) {
        await db.query(
          `INSERT INTO commercial_files (company_id, job_id, dispatch_email_id, kind, file_name, content_type, bytes, size_bytes, created_by)
           VALUES ($1,$2,$3,'attachment',$4,$5,$6,$7,$8)`,
          [u.company_id, job.id, emailRow.id, a.name, a.contentType, a.bytes, a.bytes.length, u.id]
        );
      }
      return { outcome, job_id: job.id, changes };
    });
    res.json({ ok: true, ...result });
  }));

  r.patch('/jobs/:id', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      const b = req.body || {};
      const updates = {};
      for (const key of EDITABLE_JOB_FIELDS) {
        if (!(key in b)) continue;
        updates[key] = await normalizeJobField(db, u.company_id, key, b[key]);
      }
      const changed = Object.keys(updates).filter((k) => JSON.stringify(normalizeForCompare(job[k])) !== JSON.stringify(normalizeForCompare(updates[k])));
      const next = { ...job, ...updates };
      // Re-check flags against the edited values; text flags settle when their field was edited.
      let flags = (job.flags || []).map((f) => {
        if (f.resolved || !TEXT_FLAGS.has(f.code)) return f;
        const settled = changed.includes(f.field) || (f.code === 'customer_unmatched' && next.customer_id) || (f.code === 'site_unmatched' && next.site_id);
        return settled ? { ...f, resolved: true, resolution: 'Corrected during review', resolved_by: u.id, resolved_at: new Date().toISOString() } : f;
      });
      const textFlags = flags.filter((f) => TEXT_FLAGS.has(f.code));
      const openTextFields = new Set(textFlags.filter((f) => !f.resolved && f.severity === 'blocking').map((f) => f.field));
      const fieldFlags = validateJobFields(next).filter((f) => !openTextFields.has(f.field));
      flags = [...textFlags, ...mergeFlags(flags.filter((f) => !TEXT_FLAGS.has(f.code)), fieldFlags)];
      for (const res0 of Array.isArray(b.resolve_flags) ? b.resolve_flags : []) {
        const note = clean(res0?.note, 500);
        const flag = flags.find((f) => f.code === res0?.code && !f.resolved);
        if (!flag) continue;
        if (flag.severity === 'blocking' && note.length < 3) throw new HttpError(400, `Add a note explaining how “${flag.message}” was settled.`);
        Object.assign(flag, { resolved: true, resolution: note || 'Confirmed', resolved_by: u.id, resolved_at: new Date().toISOString() });
      }
      let reviewStatus = job.review_status;
      if (b.mark_reviewed) {
        const blocking = unresolvedBlocking(flags);
        if (blocking.length) throw new HttpError(422, 'Settle the flagged items before marking this reviewed.', { flags: blocking });
        reviewStatus = 'reviewed';
      }
      if (changed.includes('nte_amount') && job.status !== 'received') {
        // An NTE edit after acceptance only moves the authorized amount when nothing was approved on top of it.
        const approved = await db.query(`SELECT 1 FROM commercial_approvals WHERE job_id=$1 AND status='approved' LIMIT 1`, [job.id]);
        if (!approved.rows.length) updates.authorized_amount = updates.nte_amount;
      }
      const cols = { ...updates, flags: JSON.stringify(flags), review_status: reviewStatus };
      if ('contacts' in cols) cols.contacts = JSON.stringify(cols.contacts);
      const keys = Object.keys(cols);
      const { rows } = await db.query(
        `UPDATE commercial_jobs SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')}, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
        [job.id, u.company_id, ...keys.map((k) => cols[k])]
      );
      if (changed.length) await logEvent(db, job, 'edited', `Updated ${changed.map((c) => c.replace(/_/g, ' ')).join(', ')}`, { fields: changed }, u.id);
      if (reviewStatus === 'reviewed' && job.review_status !== 'reviewed') {
        await logEvent(db, job, 'reviewed', 'Dispatch reviewed', {}, u.id);
        await resolveExceptions(db, u.company_id, `review:job:${job.id}`, 'Reviewed', u.id);
      }
      if (b.close_dispatch_update) await resolveExceptions(db, u.company_id, `dispatch_update:job:${job.id}`, 'Update applied', u.id);
      return rows[0];
    });
    res.json({ ok: true, job: presentJob(out, u) });
  }));

  r.post('/jobs/:id/accept', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (job.status !== 'received') throw new HttpError(409, 'This job was already accepted or closed.');
      if (job.review_status !== 'reviewed') throw new HttpError(422, 'Review the dispatch before accepting it.');
      const eta = dateOrNull(req.body?.eta_at, 'ETA');
      if (!eta) throw new HttpError(400, 'Set an ETA before accepting.');
      const assigned = await validAssignees(db, u.company_id, req.body?.assigned_user_ids);
      const { rows } = await db.query(
        `UPDATE commercial_jobs SET status='accepted', eta_at=$2, accepted_at=NOW(), accepted_by=$3, assigned_user_ids=$4,
           authorized_amount=COALESCE(authorized_amount, nte_amount), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [job.id, eta, u.id, assigned]
      );
      await logEvent(db, job, 'accepted', `Accepted with ETA ${eta.toISOString()}`, { eta_at: eta, assigned_user_ids: assigned }, u.id);
      await db.query('UPDATE commercial_companies SET first_job_processed_at=COALESCE(first_job_processed_at, NOW()) WHERE id=$1', [u.company_id]);
      await maybeStartTrial(db, u.company_id);
      return rows[0];
    });
    let notification = null;
    const notify = req.body?.notify;
    if (notify && notify.channel && notify.channel !== 'none') {
      const company = await loadCompany(pool, u.company_id);
      notification = await deliverMessage(pool, company, {
        jobId: out.id, kind: 'acceptance', channel: notify.channel, recipient: notify.recipient || out.dispatcher_email,
        subject: `Accepted: WO ${out.external_wo_number} - ${out.site_name || out.site_address}`,
        body: acceptanceEmailBody({ company, job: out }), idempotencyKey: `accept:job:${out.id}`, reference: notify.reference, userId: u.id,
      }).catch((e) => ({ ok: false, error: e.message }));
      await logEvent(pool, out, 'message', notification.ok ? `Acceptance ${notify.channel === 'email' ? 'emailed' : 'recorded'}` : `Acceptance not sent: ${notification.error}`, {}, u.id);
    }
    res.json({ ok: true, job: presentJob(out, u), notification });
  }));

  r.post('/jobs/:id/decline', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const reason = clean(req.body?.reason, 500);
    if (reason.length < 3) throw new HttpError(400, 'Give a reason for declining.');
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, req.cuser, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (!['received', 'accepted'].includes(job.status)) throw new HttpError(409, 'Work has started on this job; cancel it instead.');
      const { rows } = await db.query(`UPDATE commercial_jobs SET status='declined', declined_reason=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [job.id, reason]);
      await logEvent(db, job, 'declined', `Declined: ${reason}`, {}, req.cuser.id);
      await resolveExceptions(db, job.company_id, `review:job:${job.id}`, 'Declined', req.cuser.id);
      return rows[0];
    });
    res.json({ ok: true, job: presentJob(out, req.cuser) });
  }));

  r.post('/jobs/:id/assign', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, req.cuser, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      const assigned = await validAssignees(db, req.cuser.company_id, req.body?.assigned_user_ids);
      const { rows } = await db.query('UPDATE commercial_jobs SET assigned_user_ids=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [job.id, assigned]);
      await logEvent(db, job, 'assigned', 'Technicians assigned', { assigned_user_ids: assigned }, req.cuser.id);
      return rows[0];
    });
    res.json({ ok: true, job: presentJob(out, req.cuser) });
  }));

  r.post('/jobs/:id/status', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const status = String(req.body?.status || '');
    if (!['cancelled', 'return_visit_needed', 'in_progress', 'work_complete'].includes(status)) throw new HttpError(400, 'That status cannot be set by hand.');
    const reason = clean(req.body?.reason, 500);
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, req.cuser, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (['received', 'declined', 'paid', 'invoiced'].includes(job.status) && status !== 'cancelled') throw new HttpError(409, 'Not available for this job.');
      const { rows } = await db.query('UPDATE commercial_jobs SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *', [job.id, status]);
      await logEvent(db, job, 'status', `Status set to ${status.replace(/_/g, ' ')}${reason ? `: ${reason}` : ''}`, {}, req.cuser.id);
      return rows[0];
    });
    res.json({ ok: true, job: presentJob(out, req.cuser) });
  }));

  // ── Visits ─────────────────────────────────────────────────────────────────
  r.post('/jobs/:id/visits', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const out = await idempotent(pool, u, req.body?.client_action_id && `newvisit:${req.params.id}:${req.body.client_action_id}`, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (['received', 'declined', 'cancelled', 'paid', 'invoiced'].includes(job.status)) {
        throw new HttpError(409, job.status === 'received' ? 'Accept the job before sending a technician.' : 'This job is closed.');
      }
      const techId = isOffice(u) && req.body?.technician_user_id ? Number(req.body.technician_user_id) : u.id;
      const tech = await db.query('SELECT id FROM commercial_users WHERE id=$1 AND company_id=$2 AND active', [techId, u.company_id]);
      if (!tech.rows.length) throw new HttpError(400, 'Pick a technician from your team.');
      let visitNumber;
      if (req.body?.same_trip_as) {
        const t = await db.query('SELECT visit_number FROM commercial_visits WHERE id=$1 AND job_id=$2', [Number(req.body.same_trip_as), job.id]);
        visitNumber = t.rows[0]?.visit_number;
      }
      if (!visitNumber) {
        const m = await db.query('SELECT COALESCE(MAX(visit_number),0)+1 AS n FROM commercial_visits WHERE job_id=$1', [job.id]);
        visitNumber = m.rows[0].n;
      }
      const { rows } = await db.query(
        `INSERT INTO commercial_visits (company_id, job_id, visit_number, technician_user_id, scheduled_for, external_checkin_status, external_checkout_status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
        [u.company_id, job.id, visitNumber, techId, dateOrNull(req.body?.scheduled_for, 'Scheduled time'),
          job.checkin_method && job.checkin_method !== 'none' ? 'pending' : 'not_required', u.id]
      );
      if (!(job.assigned_user_ids || []).map(Number).includes(techId)) {
        await db.query('UPDATE commercial_jobs SET assigned_user_ids = array_append(assigned_user_ids, $2) WHERE id=$1', [job.id, techId]);
      }
      await logEvent(db, job, 'visit_created', `Visit ${visitNumber} created${visitNumber > 1 ? ' (return visit)' : ''}`, { visit_id: rows[0].id, technician_user_id: techId }, u.id);
      return { visit: rows[0] };
    });
    res.json({ ok: true, ...out });
  }));

  r.post('/visits/:id/action', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const b = req.body || {};
    const key = b.client_action_id ? `visit:${req.params.id}:${clean(b.client_action_id, 100)}` : null;
    const out = await idempotent(pool, u, key, (db) => visitAction(db, u, intId(req.params.id), b));
    res.json({ ok: true, ...out });
  }));

  // ── Files ──────────────────────────────────────────────────────────────────
  r.post('/jobs/:id/files', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const { contentType, bytes } = decodeUpload(req.body?.dataUrl);
    const stage = ['before', 'during', 'after', 'completion', 'document'].includes(req.body?.stage) ? req.body.stage : 'during';
    const key = req.body?.client_action_id ? `file:${req.params.id}:${clean(req.body.client_action_id, 100)}` : null;
    // Photos queued offline carry a client id so a resend does not store the photo twice.
    const out = await idempotent(pool, u, key, async (db) => {
      const job = await loadJobFor(db, u, req.params.id);
      if (!job) throw new HttpError(404, 'Job not found.');
      let visitId = null;
      if (req.body?.visit_id) {
        const v = await db.query('SELECT id FROM commercial_visits WHERE id=$1 AND job_id=$2 AND company_id=$3', [Number(req.body.visit_id), job.id, u.company_id]);
        visitId = v.rows[0]?.id || null;
      }
      const count = await db.query('SELECT COUNT(*)::int AS n FROM commercial_files WHERE job_id=$1', [job.id]);
      if (count.rows[0].n >= 200) throw new HttpError(400, 'This job already has 200 files.');
      const { rows } = await db.query(
        `INSERT INTO commercial_files (company_id, job_id, visit_id, kind, stage, file_name, content_type, bytes, size_bytes, caption, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, kind, stage, file_name, content_type, size_bytes, caption, visit_id, created_at`,
        [u.company_id, job.id, visitId, contentType.startsWith('image/') ? 'photo' : 'document', stage, clean(req.body?.name, 200), contentType, bytes, bytes.length, clean(req.body?.caption, 300), u.id]
      );
      await logEvent(db, job, 'file', `${contentType.startsWith('image/') ? 'Photo' : 'File'} added (${stage})`, { file_id: rows[0].id, visit_id: visitId }, u.id, b_occurred(req));
      return { file: rows[0] };
    });
    res.json({ ok: true, ...out, file: { ...out.file, url: signedFileUrl(out.file.id) } });
  }));

  r.get('/files/:id', wrap(async (req, res) => {
    const id = intId(req.params.id);
    if (!verifyFileSignature(id, req.query.exp, req.query.sig)) return res.status(403).json({ ok: false, message: 'This link has expired.' });
    const { rows } = await pool.query('SELECT content_type, bytes, file_name FROM commercial_files WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Type', rows[0].content_type);
    res.set('X-Content-Type-Options', 'nosniff');
    if (!rows[0].content_type.startsWith('image/')) res.set('Content-Disposition', `attachment; filename="${(rows[0].file_name || `file-${id}`).replace(/[^\w.\- ]/g, '_')}"`);
    res.send(rows[0].bytes);
  }));

  r.get('/dispatch-emails/:id', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const { rows } = await pool.query('SELECT * FROM commercial_dispatch_emails WHERE id=$1 AND company_id=$2', [intId(req.params.id), req.cuser.company_id]);
    if (!rows[0]) throw new HttpError(404, 'Not found.');
    res.json({ ok: true, email: rows[0] });
  }));

  // ── Proposals and approvals ────────────────────────────────────────────────
  r.post('/jobs/:id/proposals', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (['received', 'declined', 'cancelled', 'paid', 'invoiced'].includes(job.status)) throw new HttpError(409, 'Proposals can be added once the job is accepted and before it is billed.');
      const p = proposalFields(req.body, u);
      const v = await db.query('SELECT COALESCE(MAX(version),0)+1 AS n FROM commercial_proposals WHERE job_id=$1', [job.id]);
      const { rows } = await db.query(
        `INSERT INTO commercial_proposals (company_id, job_id, version, kind, findings, scope, exclusions, timing, labor_lines, material_lines, total, wo_reference, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [u.company_id, job.id, v.rows[0].n, p.kind, p.findings, p.scope, p.exclusions, p.timing, JSON.stringify(p.labor_lines), JSON.stringify(p.material_lines), p.total, job.external_wo_number, u.id]
      );
      await logEvent(db, job, 'proposal', `Proposal v${rows[0].version} drafted`, { proposal_id: rows[0].id }, u.id);
      return rows[0];
    });
    res.json({ ok: true, proposal: presentProposal(out, u) });
  }));

  r.patch('/proposals/:id', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const { proposal, job } = await loadProposal(db, u, req.params.id);
      if (proposal.status !== 'draft') throw new HttpError(409, 'Only drafts can be edited. Create a new version instead.');
      const merged = { ...proposal, ...req.body };
      if (!canSeeMoney(u)) {
        // Technicians without financial access keep the office's prices.
        merged.labor_lines = mergePrices(req.body?.labor_lines ?? proposal.labor_lines, proposal.labor_lines, 'rate');
        merged.material_lines = mergePrices(req.body?.material_lines ?? proposal.material_lines, proposal.material_lines, 'unit_cost');
      }
      const p = proposalFields(merged, { ...u, can_view_financials: true });
      const reviewed = isOffice(u) && req.body?.office_reviewed ? { by: u.id } : null;
      const { rows } = await db.query(
        `UPDATE commercial_proposals SET findings=$2, scope=$3, exclusions=$4, timing=$5, labor_lines=$6, material_lines=$7, total=$8,
           wo_reference=$9, kind=$10, reviewed_by=COALESCE($11, reviewed_by), reviewed_at=CASE WHEN $11::int IS NULL THEN reviewed_at ELSE NOW() END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [proposal.id, p.findings, p.scope, p.exclusions, p.timing, JSON.stringify(p.labor_lines), JSON.stringify(p.material_lines), p.total,
          clean(merged.wo_reference, 100) || job.external_wo_number, p.kind, reviewed?.by ?? null]
      );
      return rows[0];
    });
    res.json({ ok: true, proposal: presentProposal(out, u) });
  }));

  r.post('/proposals/:id/submit', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const via = ['email', 'portal', 'phone', 'other'].includes(req.body?.via) ? req.body.via : 'email';
    const { proposal, job, approval } = await tx(pool, async (db) => {
      const { proposal: p, job: j } = await loadProposal(db, u, req.params.id);
      if (p.status !== 'draft') throw new HttpError(409, 'This proposal was already submitted.');
      const problems = [];
      if (!clean(p.findings)) problems.push('findings');
      if (!clean(p.scope)) problems.push('scope');
      if (!(Number(p.total) > 0)) problems.push('a price above $0');
      if (!clean(p.wo_reference)) problems.push('the WO number');
      if (problems.length) throw new HttpError(422, `Before submitting, add ${problems.join(', ')}.`);
      await db.query(`UPDATE commercial_proposals SET status='superseded', updated_at=NOW() WHERE job_id=$1 AND status='submitted' AND id<>$2`, [j.id, p.id]);
      await db.query(`UPDATE commercial_approvals SET status='superseded' WHERE job_id=$1 AND status IN ('pending','needs_review') AND proposal_id IS NOT NULL AND proposal_id<>$2`, [j.id, p.id]);
      const { rows } = await db.query(
        `UPDATE commercial_proposals SET status='submitted', submitted_at=NOW(), submitted_via=$2, reviewed_by=COALESCE(reviewed_by,$3), reviewed_at=COALESCE(reviewed_at,NOW()), updated_at=NOW()
          WHERE id=$1 RETURNING *`,
        [p.id, via, u.id]
      );
      const a = await db.query(
        `INSERT INTO commercial_approvals (company_id, job_id, proposal_id, kind, status, original_amount, requested_amount, reason, requested_by)
         VALUES ($1,$2,$3,'proposal','pending',$4,$5,$6,$7) RETURNING *`,
        [u.company_id, j.id, p.id, authorizedLimit(j), p.total, clean(p.scope, 500), u.id]
      );
      await db.query(`UPDATE commercial_jobs SET status='awaiting_approval', updated_at=NOW() WHERE id=$1 AND status NOT IN ('completed','invoiced','paid')`, [j.id]);
      await logEvent(db, j, 'proposal_submitted', `Proposal v${p.version} submitted (${via}) for $${Number(p.total).toFixed(2)}`, { proposal_id: p.id }, u.id);
      return { proposal: rows[0], job: j, approval: a.rows[0] };
    });
    let delivery = null;
    if (via === 'email' || req.body?.reference) {
      const company = await loadCompany(pool, u.company_id);
      const customer = job.customer_id ? (await pool.query('SELECT * FROM commercial_customers WHERE id=$1', [job.customer_id])).rows[0] : null;
      delivery = await deliverMessage(pool, company, {
        jobId: job.id, kind: 'proposal', channel: via, recipient: clean(req.body?.recipient, 500) || job.dispatcher_email || customer?.billing_email,
        subject: `Proposal v${proposal.version}: WO ${proposal.wo_reference} - ${job.site_name || job.site_address}`,
        body: proposalEmailBody({ company, job, proposal }), idempotencyKey: `proposal:${proposal.id}`, reference: req.body?.reference, userId: u.id,
      }).catch((e) => ({ ok: false, error: e.message }));
      if (!delivery.ok) {
        await openException(pool, u.company_id, { jobId: job.id, kind: 'delivery_failed', title: `Proposal for ${job.job_number} was not delivered`, detail: delivery.error, dedupeKey: `proposal_delivery:${proposal.id}` });
      }
    }
    res.json({ ok: true, proposal: presentProposal(proposal, u), approval, delivery });
  }));

  r.post('/jobs/:id/nte-requests', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const amount = Number(req.body?.requested_amount);
    const reason = clean(req.body?.reason, 1000);
    if (!(amount > 0)) throw new HttpError(400, 'Enter the new NTE amount you are asking for.');
    if (reason.length < 5) throw new HttpError(400, 'Explain why the increase is needed.');
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      const limit = authorizedLimit(job);
      if (limit != null && amount <= limit) throw new HttpError(400, `The current authorized amount is already $${limit.toFixed(2)}.`);
      const { rows } = await db.query(
        `INSERT INTO commercial_approvals (company_id, job_id, kind, status, original_amount, requested_amount, reason, requested_by)
         VALUES ($1,$2,'nte_increase','pending',$3,$4,$5,$6) RETURNING *`,
        [u.company_id, job.id, limit, round2(amount), reason, u.id]
      );
      await db.query(`UPDATE commercial_jobs SET status='awaiting_approval', updated_at=NOW() WHERE id=$1 AND status NOT IN ('completed','invoiced','paid')`, [job.id]);
      await logEvent(db, job, 'nte_request', `NTE increase requested: $${round2(amount).toFixed(2)}`, { approval_id: rows[0].id }, u.id);
      return rows[0];
    });
    res.json({ ok: true, approval: out });
  }));

  r.post('/approvals/:id/decision', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const out = await recordDecision(pool, req.cuser, intId(req.params.id), req.body || {});
    res.json({ ok: true, ...out });
  }));

  r.post('/proposals/:id/decision', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const { rows } = await pool.query(
      `SELECT id FROM commercial_approvals WHERE proposal_id=$1 AND company_id=$2 AND status IN ('pending','needs_review') ORDER BY id DESC LIMIT 1`,
      [intId(req.params.id), req.cuser.company_id]
    );
    if (!rows[0]) throw new HttpError(409, 'This proposal is not waiting for a decision.');
    const out = await recordDecision(pool, req.cuser, rows[0].id, req.body || {});
    res.json({ ok: true, ...out });
  }));

  // ── Completion package ─────────────────────────────────────────────────────
  r.get('/jobs/:id/completion', userAuth, wrap(async (req, res) => {
    const job = await loadJobFor(pool, req.cuser, req.params.id);
    if (!job) throw new HttpError(404, 'Job not found.');
    const ctx = await completionContext(pool, job);
    res.json({ ok: true, checks: completionChecks(ctx) });
  }));

  r.post('/jobs/:id/completion/finalize', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      if (job.completion_finalized_at) throw new HttpError(409, 'The completion package is already finalized.');
      const ctx = await completionContext(db, job);
      const checks = completionChecks(ctx, { signoffName: req.body?.signoff_name });
      const failing = failingBlocking(checks);
      if (failing.length) throw new HttpError(422, 'The completion package is missing required evidence.', { checks });
      const summary = clean(req.body?.summary, 4000) || ctx.visits.filter((v) => v.work_performed).map((v) => v.work_performed).join('\n');
      const { rows } = await db.query(
        `UPDATE commercial_jobs SET status='completed', completion_finalized_at=NOW(), completion_finalized_by=$2, completion_summary=$3,
           signoff_name=COALESCE(NULLIF($4,''), signoff_name), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [job.id, u.id, summary, clean(req.body?.signoff_name, 200)]
      );
      await logEvent(db, job, 'completed', 'Completion package finalized', { checks }, u.id);
      return rows[0];
    });
    res.json({ ok: true, job: presentJob(out, u) });
  }));

  // ── Invoices ───────────────────────────────────────────────────────────────
  const requireMoney = (req) => {
    requireOffice(req);
    if (!canSeeMoney(req.cuser)) throw new HttpError(403, 'You do not have access to billing.');
  };

  r.get('/invoices', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const params = [req.cuser.company_id];
    let where = 'i.company_id=$1';
    if (req.query.status) { params.push(String(req.query.status)); where += ` AND i.status=$2`; }
    const { rows } = await pool.query(
      `SELECT i.*, j.job_number, j.site_name, j.dispatcher_name, u.name AS assigned_name FROM commercial_invoices i
         JOIN commercial_jobs j ON j.id=i.job_id LEFT JOIN commercial_users u ON u.id=i.assigned_user_id
        WHERE ${where} ORDER BY i.updated_at DESC LIMIT 300`,
      params
    );
    res.json({ ok: true, invoices: rows });
  }));

  r.post('/jobs/:id/invoices', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const u = req.cuser;
    const out = await tx(pool, async (db) => {
      const job = await loadJobFor(db, u, req.params.id, { forUpdate: true });
      if (!job) throw new HttpError(404, 'Job not found.');
      const live = await db.query(`SELECT invoice_number FROM commercial_invoices WHERE job_id=$1 AND status <> 'void'`, [job.id]);
      if (live.rows.length) throw new HttpError(409, `This job already has invoice ${live.rows[0].invoice_number}. Void it before creating another.`);
      const company = await loadCompany(db, u.company_id);
      const customer = job.customer_id ? (await db.query('SELECT * FROM commercial_customers WHERE id=$1', [job.customer_id])).rows[0] : null;
      const visits = (await db.query(`SELECT v.*, cu.name AS technician_name FROM commercial_visits v LEFT JOIN commercial_users cu ON cu.id=v.technician_user_id WHERE v.job_id=$1 ORDER BY v.visit_number, v.id`, [job.id])).rows;
      const approved = (await db.query(`SELECT * FROM commercial_proposals WHERE job_id=$1 AND status='approved' ORDER BY version DESC LIMIT 1`, [job.id])).rows[0];
      const lines = draftInvoiceLines({ job, visits, approved, company });
      const totals = invoiceTotals(lines);
      const dates = [...new Set(visits.filter((v) => v.arrived_at).map((v) => new Date(v.arrived_at).toLocaleDateString('en-US', { timeZone: job.timezone || company.timezone || 'America/New_York' })))];
      const number = await nextNumber(db, u.company_id, 'invoice');
      const { rows } = await db.query(
        `INSERT INTO commercial_invoices (company_id, job_id, invoice_number, recipient, submission_method, wo_reference, service_dates, lines, subtotal, tax, total, assigned_user_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        [u.company_id, job.id, number, customer ? (customer.invoice_recipients || customer.billing_email) : '', customer?.submission_method === 'portal' ? 'portal' : 'email',
          job.external_wo_number, dates.join(', '), JSON.stringify(lines), totals.subtotal, totals.tax, totals.total, u.id]
      );
      await logEvent(db, job, 'invoice', `Invoice ${number} drafted`, { invoice_id: rows[0].id }, u.id);
      return rows[0];
    });
    res.json({ ok: true, ...(await invoiceBundle(pool, out)) });
  }));

  r.get('/invoices/:id', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const invoice = await loadInvoice(pool, req.cuser, req.params.id);
    res.json({ ok: true, ...(await invoiceBundle(pool, invoice)) });
  }));

  r.patch('/invoices/:id', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const invoice = await loadInvoice(pool, req.cuser, req.params.id);
    if (invoice.status !== 'draft' && invoice.status !== 'delivery_failed') throw new HttpError(409, 'Sent invoices cannot be edited. Void it and create a new one if it is wrong.');
    const b = req.body || {};
    const lines = 'lines' in b ? normalizeInvoiceLines(b.lines) : invoice.lines;
    const totals = invoiceTotals(lines, 'tax' in b ? Math.max(0, Number(b.tax) || 0) : invoice.tax);
    let assigned = invoice.assigned_user_id;
    if ('assigned_user_id' in b) assigned = (await validAssignees(pool, req.cuser.company_id, [b.assigned_user_id]))[0] || null;
    const { rows } = await pool.query(
      `UPDATE commercial_invoices SET recipient=$2, submission_method=$3, wo_reference=$4, service_dates=$5, lines=$6, subtotal=$7, tax=$8, total=$9, notes=$10, assigned_user_id=$11, updated_at=NOW()
        WHERE id=$1 RETURNING *`,
      [invoice.id, 'recipient' in b ? clean(b.recipient, 500) : invoice.recipient,
        'submission_method' in b ? (SUBMISSION_METHODS.includes(b.submission_method) ? b.submission_method : 'email') : invoice.submission_method,
        'wo_reference' in b ? clean(b.wo_reference, 100) : invoice.wo_reference, 'service_dates' in b ? clean(b.service_dates, 300) : invoice.service_dates,
        JSON.stringify(lines), totals.subtotal, totals.tax, totals.total, 'notes' in b ? clean(b.notes, 3000) : invoice.notes, assigned]
    );
    res.json({ ok: true, ...(await invoiceBundle(pool, rows[0])) });
  }));

  r.post('/invoices/:id/send', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const u = req.cuser;
    const invoice = await loadInvoice(pool, u, req.params.id);
    if (!['draft', 'delivery_failed'].includes(invoice.status) && !req.body?.resend_reason) {
      throw new HttpError(409, `Invoice already ${invoice.status.replace(/_/g, ' ')}. To send again, give a reason.`);
    }
    const bundle = await invoiceBundle(pool, invoice);
    const failing = failingBlocking(bundle.checks);
    if (failing.length) throw new HttpError(422, 'Fix the invoice checks before sending.', { checks: bundle.checks });
    const company = await loadCompany(pool, u.company_id);
    const job = bundle.job;
    const customer = job.customer_id ? (await pool.query('SELECT * FROM commercial_customers WHERE id=$1', [job.customer_id])).rows[0] : null;
    const channel = invoice.submission_method === 'portal' ? 'portal' : invoice.submission_method === 'email' ? 'email' : 'other';
    if (channel !== 'email' && !clean(req.body?.reference)) throw new HttpError(400, 'Enter the portal confirmation or reference number.');
    const subject = fillTemplate(customer?.subject_format || 'Invoice {invoice_number} - WO {wo_number} - {site_name}', {
      invoice_number: invoice.invoice_number, wo_number: invoice.wo_reference, site_name: job.site_name || job.site_address,
      company: company.name, po_number: job.po_number, job_number: job.job_number, store_number: job.site_name,
    });
    const delivery = await deliverMessage(pool, company, {
      jobId: job.id, kind: 'invoice', channel, recipient: invoice.recipient, subject,
      body: invoiceEmailBody({ company, job, invoice }), idempotencyKey: `invoice:${invoice.id}`,
      reference: req.body?.reference, resendReason: req.body?.resend_reason, userId: u.id,
    });
    const out = await tx(pool, async (db) => {
      if (delivery.ok) {
        const { rows } = await db.query(
          `UPDATE commercial_invoices SET status='sent', sent_at=NOW(), sent_reference=$2, delivery_failure_reason='', updated_at=NOW() WHERE id=$1 RETURNING *`,
          [invoice.id, clean(req.body?.reference, 200)]
        );
        await db.query(`UPDATE commercial_jobs SET status='invoiced', updated_at=NOW() WHERE id=$1 AND status <> 'paid'`, [job.id]);
        await logEvent(db, job, 'invoice_sent', `Invoice ${invoice.invoice_number} ${channel === 'email' ? `emailed to ${invoice.recipient}` : `submitted via ${channel}`}`, { invoice_id: invoice.id }, u.id);
        await resolveExceptions(db, u.company_id, `invoice_delivery:${invoice.id}`, 'Re-sent', u.id);
        return rows[0];
      }
      return markDeliveryFailed(db, u, invoice, job, delivery.error || 'Delivery failed');
    });
    res.status(delivery.ok ? 200 : 502).json({ ok: delivery.ok, message: delivery.ok ? undefined : `Not delivered: ${delivery.error}`, invoice: out, delivery });
  }));

  r.post('/invoices/:id/status', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const u = req.cuser;
    const status = String(req.body?.status || '');
    const reason = clean(req.body?.reason, 1000);
    const invoice = await loadInvoice(pool, u, req.params.id);
    const job = (await pool.query('SELECT * FROM commercial_jobs WHERE id=$1', [invoice.job_id])).rows[0];
    const allowed = {
      delivery_failed: ['sent', 'acknowledged'],
      acknowledged: ['sent', 'delivery_failed'],
      disputed: ['sent', 'acknowledged'],
      sent: ['disputed'],
      void: ['draft', 'delivery_failed', 'disputed', 'sent', 'acknowledged'],
    };
    if (!allowed[status]?.includes(invoice.status)) throw new HttpError(409, `An invoice that is ${invoice.status.replace(/_/g, ' ')} cannot be marked ${status.replace(/_/g, ' ')}.`);
    if (['delivery_failed', 'disputed', 'void'].includes(status) && reason.length < 3) throw new HttpError(400, 'Add a reason.');
    const out = await tx(pool, async (db) => {
      if (status === 'delivery_failed') return markDeliveryFailed(db, u, invoice, job, reason);
      const { rows } = await db.query(
        `UPDATE commercial_invoices SET status=$2, dispute_reason=CASE WHEN $2='disputed' THEN $3 ELSE dispute_reason END,
           acknowledged_at=CASE WHEN $2='acknowledged' THEN NOW() ELSE acknowledged_at END, notes=CASE WHEN $2='void' THEN trim(notes || E'\\nVoided: ' || $3) ELSE notes END, updated_at=NOW()
          WHERE id=$1 RETURNING *`,
        [invoice.id, status, reason]
      );
      if (status === 'disputed') {
        await openException(db, u.company_id, { jobId: job.id, invoiceId: invoice.id, kind: 'invoice_disputed', title: `Invoice ${invoice.invoice_number} disputed`, detail: reason, dedupeKey: `invoice_dispute:${invoice.id}`, assignedUserId: invoice.assigned_user_id });
      }
      if (status === 'sent') await resolveExceptions(db, u.company_id, `invoice_dispute:${invoice.id}`, reason || 'Dispute settled', u.id);
      if (status === 'void') {
        await db.query(`UPDATE commercial_jobs SET status='completed', updated_at=NOW() WHERE id=$1 AND status='invoiced'`, [job.id]);
        await resolveExceptions(db, u.company_id, `invoice_delivery:${invoice.id}`, 'Voided', u.id);
        await resolveExceptions(db, u.company_id, `invoice_dispute:${invoice.id}`, 'Voided', u.id);
      }
      await logEvent(db, job, 'invoice_status', `Invoice ${invoice.invoice_number} marked ${status.replace(/_/g, ' ')}${reason ? `: ${reason}` : ''}`, { invoice_id: invoice.id }, u.id);
      return rows[0];
    });
    res.json({ ok: true, invoice: out });
  }));

  r.post('/invoices/:id/payments', userAuth, wrap(async (req, res) => {
    requireMoney(req);
    const u = req.cuser;
    const amount = round2(req.body?.amount);
    const evidence = clean(req.body?.evidence_text, 2000);
    const reference = clean(req.body?.reference, 200);
    if (!(amount > 0)) throw new HttpError(400, 'Enter the amount received.');
    if (!reference && evidence.length < 3) throw new HttpError(400, 'Add the check/ACH reference or describe the remittance as evidence.');
    const out = await tx(pool, async (db) => {
      const invoice = await loadInvoice(db, u, req.params.id, true);
      if (!['sent', 'acknowledged', 'disputed', 'paid'].includes(invoice.status)) throw new HttpError(409, 'Record payments on sent invoices.');
      await db.query(
        `INSERT INTO commercial_payments (company_id, invoice_id, amount, method, reference, received_at, evidence_text, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [u.company_id, invoice.id, amount, clean(req.body?.method, 40), reference, dateOrNull(req.body?.received_at, 'Received date') || new Date(), evidence, u.id]
      );
      const paid = round2(Number(invoice.amount_paid) + amount);
      const full = paid + 0.005 >= Number(invoice.total);
      const { rows } = await db.query(
        `UPDATE commercial_invoices SET amount_paid=$2, status=CASE WHEN $3 THEN 'paid' ELSE status END, paid_at=CASE WHEN $3 THEN NOW() ELSE paid_at END, updated_at=NOW()
          WHERE id=$1 RETURNING *`,
        [invoice.id, paid, full]
      );
      const job = (await db.query('SELECT * FROM commercial_jobs WHERE id=$1', [invoice.job_id])).rows[0];
      if (full) await db.query(`UPDATE commercial_jobs SET status='paid', updated_at=NOW() WHERE id=$1`, [job.id]);
      await logEvent(db, job, 'payment', `Payment recorded: $${amount.toFixed(2)}${reference ? ` (ref ${reference})` : ''}${full ? ' — paid in full' : ''}`, { invoice_id: invoice.id }, u.id);
      return rows[0];
    });
    res.json({ ok: true, invoice: out });
  }));

  // ── Exceptions ─────────────────────────────────────────────────────────────
  r.get('/exceptions', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const { rows } = await pool.query(
      `SELECT e.*, j.job_number, j.external_wo_number, a.name AS assigned_name FROM commercial_exceptions e
         LEFT JOIN commercial_jobs j ON j.id=e.job_id LEFT JOIN commercial_users a ON a.id=e.assigned_user_id
        WHERE e.company_id=$1 AND e.status=$2 ${isOffice(u) ? 'AND $3::int IS NOT NULL' : 'AND e.assigned_user_id=$3'} ORDER BY e.created_at DESC LIMIT 300`,
      [u.company_id, status, u.id]
    );
    res.json({ ok: true, exceptions: rows });
  }));

  r.patch('/exceptions/:id', userAuth, wrap(async (req, res) => {
    const u = req.cuser;
    const { rows: found } = await pool.query('SELECT * FROM commercial_exceptions WHERE id=$1 AND company_id=$2', [intId(req.params.id), u.company_id]);
    const ex = found[0];
    if (!ex || (!isOffice(u) && ex.assigned_user_id !== u.id)) throw new HttpError(404, 'Not found.');
    const b = req.body || {};
    let assigned = ex.assigned_user_id;
    if ('assigned_user_id' in b) {
      requireOffice(req);
      assigned = (await validAssignees(pool, u.company_id, [b.assigned_user_id]))[0];
      if (!assigned) throw new HttpError(400, 'Every exception needs a responsible person.');
    }
    const resolve = b.status === 'resolved';
    const note = clean(b.resolution_note, 1000);
    if (resolve && note.length < 3) throw new HttpError(400, 'Say how it was resolved.');
    const { rows } = await pool.query(
      `UPDATE commercial_exceptions SET assigned_user_id=$2, status=CASE WHEN $3 THEN 'resolved' ELSE status END,
         resolution_note=CASE WHEN $3 THEN $4 ELSE resolution_note END, resolved_by=CASE WHEN $3 THEN $5 ELSE resolved_by END,
         resolved_at=CASE WHEN $3 THEN NOW() ELSE resolved_at END WHERE id=$1 RETURNING *`,
      [ex.id, assigned, resolve, note, u.id]
    );
    if (ex.job_id && resolve) {
      const job = (await pool.query('SELECT * FROM commercial_jobs WHERE id=$1', [ex.job_id])).rows[0];
      if (job) await logEvent(pool, job, 'exception_resolved', `Resolved: ${ex.title} — ${note}`, { exception_id: ex.id }, u.id);
    }
    res.json({ ok: true, exception: rows[0] });
  }));

  // ── Customers and sites ────────────────────────────────────────────────────
  r.get('/customers', userAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM commercial_sites s WHERE s.customer_id=c.id) AS site_count FROM commercial_customers c WHERE company_id=$1 ORDER BY name`,
      [req.cuser.company_id]
    );
    res.json({ ok: true, customers: rows });
  }));

  r.post('/customers', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const c = customerFields(req.body);
    if (c.name.length < 2) throw new HttpError(400, 'Enter the customer name.');
    const keys = Object.keys(c);
    const { rows } = await pool.query(
      `INSERT INTO commercial_customers (company_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [req.cuser.company_id, ...keys.map((k) => c[k])]
    );
    res.json({ ok: true, customer: rows[0] });
  }));

  r.patch('/customers/:id', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const c = customerFields(req.body, true);
    const keys = Object.keys(c);
    if (!keys.length) throw new HttpError(400, 'Nothing to update.');
    const { rows } = await pool.query(
      `UPDATE commercial_customers SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')}, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [intId(req.params.id), req.cuser.company_id, ...keys.map((k) => c[k])]
    );
    if (!rows[0]) throw new HttpError(404, 'Customer not found.');
    res.json({ ok: true, customer: rows[0] });
  }));

  r.get('/sites', userAuth, wrap(async (req, res) => {
    const params = [req.cuser.company_id];
    let where = 's.company_id=$1';
    if (req.query.customer_id) { params.push(Number(req.query.customer_id)); where += ' AND s.customer_id=$2'; }
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS customer_name FROM commercial_sites s LEFT JOIN commercial_customers c ON c.id=s.customer_id WHERE ${where} ORDER BY s.name, s.address LIMIT 1000`,
      params
    );
    res.json({ ok: true, sites: rows });
  }));

  r.post('/sites', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const s = await siteFields(pool, req.cuser.company_id, req.body);
    if (!s.address && !s.name) throw new HttpError(400, 'Enter the site name or address.');
    const keys = Object.keys(s);
    const { rows } = await pool.query(
      `INSERT INTO commercial_sites (company_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [req.cuser.company_id, ...keys.map((k) => s[k])]
    );
    res.json({ ok: true, site: rows[0] });
  }));

  r.patch('/sites/:id', userAuth, wrap(async (req, res) => {
    requireOffice(req);
    const s = await siteFields(pool, req.cuser.company_id, req.body, true);
    const keys = Object.keys(s);
    if (!keys.length) throw new HttpError(400, 'Nothing to update.');
    const { rows } = await pool.query(
      `UPDATE commercial_sites SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(', ')}, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`,
      [intId(req.params.id), req.cuser.company_id, ...keys.map((k) => s[k])]
    );
    if (!rows[0]) throw new HttpError(404, 'Site not found.');
    res.json({ ok: true, site: rows[0] });
  }));

  // ── Team and company ───────────────────────────────────────────────────────
  r.get('/team', userAuth, wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM commercial_users WHERE company_id=$1 ORDER BY active DESC, role, name', [req.cuser.company_id]);
    const company = await loadCompany(pool, req.cuser.company_id);
    const seats = (PLAN_SEATS[company.plan] || 1) + Number(company.extra_seats || 0);
    const joinCode = isOffice(req.cuser) ? await companyJoinCode(pool, company.id) : undefined;
    res.json({ ok: true, users: rows.map(publicUser), seats, seats_used: rows.filter((u) => u.active).length, join_code: joinCode });
  }));

  r.post('/team', userAuth, wrap(async (req, res) => {
    requireOwner(req);
    const email = clean(req.body?.email, 254).toLowerCase();
    const name = clean(req.body?.name, 200);
    const role = ROLES.includes(req.body?.role) && req.body.role !== 'owner' ? req.body.role : 'technician';
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email.');
    if (name.length < 2) throw new HttpError(400, 'Enter their name.');
    const invite = newInviteToken();
    const user = await tx(pool, async (db) => {
      const company = await loadCompany(db, req.cuser.company_id, true);
      const seats = (PLAN_SEATS[company.plan] || 1) + Number(company.extra_seats || 0);
      const used = (await db.query('SELECT COUNT(*)::int AS n FROM commercial_users WHERE company_id=$1 AND active', [company.id])).rows[0].n;
      if (used >= seats) throw new HttpError(402, `Your ${company.plan} plan includes ${seats} user${seats === 1 ? '' : 's'}. Ask FixBridge to add a seat ($${EXTRA_SEAT_PRICE}/user/month).`);
      const taken = await db.query('SELECT 1 FROM commercial_users WHERE email=$1', [email]);
      if (taken.rows.length) throw new HttpError(409, 'That email already has a FixBridge Commercial account.');
      const { rows } = await db.query(
        `INSERT INTO commercial_users (company_id, email, name, phone, role, can_view_financials, invite_token_hash, invite_expires_at, approval_status, signup_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending','owner_invite') RETURNING *`,
        [company.id, email, name, clean(req.body?.phone, 40), role, role === 'office' ? true : Boolean(req.body?.can_view_financials), invite.hash, invite.expiresAt]
      );
      return rows[0];
    });
    const link = `${appBaseUrl(req)}/commercial/set-password?token=${invite.token}`;
    const company = await loadCompany(pool, req.cuser.company_id);
    const mail = await sendMail({
      to: email,
      subject: `${company.name} invited you to FixBridge Commercial`,
      text: `${req.cuser.name || 'Your company'} added you to ${company.name} on FixBridge Commercial.\n\nSet your password here (link expires in 7 days):\n${link}\n`,
    }).catch((e) => ({ ok: false, message: e.message }));
    await notifyAdminOfPendingAccount(user, company.name);
    res.json({ ok: true, user: publicUser(user), invite_link: link, emailed: Boolean(mail.ok && !mail.simulated) });
  }));

  r.post('/team/join-code', userAuth, wrap(async (req, res) => {
    requireOwner(req);
    res.json({ ok: true, join_code: await companyJoinCode(pool, req.cuser.company_id, true) });
  }));

  r.patch('/team/:id', userAuth, wrap(async (req, res) => {
    requireOwner(req);
    const id = intId(req.params.id);
    const { rows: found } = await pool.query('SELECT * FROM commercial_users WHERE id=$1 AND company_id=$2', [id, req.cuser.company_id]);
    const target = found[0];
    if (!target) throw new HttpError(404, 'Not found.');
    const b = req.body || {};
    if (target.id === req.cuser.id && (b.active === false || (b.role && b.role !== 'owner'))) throw new HttpError(400, 'You cannot remove your own owner access.');
    const role = b.role && ROLES.includes(b.role) ? b.role : target.role;
    let invite = null;
    if (b.reissue_invite) invite = newInviteToken();
    if (b.active === true && !target.active) {
      const company = await loadCompany(pool, req.cuser.company_id);
      const seats = (PLAN_SEATS[company.plan] || 1) + Number(company.extra_seats || 0);
      const used = (await pool.query('SELECT COUNT(*)::int AS n FROM commercial_users WHERE company_id=$1 AND active', [company.id])).rows[0].n;
      if (used >= seats) throw new HttpError(402, 'No free seats on your plan.');
    }
    const { rows } = await pool.query(
      `UPDATE commercial_users SET role=$2, can_view_financials=$3, active=$4, name=$5, phone=$6,
         invite_token_hash=COALESCE($7, invite_token_hash), invite_expires_at=COALESCE($8, invite_expires_at) WHERE id=$1 RETURNING *`,
      [id, role, role === 'technician' ? Boolean(b.can_view_financials ?? target.can_view_financials) : true,
        typeof b.active === 'boolean' ? b.active : target.active, 'name' in b ? clean(b.name, 200) : target.name,
        'phone' in b ? clean(b.phone, 40) : target.phone, invite?.hash || null, invite?.expiresAt || null]
    );
    res.json({ ok: true, user: publicUser(rows[0]), invite_link: invite ? `${appBaseUrl(req)}/commercial/set-password?token=${invite.token}` : undefined });
  }));

  r.patch('/company', userAuth, wrap(async (req, res) => {
    requireOwner(req);
    const b = req.body || {};
    const company = await loadCompany(pool, req.cuser.company_id);
    let assignee = company.default_assignee_user_id;
    if ('default_assignee_user_id' in b) assignee = (await validAssignees(pool, company.id, [b.default_assignee_user_id]))[0] || null;
    if (b.timezone && !validTimeZone(b.timezone)) throw new HttpError(400, 'Unknown time zone.');
    const { rows } = await pool.query(
      `UPDATE commercial_companies SET name=$2, email=$3, phone=$4, timezone=$5, default_assignee_user_id=$6, labor_rate=$7, service_area=$8, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [company.id, 'name' in b ? clean(b.name, 200) || company.name : company.name, 'email' in b ? clean(b.email, 254).toLowerCase() : company.email,
        'phone' in b ? clean(b.phone, 40) : company.phone, b.timezone || company.timezone, assignee,
        'labor_rate' in b ? (num(b.labor_rate) == null ? null : Math.max(0, num(b.labor_rate))) : company.labor_rate, 'service_area' in b ? clean(b.service_area, 300) : company.service_area]
    );
    res.json({ ok: true, company: presentCompany(rows[0], req.cuser) });
  }));

  // ── Commercial admin (separate from the marketplace admin) ─────────────────
  r.post('/admin/auth/login', authLimiter, wrap(async (req, res) => {
    const email = clean(req.body?.email, 254).toLowerCase();
    const { rows } = await pool.query('SELECT * FROM commercial_admins WHERE email=$1', [email]);
    const admin = rows[0];
    const ok = admin?.active && (await bcrypt.compare(String(req.body?.password || ''), admin.password_hash));
    if (!ok) return res.status(401).json({ ok: false, message: 'Email or password is incorrect.' });
    await pool.query('UPDATE commercial_admins SET last_login_at=NOW() WHERE id=$1', [admin.id]);
    res.json({ ok: true, token: makeCommercialAdminToken(admin), admin: { id: admin.id, email: admin.email, name: admin.name } });
  }));

  r.post('/admin/auth/google', authLimiter, wrap(async (req, res) => {
    const verified = await verifyGoogleIdToken(String(req.body?.credential || ''));
    if (!verified.ok) {
      return res.status(401).json({ ok: false, code: 'GOOGLE_FAILED', message: verified.reason === 'missing' ? 'Google sign-in is not set up on this site yet.' : 'Google sign-in failed. Please try again.' });
    }
    const g = verified.user;
    if (g.email !== COMMERCIAL_GOOGLE_ADMIN_EMAIL) {
      return res.status(403).json({ ok: false, code: 'GOOGLE_NOT_ALLOWED', message: `Google sign-in for the commercial admin is only available for ${COMMERCIAL_GOOGLE_ADMIN_EMAIL}. Other admins sign in with email and password.` });
    }
    let { rows } = await pool.query('SELECT * FROM commercial_admins WHERE email=$1', [g.email]);
    let admin = rows[0];
    if (admin && !admin.active) return res.status(403).json({ ok: false, message: 'This admin account is deactivated.' });
    if (admin?.google_sub && admin.google_sub !== g.sub) {
      return res.status(403).json({ ok: false, code: 'GOOGLE_MISMATCH', message: 'This admin is linked to a different Google account.' });
    }
    if (!admin) {
      // First Google sign-in creates the admin. Its password is random and unknown, so this
      // account signs in with Google until another admin sets a password for it.
      ({ rows } = await pool.query(
        `INSERT INTO commercial_admins (email, name, password_hash, google_sub) VALUES ($1,$2,$3,$4) RETURNING *`,
        [g.email, clean(g.name, 200) || 'FixBridge admin', await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12), g.sub]
      ));
      admin = rows[0];
    } else if (!admin.google_sub) {
      ({ rows } = await pool.query('UPDATE commercial_admins SET google_sub=$2 WHERE id=$1 RETURNING *', [admin.id, g.sub]));
      admin = rows[0];
    }
    await pool.query('UPDATE commercial_admins SET last_login_at=NOW() WHERE id=$1', [admin.id]);
    res.json({ ok: true, token: makeCommercialAdminToken(admin), admin: { id: admin.id, email: admin.email, name: admin.name } });
  }));

  r.get('/admin/me', adminAuth, wrap(async (req, res) => res.json({ ok: true, admin: req.cadmin })));

  // ── Commercial admins (any active admin can add and manage admins) ─────────
  const presentAdmin = (a) => ({ id: a.id, email: a.email, name: a.name, active: a.active, last_login_at: a.last_login_at, created_at: a.created_at });

  r.get('/admin/admins', adminAuth, wrap(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM commercial_admins ORDER BY active DESC, created_at ASC');
    res.json({ ok: true, admins: rows.map(presentAdmin) });
  }));

  r.post('/admin/admins', adminAuth, wrap(async (req, res) => {
    const email = clean(req.body?.email, 254).toLowerCase();
    const name = clean(req.body?.name, 200);
    const password = String(req.body?.password || '');
    const errors = {};
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email.';
    if (name.length < 2) errors.name = 'Enter their name.';
    if (password.length < 12) errors.password = 'Use at least 12 characters.';
    if (Object.keys(errors).length) return res.status(400).json({ ok: false, message: 'Please fix the highlighted fields.', errors });
    const { rows } = await pool.query(
      `INSERT INTO commercial_admins (email, name, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [email, name, await bcrypt.hash(password, 12)]
    );
    if (!rows[0]) throw new HttpError(409, 'That email is already a commercial admin.');
    const mail = await sendMail({
      to: email,
      subject: 'You are a FixBridge Commercial admin',
      text: `Hi ${name},\n\n${req.cadmin.name || req.cadmin.email} added you as a FixBridge Commercial admin.\n\nSign in at ${appBaseUrl(req)}/commercial/admin/login with the password they gave you, then change it under Admins.\n`,
    }).catch(() => ({ ok: false }));
    res.json({ ok: true, admin: presentAdmin(rows[0]), emailed: Boolean(mail.ok && !mail.simulated) });
  }));

  r.patch('/admin/admins/:id', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const b = req.body || {};
    const admin = await tx(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM commercial_admins WHERE id=$1 FOR UPDATE', [id]);
      const target = rows[0];
      if (!target) throw new HttpError(404, 'Admin not found.');
      if (b.active === false && target.active) {
        if (target.id === req.cadmin.id) throw new HttpError(400, 'You cannot deactivate your own admin account.');
        const others = (await db.query('SELECT COUNT(*)::int AS n FROM commercial_admins WHERE active AND id<>$1', [id])).rows[0].n;
        if (others < 1) throw new HttpError(400, 'At least one commercial admin must stay active.');
      }
      if (b.password !== undefined && String(b.password).length < 12) throw new HttpError(400, 'Use at least 12 characters for the password.');
      const hash = b.password !== undefined ? await bcrypt.hash(String(b.password), 12) : null;
      const { rows: updated } = await db.query(
        `UPDATE commercial_admins SET name=$2, active=$3, password_hash=COALESCE($4, password_hash) WHERE id=$1 RETURNING *`,
        [id, 'name' in b ? clean(b.name, 200) || target.name : target.name, typeof b.active === 'boolean' ? b.active : target.active, hash]
      );
      return updated[0];
    });
    res.json({ ok: true, admin: presentAdmin(admin) });
  }));

  r.post('/admin/auth/change-password', authLimiter, adminAuth, wrap(async (req, res) => {
    const current = String(req.body?.current_password || '');
    const next = String(req.body?.new_password || '');
    if (next.length < 12) throw new HttpError(400, 'Use at least 12 characters for the new password.');
    const { rows } = await pool.query('SELECT password_hash FROM commercial_admins WHERE id=$1', [req.cadmin.id]);
    if (!(await bcrypt.compare(current, rows[0]?.password_hash || ''))) throw new HttpError(400, 'Your current password is incorrect.');
    await pool.query('UPDATE commercial_admins SET password_hash=$2 WHERE id=$1', [req.cadmin.id, await bcrypt.hash(next, 12)]);
    res.json({ ok: true });
  }));

  r.get('/admin/summary', adminAuth, wrap(async (_req, res) => {
    const { rows } = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM commercial_pilot_applications WHERE status='new') AS new_applications,
      (SELECT COUNT(*)::int FROM commercial_companies) AS companies,
      (SELECT COUNT(*)::int FROM commercial_companies WHERE founding_member) AS founding,
      (SELECT COUNT(*)::int FROM commercial_jobs) AS jobs,
      (SELECT COUNT(*)::int FROM commercial_jobs WHERE created_at > NOW() - INTERVAL '30 days') AS jobs_30d,
      (SELECT COUNT(*)::int FROM commercial_exceptions WHERE status='open') AS open_exceptions,
      (SELECT COUNT(*)::int FROM commercial_users WHERE approval_status='pending') AS pending_accounts`);
    res.json({ ok: true, summary: { ...rows[0], founding_limit: FOUNDING_LIMIT } });
  }));

  // ── Account approvals ─────────────────────────────────────────────────────
  r.get('/admin/accounts', adminAuth, wrap(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await pool.query(
      `SELECT u.*, c.name AS company_name, c.status AS company_status
         FROM commercial_users u JOIN commercial_companies c ON c.id=u.company_id
        WHERE ($1::text IS NULL OR u.approval_status=$1)
        ORDER BY (u.approval_status='pending') DESC, u.created_at DESC
        LIMIT 500`,
      [status]
    );
    res.json({
      ok: true,
      accounts: rows.map((u) => ({
        ...publicUser(u),
        company_name: u.company_name,
        company_status: u.company_status,
        signup_source: u.signup_source,
        approval_note: u.approval_note,
        approval_decided_at: u.approval_decided_at,
        created_at: u.created_at,
      })),
    });
  }));

  r.post('/admin/accounts/:id/approve', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const user = await tx(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM commercial_users WHERE id=$1 FOR UPDATE', [id]);
      const u = rows[0];
      if (!u) throw new HttpError(404, 'Account not found.');
      if (u.approval_status === 'approved') throw new HttpError(409, 'This account is already approved.');
      const company = await loadCompany(db, u.company_id, true);
      if (u.role === 'owner' && company.status === 'pending') {
        await db.query(`UPDATE commercial_companies SET status='pilot', trial_started_at=COALESCE(trial_started_at, NOW()) WHERE id=$1`, [company.id]);
      } else if (['pending', 'suspended', 'cancelled'].includes(company.status)) {
        throw new HttpError(409, `Approve the company owner first (company status: ${company.status}).`);
      }
      const seats = (PLAN_SEATS[company.plan] || 1) + Number(company.extra_seats || 0);
      const used = (await db.query(
        `SELECT COUNT(*)::int AS n FROM commercial_users WHERE company_id=$1 AND active AND approval_status='approved'`,
        [company.id]
      )).rows[0].n;
      if (used >= seats) {
        throw new HttpError(402, `${company.name} has no free seats (${used}/${seats}). Add a seat on the company page first.`);
      }
      const upd = await db.query(
        `UPDATE commercial_users SET approval_status='approved', active=TRUE, approval_note=$2,
           approval_decided_at=NOW(), approval_decided_by=$3 WHERE id=$1 RETURNING *`,
        [id, clean(req.body?.note, 500), req.cadmin.id]
      );
      return { ...upd.rows[0], company_name: company.name };
    });
    const mail = await sendMail({
      to: user.email,
      subject: 'Your FixBridge Commercial account is approved',
      text: `Hi ${user.name},\n\nYour ${user.role} account for ${user.company_name} is approved.\n\n${
        user.password_hash ? `Sign in at ${appBaseUrl(req)}/commercial/login/${user.role}` : 'Use the invite link you received to set your password, then sign in.'
      }\n`,
    }).catch(() => ({ ok: false }));
    res.json({ ok: true, account: publicUser(user), emailed: Boolean(mail.ok && !mail.simulated) });
  }));

  r.post('/admin/accounts/:id/reject', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const note = clean(req.body?.note, 500);
    const user = await tx(pool, async (db) => {
      const { rows } = await db.query('SELECT * FROM commercial_users WHERE id=$1 FOR UPDATE', [id]);
      const u = rows[0];
      if (!u) throw new HttpError(404, 'Account not found.');
      if (u.approval_status !== 'pending') throw new HttpError(409, 'Only accounts waiting for approval can be rejected. Deactivate approved accounts from the company page.');
      const upd = await db.query(
        `UPDATE commercial_users SET approval_status='rejected', active=FALSE, approval_note=$2,
           approval_decided_at=NOW(), approval_decided_by=$3 WHERE id=$1 RETURNING *`,
        [id, note, req.cadmin.id]
      );
      // A rejected owner sign-up leaves no usable company behind.
      if (u.role === 'owner' && u.signup_source === 'self_signup') {
        await db.query(`UPDATE commercial_companies SET status='cancelled' WHERE id=$1 AND status='pending'`, [u.company_id]);
      }
      return upd.rows[0];
    });
    res.json({ ok: true, account: publicUser(user) });
  }));

  r.get('/admin/applications', adminAuth, wrap(async (req, res) => {
    const status = ['new', 'approved', 'declined'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await pool.query(
      `SELECT * FROM commercial_pilot_applications ${status ? 'WHERE status=$1' : ''} ORDER BY created_at DESC LIMIT 300`,
      status ? [status] : []
    );
    res.json({ ok: true, applications: rows });
  }));

  r.post('/admin/applications/:id/approve', adminAuth, wrap(async (req, res) => {
    const plan = ['network', 'essentials', 'team'].includes(req.body?.plan) ? req.body.plan : 'essentials';
    const founding = Boolean(req.body?.founding_member);
    const invite = newInviteToken();
    const out = await tx(pool, async (db) => {
      const { rows: found } = await db.query('SELECT * FROM commercial_pilot_applications WHERE id=$1 FOR UPDATE', [intId(req.params.id)]);
      const appRow = found[0];
      if (!appRow) throw new HttpError(404, 'Application not found.');
      if (appRow.status !== 'new') throw new HttpError(409, `This application was already ${appRow.status}.`);
      if (founding) {
        await db.query('LOCK TABLE commercial_companies IN SHARE ROW EXCLUSIVE MODE');
        const n = (await db.query('SELECT COUNT(*)::int AS n FROM commercial_companies WHERE founding_member')).rows[0].n;
        if (n >= FOUNDING_LIMIT) throw new HttpError(409, `All ${FOUNDING_LIMIT} founding spots are taken.`);
      }
      const taken = await db.query('SELECT 1 FROM commercial_users WHERE email=$1', [appRow.email]);
      if (taken.rows.length) throw new HttpError(409, 'That email already has a FixBridge Commercial account.');
      const company = (await db.query(
        `INSERT INTO commercial_companies (name, email, phone, trades, service_area, plan, status, founding_member, application_id)
         VALUES ($1,$2,$3,$4,$5,$6,'pilot',$7,$8) RETURNING *`,
        [appRow.company_name, appRow.email, appRow.phone, appRow.trades, appRow.service_area, plan, founding, appRow.id]
      )).rows[0];
      const owner = (await db.query(
        `INSERT INTO commercial_users (company_id, email, name, phone, role, can_view_financials, invite_token_hash, invite_expires_at)
         VALUES ($1,$2,$3,$4,'owner',TRUE,$5,$6) RETURNING *`,
        [company.id, appRow.email, appRow.contact_name, appRow.phone, invite.hash, invite.expiresAt]
      )).rows[0];
      await db.query('UPDATE commercial_companies SET default_assignee_user_id=$2 WHERE id=$1', [company.id, owner.id]);
      await db.query(
        `UPDATE commercial_pilot_applications SET status='approved', company_id=$2, decided_by=$3, decided_at=NOW(), decision_note=$4 WHERE id=$1`,
        [appRow.id, company.id, req.cadmin.id, clean(req.body?.note, 1000)]
      );
      return { company, owner, application: appRow };
    });
    const link = `${appBaseUrl(req)}/commercial/set-password?token=${invite.token}`;
    let emailed = false;
    if (req.body?.send_email !== false) {
      const mail = await sendMail({
        to: out.owner.email,
        subject: 'Your FixBridge Commercial pilot account is ready',
        text: `Hi ${out.owner.name},\n\n${out.company.name} has been approved for the FixBridge Commercial pilot.\n\nSet your password here (link expires in 7 days):\n${link}\n\nThen sign in at ${appBaseUrl(req)}/commercial/login.\n`,
      }).catch((e) => ({ ok: false, message: e.message }));
      emailed = Boolean(mail.ok && !mail.simulated);
    }
    res.json({ ok: true, company: out.company, owner: publicUser(out.owner), invite_link: link, emailed });
  }));

  r.post('/admin/applications/:id/decline', adminAuth, wrap(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE commercial_pilot_applications SET status='declined', decision_note=$2, decided_by=$3, decided_at=NOW() WHERE id=$1 AND status='new' RETURNING *`,
      [intId(req.params.id), clean(req.body?.note, 1000), req.cadmin.id]
    );
    if (!rows[0]) throw new HttpError(409, 'This application is not open.');
    res.json({ ok: true, application: rows[0] });
  }));

  r.get('/admin/companies', adminAuth, wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*)::int FROM commercial_users u WHERE u.company_id=c.id AND u.active) AS active_users,
         (SELECT COUNT(*)::int FROM commercial_jobs j WHERE j.company_id=c.id) AS job_count,
         (SELECT MAX(j.created_at) FROM commercial_jobs j WHERE j.company_id=c.id) AS last_job_at,
         (SELECT COUNT(*)::int FROM commercial_exceptions e WHERE e.company_id=c.id AND e.status='open') AS open_exceptions
         FROM commercial_companies c ORDER BY c.created_at DESC`
    );
    res.json({ ok: true, companies: rows.map((c) => ({ ...c, billing: billingTimeline(c) })) });
  }));

  r.get('/admin/companies/:id', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const company = (await pool.query('SELECT * FROM commercial_companies WHERE id=$1', [id])).rows[0];
    if (!company) throw new HttpError(404, 'Company not found.');
    const users = (await pool.query('SELECT * FROM commercial_users WHERE company_id=$1 ORDER BY role, name', [id])).rows.map(publicUser);
    const stats = (await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM commercial_jobs WHERE company_id=$1 GROUP BY status`, [id]
    )).rows;
    res.json({ ok: true, company: { ...company, billing: billingTimeline(company) }, users, job_counts: stats });
  }));

  r.patch('/admin/companies/:id', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const b = req.body || {};
    const out = await tx(pool, async (db) => {
      const c = (await db.query('SELECT * FROM commercial_companies WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!c) throw new HttpError(404, 'Company not found.');
      const plan = ['network', 'essentials', 'team'].includes(b.plan) ? b.plan : c.plan;
      const status = ['pilot', 'active', 'suspended', 'cancelled'].includes(b.status) ? b.status : c.status;
      const founding = typeof b.founding_member === 'boolean' ? b.founding_member : c.founding_member;
      if (founding && !c.founding_member) {
        await db.query('LOCK TABLE commercial_companies IN SHARE ROW EXCLUSIVE MODE');
        const n = (await db.query('SELECT COUNT(*)::int AS n FROM commercial_companies WHERE founding_member')).rows[0].n;
        if (n >= FOUNDING_LIMIT) throw new HttpError(409, `All ${FOUNDING_LIMIT} founding spots are taken.`);
      }
      const intake = b.intake_configured === true ? (c.intake_configured_at || new Date()) : b.intake_configured === false ? null : c.intake_configured_at;
      const { rows } = await db.query(
        `UPDATE commercial_companies SET plan=$2, status=$3, founding_member=$4, extra_seats=$5, intake_configured_at=$6, billing_notes=$7,
           trial_started_at=CASE WHEN $6::timestamptz IS NULL THEN NULL ELSE trial_started_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, plan, status, founding, Math.max(0, Math.min(500, Number(b.extra_seats ?? c.extra_seats) || 0)), intake,
          'billing_notes' in b ? clean(b.billing_notes, 2000) : c.billing_notes]
      );
      await maybeStartTrial(db, id);
      return (await db.query('SELECT * FROM commercial_companies WHERE id=$1', [id])).rows[0] || rows[0];
    });
    res.json({ ok: true, company: { ...out, billing: billingTimeline(out) } });
  }));

  r.post('/admin/companies/:id/owner-invite', adminAuth, wrap(async (req, res) => {
    const id = intId(req.params.id);
    const invite = newInviteToken();
    const { rows } = await pool.query(
      `UPDATE commercial_users SET invite_token_hash=$2, invite_expires_at=$3
        WHERE id=(SELECT id FROM commercial_users WHERE company_id=$1 AND role='owner' ORDER BY id LIMIT 1) RETURNING *`,
      [id, invite.hash, invite.expiresAt]
    );
    if (!rows[0]) throw new HttpError(404, 'This company has no owner account.');
    res.json({ ok: true, owner: publicUser(rows[0]), invite_link: `${appBaseUrl(req)}/commercial/set-password?token=${invite.token}` });
  }));

  r.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    console.error('[commercial]', err);
    res.status(500).json({ ok: false, message: 'Something went wrong. Please try again.' });
  });
  app.use('/api/commercial', r);
}

// ── Helpers that read or write several tables ────────────────────────────────
function b_occurred(req) {
  return req.body?.occurred_at ? occurredAt(req.body.occurred_at) : null;
}

function presentCompany(c, user) {
  const out = {
    id: c.id, name: c.name, email: c.email, phone: c.phone, timezone: c.timezone, plan: c.plan, status: c.status,
    trades: c.trades, service_area: c.service_area, default_assignee_user_id: c.default_assignee_user_id,
    founding_member: c.founding_member,
  };
  if (canSeeMoney(user)) out.labor_rate = c.labor_rate == null ? null : Number(c.labor_rate);
  if (user.role === 'owner') out.billing = billingTimeline(c);
  return out;
}

async function loadCompany(db, id, forUpdate = false) {
  const { rows } = await db.query(`SELECT * FROM commercial_companies WHERE id=$1 ${forUpdate ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Company not found.');
  return rows[0];
}

async function idempotent(pool, user, key, fn) {
  if (!key) return tx(pool, fn);
  const prior = await pool.query('SELECT response FROM commercial_idempotency WHERE company_id=$1 AND key=$2', [user.company_id, key]);
  if (prior.rows[0]) return { ...prior.rows[0].response, replayed: true };
  return tx(pool, async (db) => {
    const result = await fn(db);
    const ins = await db.query(
      `INSERT INTO commercial_idempotency (company_id, key, response) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key`,
      [user.company_id, key, JSON.stringify(result)]
    );
    if (!ins.rows.length) throw new HttpError(409, 'This action was already recorded.');
    return result;
  });
}

async function validAssignees(db, companyId, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) return [];
  const { rows } = await db.query('SELECT id FROM commercial_users WHERE company_id=$1 AND active AND id = ANY($2::int[])', [companyId, list]);
  if (rows.length !== list.length) throw new HttpError(400, 'Pick people from your own team.');
  return list;
}

function normalizeForCompare(v) {
  if (v instanceof Date) return v.toISOString();
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

async function normalizeJobField(db, companyId, key, value) {
  switch (key) {
    case 'customer_id': {
      if (value == null || value === '') return null;
      const { rows } = await db.query('SELECT id FROM commercial_customers WHERE id=$1 AND company_id=$2', [Number(value), companyId]);
      if (!rows[0]) throw new HttpError(400, 'Pick one of your customers.');
      return rows[0].id;
    }
    case 'site_id': {
      if (value == null || value === '') return null;
      const { rows } = await db.query('SELECT id FROM commercial_sites WHERE id=$1 AND company_id=$2', [Number(value), companyId]);
      if (!rows[0]) throw new HttpError(400, 'Pick one of your sites.');
      return rows[0].id;
    }
    case 'nte_amount': {
      if (value == null || value === '') return null;
      const n = Number(String(value).replace(/[$,]/g, ''));
      if (!(n > 0)) throw new HttpError(400, 'NTE must be a positive amount.');
      return round2(n);
    }
    case 'due_at': return dateOrNull(value, 'Due date');
    case 'eta_at': return dateOrNull(value, 'ETA');
    case 'priority': return PRIORITIES.includes(value) ? value : 'routine';
    case 'checkin_method': return CHECKIN_METHODS.includes(value) ? value : 'other';
    case 'timezone': return value && validTimeZone(value) ? value : '';
    case 'contacts': return (Array.isArray(value) ? value : []).slice(0, 10).map((c) => ({ name: clean(c?.name, 120), phone: clean(c?.phone, 40), email: clean(c?.email, 254), role: clean(c?.role, 80) }));
    case 'dispatcher_email': return clean(value, 254).toLowerCase();
    case 'external_wo_number': case 'po_number': return clean(value, 100);
    default: return clean(value, 6000);
  }
}

async function findJobByWo(db, companyId, wo, dispatcherEmail) {
  const { rows } = await db.query(
    `SELECT * FROM commercial_jobs WHERE company_id=$1 AND lower(external_wo_number)=lower($2) AND status NOT IN ('declined') ORDER BY id DESC FOR UPDATE`,
    [companyId, wo]
  );
  if (!rows.length) return null;
  const domain = (e) => String(e || '').split('@')[1] || '';
  return rows.find((j) => !j.dispatcher_email || !dispatcherEmail || domain(j.dispatcher_email) === domain(dispatcherEmail)) || null;
}

const UPDATE_FIELDS = ['po_number', 'billing_customer', 'site_name', 'site_address', 'scope', 'trade', 'priority', 'due_at', 'nte_amount', 'approval_conditions', 'billing_instructions', 'access_instructions', 'checkin_method', 'checkin_instructions'];

/** A second email for a known WO: before acceptance it updates the job, after acceptance it goes to review. */
async function applyDispatchUpdate(db, job, f, newFlags, user) {
  const changes = [];
  for (const key of UPDATE_FIELDS) {
    const incoming = f[key];
    if (incoming == null || incoming === '' || (key === 'checkin_method' && incoming === 'none') || (key === 'priority' && incoming === 'routine' && !f.priority_explicit)) continue;
    const before = normalizeForCompare(key === 'due_at' && job[key] ? new Date(job[key]).toISOString() : job[key]);
    const after = normalizeForCompare(incoming);
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field: key, from: job[key] instanceof Date ? job[key].toISOString() : job[key], to: incoming });
  }
  if (!changes.length) {
    await logEvent(db, job, 'dispatch_duplicate', 'Same work order received again — no changes', {}, user.id);
    return { job, changes };
  }
  if (job.status === 'received') {
    const sets = {};
    for (const c of changes) sets[c.field] = c.to;
    const next = { ...job, ...sets };
    const flags = mergeFlags(job.flags, [...newFlags.filter((fl) => TEXT_FLAGS.has(fl.code)), ...validateJobFields(next)]);
    const keys = Object.keys(sets);
    const { rows } = await db.query(
      `UPDATE commercial_jobs SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')}, flags=$${keys.length + 2}, review_status='needs_review', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [job.id, ...keys.map((k) => sets[k]), JSON.stringify(flags)]
    );
    await logEvent(db, job, 'dispatch_update', `Dispatcher update applied: ${changes.map((c) => c.field.replace(/_/g, ' ')).join(', ')}`, { changes }, user.id);
    return { job: rows[0], changes };
  }
  await logEvent(db, job, 'dispatch_update', `Dispatcher sent changes after acceptance: ${changes.map((c) => c.field.replace(/_/g, ' ')).join(', ')}`, { changes }, user.id);
  await openException(db, job.company_id, {
    jobId: job.id, kind: 'dispatch_update', title: `WO ${job.external_wo_number} changed after acceptance`,
    detail: changes.map((c) => `${c.field.replace(/_/g, ' ')}: “${c.from ?? ''}” → “${c.to}”`).join('\n'),
    dedupeKey: `dispatch_update:job:${job.id}`,
  });
  return { job, changes };
}

async function createJobFromDispatch(db, company, f, flags, user) {
  const domain = String(f.dispatcher_email || '').split('@')[1]?.toLowerCase() || '';
  const customer = (await db.query(
    `SELECT * FROM commercial_customers WHERE company_id=$1 AND (($2 <> '' AND $2 = ANY(email_domains)) OR lower(name)=lower($3) OR lower(name)=lower($4))
      ORDER BY (CASE WHEN $2 <> '' AND $2 = ANY(email_domains) THEN 0 ELSE 1 END) LIMIT 1`,
    [company.id, domain, f.dispatcher_name || '', f.billing_customer || '']
  )).rows[0];
  const addressKey = String(f.site_address || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  const site = (await db.query(
    `SELECT * FROM commercial_sites WHERE company_id=$1 AND (
        ($2 <> '' AND store_number=$2 AND ($3::int IS NULL OR customer_id=$3))
        OR ($4 <> '' AND left(regexp_replace(lower(address || city || state || zip), '[^a-z0-9]', '', 'g'), 24) = $4))
      LIMIT 1`,
    [company.id, f.store_number || '', customer?.id || null, addressKey.length >= 8 ? addressKey : '']
  )).rows[0];
  const allFlags = [...flags];
  if (!customer && f.dispatcher_name) allFlags.push(makeFlag('customer_unmatched', `(${f.dispatcher_name})`));
  if (!site && (f.site_address || f.store_number)) allFlags.push(makeFlag('site_unmatched'));
  const number = await nextNumber(db, company.id, 'job');
  const checkinMethod = f.checkin_method !== 'none' ? f.checkin_method : customer?.checkin_method || 'none';
  const { rows } = await db.query(
    `INSERT INTO commercial_jobs (company_id, job_number, external_wo_number, po_number, dispatcher_name, dispatcher_email, customer_id, billing_customer,
       site_id, site_name, site_address, contacts, scope, trade, priority, due_at, due_text, timezone, nte_amount, approval_conditions,
       billing_instructions, access_instructions, checkin_method, checkin_instructions, flags, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
    [company.id, number, f.external_wo_number, f.po_number, f.dispatcher_name, f.dispatcher_email, customer?.id || null, f.billing_customer,
      site?.id || null, f.site_name || site?.name || '', f.site_address || [site?.address, site?.city, site?.state, site?.zip].filter(Boolean).join(', '),
      JSON.stringify(f.contacts || []), f.scope, f.trade, f.priority, f.due_at, f.due_text, f.timezone || site?.timezone || company.timezone, f.nte_amount,
      f.approval_conditions, f.billing_instructions || customer?.billing_instructions || '', f.access_instructions || site?.access_instructions || '',
      checkinMethod, f.checkin_instructions || customer?.checkin_instructions || '', JSON.stringify(allFlags), user.id]
  );
  const job = rows[0];
  await logEvent(db, job, 'received', `Dispatch received for WO ${f.external_wo_number || '(no WO#)'}`, {}, user.id);
  const blocking = unresolvedBlocking(allFlags);
  if (blocking.length) {
    await openException(db, company.id, {
      jobId: job.id, kind: 'dispatch_review', title: `${job.job_number}: dispatch needs review`,
      detail: blocking.map((fl) => fl.message).join('\n'), dedupeKey: `review:job:${job.id}`,
    });
  }
  return job;
}

async function visitAction(db, u, visitId, b) {
  const { rows: found } = await db.query('SELECT * FROM commercial_visits WHERE id=$1 AND company_id=$2 FOR UPDATE', [visitId, u.company_id]);
  const visit = found[0];
  if (!visit) throw new HttpError(404, 'Visit not found.');
  if (!isOffice(u) && visit.technician_user_id !== u.id) throw new HttpError(404, 'Visit not found.');
  const job = (await db.query('SELECT * FROM commercial_jobs WHERE id=$1 FOR UPDATE', [visit.job_id])).rows[0];
  const at = occurredAt(b.occurred_at);
  const action = String(b.action || '');
  let sets = {};
  let summary = '';
  let jobStatus = null;
  switch (action) {
    case 'on_my_way':
      if (visit.status !== 'scheduled') throw new HttpError(409, 'This visit is already under way.');
      sets = { status: 'en_route', en_route_at: at };
      summary = 'On the way';
      break;
    case 'check_in': {
      if (!['scheduled', 'en_route'].includes(visit.status)) throw new HttpError(409, 'Already checked in.');
      const lat = num(b.lat); const lng = num(b.lng);
      const hasLocation = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      sets = {
        status: 'on_site', arrived_at: at, en_route_at: visit.en_route_at || null,
        arrival_lat: hasLocation ? lat : null, arrival_lng: hasLocation ? lng : null,
        arrival_location_note: clean(b.location_note, 300) || (hasLocation ? '' : 'Location not shared'),
      };
      summary = `Checked in${hasLocation ? '' : ' (no location)'}`;
      if (['received', 'accepted', 'return_visit_needed', 'proposal_needed'].includes(job.status)) jobStatus = 'in_progress';
      break;
    }
    case 'external_checkin':
    case 'external_checkout': {
      const status = String(b.status || '');
      if (!['confirmed', 'failed', 'exception', 'not_required'].includes(status)) throw new HttpError(400, 'Pick confirmed, failed, exception or not required.');
      const note = clean(b.note, 1000);
      if ((status === 'failed' || status === 'exception') && note.length < 3) throw new HttpError(400, 'Describe what went wrong (e.g. “IVR line busy, called dispatcher at 9:12”).');
      if (!visit.arrived_at) throw new HttpError(409, 'Check in at the site first.');
      const prefix = action === 'external_checkin' ? 'external_checkin' : 'external_checkout';
      sets = { [`${prefix}_status`]: status, [`${prefix}_reference`]: clean(b.reference, 200), [`${prefix}_note`]: note };
      if (action === 'external_checkin') { sets.external_checkin_at = at; sets.external_checkin_method = clean(b.method, 40) || job.checkin_method; }
      summary = `Customer ${action === 'external_checkin' ? 'check-in' : 'check-out'} ${status.replace(/_/g, ' ')}${b.reference ? ` (ref ${clean(b.reference, 60)})` : ''}`;
      if (status === 'failed' || status === 'exception') {
        await openException(db, u.company_id, {
          jobId: job.id, kind: `${prefix}_failed`, title: `${job.job_number}: customer ${action === 'external_checkin' ? 'check-in' : 'check-out'} ${status}`,
          detail: note, dedupeKey: `${prefix}:visit:${visit.id}`,
        });
      } else {
        await resolveExceptions(db, u.company_id, `${prefix}:visit:${visit.id}`, `Marked ${status}`, u.id);
      }
      break;
    }
    case 'check_out': {
      if (visit.status !== 'on_site') throw new HttpError(409, 'Check in before checking out.');
      const outcome = String(b.outcome || '');
      if (!VISIT_OUTCOMES.includes(outcome)) throw new HttpError(400, 'Pick the visit outcome.');
      const work = clean(b.work_performed, 6000);
      if (outcome === 'completed' && work.length < 5) throw new HttpError(400, 'Describe the work performed.');
      if (outcome === 'parts_needed' && !clean(b.parts_needed)) throw new HttpError(400, 'List the parts needed.');
      sets = {
        status: 'completed', departed_at: at, outcome, work_performed: work,
        notes: clean([visit.notes, clean(b.notes, 4000)].filter(Boolean).join('\n'), 8000), parts_needed: clean(b.parts_needed, 2000),
      };
      summary = `Checked out — ${outcome.replace(/_/g, ' ')}`;
      const others = await db.query(`SELECT 1 FROM commercial_visits WHERE job_id=$1 AND id<>$2 AND status IN ('en_route','on_site') LIMIT 1`, [job.id, visit.id]);
      if (!others.rows.length && !['completed', 'invoiced', 'paid'].includes(job.status)) jobStatus = outcomeJobStatus(outcome);
      if (outcome === 'no_access') {
        await openException(db, u.company_id, { jobId: job.id, kind: 'no_access', title: `${job.job_number}: no access to site`, detail: clean(b.notes, 1000), dedupeKey: `no_access:visit:${visit.id}` });
      }
      if (visit.external_checkin_status === 'pending') {
        await openException(db, u.company_id, {
          jobId: job.id, kind: 'external_checkin_failed', title: `${job.job_number}: customer check-in never confirmed`,
          detail: 'The technician checked out without recording the customer check-in. Confirm it or record why it failed.', dedupeKey: `external_checkin:visit:${visit.id}`,
        });
      }
      break;
    }
    case 'note': {
      const note = clean(b.note, 4000);
      if (!note) throw new HttpError(400, 'Write a note.');
      sets = { notes: clean([visit.notes, `[${at.toISOString()}] ${note}`].filter(Boolean).join('\n'), 8000) };
      summary = 'Note added';
      break;
    }
    case 'cancel':
      if (!['scheduled', 'en_route'].includes(visit.status)) throw new HttpError(409, 'Only visits not yet on site can be cancelled.');
      sets = { status: 'cancelled' };
      summary = 'Visit cancelled';
      break;
    default:
      throw new HttpError(400, 'Unknown action.');
  }
  const keys = Object.keys(sets);
  const { rows } = await db.query(
    `UPDATE commercial_visits SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [visit.id, ...keys.map((k) => sets[k])]
  );
  if (jobStatus) await db.query('UPDATE commercial_jobs SET status=$2, updated_at=NOW() WHERE id=$1', [job.id, jobStatus]);
  await logEvent(db, job, `visit_${action}`, `Visit ${visit.visit_number}: ${summary}`, { visit_id: visit.id, note: action === 'note' ? clean(b.note, 300) : undefined }, u.id, at);
  return { visit: rows[0], job_status: jobStatus || job.status };
}

function proposalFields(b, user) {
  const labor = normalizeLaborLines(b?.labor_lines);
  const materials = normalizeMaterialLines(b?.material_lines);
  if (!canSeeMoney(user)) {
    for (const l of labor) l.rate = 0;
    for (const l of materials) l.unit_cost = 0;
  }
  return {
    kind: b?.kind === 'change_order' ? 'change_order' : 'proposal',
    findings: clean(b?.findings, 6000),
    scope: clean(b?.scope, 6000),
    exclusions: clean(b?.exclusions, 3000),
    timing: clean(b?.timing, 500),
    labor_lines: labor,
    material_lines: materials,
    total: proposalTotal(labor, materials),
  };
}

function mergePrices(incoming, existing, priceKey) {
  const prior = Array.isArray(existing) ? existing : [];
  return (Array.isArray(incoming) ? incoming : []).map((l, i) => ({ ...l, [priceKey]: prior[i]?.[priceKey] ?? 0 }));
}

async function loadProposal(db, user, id) {
  const { rows } = await db.query('SELECT * FROM commercial_proposals WHERE id=$1 AND company_id=$2 FOR UPDATE', [intId(id), user.company_id]);
  if (!rows[0]) throw new HttpError(404, 'Proposal not found.');
  const job = await loadJobFor(db, user, rows[0].job_id);
  if (!job) throw new HttpError(404, 'Proposal not found.');
  return { proposal: rows[0], job };
}

async function recordDecision(pool, user, approvalId, b) {
  const decision = String(b.decision || '');
  if (!['approved', 'declined', 'unclear'].includes(decision)) throw new HttpError(400, 'Pick approved, declined, or unclear.');
  const evidence = clean(b.evidence_text, 4000);
  const approver = clean(b.approver_name, 200);
  if (evidence.length < 5) throw new HttpError(400, 'Paste or describe the reply you received as evidence.');
  if (decision === 'approved' && approver.length < 2) throw new HttpError(400, 'Enter who approved it.');
  return tx(pool, async (db) => {
    const { rows: found } = await db.query('SELECT * FROM commercial_approvals WHERE id=$1 AND company_id=$2 FOR UPDATE', [approvalId, user.company_id]);
    const approval = found[0];
    if (!approval) throw new HttpError(404, 'Not found.');
    if (!['pending', 'needs_review'].includes(approval.status)) throw new HttpError(409, `Already ${approval.status}.`);
    const job = (await db.query('SELECT * FROM commercial_jobs WHERE id=$1 FOR UPDATE', [approval.job_id])).rows[0];
    let approvedAmount = null;
    if (decision === 'approved') {
      approvedAmount = b.approved_amount == null || b.approved_amount === '' ? Number(approval.requested_amount) : round2(b.approved_amount);
      if (!(approvedAmount > 0)) throw new HttpError(400, 'Enter the approved amount.');
    }
    const status = decision === 'unclear' ? 'needs_review' : decision;
    const { rows } = await db.query(
      `UPDATE commercial_approvals SET status=$2, approved_amount=$3, approver_name=$4, approver_contact=$5, evidence_kind=$6, evidence_text=$7,
         recorded_by=$8, decided_at=CASE WHEN $2 IN ('approved','declined') THEN NOW() ELSE decided_at END WHERE id=$1 RETURNING *`,
      [approval.id, status, approvedAmount, approver, clean(b.approver_contact, 200), clean(b.evidence_kind, 40) || 'email', evidence, user.id]
    );
    if (approval.proposal_id && decision !== 'unclear') {
      await db.query(`UPDATE commercial_proposals SET status=$2, updated_at=NOW() WHERE id=$1`, [approval.proposal_id, decision]);
    }
    let summary;
    if (decision === 'approved') {
      const current = authorizedLimit(job) ?? 0;
      const newLimit = Math.max(current, approvedAmount);
      await db.query(`UPDATE commercial_jobs SET authorized_amount=$2, updated_at=NOW() WHERE id=$1`, [job.id, newLimit]);
      summary = `${approval.kind === 'nte_increase' ? 'NTE increase' : 'Proposal'} approved by ${approver}: $${approvedAmount.toFixed(2)}`;
      await resolveExceptions(db, user.company_id, `ambiguous:approval:${approval.id}`, 'Approved', user.id);
    } else if (decision === 'declined') {
      summary = `${approval.kind === 'nte_increase' ? 'NTE increase' : 'Proposal'} declined${approver ? ` by ${approver}` : ''}`;
      await resolveExceptions(db, user.company_id, `ambiguous:approval:${approval.id}`, 'Declined', user.id);
    } else {
      summary = 'Reply received but it is not a clear approval — needs review';
      await openException(db, user.company_id, {
        jobId: job.id, kind: 'ambiguous_reply', title: `${job.job_number}: unclear reply to ${approval.kind === 'nte_increase' ? 'NTE request' : 'proposal'}`,
        detail: evidence, dedupeKey: `ambiguous:approval:${approval.id}`,
      });
    }
    if (decision !== 'unclear') {
      const open = await db.query(`SELECT 1 FROM commercial_approvals WHERE job_id=$1 AND status IN ('pending','needs_review') LIMIT 1`, [job.id]);
      if (!open.rows.length && job.status === 'awaiting_approval') {
        const next = decision === 'approved' ? 'return_visit_needed' : 'in_progress';
        await db.query('UPDATE commercial_jobs SET status=$2, updated_at=NOW() WHERE id=$1', [job.id, next]);
      }
    }
    await logEvent(db, job, 'approval', summary, { approval_id: approval.id }, user.id);
    return { approval: rows[0] };
  });
}

async function completionContext(db, job) {
  const visits = (await db.query('SELECT * FROM commercial_visits WHERE job_id=$1 AND status <> $2 ORDER BY visit_number, id', [job.id, 'cancelled'])).rows;
  const files = (await db.query('SELECT id, kind, stage, visit_id FROM commercial_files WHERE job_id=$1', [job.id])).rows;
  const approvals = (await db.query('SELECT * FROM commercial_approvals WHERE job_id=$1', [job.id])).rows;
  const customer = job.customer_id ? (await db.query('SELECT * FROM commercial_customers WHERE id=$1', [job.customer_id])).rows[0] : null;
  return { job, visits, files, approvals, customer };
}

function draftInvoiceLines({ job, visits, approved, company }) {
  if (approved) {
    return [
      ...(approved.labor_lines || []).map((l) => ({ type: 'labor', description: l.description || 'Labor', quantity: Number(l.hours) || 0, unit_price: Number(l.rate) || 0 })),
      ...(approved.material_lines || []).map((l) => ({ type: 'material', description: l.description || 'Material', quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_cost) || 0 })),
    ];
  }
  const rate = company.labor_rate == null ? 0 : Number(company.labor_rate);
  const lines = visits.filter((v) => v.arrived_at && v.departed_at).map((v) => {
    const hours = Math.max(0.25, Math.round(((new Date(v.departed_at) - new Date(v.arrived_at)) / 3600000) * 4) / 4);
    return {
      type: 'labor',
      description: `Labor — visit ${v.visit_number}${v.technician_name ? ` (${v.technician_name})` : ''}, ${new Date(v.arrived_at).toLocaleDateString('en-US', { timeZone: job.timezone || company.timezone || 'America/New_York' })}`,
      quantity: hours,
      unit_price: rate,
    };
  });
  return lines.length ? lines : [{ type: 'labor', description: `Service per WO ${job.external_wo_number}`, quantity: 1, unit_price: 0 }];
}

async function loadInvoice(db, user, id, forUpdate = false) {
  const { rows } = await db.query(`SELECT * FROM commercial_invoices WHERE id=$1 AND company_id=$2 ${forUpdate ? 'FOR UPDATE' : ''}`, [intId(id), user.company_id]);
  if (!rows[0]) throw new HttpError(404, 'Invoice not found.');
  return rows[0];
}

async function invoiceBundle(db, invoice) {
  const job = (await db.query('SELECT * FROM commercial_jobs WHERE id=$1', [invoice.job_id])).rows[0];
  const proposals = (await db.query('SELECT * FROM commercial_proposals WHERE job_id=$1', [job.id])).rows;
  const approvals = (await db.query('SELECT * FROM commercial_approvals WHERE job_id=$1', [job.id])).rows;
  const otherInvoices = (await db.query(
    `SELECT id, invoice_number, status FROM commercial_invoices WHERE company_id=$1 AND (job_id=$2 OR (wo_reference <> '' AND lower(wo_reference)=lower($3)))`,
    [invoice.company_id, job.id, invoice.wo_reference]
  )).rows;
  const payments = (await db.query('SELECT * FROM commercial_payments WHERE invoice_id=$1 ORDER BY id', [invoice.id])).rows;
  const messages = (await db.query(`SELECT id, channel, recipient, subject, status, error, reference, created_at FROM commercial_messages WHERE company_id=$1 AND idempotency_key LIKE $2 ORDER BY id`, [invoice.company_id, `invoice:${invoice.id}%`])).rows;
  const checks = invoiceChecks({ invoice, job, proposals, approvals, otherInvoices });
  return { invoice, job, checks, payments, messages };
}

async function markDeliveryFailed(db, user, invoice, job, reason) {
  const { rows } = await db.query(
    `UPDATE commercial_invoices SET status='delivery_failed', delivery_failure_reason=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [invoice.id, clean(reason, 1000)]
  );
  await openException(db, user.company_id, {
    jobId: job.id, invoiceId: invoice.id, kind: 'invoice_delivery_failed', title: `Invoice ${invoice.invoice_number} was not delivered`,
    detail: reason, dedupeKey: `invoice_delivery:${invoice.id}`, assignedUserId: invoice.assigned_user_id,
  });
  await logEvent(db, job, 'invoice_delivery_failed', `Invoice ${invoice.invoice_number} delivery failed: ${clean(reason, 200)}`, { invoice_id: invoice.id }, user.id);
  return rows[0];
}

/** Everything the job page needs, filtered by what this user may see. */
async function jobBundle(db, job, user) {
  const money = canSeeMoney(user);
  const visits = (await db.query(
    `SELECT v.*, u.name AS technician_name FROM commercial_visits v LEFT JOIN commercial_users u ON u.id=v.technician_user_id WHERE v.job_id=$1 ORDER BY v.visit_number, v.id`,
    [job.id]
  )).rows;
  const files = (await db.query(
    `SELECT id, kind, stage, file_name, content_type, size_bytes, caption, visit_id, dispatch_email_id, created_at FROM commercial_files WHERE job_id=$1 ORDER BY id`,
    [job.id]
  )).rows.map((f) => ({ ...f, url: signedFileUrl(f.id) }));
  const proposals = (await db.query('SELECT * FROM commercial_proposals WHERE job_id=$1 ORDER BY version', [job.id])).rows.map((p) => presentProposal(p, user));
  const approvals = (await db.query('SELECT * FROM commercial_approvals WHERE job_id=$1 ORDER BY id', [job.id])).rows
    .map((a) => (money ? a : { ...a, original_amount: null, requested_amount: null, approved_amount: null }));
  const events = (await db.query(
    `SELECT e.*, u.name AS actor_name FROM commercial_job_events e LEFT JOIN commercial_users u ON u.id=e.actor_user_id WHERE e.job_id=$1 ORDER BY e.occurred_at, e.id`,
    [job.id]
  )).rows;
  const exceptions = (await db.query(
    `SELECT e.*, u.name AS assigned_name FROM commercial_exceptions e LEFT JOIN commercial_users u ON u.id=e.assigned_user_id WHERE e.job_id=$1 ORDER BY e.id DESC`, [job.id]
  )).rows;
  const customer = job.customer_id ? (await db.query('SELECT * FROM commercial_customers WHERE id=$1', [job.customer_id])).rows[0] : null;
  const site = job.site_id ? (await db.query('SELECT * FROM commercial_sites WHERE id=$1', [job.site_id])).rows[0] : null;
  const ctx = { job, visits: visits.filter((v) => v.status !== 'cancelled'), files, approvals, customer };
  const out = {
    job: presentJob(job, user), visits, files, proposals, approvals, events, exceptions, customer, site,
    completion: completionChecks(ctx),
  };
  if (isOffice(user)) {
    out.dispatch_emails = (await db.query(
      'SELECT id, source, from_address, subject, received_at, outcome, flags, created_at FROM commercial_dispatch_emails WHERE job_id=$1 ORDER BY id', [job.id]
    )).rows;
  }
  if (money) out.invoices = (await db.query('SELECT * FROM commercial_invoices WHERE job_id=$1 ORDER BY id', [job.id])).rows;
  return out;
}

function customerFields(b = {}, partial = false) {
  const out = {};
  const set = (key, value) => { if (!partial || key in b) out[key] = value; };
  set('name', clean(b.name, 200));
  set('kind', ['facility_manager', 'property_manager', 'retailer', 'general_contractor', 'other'].includes(b.kind) ? b.kind : 'facility_manager');
  set('email_domains', (Array.isArray(b.email_domains) ? b.email_domains : String(b.email_domains || '').split(/[,\s]+/))
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 10));
  set('billing_email', clean(b.billing_email, 254).toLowerCase());
  set('invoice_recipients', clean(b.invoice_recipients, 1000));
  set('submission_method', SUBMISSION_METHODS.includes(b.submission_method) ? b.submission_method : 'email');
  set('portal_name', clean(b.portal_name, 100));
  set('portal_url', /^https?:\/\//i.test(String(b.portal_url || '')) ? clean(b.portal_url, 500) : '');
  set('subject_format', clean(b.subject_format, 300) || 'Invoice {invoice_number} - WO {wo_number} - {site_name}');
  set('checkin_method', CHECKIN_METHODS.includes(b.checkin_method) ? b.checkin_method : 'none');
  set('checkin_instructions', clean(b.checkin_instructions, 2000));
  set('billing_instructions', clean(b.billing_instructions, 2000));
  set('payment_terms_days', Math.max(0, Math.min(180, Number(b.payment_terms_days ?? 30) || 30)));
  set('requires_completion_photos', b.requires_completion_photos !== false);
  set('requires_signoff', Boolean(b.requires_signoff));
  set('notes', clean(b.notes, 3000));
  return out;
}

async function siteFields(db, companyId, b = {}, partial = false) {
  const out = {};
  const set = (key, value) => { if (!partial || key in b) out[key] = value; };
  if (!partial || 'customer_id' in b) {
    let customerId = null;
    if (b.customer_id) {
      const { rows } = await db.query('SELECT id FROM commercial_customers WHERE id=$1 AND company_id=$2', [Number(b.customer_id), companyId]);
      if (!rows[0]) throw new HttpError(400, 'Pick one of your customers.');
      customerId = rows[0].id;
    }
    out.customer_id = customerId;
  }
  set('name', clean(b.name, 200));
  set('store_number', clean(b.store_number, 40));
  set('address', clean(b.address, 300));
  set('city', clean(b.city, 100));
  set('state', clean(b.state, 40));
  set('zip', clean(b.zip, 20));
  if (!partial || 'timezone' in b) {
    if (b.timezone && !validTimeZone(b.timezone)) throw new HttpError(400, 'Unknown time zone.');
    out.timezone = clean(b.timezone, 60);
  }
  set('access_instructions', clean(b.access_instructions, 2000));
  set('contact_name', clean(b.contact_name, 200));
  set('contact_phone', clean(b.contact_phone, 40));
  set('notes', clean(b.notes, 2000));
  return out;
}

