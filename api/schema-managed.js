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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_registration_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_registration_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_license_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS business_license_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_application JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS service_zips JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_radius_miles INT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS master_agreement_accepted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS min_trip_charge NUMERIC`);

  // Contractor pricing rule details
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_visit_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS after_hours_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS weekend_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS minimum_labor_fee NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS free_estimate BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS visit_applies_to_repair BOOLEAN DEFAULT FALSE`);

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

  // Job risk level & visit fee status columns
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS diy_risk_level TEXT DEFAULT 'green'`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS visit_fee_authorized BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS visit_fee_captured BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`);

  // Address segregation columns
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS street_address TEXT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS health_profile JSONB`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS beds NUMERIC`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS baths NUMERIC`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS sqft INT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS home_systems JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_documents (
      id              BIGSERIAL PRIMARY KEY,
      property_id     INT NOT NULL,
      owner_user_id   INT NOT NULL,
      category        TEXT NOT NULL,
      title           TEXT,
      file_name       TEXT,
      mime_type       TEXT,
      data_url        TEXT NOT NULL,
      notes           TEXT,
      system_key      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS street_address TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS city TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS state TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS zip TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`);

  // Profile extensions & Referral System
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_code TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dob TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_access_level TEXT DEFAULT 'read-write'`);


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


  // ── Missing tables from spec §2.2 ─────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id          SERIAL PRIMARY KEY,
      source      TEXT NOT NULL,
      job_id      BIGINT,
      user_id     INT,
      error_code  TEXT,
      message     TEXT,
      metadata    JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS completion_reports (
      id              SERIAL PRIMARY KEY,
      job_id          BIGINT NOT NULL,
      contractor_id   INT NOT NULL,
      summary         TEXT,
      materials_used  TEXT,
      before_photo_url TEXT,
      after_photo_url  TEXT,
      warranty        TEXT,
      submitted_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_reviews (
      id            SERIAL PRIMARY KEY,
      author_name   TEXT NOT NULL,
      location      TEXT NOT NULL,
      service_type  TEXT,
      rating        INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      body          TEXT NOT NULL,
      verified      BOOLEAN NOT NULL DEFAULT FALSE,
      published     BOOLEAN NOT NULL DEFAULT TRUE,
      user_id       INT,
      job_id        BIGINT,
      images        TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS images TEXT`);

  // Seed starter reviews once (empty table only)
  try {
    const { rows: existingReviews } = await pool.query(`SELECT COUNT(*)::int AS c FROM site_reviews`);
    if ((existingReviews[0]?.c || 0) === 0) {
      const seeds = [
        ['Maria Santos', 'Astoria, Queens', 'Plumbing', 5, 'Ceiling leak the night before Thanksgiving. Three bids by morning — the contractor who won was excellent and cleaned up after.', true],
        ['Tony Marchetti', 'Huntington, LI', 'HVAC', 5, 'Thought I needed a full HVAC replacement. The AI flagged a capacitor issue — $180 fix. Nobody tried to upsell me.', true],
        ['Devon Williams', 'Flushing, Queens', 'Electrical', 5, 'The AI broke down my panel upgrade better than any contractor I had spoken to. I finally understood what I was paying for.', true],
        ['Rachel Kim', 'Park Slope, Brooklyn', 'General', 5, 'Four bids within 24 hours. The AI estimate was spot on — the winning contractor came in right at the middle of the range.', true],
      ];
      for (const s of seeds) {
        await pool.query(
          `INSERT INTO site_reviews (author_name, location, service_type, rating, body, verified, published)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
          s
        );
      }
    }
  } catch (seedErr) {
    console.warn('[API] site_reviews seed skipped:', seedErr.message);
  }

  // Commented out as it conflicts with the primary notifications table in api/app.js
  // and fails to parse in pg-mem.
  /*
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      user_id     INT NOT NULL,
      job_id      BIGINT,
      channel     TEXT NOT NULL DEFAULT 'email',
      subject     TEXT,
      body        TEXT,
      status      TEXT NOT NULL DEFAULT 'sent',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          SERIAL PRIMARY KEY,
      job_id      BIGINT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id              SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_user_id  INT NOT NULL,
      body            TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consent_records (
      id              SERIAL PRIMARY KEY,
      user_id         INT,
      job_id          BIGINT,
      consent_type    TEXT NOT NULL,
      consent_given   BOOLEAN NOT NULL DEFAULT FALSE,
      ip_address      TEXT,
      user_agent      TEXT,
      version         TEXT DEFAULT '1.0',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── transfers: add reserve columns if not present ─────────────────────────
  await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS reserve_amount     NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS reserve_release_at TIMESTAMPTZ`);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_code TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_apple_sub TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_auth0_sub TEXT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_role_oauth_apple_sub_idx
    ON users (role, oauth_apple_sub)
    WHERE oauth_apple_sub IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_role_oauth_auth0_sub_idx
    ON users (role, oauth_auth0_sub)
    WHERE oauth_auth0_sub IS NOT NULL
  `);

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

  // Interlink tables with foreign key constraints (robust with try-catch blocks)
  const alterQueries = [
    `ALTER TABLE properties ADD CONSTRAINT fk_properties_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE managed_jobs ADD CONSTRAINT fk_managed_jobs_homeowner_user_id FOREIGN KEY (homeowner_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE managed_jobs ADD CONSTRAINT fk_managed_jobs_property_id FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL`,
    `ALTER TABLE managed_jobs ADD CONSTRAINT fk_managed_jobs_assigned_contractor_user_id FOREIGN KEY (assigned_contractor_user_id) REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE job_invitations ADD CONSTRAINT fk_job_invitations_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE job_invitations ADD CONSTRAINT fk_job_invitations_contractor_user_id FOREIGN KEY (contractor_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE bids ADD CONSTRAINT fk_bids_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE bids ADD CONSTRAINT fk_bids_contractor_user_id FOREIGN KEY (contractor_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE proposals ADD CONSTRAINT fk_proposals_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE proposals ADD CONSTRAINT fk_proposals_bid_id FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE SET NULL`,
    `ALTER TABLE change_orders ADD CONSTRAINT fk_change_orders_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE change_orders ADD CONSTRAINT fk_change_orders_contractor_user_id FOREIGN KEY (contractor_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE payments ADD CONSTRAINT fk_payments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE payments ADD CONSTRAINT fk_payments_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE SET NULL`,
    `ALTER TABLE transfers ADD CONSTRAINT fk_transfers_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE transfers ADD CONSTRAINT fk_transfers_contractor_user_id FOREIGN KEY (contractor_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE partner_referrals ADD CONSTRAINT fk_partner_referrals_partner_id FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE`,
    `ALTER TABLE partner_referrals ADD CONSTRAINT fk_partner_referrals_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE partner_referrals ADD CONSTRAINT fk_partner_referrals_homeowner_user_id FOREIGN KEY (homeowner_user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE job_status_history ADD CONSTRAINT fk_job_status_history_job_id FOREIGN KEY (job_id) REFERENCES managed_jobs(id) ON DELETE CASCADE`,
    `ALTER TABLE job_status_history ADD CONSTRAINT fk_job_status_history_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
  ];

  for (const q of alterQueries) {
    try {
      await pool.query(q);
    } catch (err) {
      // Ignore if constraint already exists
    }
  }

  // ── Contractor payout system ───────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_accounts (
      id                       SERIAL PRIMARY KEY,
      contractor_id            INT NOT NULL UNIQUE,
      stripe_account_id        TEXT,
      stripe_account_status    TEXT DEFAULT 'not_connected',
      payouts_enabled          BOOLEAN DEFAULT FALSE,
      instant_payouts_eligible BOOLEAN DEFAULT FALSE,
      bank_account_status      TEXT DEFAULT 'unknown',
      verification_status      TEXT DEFAULT 'unverified',
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_payouts (
      id                       BIGSERIAL PRIMARY KEY,
      contractor_id            INT NOT NULL,
      job_id                   BIGINT NOT NULL UNIQUE,
      job_ref                  TEXT,
      customer_label           TEXT,
      completion_date          TIMESTAMPTZ,
      gross_amount_cents       INT NOT NULL DEFAULT 0,
      platform_fee_cents       INT NOT NULL DEFAULT 0,
      instant_payout_fee_cents INT NOT NULL DEFAULT 0,
      adjustments_cents        INT NOT NULL DEFAULT 0,
      net_amount_cents         INT NOT NULL DEFAULT 0,
      reserve_amount_cents     INT NOT NULL DEFAULT 0,
      payout_method            TEXT DEFAULT 'standard',
      stripe_transfer_id       TEXT,
      stripe_payout_id         TEXT,
      status                   TEXT NOT NULL DEFAULT 'pending_approval',
      approved_by              INT,
      approved_at              TIMESTAMPTZ,
      paid_at                  TIMESTAMPTZ,
      estimated_payout_at      TIMESTAMPTZ,
      failure_reason           TEXT,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payout_settings (
      id                          TEXT PRIMARY KEY DEFAULT 'default',
      instant_payout_enabled      BOOLEAN DEFAULT TRUE,
      instant_fee_type            TEXT DEFAULT 'percentage_plus_fixed',
      instant_fee_percentage_bps  INT DEFAULT 200,
      instant_fee_fixed_cents     INT DEFAULT 150,
      minimum_instant_fee_cents   INT DEFAULT 50,
      maximum_instant_fee_cents   INT DEFAULT 2500,
      minimum_instant_payout_cents INT DEFAULT 1000,
      maximum_instant_payout_cents INT DEFAULT 1000000,
      contractor_absorbs_fee      BOOLEAN DEFAULT TRUE,
      fixbridge_absorbs_fee       BOOLEAN DEFAULT FALSE,
      updated_by                  INT,
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existingPayoutSettings = await pool.query(`SELECT id FROM payout_settings WHERE id='default'`);
  if (!existingPayoutSettings.rows.length) {
    await pool.query(`INSERT INTO payout_settings (id) VALUES ('default')`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payout_audit_logs (
      id               BIGSERIAL PRIMARY KEY,
      payout_id        BIGINT NOT NULL,
      action           TEXT NOT NULL,
      previous_status  TEXT,
      new_status       TEXT,
      performed_by     INT,
      metadata         JSONB,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_payouts_contractor
    ON contractor_payouts (contractor_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_payouts_status
    ON contractor_payouts (status, created_at DESC)
  `);

  // ── Workflow v2: immutable financial snapshots, quote builder, tips ────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_financial_snapshots (
      id                          BIGSERIAL PRIMARY KEY,
      job_id                      BIGINT NOT NULL,
      snapshot_type               TEXT NOT NULL,
      ai_estimate_low             NUMERIC,
      ai_estimate_high            NUMERIC,
      ai_confidence               TEXT,
      contractor_original_quote   NUMERIC,
      contractor_change_orders    NUMERIC DEFAULT 0,
      contractor_total_due        NUMERIC,
      internal_price_adjustment   NUMERIC DEFAULT 0,
      additional_charges          NUMERIC DEFAULT 0,
      discounts                   NUMERIC DEFAULT 0,
      coupon_amount               NUMERIC DEFAULT 0,
      coupon_funded_by            TEXT,
      customer_approved_quote       NUMERIC,
      customer_change_orders        NUMERIC DEFAULT 0,
      customer_service_total        NUMERIC,
      tip_amount                  NUMERIC DEFAULT 0,
      customer_final_payment      NUMERIC,
      processing_cost             NUMERIC,
      ai_cost                     NUMERIC DEFAULT 0,
      other_direct_cost           NUMERIC DEFAULT 0,
      fixbridge_gross_difference  NUMERIC,
      fixbridge_net_contribution  NUMERIC,
      contractor_payout           NUMERIC,
      contractor_payout_fee       NUMERIC DEFAULT 0,
      contractor_net_payout       NUMERIC,
      line_items                  JSONB,
      metadata                    JSONB,
      created_by                  INT,
      created_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_tips (
      id                      SERIAL PRIMARY KEY,
      job_id                  BIGINT NOT NULL,
      homeowner_user_id       INT NOT NULL,
      contractor_user_id      INT,
      amount                  NUMERIC NOT NULL,
      percent_of_service      NUMERIC,
      status                  TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      paid_at                 TIMESTAMPTZ
    )
  `);

  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS line_items JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pricing_adjustments JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS admin_discount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS admin_discount_reason TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS coupon_code TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS coupon_funded_by TEXT DEFAULT 'fixbridge'`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS quote_valid_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS customer_line_items JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS expected_margin_pct NUMERIC`);

  await pool.query(`ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'remote_quote'`);
  await pool.query(`ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS site_visit_window TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS estimate_confidence TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS access_instructions TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS quote_request_mode TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS similar_jobs_count INT DEFAULT 0`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_job_financial_snapshots_job
    ON job_financial_snapshots (job_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS homeowner_invoices (
      id               SERIAL PRIMARY KEY,
      invoice_number   TEXT NOT NULL UNIQUE,
      job_id           BIGINT NOT NULL,
      homeowner_user_id INT,
      amount_due       NUMERIC NOT NULL,
      subtotal         NUMERIC,
      paid             NUMERIC DEFAULT 0,
      line_items       JSONB,
      sent_via         JSONB,
      sent_by          INT,
      custom_note      TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_invoices_job
    ON homeowner_invoices (job_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_invoices_homeowner
    ON homeowner_invoices (homeowner_user_id, created_at DESC)
  `);

  console.log('[API] Managed schema ready');
}
