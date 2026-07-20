import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import crypto from 'crypto';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

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

const DEMO_USERS = [
  { role: 'homeowner',   name: 'Maria Santos', email: 'maria@example.com',     plainPassword: 'demo123', trade: null,             license_number: null },
  { role: 'contractor',  name: 'James Park',   email: 'james@yourcompany.com', plainPassword: 'demo123', trade: 'Master Plumber', license_number: 'NY-00231847' },
];

const SEEDED_JOBS = [
  {
    id: 1, category: 'Plumbing', tag: 'PLUMBING',
    title: 'Kitchen sink drain clog - backed up',
    city_state_zip: 'Brooklyn, NY 11215', full_address: '145 7th Ave, Brooklyn, NY 11215',
    contact_name: 'Maria Santos', contact_phone: '(917) 555-0121',
    dist: '2.1 mi', posted: '1h ago', est: '$150-$320', bids: 2, urgent: false, ai: true,
    requirements: REQUIREMENTS_MAP.Plumbing,
  },
  {
    id: 2, category: 'Plumbing', tag: 'PLUMBING · URGENT',
    title: 'Pipe burst under bathroom vanity',
    city_state_zip: 'Astoria, NY 11102', full_address: '31-42 30th St, Astoria, NY 11102',
    contact_name: 'Kevin Patel', contact_phone: '(646) 555-0194',
    dist: '0.8 mi', posted: '25m ago', est: '$280-$520', bids: 1, urgent: true, ai: true,
    requirements: REQUIREMENTS_MAP.Plumbing,
  },
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
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(role, email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id             BIGINT PRIMARY KEY,
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

  // Seed demo users (with hashed passwords)
  for (const u of DEMO_USERS) {
    const existing = await pool.query(
      'SELECT password FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
      [u.role, u.email]
    );
    if (existing.rows.length === 0) {
      const hashed = await bcrypt.hash(u.plainPassword, 10);
      await pool.query(
        `INSERT INTO users (role,name,email,password,trade,license_number)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [u.role, u.name, u.email, hashed, u.trade, u.license_number]
      );
    } else {
      // Migrate plaintext demo passwords if needed
      const pw = existing.rows[0].password;
      if (!pw.startsWith('$2') && pw !== 'GOOGLE_OAUTH') {
        const hashed = await bcrypt.hash(pw, 10);
        await pool.query('UPDATE users SET password=$1 WHERE role=$2 AND LOWER(email)=LOWER($3)', [hashed, u.role, u.email]);
      }
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

  // Seed demo jobs
  for (const j of SEEDED_JOBS) {
    await pool.query(
      `INSERT INTO jobs (id,category,tag,title,city_state_zip,full_address,contact_name,contact_phone,dist,posted,est,bids,urgent,ai,requirements)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
      [j.id,j.category,j.tag,j.title,j.city_state_zip,j.full_address,j.contact_name,j.contact_phone,j.dist,j.posted,j.est,j.bids,j.urgent,j.ai,JSON.stringify(j.requirements)]
    );
  }

  console.log('[FixBridge API] DB ready ✓');
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToUser(r) {
  return {
    role: r.role, name: r.name, email: r.email,
    // Never send the password hash to the client
    ...(r.trade                    && { trade: r.trade }),
    ...(r.license_number           && { licenseNumber: r.license_number }),
    ...(r.license_document_name    && { licenseDocumentName: r.license_document_name }),
    ...(r.insurance_document_name  && { insuranceDocumentName: r.insurance_document_name }),
    ...(r.id_document_name         && { idDocumentName: r.id_document_name }),
    isGoogleAccount: r.password === 'GOOGLE_OAUTH',
  };
}

function rowToJob(r) {
  return {
    id: Number(r.id), category: r.category, tag: r.tag, title: r.title,
    ...(r.description    && { description: r.description }),
    ...(r.media_data_url && { mediaDataUrl: r.media_data_url }),
    ...(r.media_type     && { mediaType: r.media_type }),
    ...(r.ai_assessment  && { aiAssessment: r.ai_assessment }),
    cityStateZip: r.city_state_zip, fullAddress: r.full_address,
    contactName: r.contact_name, contactPhone: r.contact_phone,
    dist: r.dist, posted: r.posted, est: r.est,
    bids: r.bids, urgent: r.urgent, ai: r.ai,
    requirements: r.requirements ?? [],
  };
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

    // Block password login for Google-only accounts
    if (rows[0].password === 'GOOGLE_OAUTH') {
      return res.status(401).json({ ok: false, message: 'This account uses Google Sign-In. Please click "Continue with Google".' });
    }

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    }

    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('signin:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { role, name, email, password, trade, licenseNumber, licenseDocumentName, insuranceDocumentName, idDocumentName } = req.body;
    if (!role || !name || !email || !password) return res.status(400).json({ ok: false, message: 'All required fields must be filled.' });
    if (password.length < 6) return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters.' });

    const existing = await pool.query(`SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`, [role, email.trim()]);
    if (existing.rows.length) return res.status(409).json({ ok: false, message: 'An account with that email already exists.' });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (role,name,email,password,trade,license_number,license_document_name,insurance_document_name,id_document_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [role, name.trim(), email.trim().toLowerCase(), hashed, trade?.trim()||null, licenseNumber?.trim()||null, licenseDocumentName||null, insuranceDocumentName||null, idDocumentName||null]
    );
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('signup:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

/** Google OAuth — verifies Google ID token, finds or creates user */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role } = req.body;
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ ok: false, message: 'Google Sign-In is not configured on this server.' });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ ok: false, message: 'Invalid Google token.' });

    const { email, name } = payload;
    let { rows } = await pool.query('SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)', [role, email]);

    if (!rows.length) {
      if (role === 'contractor') {
        // Contractors must register manually to provide license docs
        return res.status(403).json({
          ok: false,
          message: 'No contractor account found for this Google email. Please sign up manually with your trade and license information.',
        });
      }
      // Auto-create homeowner account
      const result = await pool.query(
        `INSERT INTO users (role,name,email,password) VALUES ($1,$2,$3,'GOOGLE_OAUTH') RETURNING *`,
        [role, name || email.split('@')[0], email.toLowerCase()]
      );
      rows = result.rows;
    }

    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('google auth:', e);
    return res.status(401).json({ ok: false, message: 'Google sign-in failed. Please try again.' });
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

app.get('/api/users', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at');
    return res.json(rows.map(rowToUser));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/api/jobs', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    return res.json(rows.map(rowToJob));
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const { category, tag, title, description, mediaDataUrl, mediaType, aiAssessment,
            cityStateZip, fullAddress, contactName, contactPhone, dist, est, bids, urgent, ai, requirements } = req.body;
    const id = Date.now();
    await pool.query(
      `INSERT INTO jobs (id,category,tag,title,description,media_data_url,media_type,ai_assessment,city_state_zip,full_address,contact_name,contact_phone,dist,posted,est,bids,urgent,ai,requirements)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id,category,tag,title,description||null,mediaDataUrl||null,mediaType||null,
       aiAssessment?JSON.stringify(aiAssessment):null,
       cityStateZip,fullAddress,contactName,contactPhone,dist||null,
       'Just now',est||'',bids||0,urgent||false,ai||false,JSON.stringify(requirements||[])]
    );
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [id]);
    return res.json(rowToJob(rows[0]));
  } catch (e) {
    console.error('add job:', e);
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

export default app;
