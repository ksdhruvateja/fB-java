import { DEFAULT_PRICING_RULES } from './pricing.js';

/**
 * Additive Managed MVP schema for Neon / pg-mem.
 */
export async function initManagedSchema(pool) {
  // Contractor compliance extensions on users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'draft'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS license_expires_at DATE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_expires_at DATE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS w9_document_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS w9_document_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS service_zips JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_radius_miles INT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS master_agreement_accepted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS min_trip_charge NUMERIC`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id              SERIAL PRIMARY KEY,
      owner_user_id   INT NOT NULL,
      label           TEXT,
      address_line1   TEXT NOT NULL,
      address_line2   TEXT,
      city            TEXT,
      state           TEXT,
      zip             TEXT,
      property_type   TEXT,
      access_notes    TEXT,
      property_purpose TEXT,
      transaction_stage TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_rules (
      id         TEXT PRIMARY KEY DEFAULT 'default',
      rules      JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INT
    )
  `);

  const existingRules = await pool.query(`SELECT id FROM pricing_rules WHERE id='default'`);
  if (!existingRules.rows.length) {
    await pool.query(`INSERT INTO pricing_rules (id, rules) VALUES ('default', $1)`, [
      JSON.stringify(DEFAULT_PRICING_RULES),
    ]);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS managed_jobs (
      id                              BIGSERIAL PRIMARY KEY,
      booking_id                      TEXT UNIQUE,
      homeowner_user_id               INT NOT NULL,
      property_id                     INT,
      job_mode                        TEXT NOT NULL DEFAULT 'managed',
      status                          TEXT NOT NULL DEFAULT 'draft',
      category                        TEXT,
      title                           TEXT,
      description                     TEXT,
      media_data_url                  TEXT,
      media_type                      TEXT,
      preferred_date                  TEXT,
      preferred_time_slot             TEXT,
      service_timing                  TEXT,
      city_state_zip                  TEXT,
      full_address                    TEXT,
      contact_name                    TEXT,
      contact_phone                   TEXT,
      ai_assessment                   JSONB,
      pricing                         JSONB,
      show_retail_price               BOOLEAN DEFAULT TRUE,
      customer_retail_estimate_low    NUMERIC,
      customer_retail_estimate_high   NUMERIC,
      estimated_contractor_net_low    NUMERIC,
      estimated_contractor_net_high   NUMERIC,
      assigned_contractor_user_id     INT,
      active_proposal_id              INT,
      partner_code                    TEXT,
      partner_id                      INT,
      referral_source                 TEXT,
      referral_status                 TEXT,
      referring_name                  TEXT,
      referring_company               TEXT,
      referring_email                 TEXT,
      referring_phone                 TEXT,
      customer_partner_status_consent BOOLEAN DEFAULT FALSE,
      consent_timestamp               TIMESTAMPTZ,
      consent_version                 TEXT,
      property_purpose                TEXT,
      transaction_stage               TEXT,
      listing_deadline                TEXT,
      closing_deadline                TEXT,
      inspection_report_url           TEXT,
      listing_reference_url           TEXT,
      property_opportunity_notes      TEXT,
      completion_report               JSONB,
      customer_confirmed_at           TIMESTAMPTZ,
      admin_notes                     TEXT,
      created_at                      TIMESTAMPTZ DEFAULT NOW(),
      updated_at                      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_invitations (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      contractor_user_id   INT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'invited',
      expected_net_low     NUMERIC,
      expected_net_high    NUMERIC,
      message              TEXT,
      invited_by           INT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      responded_at         TIMESTAMPTZ,
      UNIQUE(job_id, contractor_user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bids (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      contractor_user_id   INT NOT NULL,
      invitation_id        INT,
      labor                NUMERIC DEFAULT 0,
      materials            NUMERIC DEFAULT 0,
      equipment            NUMERIC DEFAULT 0,
      travel_diagnostic    NUMERIC DEFAULT 0,
      permit_cost          NUMERIC DEFAULT 0,
      disposal             NUMERIC DEFAULT 0,
      net_total            NUMERIC NOT NULL,
      duration_hours       NUMERIC,
      earliest_start       TEXT,
      warranty             TEXT,
      exclusions           TEXT,
      notes                TEXT,
      status               TEXT NOT NULL DEFAULT 'submitted',
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS proposals (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      bid_id               INT,
      scope_summary        TEXT,
      retail_amount        NUMERIC NOT NULL,
      deposit_amount       NUMERIC,
      timeline             TEXT,
      warranty             TEXT,
      exclusions           TEXT,
      contractor_net       NUMERIC,
      platform_gross       NUMERIC,
      processing_cost      NUMERIC,
      status               TEXT NOT NULL DEFAULT 'draft',
      created_by           INT,
      published_at         TIMESTAMPTZ,
      approved_at          TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS change_orders (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      contractor_user_id   INT,
      description          TEXT NOT NULL,
      media_data_url       TEXT,
      contractor_net       NUMERIC NOT NULL,
      retail_amount        NUMERIC,
      status               TEXT NOT NULL DEFAULT 'pending',
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      approved_at          TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT,
      user_id              INT,
      payment_type         TEXT NOT NULL,
      amount               NUMERIC NOT NULL,
      currency             TEXT DEFAULT 'usd',
      status               TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id    TEXT,
      stripe_payment_intent TEXT,
      simulated            BOOLEAN DEFAULT FALSE,
      meta                 JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transfers (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      contractor_user_id   INT NOT NULL,
      amount               NUMERIC NOT NULL,
      status               TEXT NOT NULL DEFAULT 'pending',
      stripe_transfer_id   TEXT,
      simulated            BOOLEAN DEFAULT FALSE,
      hold_reason          TEXT,
      created_by           INT,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id                   SERIAL PRIMARY KEY,
      provider             TEXT NOT NULL,
      event_id             TEXT NOT NULL,
      type                 TEXT,
      processed            BOOLEAN DEFAULT FALSE,
      payload              JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, event_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id                   SERIAL PRIMARY KEY,
      code                 TEXT UNIQUE NOT NULL,
      name                 TEXT NOT NULL,
      company              TEXT,
      email                TEXT,
      phone                TEXT,
      active               BOOLEAN DEFAULT TRUE,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_referrals (
      id                   SERIAL PRIMARY KEY,
      partner_id           INT,
      partner_code         TEXT,
      job_id               BIGINT,
      homeowner_user_id    INT,
      status               TEXT DEFAULT 'referral_received',
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id                   SERIAL PRIMARY KEY,
      actor_user_id        INT,
      action               TEXT NOT NULL,
      entity_type          TEXT,
      entity_id            TEXT,
      detail               JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_status_history (
      id                   SERIAL PRIMARY KEY,
      job_id               BIGINT NOT NULL,
      from_status          TEXT,
      to_status            TEXT NOT NULL,
      actor_user_id        INT,
      note                 TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_referral_events (
      id                   SERIAL PRIMARY KEY,
      referral_id          INT,
      job_id               BIGINT,
      status               TEXT NOT NULL,
      detail               JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id                   SERIAL PRIMARY KEY,
      code                 TEXT UNIQUE NOT NULL,
      label                TEXT,
      discount_type        TEXT NOT NULL DEFAULT 'percent',
      value                NUMERIC NOT NULL,
      active               BOOLEAN DEFAULT TRUE,
      max_uses             INT,
      uses_count           INT DEFAULT 0,
      expires_at           TIMESTAMPTZ,
      created_by           INT,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_code TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_type TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_value NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_label TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_amount_low NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS discount_amount_high NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS job_mode TEXT DEFAULT 'managed'`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS coverage_state TEXT DEFAULT 'unknown'`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS invite_deadline_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS nte_limit NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS sla_hours INT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS budget_view TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS media_storage_key TEXT`);

  await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS hold_reason TEXT`);
  await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS parent_transfer_id INT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refunds (
      id SERIAL PRIMARY KEY,
      payment_id INT,
      job_id BIGINT,
      amount NUMERIC NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      stripe_refund_id TEXT,
      simulated BOOLEAN DEFAULT FALSE,
      created_by INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS disputes (
      id SERIAL PRIMARY KEY,
      payment_id INT,
      job_id BIGINT,
      stripe_dispute_id TEXT,
      amount NUMERIC,
      reason TEXT,
      status TEXT DEFAULT 'open',
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_schedules (
      id SERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL,
      label TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      due_at TIMESTAMPTZ,
      status TEXT DEFAULT 'pending',
      payment_id INT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_purchases (
      id SERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL,
      contractor_user_id INT NOT NULL,
      amount NUMERIC NOT NULL,
      status TEXT DEFAULT 'pending',
      stripe_session_id TEXT,
      unlocked_at TIMESTAMPTZ,
      simulated BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, contractor_user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      plan_code TEXT NOT NULL,
      plan_family TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      stripe_subscription_id TEXT,
      current_period_end TIMESTAMPTZ,
      simulated BOOLEAN DEFAULT FALSE,
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diy_projects (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      job_id BIGINT,
      title TEXT NOT NULL,
      plan JSONB NOT NULL,
      steps_completed JSONB DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parts_catalog (
      id SERIAL PRIMARY KEY,
      sku TEXT,
      name TEXT NOT NULL,
      category TEXT,
      brand TEXT,
      url TEXT,
      price NUMERIC,
      affiliate BOOLEAN DEFAULT FALSE,
      approved BOOLEAN DEFAULT TRUE,
      compatibility_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_units (
      id SERIAL PRIMARY KEY,
      property_id INT NOT NULL,
      unit_label TEXT NOT NULL,
      tenant_name TEXT,
      tenant_email TEXT,
      approval_limit NUMERIC,
      emergency_limit NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_users (
      id SERIAL PRIMARY KEY,
      partner_id INT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      password_hash TEXT,
      role TEXT DEFAULT 'partner',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(partner_id, email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_objects (
      id SERIAL PRIMARY KEY,
      owner_user_id INT,
      job_id BIGINT,
      kind TEXT,
      storage_key TEXT,
      content_type TEXT,
      byte_size INT,
      data_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mfa_challenges (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_crm_notes (
      id SERIAL PRIMARY KEY,
      contractor_user_id INT NOT NULL,
      customer_name TEXT,
      note TEXT NOT NULL,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_code TEXT`);

  // Seed a few approved catalog parts for DIY/tool finder demos
  const { rows: partCount } = await pool.query(`SELECT COUNT(*)::int AS c FROM parts_catalog`);
  if ((partCount[0]?.c || 0) === 0) {
    await pool.query(
      `INSERT INTO parts_catalog (sku, name, category, brand, url, price, affiliate, approved, compatibility_notes)
       VALUES
       ('PIPE-1/2', '1/2" Copper Pipe Coupling', 'plumbing', 'Generic', 'https://example.com/parts/pipe-coupling', 4.5, true, true, 'Common residential copper joints'),
       ('GFCI-15', '15A GFCI Outlet', 'electrical', 'Generic', 'https://example.com/parts/gfci', 18.0, true, true, 'Replace only if DIY-safe and power off'),
       ('FILT-1', '1" HVAC Filter', 'hvac', 'Generic', 'https://example.com/parts/filter', 12.0, true, true, 'Match filter size printed on existing filter')`
    );
  }

  // Mark demo contractor as approved for pilot (always keep invite-ready)
  await pool.query(`
    UPDATE users SET compliance_status='approved'
    WHERE role='contractor' AND LOWER(email)=LOWER('james@yourcompany.com')
  `);

  console.log('[API] Managed schema ready');
}
