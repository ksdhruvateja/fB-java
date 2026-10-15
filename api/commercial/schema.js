/**
 * FixBridge Commercial: tables for the commercial contractor product. Kept apart from the
 * homeowner/contractor marketplace tables (every table is prefixed commercial_) and created on
 * first use, independent of the main schema version gate.
 */
import bcrypt from 'bcryptjs';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS commercial_admins (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS commercial_pilot_applications (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    trades TEXT[] NOT NULL DEFAULT '{}',
    service_area TEXT NOT NULL DEFAULT '',
    team_size TEXT NOT NULL DEFAULT '',
    dispatch_sources TEXT NOT NULL DEFAULT '',
    monthly_dispatch_volume TEXT NOT NULL DEFAULT '',
    current_tools TEXT NOT NULL DEFAULT '',
    plan_interest TEXT NOT NULL DEFAULT 'essentials',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    decision_note TEXT NOT NULL DEFAULT '',
    company_id INT,
    decided_by INT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS commercial_companies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    trades TEXT[] NOT NULL DEFAULT '{}',
    service_area TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    plan TEXT NOT NULL DEFAULT 'essentials',
    status TEXT NOT NULL DEFAULT 'pilot',
    extra_seats INT NOT NULL DEFAULT 0,
    founding_member BOOLEAN NOT NULL DEFAULT FALSE,
    intake_configured_at TIMESTAMPTZ,
    first_job_processed_at TIMESTAMPTZ,
    trial_started_at TIMESTAMPTZ,
    billing_notes TEXT NOT NULL DEFAULT '',
    default_assignee_user_id INT,
    labor_rate NUMERIC(10,2),
    next_job_seq INT NOT NULL DEFAULT 1000,
    next_invoice_seq INT NOT NULL DEFAULT 1000,
    application_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS commercial_users (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'technician',
    can_view_financials BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT,
    invite_token_hash TEXT,
    invite_expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_users_company_idx ON commercial_users(company_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_customers (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'facility_manager',
    email_domains TEXT[] NOT NULL DEFAULT '{}',
    billing_email TEXT NOT NULL DEFAULT '',
    invoice_recipients TEXT NOT NULL DEFAULT '',
    submission_method TEXT NOT NULL DEFAULT 'email',
    portal_name TEXT NOT NULL DEFAULT '',
    portal_url TEXT NOT NULL DEFAULT '',
    subject_format TEXT NOT NULL DEFAULT 'Invoice {invoice_number} - WO {wo_number} - {site_name}',
    checkin_method TEXT NOT NULL DEFAULT 'none',
    checkin_instructions TEXT NOT NULL DEFAULT '',
    billing_instructions TEXT NOT NULL DEFAULT '',
    payment_terms_days INT NOT NULL DEFAULT 30,
    requires_completion_photos BOOLEAN NOT NULL DEFAULT TRUE,
    requires_signoff BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_customers_company_idx ON commercial_customers(company_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_sites (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    customer_id INT REFERENCES commercial_customers(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    zip TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    access_instructions TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_sites_company_idx ON commercial_sites(company_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_jobs (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_number TEXT NOT NULL,
    external_wo_number TEXT NOT NULL DEFAULT '',
    po_number TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'contractor_customer',
    dispatcher_name TEXT NOT NULL DEFAULT '',
    dispatcher_email TEXT NOT NULL DEFAULT '',
    customer_id INT REFERENCES commercial_customers(id) ON DELETE SET NULL,
    billing_customer TEXT NOT NULL DEFAULT '',
    site_id INT REFERENCES commercial_sites(id) ON DELETE SET NULL,
    site_name TEXT NOT NULL DEFAULT '',
    site_address TEXT NOT NULL DEFAULT '',
    contacts JSONB NOT NULL DEFAULT '[]',
    scope TEXT NOT NULL DEFAULT '',
    trade TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'routine',
    due_at TIMESTAMPTZ,
    due_text TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    nte_amount NUMERIC(12,2),
    authorized_amount NUMERIC(12,2),
    approval_conditions TEXT NOT NULL DEFAULT '',
    billing_instructions TEXT NOT NULL DEFAULT '',
    access_instructions TEXT NOT NULL DEFAULT '',
    checkin_method TEXT NOT NULL DEFAULT 'none',
    checkin_instructions TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received',
    review_status TEXT NOT NULL DEFAULT 'needs_review',
    flags JSONB NOT NULL DEFAULT '[]',
    assigned_user_ids INT[] NOT NULL DEFAULT '{}',
    eta_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    accepted_by INT,
    declined_reason TEXT NOT NULL DEFAULT '',
    completion_finalized_at TIMESTAMPTZ,
    completion_finalized_by INT,
    completion_summary TEXT NOT NULL DEFAULT '',
    signoff_name TEXT NOT NULL DEFAULT '',
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, job_number)
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_jobs_company_idx ON commercial_jobs(company_id, status)`,
  `CREATE INDEX IF NOT EXISTS commercial_jobs_wo_idx ON commercial_jobs(company_id, lower(external_wo_number))`,
  `CREATE TABLE IF NOT EXISTS commercial_dispatch_emails (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT REFERENCES commercial_jobs(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'paste',
    from_address TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    received_at TIMESTAMPTZ,
    raw_text TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    extracted JSONB NOT NULL DEFAULT '{}',
    flags JSONB NOT NULL DEFAULT '[]',
    outcome TEXT NOT NULL DEFAULT 'created',
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_dispatch_hash_idx ON commercial_dispatch_emails(company_id, content_hash)`,
  `CREATE TABLE IF NOT EXISTS commercial_files (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    visit_id INT,
    dispatch_email_id INT,
    kind TEXT NOT NULL DEFAULT 'photo',
    stage TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    bytes BYTEA NOT NULL,
    size_bytes INT NOT NULL DEFAULT 0,
    caption TEXT NOT NULL DEFAULT '',
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_files_job_idx ON commercial_files(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_visits (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT NOT NULL REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    visit_number INT NOT NULL DEFAULT 1,
    technician_user_id INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_for TIMESTAMPTZ,
    en_route_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    departed_at TIMESTAMPTZ,
    arrival_lat DOUBLE PRECISION,
    arrival_lng DOUBLE PRECISION,
    arrival_location_note TEXT NOT NULL DEFAULT '',
    external_checkin_status TEXT NOT NULL DEFAULT 'not_required',
    external_checkin_method TEXT NOT NULL DEFAULT '',
    external_checkin_reference TEXT NOT NULL DEFAULT '',
    external_checkin_note TEXT NOT NULL DEFAULT '',
    external_checkin_at TIMESTAMPTZ,
    external_checkout_status TEXT NOT NULL DEFAULT 'not_required',
    external_checkout_reference TEXT NOT NULL DEFAULT '',
    external_checkout_note TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL DEFAULT '',
    work_performed TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    parts_needed TEXT NOT NULL DEFAULT '',
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_visits_job_idx ON commercial_visits(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_proposals (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT NOT NULL REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    kind TEXT NOT NULL DEFAULT 'proposal',
    status TEXT NOT NULL DEFAULT 'draft',
    findings TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT '',
    exclusions TEXT NOT NULL DEFAULT '',
    timing TEXT NOT NULL DEFAULT '',
    labor_lines JSONB NOT NULL DEFAULT '[]',
    material_lines JSONB NOT NULL DEFAULT '[]',
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    wo_reference TEXT NOT NULL DEFAULT '',
    created_by INT,
    reviewed_by INT,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submitted_via TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_proposals_job_idx ON commercial_proposals(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_approvals (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT NOT NULL REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    proposal_id INT REFERENCES commercial_proposals(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'proposal',
    status TEXT NOT NULL DEFAULT 'pending',
    original_amount NUMERIC(12,2),
    requested_amount NUMERIC(12,2),
    approved_amount NUMERIC(12,2),
    reason TEXT NOT NULL DEFAULT '',
    approver_name TEXT NOT NULL DEFAULT '',
    approver_contact TEXT NOT NULL DEFAULT '',
    evidence_kind TEXT NOT NULL DEFAULT '',
    evidence_text TEXT NOT NULL DEFAULT '',
    requested_by INT,
    recorded_by INT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_approvals_job_idx ON commercial_approvals(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_invoices (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT NOT NULL REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    recipient TEXT NOT NULL DEFAULT '',
    submission_method TEXT NOT NULL DEFAULT 'email',
    wo_reference TEXT NOT NULL DEFAULT '',
    service_dates TEXT NOT NULL DEFAULT '',
    lines JSONB NOT NULL DEFAULT '[]',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    checks JSONB NOT NULL DEFAULT '[]',
    sent_at TIMESTAMPTZ,
    sent_reference TEXT NOT NULL DEFAULT '',
    delivery_failure_reason TEXT NOT NULL DEFAULT '',
    acknowledged_at TIMESTAMPTZ,
    dispute_reason TEXT NOT NULL DEFAULT '',
    paid_at TIMESTAMPTZ,
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    assigned_user_id INT,
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, invoice_number)
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_invoices_job_idx ON commercial_invoices(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_payments (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    invoice_id INT NOT NULL REFERENCES commercial_invoices(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    method TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    received_at DATE,
    evidence_text TEXT NOT NULL DEFAULT '',
    recorded_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS commercial_messages (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    direction TEXT NOT NULL DEFAULT 'outbound',
    recipient TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    created_by INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS commercial_exceptions (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    invoice_id INT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    assigned_user_id INT,
    status TEXT NOT NULL DEFAULT 'open',
    dedupe_key TEXT,
    resolution_note TEXT NOT NULL DEFAULT '',
    resolved_by INT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS commercial_exceptions_open_dedupe
     ON commercial_exceptions(company_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS commercial_job_events (
    id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES commercial_companies(id) ON DELETE CASCADE,
    job_id INT NOT NULL REFERENCES commercial_jobs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    actor_user_id INT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS commercial_job_events_job_idx ON commercial_job_events(company_id, job_id)`,
  `CREATE TABLE IF NOT EXISTS commercial_idempotency (
    company_id INT NOT NULL,
    key TEXT NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, key)
  )`,
];

let ready = null;

/** Creates the commercial tables once per process; later calls reuse the same promise. */
export function ensureCommercialSchema(pool) {
  if (!ready) {
    ready = (async () => {
      for (const sql of STATEMENTS) await pool.query(sql);
      await bootstrapCommercialAdmin(pool);
      await syncDemoCompany(pool);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Creates the first commercial admin from COMMERCIAL_ADMIN_EMAIL / COMMERCIAL_ADMIN_PASSWORD. */
async function bootstrapCommercialAdmin(pool) {
  const email = String(process.env.COMMERCIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.COMMERCIAL_ADMIN_PASSWORD || '');
  if (!email || password.length < 12) return;
  const existing = await pool.query('SELECT id FROM commercial_admins WHERE email=$1', [email]);
  if (existing.rows.length) return;
  await pool.query(
    'INSERT INTO commercial_admins (email, name, password_hash) VALUES ($1, $2, $3)',
    [email, String(process.env.COMMERCIAL_ADMIN_NAME || 'Commercial admin'), await bcrypt.hash(password, 12)]
  );
  console.log(`[commercial] Created commercial admin ${email}`);
}

export const DEMO_COMPANY_NAME = 'FixBridge Demo Services';
export const DEMO_USERS = [
  { email: 'demo.owner@fixbridge.us', name: 'Demo Owner', role: 'owner', can_view_financials: true },
  { email: 'demo.office@fixbridge.us', name: 'Demo Office', role: 'office', can_view_financials: true },
  { email: 'demo.tech@fixbridge.us', name: 'Demo Technician', role: 'technician', can_view_financials: false },
];

/**
 * Optional demo company for trying the product. Enabled only while COMMERCIAL_DEMO_PASSWORD is
 * set (10+ characters); all demo users share that password. Removing the variable deactivates
 * the demo users on the next start. The demo company is never a founding member and its customer
 * uses example.com addresses, so nothing is emailed to real people.
 */
async function syncDemoCompany(pool) {
  const password = String(process.env.COMMERCIAL_DEMO_PASSWORD || '');
  const enabled = password.length >= 10;
  const existing = await pool.query('SELECT id FROM commercial_companies WHERE name=$1 AND application_id IS NULL ORDER BY id LIMIT 1', [DEMO_COMPANY_NAME]);
  if (!enabled) {
    if (existing.rows[0]) {
      await pool.query('UPDATE commercial_users SET active=FALSE WHERE company_id=$1', [existing.rows[0].id]);
    }
    return;
  }
  let companyId = existing.rows[0]?.id;
  if (!companyId) {
    const { rows } = await pool.query(
      `INSERT INTO commercial_companies (name, email, phone, trades, service_area, timezone, plan, status, founding_member, labor_rate)
       VALUES ($1, 'demo.office@fixbridge.us', '555-0100', ARRAY['Plumbing','HVAC','Electrical'], 'Demo area', 'America/Chicago', 'team', 'pilot', FALSE, 95)
       RETURNING id`,
      [DEMO_COMPANY_NAME]
    );
    companyId = rows[0].id;
    const customer = await pool.query(
      `INSERT INTO commercial_customers (company_id, name, kind, email_domains, billing_email, invoice_recipients, submission_method,
         subject_format, checkin_method, checkin_instructions, billing_instructions)
       VALUES ($1, 'Northwind Facility Services (demo)', 'facility_manager', ARRAY['example.com'], 'ap@example.com', 'ap@example.com', 'email',
         'Invoice {invoice_number} - WO {wo_number} - {site_name}', 'phone_ivr', 'Call the IVR with the WO# and PIN on arrival and departure.',
         'Email invoice with before/after photos within 7 days.')
       RETURNING id`,
      [companyId]
    );
    await pool.query(
      `INSERT INTO commercial_sites (company_id, customer_id, name, store_number, address, city, state, zip, timezone, access_instructions)
       VALUES ($1, $2, 'Brightway Grocers Store #218 (demo)', '218', '1450 Market Street', 'Springfield', 'IL', '62704', 'America/Chicago',
         'Use the rear receiving door. Store hours 6am–11pm.')`,
      [companyId, customer.rows[0].id]
    );
  }
  const hash = await bcrypt.hash(password, 12);
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO commercial_users (company_id, email, name, role, can_view_financials, password_hash, active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, active=TRUE, role=EXCLUDED.role,
         can_view_financials=EXCLUDED.can_view_financials
       WHERE commercial_users.company_id=$1`,
      [companyId, u.email, u.name, u.role, u.can_view_financials, hash]
    );
  }
  const owner = await pool.query(`SELECT id FROM commercial_users WHERE company_id=$1 AND role='owner' ORDER BY id LIMIT 1`, [companyId]);
  await pool.query('UPDATE commercial_companies SET default_assignee_user_id=COALESCE(default_assignee_user_id, $2) WHERE id=$1', [companyId, owner.rows[0]?.id || null]);
  console.log(`[commercial] Demo company enabled (${DEMO_USERS.map((u) => u.email).join(', ')})`);
}
