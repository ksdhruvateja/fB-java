import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

const REQUIREMENTS_MAP = {
  Plumbing:    ["Licensed plumber", "Leak diagnosis tools", "Pipe repair experience"],
  Electrical:  ["Licensed electrician", "Panel/circuit safety knowledge", "Code-compliant wiring"],
  HVAC:        ["HVAC certification", "Troubleshooting equipment", "Heating/cooling repair experience"],
  Painting:    ["Surface prep experience", "Interior/exterior painting tools", "Finish quality references"],
  Roofing:     ["Roof safety gear", "Shingle/flashings expertise", "Weatherproofing experience"],
  Flooring:    ["Floor leveling skills", "Cutting/installation tools", "Material-specific installation knowledge"],
  Carpentry:   ["Framing/finish carpentry skills", "Measurement/cutting precision", "Structural repair experience"],
  Others:      ["General contractor capability", "Problem diagnosis ability", "Willingness to scope unfamiliar jobs"],
};

const DEMO_USERS = [
  { role: 'homeowner', name: 'Maria Santos',  email: 'maria@example.com',         password: 'demo123', trade: null,             license_number: null },
  { role: 'contractor', name: 'James Park',   email: 'james@yourcompany.com',     password: 'demo123', trade: 'Master Plumber', license_number: 'NY-00231847' },
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
      id                    SERIAL PRIMARY KEY,
      role                  TEXT NOT NULL,
      name                  TEXT NOT NULL,
      email                 TEXT NOT NULL,
      password              TEXT NOT NULL,
      trade                 TEXT,
      license_number        TEXT,
      license_document_name TEXT,
      insurance_document_name TEXT,
      id_document_name      TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(role, email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id              BIGINT PRIMARY KEY,
      category        TEXT NOT NULL,
      tag             TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      media_data_url  TEXT,
      media_type      TEXT,
      ai_assessment   JSONB,
      city_state_zip  TEXT NOT NULL,
      full_address    TEXT NOT NULL,
      contact_name    TEXT NOT NULL,
      contact_phone   TEXT NOT NULL,
      dist            TEXT,
      posted          TEXT,
      est             TEXT,
      bids            INT DEFAULT 0,
      urgent          BOOLEAN DEFAULT FALSE,
      ai              BOOLEAN DEFAULT FALSE,
      requirements    JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_lifecycle (
      job_id           BIGINT PRIMARY KEY,
      status           TEXT NOT NULL DEFAULT 'open',
      contractor_name  TEXT,
      contractor_email TEXT,
      invoice_amount   NUMERIC,
      invoice_file_name TEXT,
      rating           INT,
      review           TEXT,
      accepted_at      TIMESTAMPTZ,
      completed_at     TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_chat_messages (
      id           BIGINT PRIMARY KEY,
      job_id       BIGINT NOT NULL,
      sender_role  TEXT NOT NULL,
      sender_name  TEXT NOT NULL,
      text         TEXT NOT NULL,
      image_data_url TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed demo users
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO users (role, name, email, password, trade, license_number)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (role, email) DO NOTHING`,
      [u.role, u.name, u.email, u.password, u.trade, u.license_number]
    );
  }

  // Seed demo jobs
  for (const j of SEEDED_JOBS) {
    await pool.query(
      `INSERT INTO jobs (id,category,tag,title,city_state_zip,full_address,contact_name,contact_phone,dist,posted,est,bids,urgent,ai,requirements)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
      [j.id,j.category,j.tag,j.title,j.city_state_zip,j.full_address,j.contact_name,j.contact_phone,j.dist,j.posted,j.est,j.bids,j.urgent,j.ai,JSON.stringify(j.requirements)]
    );
  }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToUser(r) {
  return {
    role: r.role, name: r.name, email: r.email, password: r.password,
    ...(r.trade               && { trade: r.trade }),
    ...(r.license_number      && { licenseNumber: r.license_number }),
    ...(r.license_document_name  && { licenseDocumentName: r.license_document_name }),
    ...(r.insurance_document_name && { insuranceDocumentName: r.insurance_document_name }),
    ...(r.id_document_name    && { idDocumentName: r.id_document_name }),
  };
}

function rowToJob(r) {
  return {
    id: Number(r.id), category: r.category, tag: r.tag, title: r.title,
    ...(r.description     && { description: r.description }),
    ...(r.media_data_url  && { mediaDataUrl: r.media_data_url }),
    ...(r.media_type      && { mediaType: r.media_type }),
    ...(r.ai_assessment   && { aiAssessment: r.ai_assessment }),
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
    ...(r.contractor_name  && { contractorName: r.contractor_name }),
    ...(r.contractor_email && { contractorEmail: r.contractor_email }),
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

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { role, email, password } = req.body;
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2) AND password=$3`,
      [role, email.trim(), password]
    );
    if (!rows.length) return res.status(401).json({ ok: false, message: 'Incorrect email or password. Use the demo login or sign up first.' });
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('signin:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { role, name, email, password, trade, licenseNumber, licenseDocumentName, insuranceDocumentName, idDocumentName } = req.body;
    const existing = await pool.query(`SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`, [role, email.trim()]);
    if (existing.rows.length) return res.status(409).json({ ok: false, message: 'An account with that email already exists.' });
    const { rows } = await pool.query(
      `INSERT INTO users (role,name,email,password,trade,license_number,license_document_name,insurance_document_name,id_document_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [role, name.trim(), email.trim().toLowerCase(), password, trade?.trim()||null, licenseNumber?.trim()||null, licenseDocumentName||null, insuranceDocumentName||null, idDocumentName||null]
    );
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('signup:', e);
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
      [id, category, tag, title, description||null, mediaDataUrl||null, mediaType||null,
       aiAssessment ? JSON.stringify(aiAssessment) : null,
       cityStateZip, fullAddress, contactName, contactPhone, dist||null,
       'Just now', est||'', bids||0, urgent||false, ai||false,
       JSON.stringify(requirements||[])]
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
      [jobId, status, contractorName||null, contractorEmail||null, now]
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
      [jobId, amount, fileName]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    console.error('update invoice:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/lifecycle/:jobId/rating', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { rating, review } = req.body;
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,rating,review,updated_at)
       VALUES ($1,'completed',$2,$3,NOW())
       ON CONFLICT (job_id) DO UPDATE SET rating=$2, review=$3, updated_at=NOW()`,
      [jobId, rating, review]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    console.error('update rating:', e);
    return res.status(500).json({ error: 'Server error' });
  }
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
      [id, jobId, senderRole, senderName, text, imageDataUrl||null]
    );
    return res.json(rowToMessage(rows[0]));
  } catch (e) {
    console.error('add message:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default app;
