import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { newDb } from 'pg-mem';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import crypto from 'crypto';
import { analyzeRepair, chatWithCustomer, getAiStatus } from './ai.js';

const isProduction = process.env.NODE_ENV === 'production';
const useInMemoryDb = !process.env.NEON_DATABASE_URL;

// ── Require SESSION_SECRET at startup ─────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET || (!isProduction ? 'local-dev-secret' : undefined);
if (!JWT_SECRET) {
  // Throw (do not process.exit) so Netlify Functions can report the error cleanly.
  throw new Error(
    '[FATAL] SESSION_SECRET environment variable is not set. ' +
    'Set it in the Netlify UI (Site settings → Environment variables) before deploying.'
  );
}

if (!process.env.SESSION_SECRET && !isProduction) {
  console.warn('[FixBridge API] SESSION_SECRET not set; using local development default.');
}

const { Pool } = pg;

function createPool() {
  if (!useInMemoryDb) {
    let host = 'neon';
    try {
      host = new URL(process.env.NEON_DATABASE_URL.replace(/^postgresql:/i, 'postgres:')).hostname;
    } catch {
      // Keep generic label if URL parsing fails.
    }
    console.log(`[FixBridge API] Using Neon Postgres (${host}).`);
    const connectionString = process.env.NEON_DATABASE_URL.includes('uselibpqcompat=')
      ? process.env.NEON_DATABASE_URL
      : `${process.env.NEON_DATABASE_URL}${process.env.NEON_DATABASE_URL.includes('?') ? '&' : '?'}uselibpqcompat=true`;
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }

  const db = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool: MemoryPool } = db.adapters.createPg();
  console.warn('[FixBridge API] NEON_DATABASE_URL not set; using in-memory local database.');
  return new MemoryPool();
}

export const pool = createPool();

function formatBookingId(id, createdAt = new Date()) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
    : date.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = String(id).slice(-6).padStart(6, '0');
  return `FB-${stamp}-${suffix}`;
}

const REQUIREMENTS_MAP = {
  Plumbing:   ['Licensed plumber', 'Leak diagnosis tools', 'Pipe repair experience'],
  Electrical: ['Licensed electrician', 'Panel/circuit safety knowledge', 'Code-compliant wiring'],
  HVAC:       ['HVAC certification', 'Troubleshooting equipment', 'Heating/cooling repair experience'],
  Painting:   ['Surface prep experience', 'Interior/exterior painting tools', 'Finish quality references'],
  Roofing:    ['Roof safety gear', 'Shingle/flashings expertise', 'Weatherproofing experience'],
  Flooring:   ['Floor leveling skills', 'Cutting/installation tools', 'Material-specific installation knowledge'],
  Carpentry:  ['Framing/finish carpentry skills', 'Measurement/cutting precision', 'Structural repair experience'],
  Others:     ['General contractor capability', 'Problem diagnosis ability', 'Willingness to scope unfamiliar jobs'],
};

const TRADE_MATCH_TERMS = {
  Plumbing: ['plumbing', 'plumber', 'pipe', 'drain'],
  Electrical: ['electrical', 'electrician', 'wiring', 'panel'],
  HVAC: ['hvac', 'heating', 'cooling', 'air conditioning', 'ventilation'],
  Painting: ['painting', 'painter', 'paint'],
  Roofing: ['roofing', 'roofer', 'roof'],
  Flooring: ['flooring', 'floor', 'tile', 'hardwood', 'laminate'],
  Carpentry: ['carpentry', 'carpenter', 'framing', 'woodwork'],
  Others: ['contractor', 'handyman', 'general'],
};

function contractorTradeMatchesCategory(contractorTrade, category) {
  if (category === 'Others') return true;
  if (!contractorTrade) return false;
  const terms = TRADE_MATCH_TERMS[category];
  if (!terms) return false;
  const normalizedTrade = String(contractorTrade).toLowerCase();
  return terms.some((term) => normalizedTrade.includes(term));
}

const DEMO_USERS = [
  { role: 'homeowner',   name: 'Maria Santos', email: 'maria@example.com',     plainPassword: 'demo123', is_admin: false, trade: null,             license_number: null },
  { role: 'contractor',  name: 'James Park',   email: 'james@yourcompany.com', plainPassword: 'demo123', is_admin: true,  trade: 'Master Plumber', license_number: 'NY-00231847' },
];

// ── Schema init ───────────────────────────────────────────────────────────────

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                      SERIAL PRIMARY KEY,
      role                    TEXT NOT NULL,
      name                    TEXT NOT NULL,
      email                   TEXT NOT NULL,
      password                TEXT NOT NULL,
      trade                   TEXT,
      license_number          TEXT,
      license_document_name   TEXT,
      insurance_document_name TEXT,
      id_document_name        TEXT,
      is_admin                BOOLEAN NOT NULL DEFAULT FALSE,
      is_blocked              BOOLEAN NOT NULL DEFAULT FALSE,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(role, email)
    )
  `);
  // Add is_admin column to existing tables that predate this migration
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE
  `);
  // Profile fields (additive — used by homeowner + contractor My Profile)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_data_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_details TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_details TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_emails JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_phones JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_addresses JSONB`);
  // Contractor verification documents (name + file bytes as data URL) — persisted in Neon
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS license_document_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_document_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_data TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id             BIGINT PRIMARY KEY,
      booking_id     TEXT,
      category       TEXT NOT NULL,
      tag            TEXT NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT,
      media_data_url TEXT,
      media_type     TEXT,
      ai_assessment  JSONB,
      city_state_zip TEXT NOT NULL,
      full_address   TEXT NOT NULL,
      contact_name   TEXT NOT NULL,
      contact_phone  TEXT NOT NULL,
      homeowner_email TEXT,
      scheduled_date TEXT,
      time_slot      TEXT,
      service_timing TEXT,
      dist           TEXT,
      posted         TEXT,
      est            TEXT,
      bids           INT DEFAULT 0,
      urgent         BOOLEAN DEFAULT FALSE,
      ai             BOOLEAN DEFAULT FALSE,
      requirements   JSONB,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_lifecycle (
      job_id            BIGINT PRIMARY KEY,
      status            TEXT NOT NULL DEFAULT 'open',
      contractor_name   TEXT,
      contractor_email  TEXT,
      invoice_amount    NUMERIC,
      invoice_file_name TEXT,
      rating            INT,
      review            TEXT,
      accepted_at       TIMESTAMPTZ,
      completed_at      TIMESTAMPTZ,
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS homeowner_email TEXT
  `);
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS booking_id TEXT
  `);
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_date TEXT
  `);
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_slot TEXT
  `);
  await pool.query(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS service_timing TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_chat_messages (
      id             BIGINT PRIMARY KEY,
      job_id         BIGINT NOT NULL,
      sender_role    TEXT NOT NULL,
      sender_name    TEXT NOT NULL,
      text           TEXT NOT NULL,
      image_data_url TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL,
      token      TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INT NOT NULL,
      job_id     BIGINT,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      read       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed / repair demo users so UI credentials always work (even if Neon was
  // created before seeding, or a demo password was changed).
  for (const u of DEMO_USERS) {
    const hashed = await bcrypt.hash(u.plainPassword, 10);
    const existing = await pool.query(
      'SELECT id, password, is_admin FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
      [u.role, u.email]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (role,name,email,password,trade,license_number,is_admin)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [u.role, u.name, u.email, hashed, u.trade, u.license_number, u.is_admin]
      );
      continue;
    }

    const row = existing.rows[0];
    const pw = row.password;
    let passwordOk = false;
    if (pw && pw.startsWith('$2')) {
      try {
        passwordOk = await bcrypt.compare(u.plainPassword, pw);
      } catch {
        passwordOk = false;
      }
    }

    // Restore known demo password when missing, plaintext, or out of sync.
    if (!passwordOk && pw !== 'GOOGLE_OAUTH') {
      await pool.query(
        'UPDATE users SET password=$1, name=$2, trade=$3, license_number=$4 WHERE role=$5 AND LOWER(email)=LOWER($6)',
        [hashed, u.name, u.trade, u.license_number, u.role, u.email]
      );
    }

    if (u.is_admin && row.is_admin !== true) {
      await pool.query(
        'UPDATE users SET is_admin=true WHERE role=$1 AND LOWER(email)=LOWER($2)',
        [u.role, u.email]
      );
    }
  }

  // Migrate any remaining plaintext passwords for other users
  const { rows: allUsers } = await pool.query(
    `SELECT role, email, password FROM users WHERE password NOT LIKE '$2%' AND password != 'GOOGLE_OAUTH'`
  );
  for (const u of allUsers) {
    const hashed = await bcrypt.hash(u.password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE role=$2 AND LOWER(email)=LOWER($3)', [hashed, u.role, u.email]);
  }

  // Remove old seeded demo jobs from databases created before live job posting.
  await pool.query('DELETE FROM job_chat_messages WHERE job_id IN (1, 2)');
  await pool.query('DELETE FROM job_lifecycle WHERE job_id IN (1, 2)');
  await pool.query('DELETE FROM jobs WHERE id IN (1, 2)');

  const { rows: jobsMissingBookingId } = await pool.query(
    'SELECT id, created_at FROM jobs WHERE booking_id IS NULL OR booking_id = \'\''
  );
  for (const job of jobsMissingBookingId) {
    await pool.query('UPDATE jobs SET booking_id=$1 WHERE id=$2', [formatBookingId(job.id, job.created_at), job.id]);
  }

  // Unique job numbers (booking_id) across homeowner / contractor / admin views.
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_booking_id_uidx
      ON jobs (booking_id)
      WHERE booking_id IS NOT NULL AND booking_id <> ''
    `);
  } catch (e) {
    console.warn('[FixBridge API] booking_id unique index skipped:', e.message);
  }

  console.log('[FixBridge API] DB ready ✓');
}

// ── Row mappers ───────────────────────────────────────────────────────────────

// ── JWT helpers ───────────────────────────────────────────────────────────────

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, isAdmin: user.isAdmin === true },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/** Reject requests that don't carry a valid JWT. */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Authentication required.' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [decoded.id]);
    if (!rows.length) {
      return res.status(401).json({ ok: false, message: 'User not found.' });
    }
    if (rows[0].is_blocked === true) {
      return res.status(403).json({ ok: false, message: 'This account has been blocked. Please contact support.' });
    }
    req.authUser = {
      ...decoded,
      isAdmin: rows[0].is_admin === true,
      isBlocked: rows[0].is_blocked === true,
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Invalid or expired token.' });
  }
}

/** Reject requests from non-admin token holders. */
function requireAdmin(req, res, next) {
  if (!req.authUser?.isAdmin) {
    return res.status(403).json({ ok: false, message: 'Admin access required.' });
  }
  next();
}

// ── Row serializers ───────────────────────────────────────────────────────────

function asStringArray(val) {
  if (Array.isArray(val)) return val.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? '').trim()).filter(Boolean);
    } catch {
      // ignore
    }
  }
  return [];
}

const MAX_DOCUMENT_DATA_URL_LENGTH = 5_000_000;

function isAllowedDocumentDataUrl(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('data:image/') || value.startsWith('data:application/pdf'))
  );
}

function parseDocumentField(body, nameKey, dataKey) {
  const name = typeof body[nameKey] === 'string' ? body[nameKey].trim() : '';
  const data = typeof body[dataKey] === 'string' ? body[dataKey] : null;
  const provided = Object.prototype.hasOwnProperty.call(body, dataKey) || Object.prototype.hasOwnProperty.call(body, nameKey);
  if (!provided) return { provided: false };
  if (data) {
    if (!isAllowedDocumentDataUrl(data)) {
      return { error: 'Documents must be PDF or image files.' };
    }
    if (data.length > MAX_DOCUMENT_DATA_URL_LENGTH) {
      return { error: 'Document is too large. Please upload a file under ~3.5 MB.' };
    }
  }
  return {
    provided: true,
    name: name || null,
    data: data || null,
    // Clear only when client explicitly sends null data with empty/null name
    clear: body[dataKey] === null && (body[nameKey] === null || body[nameKey] === ''),
    set: typeof data === 'string' && data.length > 0,
  };
}

function rowToUser(r, { includeDocumentData = true } = {}) {
  return {
    id: r.id,
    role: r.role, name: r.name, email: r.email,
    // Never send the password hash to the client
    ...(r.trade                    && { trade: r.trade }),
    ...(r.license_number           && { licenseNumber: r.license_number }),
    ...(r.license_document_name    && { licenseDocumentName: r.license_document_name }),
    ...(r.insurance_document_name  && { insuranceDocumentName: r.insurance_document_name }),
    ...(r.id_document_name         && { idDocumentName: r.id_document_name }),
    ...(includeDocumentData && r.license_document_data   && { licenseDocumentData: r.license_document_data }),
    ...(includeDocumentData && r.insurance_document_data && { insuranceDocumentData: r.insurance_document_data }),
    ...(includeDocumentData && r.id_document_data        && { idDocumentData: r.id_document_data }),
    ...(r.photo_data_url           && { photoDataUrl: r.photo_data_url }),
    ...(r.phone                    && { phone: r.phone }),
    ...(r.address                  && { address: r.address }),
    ...(r.contact_email            && { contactEmail: r.contact_email }),
    ...(r.company_name             && { companyName: r.company_name }),
    ...(r.company_details          && { companyDetails: r.company_details }),
    ...(r.insurance_details        && { insuranceDetails: r.insurance_details }),
    emails: asStringArray(r.profile_emails),
    phones: asStringArray(r.profile_phones),
    addresses: asStringArray(r.profile_addresses),
    isAdmin: r.is_admin === true,
    isBlocked: r.is_blocked === true,
    isGoogleAccount: r.password === 'GOOGLE_OAUTH',
  };
}

function rowToJob(r) {
  return {
    id: Number(r.id), bookingId: r.booking_id, category: r.category, tag: r.tag, title: r.title,
    ...(r.description    && { description: r.description }),
    ...(r.media_data_url && { mediaDataUrl: r.media_data_url }),
    ...(r.media_type     && { mediaType: r.media_type }),
    ...(r.ai_assessment  && { aiAssessment: r.ai_assessment }),
    cityStateZip: r.city_state_zip, fullAddress: r.full_address,
    contactName: r.contact_name, contactPhone: r.contact_phone,
    ...(r.scheduled_date && { scheduledDate: r.scheduled_date }),
    ...(r.time_slot && { timeSlot: r.time_slot }),
    ...(r.service_timing && { serviceTiming: r.service_timing }),
    dist: r.dist, posted: r.posted, est: r.est,
    bids: r.bids, urgent: r.urgent, ai: r.ai,
    requirements: r.requirements ?? [],
  };
}

function rowToNotification(r) {
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    jobId: r.job_id != null ? Number(r.job_id) : undefined,
    type: r.type,
    title: r.title,
    message: r.message,
    read: r.read === true,
    createdAt: r.created_at,
  };
}

async function notifyMatchingContractors(job) {
  const { rows: contractors } = await pool.query(
    `SELECT id, trade FROM users WHERE role='contractor' AND is_blocked=false`
  );
  const matching = contractors.filter((c) => contractorTradeMatchesCategory(c.trade, job.category));
  const jobLabel = job.booking_id || job.bookingId || `JOB-${job.id}`;
  const title = job.urgent ? 'Urgent job in your trade' : 'New job in your trade';
  const message = `${jobLabel} · ${job.category}: ${job.title}`;
  for (const contractor of matching) {
    await pool.query(
      `INSERT INTO notifications (user_id, job_id, type, title, message)
       VALUES ($1, $2, 'new_job', $3, $4)`,
      [contractor.id, job.id, title, message]
    );
  }
  return matching.length;
}

/** Notify every admin when a contractor uploads or replaces verification documents. */
async function notifyAdminsOfDocumentChange({ contractorName, contractorEmail, changedLabels }) {
  if (!changedLabels?.length) return 0;
  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE is_admin=true AND COALESCE(is_blocked,false)=false`
  );
  const title = 'Contractor document updated';
  const message = `${contractorName} (${contractorEmail}) updated: ${changedLabels.join(', ')}`;
  for (const admin of admins) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'document_update', $2, $3)`,
      [admin.id, title, message]
    );
  }
  return admins.length;
}

function rowToLifecycle(r) {
  return {
    jobId: Number(r.job_id), status: r.status,
    ...(r.contractor_name   && { contractorName: r.contractor_name }),
    ...(r.contractor_email  && { contractorEmail: r.contractor_email }),
    ...(r.invoice_amount != null && { invoiceAmount: Number(r.invoice_amount) }),
    ...(r.invoice_file_name && { invoiceFileName: r.invoice_file_name }),
    ...(r.rating != null    && { rating: Number(r.rating) }),
    ...(r.review            && { review: r.review }),
    ...(r.accepted_at       && { acceptedAt: r.accepted_at instanceof Date ? r.accepted_at.toISOString() : r.accepted_at }),
    ...(r.completed_at      && { completedAt: r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at }),
  };
}

function rowToMessage(r) {
  return {
    id: Number(r.id), senderRole: r.sender_role, senderName: r.sender_name, text: r.text,
    ...(r.image_data_url && { imageDataUrl: r.image_data_url }),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
// Required behind Netlify / other reverse proxies so express-rate-limit trusts X-Forwarded-For.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── Rate limiters ─────────────────────────────────────────────────────────────

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }),
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many reset requests. Please wait 1 hour before trying again.' }),
});

// ── Resend email client (lazy) ─────────────────────────────────────────────

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signin', signInLimiter, async (req, res) => {
  try {
    const { role, email, password } = req.body;
    if (!role || !email || !password) return res.status(400).json({ ok: false, message: 'All fields are required.' });

    const { rows } = await pool.query(
      `SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`,
      [role, email.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, message: 'Incorrect email or password. Use the demo login or sign up first.' });
    }

    if (rows[0].is_blocked === true) {
      return res.status(403).json({ ok: false, message: 'This account has been blocked. Please contact support.' });
    }

    // Block password login for Google-only accounts
    if (rows[0].password === 'GOOGLE_OAUTH') {
      return res.status(401).json({ ok: false, message: 'This account uses Google Sign-In. Please click "Continue with Google".' });
    }

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    }

    const user = rowToUser(rows[0]);
    return res.json({ ok: true, token: makeToken(user), user });
  } catch (e) {
    console.error('signin:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const {
      role, name, email, password, trade, licenseNumber,
      licenseDocumentName, insuranceDocumentName, idDocumentName,
      licenseDocumentData, insuranceDocumentData, idDocumentData,
    } = req.body;
    if (!role || !name || !email || !password) return res.status(400).json({ ok: false, message: 'All required fields must be filled.' });
    if (password.length < 6) return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters.' });

    const docs = [
      { label: 'License', name: licenseDocumentName, data: licenseDocumentData },
      { label: 'Insurance', name: insuranceDocumentName, data: insuranceDocumentData },
      { label: 'ID Document', name: idDocumentName, data: idDocumentData },
    ];
    for (const doc of docs) {
      if (doc.data) {
        if (!isAllowedDocumentDataUrl(doc.data)) {
          return res.status(400).json({ ok: false, message: `${doc.label} must be a PDF or image file.` });
        }
        if (doc.data.length > MAX_DOCUMENT_DATA_URL_LENGTH) {
          return res.status(400).json({ ok: false, message: `${doc.label} is too large. Please use a file under ~3.5 MB.` });
        }
      }
    }

    const existing = await pool.query(`SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`, [role, email.trim()]);
    if (existing.rows.length) return res.status(409).json({ ok: false, message: 'An account with that email already exists.' });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (
         role,name,email,password,trade,license_number,
         license_document_name,insurance_document_name,id_document_name,
         license_document_data,insurance_document_data,id_document_data
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        role, name.trim(), email.trim().toLowerCase(), hashed,
        trade?.trim()||null, licenseNumber?.trim()||null,
        licenseDocumentName||null, insuranceDocumentName||null, idDocumentName||null,
        licenseDocumentData||null, insuranceDocumentData||null, idDocumentData||null,
      ]
    );
    const user = rowToUser(rows[0]);
    if (role === 'contractor') {
      const uploaded = docs.filter((d) => d.data || d.name).map((d) => d.label);
      if (uploaded.length) {
        try {
          await notifyAdminsOfDocumentChange({
            contractorName: user.name,
            contractorEmail: user.email,
            changedLabels: uploaded,
          });
        } catch (notifyErr) {
          console.error('notify admins on signup docs:', notifyErr);
        }
      }
    }
    return res.json({ ok: true, token: makeToken(user), user });
  } catch (e) {
    console.error('signup:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

/** Google OAuth — verifies Google ID token, finds or creates user (role from portal). */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role } = req.body;
    if (!credential) return res.status(400).json({ ok: false, message: 'Google credential is required.' });
    if (role !== 'homeowner' && role !== 'contractor') {
      return res.status(400).json({ ok: false, message: 'A valid portal role is required.' });
    }

    const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ ok: false, message: 'Google Sign-In is not configured on this server.' });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ ok: false, message: 'Invalid Google token.' });

    const email = String(payload.email).toLowerCase();
    const displayName = (payload.name && String(payload.name).trim()) || email.split('@')[0];
    const picture = typeof payload.picture === 'string' ? payload.picture : null;

    let { rows } = await pool.query(
      'SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
      [role, email]
    );

    if (!rows.length) {
      // Auto-create for the portal role that initiated Google auth (homeowner or contractor).
      const result = await pool.query(
        `INSERT INTO users (role,name,email,password,photo_data_url)
         VALUES ($1,$2,$3,'GOOGLE_OAUTH',$4) RETURNING *`,
        [role, displayName, email, picture]
      );
      rows = result.rows;
    } else {
      // Refresh profile name / photo from Google when missing or still a Google-managed account.
      const existing = rows[0];
      const nextName = existing.name?.trim() ? existing.name : displayName;
      const nextPhoto = existing.photo_data_url || picture;
      if (nextName !== existing.name || nextPhoto !== existing.photo_data_url) {
        const updated = await pool.query(
          `UPDATE users SET name=$1, photo_data_url=COALESCE(photo_data_url, $2) WHERE id=$3 RETURNING *`,
          [nextName, picture, existing.id]
        );
        rows = updated.rows;
      }
    }

    if (rows[0].is_blocked === true) {
      return res.status(403).json({ ok: false, message: 'This account has been blocked. Please contact support.' });
    }

    const user = rowToUser(rows[0]);
    return res.json({ ok: true, token: makeToken(user), user });
  } catch (e) {
    console.error('google auth:', e);
    return res.status(401).json({ ok: false, message: 'Google sign-in failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
    if (!rows.length) return res.status(401).json({ ok: false, message: 'User not found.' });
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('me:', e);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
});

// ── PUT /api/auth/profile — update signed-in user's My Profile fields ─────────
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ ok: false, message: 'Name is required.' });
    }

    const photoDataUrl = typeof body.photoDataUrl === 'string' ? body.photoDataUrl : null;
    if (photoDataUrl && photoDataUrl.length > 2_500_000) {
      return res.status(400).json({ ok: false, message: 'Photo is too large. Please use a smaller image.' });
    }
    if (photoDataUrl && !photoDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, message: 'Photo must be an image data URL.' });
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const companyDetails = typeof body.companyDetails === 'string' ? body.companyDetails.trim() : '';
    const insuranceDetails = typeof body.insuranceDetails === 'string' ? body.insuranceDetails.trim() : '';
    const licenseNumber = typeof body.licenseNumber === 'string' ? body.licenseNumber.trim() : undefined;
    const emails = asStringArray(body.emails);
    const phones = asStringArray(body.phones);
    const addresses = asStringArray(body.addresses);

    const licenseDoc = parseDocumentField(body, 'licenseDocumentName', 'licenseDocumentData');
    const insuranceDoc = parseDocumentField(body, 'insuranceDocumentName', 'insuranceDocumentData');
    const idDoc = parseDocumentField(body, 'idDocumentName', 'idDocumentData');
    for (const doc of [licenseDoc, insuranceDoc, idDoc]) {
      if (doc.error) return res.status(400).json({ ok: false, message: doc.error });
    }

    // Clear photo when client explicitly sends null; omit field leaves existing value
    const clearPhoto = body.photoDataUrl === null;
    const setPhoto = typeof body.photoDataUrl === 'string';
    const setLicenseNumber = typeof licenseNumber === 'string';

    const { rows: beforeRows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
    if (!beforeRows.length) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }
    const before = beforeRows[0];

    const { rows } = await pool.query(
      `UPDATE users SET
         name = $1,
         phone = $2,
         address = $3,
         contact_email = $4,
         company_name = $5,
         company_details = $6,
         insurance_details = $7,
         profile_emails = $8::jsonb,
         profile_phones = $9::jsonb,
         profile_addresses = $10::jsonb,
         photo_data_url = CASE
           WHEN $11::boolean THEN NULL
           WHEN $12::boolean THEN $13
           ELSE photo_data_url
         END,
         license_number = CASE WHEN $14::boolean THEN $15 ELSE license_number END,
         license_document_name = CASE
           WHEN $16::boolean AND $17::boolean THEN NULL
           WHEN $16::boolean AND $18::boolean THEN $19
           WHEN $16::boolean AND $19::text IS NOT NULL AND NOT $18::boolean THEN $19
           ELSE license_document_name
         END,
         license_document_data = CASE
           WHEN $16::boolean AND $17::boolean THEN NULL
           WHEN $16::boolean AND $18::boolean THEN $20
           ELSE license_document_data
         END,
         insurance_document_name = CASE
           WHEN $21::boolean AND $22::boolean THEN NULL
           WHEN $21::boolean AND $23::boolean THEN $24
           WHEN $21::boolean AND $24::text IS NOT NULL AND NOT $23::boolean THEN $24
           ELSE insurance_document_name
         END,
         insurance_document_data = CASE
           WHEN $21::boolean AND $22::boolean THEN NULL
           WHEN $21::boolean AND $23::boolean THEN $25
           ELSE insurance_document_data
         END,
         id_document_name = CASE
           WHEN $26::boolean AND $27::boolean THEN NULL
           WHEN $26::boolean AND $28::boolean THEN $29
           WHEN $26::boolean AND $29::text IS NOT NULL AND NOT $28::boolean THEN $29
           ELSE id_document_name
         END,
         id_document_data = CASE
           WHEN $26::boolean AND $27::boolean THEN NULL
           WHEN $26::boolean AND $28::boolean THEN $30
           ELSE id_document_data
         END
       WHERE id = $31
       RETURNING *`,
      [
        name,
        phone || null,
        address || null,
        contactEmail || null,
        companyName || null,
        companyDetails || null,
        insuranceDetails || null,
        JSON.stringify(emails),
        JSON.stringify(phones),
        JSON.stringify(addresses),
        clearPhoto,
        setPhoto,
        setPhoto ? photoDataUrl : null,
        setLicenseNumber,
        setLicenseNumber ? (licenseNumber || null) : null,
        // license doc: provided, clear, set, name, data
        Boolean(licenseDoc.provided),
        Boolean(licenseDoc.clear),
        Boolean(licenseDoc.set),
        licenseDoc.provided ? licenseDoc.name : null,
        licenseDoc.provided ? licenseDoc.data : null,
        // insurance doc
        Boolean(insuranceDoc.provided),
        Boolean(insuranceDoc.clear),
        Boolean(insuranceDoc.set),
        insuranceDoc.provided ? insuranceDoc.name : null,
        insuranceDoc.provided ? insuranceDoc.data : null,
        // id doc
        Boolean(idDoc.provided),
        Boolean(idDoc.clear),
        Boolean(idDoc.set),
        idDoc.provided ? idDoc.name : null,
        idDoc.provided ? idDoc.data : null,
        req.authUser.id,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }

    const updated = rows[0];
    const changedLabels = [];
    if (licenseDoc.set && licenseDoc.data !== before.license_document_data) changedLabels.push('License');
    if (insuranceDoc.set && insuranceDoc.data !== before.insurance_document_data) changedLabels.push('Insurance');
    if (idDoc.set && idDoc.data !== before.id_document_data) changedLabels.push('ID Document');
    if (before.role === 'contractor' && changedLabels.length) {
      try {
        await notifyAdminsOfDocumentChange({
          contractorName: updated.name,
          contractorEmail: updated.email,
          changedLabels,
        });
      } catch (notifyErr) {
        console.error('notify admins on profile docs:', notifyErr);
      }
    }

    return res.json({ ok: true, user: rowToUser(updated) });
  } catch (e) {
    console.error('profile update:', e);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
});

/** Forgot password — generates reset token and emails the link */
app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ ok: false });

    const { rows } = await pool.query(
      `SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2) AND password != 'GOOGLE_OAUTH'`,
      [role, email.trim()]
    );

    // Always return ok to prevent email enumeration attacks
    if (!rows.length) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate old unused tokens for this account
    await pool.query(
      'UPDATE password_reset_tokens SET used=true WHERE email=$1 AND role=$2 AND used=false',
      [rows[0].email, role]
    );
    await pool.query(
      'INSERT INTO password_reset_tokens (email,role,token,expires_at) VALUES ($1,$2,$3,$4)',
      [rows[0].email, role, token, expiresAt]
    );

    const origin = req.headers.origin || process.env.APP_URL || 'http://localhost:5000';
    const resetUrl = `${origin}/?action=reset-password&token=${token}&role=${role}`;
    const userName = rows[0].name;
    const portalLabel = role === 'homeowner' ? 'Homeowner' : 'Contractor';

    const resend = getResend();
    if (resend) {
      const fromEmail = process.env.FROM_EMAIL || 'FixBridge <onboarding@resend.dev>';
      await resend.emails.send({
        from: fromEmail,
        to: rows[0].email,
        subject: `Reset your FixBridge ${portalLabel} password`,
        html: `
          <div style="font-family:'DM Sans',sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;padding:40px;">
            <div style="margin-bottom:24px;">
              <span style="font-weight:900;font-size:22px;letter-spacing:0.05em;color:#111;">FIX</span><span style="font-weight:900;font-size:22px;letter-spacing:0.05em;color:#FF4D1C;">BRIDGE</span>
              <span style="font-size:10px;background:#FF4D1C;color:#fff;padding:2px 6px;margin-left:6px;font-family:monospace;">AI</span>
            </div>
            <h2 style="font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:0.04em;color:#111;margin-bottom:8px;">Reset your password</h2>
            <p style="color:#6b7280;margin-bottom:8px;">Hi ${userName},</p>
            <p style="color:#6b7280;margin-bottom:24px;">We received a request to reset your <strong>${portalLabel} Portal</strong> password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#FF4D1C;color:#fff;padding:13px 28px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.03em;">
              RESET MY PASSWORD →
            </a>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
              If you didn't request this, you can safely ignore this email. Your password won't change.
            </p>
          </div>
        `,
      });
    } else {
      // Dev mode: print link to server console (no email configured yet)
      console.log(`\n[FixBridge DEV] Password reset link for ${rows[0].email}:\n${resetUrl}\n`);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('forgot-password:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

/** Reset password — validates token and sets new hashed password */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, role, password } = req.body;
    if (!token || !role || !password) return res.status(400).json({ ok: false, message: 'Invalid request.' });
    if (password.length < 6) return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters.' });

    const { rows } = await pool.query(
      `SELECT * FROM password_reset_tokens WHERE token=$1 AND role=$2 AND used=false AND expires_at > NOW()`,
      [token, role]
    );
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password=$1 WHERE LOWER(email)=LOWER($2) AND role=$3', [hashed, rows[0].email, role]);
    await pool.query('UPDATE password_reset_tokens SET used=true WHERE token=$1', [token]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('reset-password:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

// Requires a valid token. Returns only contractor public info (no passwords, no document file bytes).
app.get('/api/users', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE role='contractor' AND is_blocked=false ORDER BY created_at DESC`);
    return res.json({ ok: true, users: rows.map((r) => rowToUser(r, { includeDocumentData: false })) });
  } catch (e) {
    console.error('users:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ── GET /api/admin/verify ──────────────────────────────────────────────────────
// Confirms the token holder has admin privileges — called by AdminPanel on mount.
app.get('/api/admin/verify', requireAuth, requireAdmin, (_req, res) => {
  return res.json({ ok: true });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users ORDER BY created_at DESC, role ASC, name ASC`);
    return res.json({ ok: true, users: rows.map(rowToUser) });
  } catch (e) {
    console.error('admin users:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.put('/api/admin/users/:userId/block', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { blocked } = req.body;
    const normalizedBlocked = blocked === true;
    const { rows } = await pool.query(
      'UPDATE users SET is_blocked=$1 WHERE id=$2 RETURNING *',
      [normalizedBlocked, userId]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('block user:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ── Admin: all jobs / conversations / messages ────────────────────────────────

app.get('/api/admin/jobs', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    return res.json({ ok: true, jobs: rows.map(rowToJob) });
  } catch (e) {
    console.error('admin jobs:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/lifecycle', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_lifecycle');
    return res.json({ ok: true, lifecycles: rows.map(rowToLifecycle) });
  } catch (e) {
    console.error('admin lifecycle:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/conversations', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_chat_messages ORDER BY created_at ASC');
    const byJob = {};
    for (const r of rows) {
      const k = String(r.job_id);
      if (!byJob[k]) byJob[k] = [];
      byJob[k].push(rowToMessage(r));
    }
    return res.json({ ok: true, conversations: byJob });
  } catch (e) {
    console.error('admin conversations:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/messages', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, j.title AS job_title, j.booking_id, j.category AS job_category
       FROM job_chat_messages m
       LEFT JOIN jobs j ON j.id = m.job_id
       ORDER BY m.created_at DESC`
    );
    return res.json({
      ok: true,
      messages: rows.map((r) => ({
        ...rowToMessage(r),
        jobId: Number(r.job_id),
        jobTitle: r.job_title || null,
        bookingId: r.booking_id || null,
        jobCategory: r.job_category || null,
      })),
    });
  } catch (e) {
    console.error('admin messages:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/chat/:jobId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM job_chat_messages WHERE job_id=$1 ORDER BY created_at ASC',
      [req.params.jobId]
    );
    return res.json({ ok: true, messages: rows.map(rowToMessage) });
  } catch (e) {
    console.error('admin chat:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/api/jobs', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    return res.json(rows.map(rowToJob));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/jobs/my', requireAuth, async (req, res) => {
  try {
    if (req.authUser.role !== 'homeowner') {
      return res.status(403).json({ error: 'Homeowner access required' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM jobs WHERE LOWER(homeowner_email)=LOWER($1) ORDER BY created_at DESC',
      [req.authUser.email]
    );
    return res.json(rows.map(rowToJob));
  } catch (e) {
    console.error('my jobs:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/jobs', requireAuth, async (req, res) => {
  try {
    if (req.authUser.role !== 'homeowner') {
      return res.status(403).json({ error: 'Homeowner access required' });
    }
    const { category, tag, title, description, mediaDataUrl, mediaType, aiAssessment,
            cityStateZip, fullAddress, contactName, contactPhone, dist, est, bids, urgent, ai, requirements,
            scheduledDate, timeSlot, serviceTiming } = req.body;
    const id = Date.now();
    const bookingId = formatBookingId(id);
    await pool.query(
      `INSERT INTO jobs (id,booking_id,category,tag,title,description,media_data_url,media_type,ai_assessment,city_state_zip,full_address,contact_name,contact_phone,homeowner_email,scheduled_date,time_slot,service_timing,dist,posted,est,bids,urgent,ai,requirements)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [id, bookingId, category, tag, title, description || null, mediaDataUrl || null, mediaType || null,
       aiAssessment ? JSON.stringify(aiAssessment) : null,
       cityStateZip, fullAddress, contactName, contactPhone, req.authUser.email,
       scheduledDate || null, timeSlot || null, serviceTiming || null, dist || null,
       'Just now', est || '', bids || 0, urgent || false, ai || false, JSON.stringify(requirements || [])]
    );
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [id]);
    const job = rows[0];
    try {
      await notifyMatchingContractors(job);
    } catch (notifyErr) {
      console.error('notify contractors:', notifyErr);
    }
    return res.json(rowToJob(job));
  } catch (e) {
    console.error('add job:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Notifications ─────────────────────────────────────────────────────────────

app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.authUser.id]
    );
    return res.json(rows.map(rowToNotification));
  } catch (e) {
    console.error('list notifications:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notifications/read', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length > 0) {
      const normalizedIds = ids.map(Number).filter((n) => Number.isFinite(n));
      for (const id of normalizedIds) {
        await pool.query(
          'UPDATE notifications SET read=true WHERE user_id=$1 AND id=$2',
          [req.authUser.id, id]
        );
      }
    } else {
      await pool.query(
        'UPDATE notifications SET read=true WHERE user_id=$1 AND read=false',
        [req.authUser.id]
      );
    }
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.authUser.id]
    );
    return res.json(rows.map(rowToNotification));
  } catch (e) {
    console.error('mark notifications read:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.get('/api/lifecycle', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_lifecycle');
    return res.json(rows.map(rowToLifecycle));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/lifecycle/:jobId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [req.params.jobId]);
    return res.json(rows.length ? rowToLifecycle(rows[0]) : { jobId: Number(req.params.jobId), status: 'open' });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/lifecycle/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status, contractorName, contractorEmail } = req.body;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,contractor_name,contractor_email,accepted_at,completed_at,updated_at)
       VALUES ($1,$2,$3,$4,
         CASE WHEN $2='accepted'  THEN $5::timestamptz ELSE NULL END,
         CASE WHEN $2='completed' THEN $5::timestamptz ELSE NULL END,
         $5::timestamptz)
       ON CONFLICT (job_id) DO UPDATE SET
         status           = EXCLUDED.status,
         contractor_name  = COALESCE($3, job_lifecycle.contractor_name),
         contractor_email = COALESCE($4, job_lifecycle.contractor_email),
         accepted_at  = CASE WHEN $2='accepted'  AND job_lifecycle.accepted_at  IS NULL THEN $5::timestamptz ELSE job_lifecycle.accepted_at  END,
         completed_at = CASE WHEN $2='completed' AND job_lifecycle.completed_at IS NULL THEN $5::timestamptz ELSE job_lifecycle.completed_at END,
         updated_at   = $5::timestamptz`,
      [jobId,status,contractorName||null,contractorEmail||null,now]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    console.error('update status:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/lifecycle/:jobId/invoice', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { amount, fileName } = req.body;
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,invoice_amount,invoice_file_name,updated_at)
       VALUES ($1,'completed',$2,$3,NOW())
       ON CONFLICT (job_id) DO UPDATE SET invoice_amount=$2, invoice_file_name=$3, updated_at=NOW()`,
      [jobId,amount,fileName]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/lifecycle/:jobId/rating', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { rating, review } = req.body;
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,rating,review,updated_at)
       VALUES ($1,'completed',$2,$3,NOW())
       ON CONFLICT (job_id) DO UPDATE SET rating=$2, review=$3, updated_at=NOW()`,
      [jobId,rating,review]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.get('/api/chat', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_chat_messages ORDER BY created_at ASC');
    const byJob = {};
    for (const r of rows) {
      const k = String(r.job_id);
      if (!byJob[k]) byJob[k] = [];
      byJob[k].push(rowToMessage(r));
    }
    return res.json(byJob);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/chat/:jobId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM job_chat_messages WHERE job_id=$1 ORDER BY created_at ASC',
      [req.params.jobId]
    );
    return res.json(rows.map(rowToMessage));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/chat/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { senderRole, senderName, text, imageDataUrl } = req.body;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const { rows } = await pool.query(
      `INSERT INTO job_chat_messages (id,job_id,sender_role,sender_name,text,image_data_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id,jobId,senderRole,senderName,text,imageDataUrl||null]
    );
    return res.json(rowToMessage(rows[0]));
  } catch (e) {
    console.error('add message:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Multi-provider AI assessment (Gemini / OpenAI / OpenRouter / custom) ──────
app.get('/api/ai/status', (_req, res) => {
  return res.json(getAiStatus());
});

app.post('/api/ai/assess', async (req, res) => {
  try {
    const { category, description, imageDataUrl, mode } = req.body || {};
    const desc = typeof description === 'string' ? description.trim() : '';
    const hasImage = typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:');
    if (!category || (!desc && !hasImage)) {
      return res.status(400).json({
        ok: false,
        message: 'category and either a description or a photo are required.',
      });
    }
    const result = await analyzeRepair({
      category,
      description: desc || 'No written description provided. Analyze the attached photo and infer the repair issue.',
      imageDataUrl: hasImage ? imageDataUrl : null,
      mode: mode === 'detail' ? 'detail' : 'summary',
    });
    return res.json(result);
  } catch (e) {
    console.error('ai assess:', e);
    return res.status(500).json({
      assessment: null,
      source: 'error',
      error: 'Server error calling AI provider',
    });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, message: 'messages array is required.' });
    }
    const normalized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0)
      .slice(-20);
    if (!normalized.some((m) => m.role === 'user')) {
      return res.status(400).json({ ok: false, message: 'At least one user message is required.' });
    }
    const result = await chatWithCustomer({ messages: normalized });
    return res.json(result);
  } catch (e) {
    console.error('ai chat:', e);
    return res.status(500).json({
      reply: null,
      source: 'error',
      error: 'Server error calling AI chat',
    });
  }
});

export default app;
