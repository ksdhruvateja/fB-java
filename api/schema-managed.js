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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS diversity_document_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS diversity_document_data TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_application JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS service_zips JSONB`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS travel_radius_miles INT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_onboarding_status TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS master_agreement_accepted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dispatch_eligible BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level1_eligible BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level2_eligible BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS overall_compliance_status TEXT DEFAULT 'RED'`);
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
    CREATE TABLE IF NOT EXISTS homecare_settings (
      id              TEXT PRIMARY KEY DEFAULT 'default',
      config          JSONB NOT NULL,
      config_version  INT NOT NULL DEFAULT 1,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_by      INT
    )
  `);

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
  await pool.query(`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS approved_snapshot JSONB`);
  await pool.query(`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS line_items JSONB`);
  await pool.query(`ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS reason TEXT`);

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
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS public_id TEXT`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'stripe'`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_public_id
    ON payments (public_id) WHERE public_id IS NOT NULL
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
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS visit_fee_amount NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancellation_reason_code TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancellation_details JSONB`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancelled_by TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS checkout_snapshot JSONB`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS coupon_redeemed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS service_fee_amount NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS service_amount NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS coupon_discount_amount NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS final_customer_amount NUMERIC`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS work_queue_status TEXT`);

  // Address segregation columns
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'US'`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS street_address TEXT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS health_profile JSONB`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS beds NUMERIC`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS baths NUMERIC`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS sqft INT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS home_systems JSONB`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS postal_code_plus4 TEXT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS address_verified BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS address_verification_provider TEXT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS timezone TEXT`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code_plus4 TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address_verified BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address_verification_provider TEXT`);

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
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS assessment_status TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS assessment_error_code TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS assessment_attempts INT DEFAULT 0`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS assessment_started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS assessment_completed_at TIMESTAMPTZ`);

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
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS contractor_user_id INT`);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS rating_quality INT`);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS rating_communication INT`);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS rating_punctuality INT`);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS rating_cleanliness INT`);
  await pool.query(`ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS rating_value INT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role_preset TEXT`);
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS site_reviews_user_job_uidx
      ON site_reviews (user_id, job_id)
      WHERE user_id IS NOT NULL AND job_id IS NOT NULL
    `);
  } catch (idxErr) {
    console.warn('[API] site_reviews unique index skipped:', idxErr.message);
  }

  // Seed starter reviews once (empty table only) — never in production
  try {
    const allowMarketingSeed =
      process.env.NODE_ENV !== 'production' &&
      String(process.env.ENABLE_DEMO_SEED ?? process.env.ENABLE_DEMO_USERS ?? 'false').toLowerCase() === 'true' ||
      String(process.env.ENABLE_DEMO_SEED ?? process.env.ENABLE_DEMO_USERS ?? 'false').toLowerCase() === '1';
    const { rows: existingReviews } = await pool.query(`SELECT COUNT(*)::int AS c FROM site_reviews`);
    if (allowMarketingSeed && (existingReviews[0]?.c || 0) === 0) {
      const seeds = [
        ['Maria Santos', 'Denver, CO', 'Plumbing', 5, 'Ceiling leak the night before Thanksgiving. Three bids by morning — the contractor who won was excellent and cleaned up after.', true],
        ['Tony Marchetti', 'Charlotte, NC', 'HVAC', 5, 'Thought I needed a full HVAC replacement. The AI flagged a capacitor issue — $180 fix. Nobody tried to upsell me.', true],
        ['Devon Williams', 'Seattle, WA', 'Electrical', 5, 'The AI broke down my panel upgrade better than any contractor I had spoken to. I finally understood what I was paying for.', true],
        ['Rachel Kim', 'Atlanta, GA', 'General', 5, 'Four bids within 24 hours. The AI estimate was spot on — the winning contractor came in right at the middle of the range.', true],
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

  // ── Contractor compliance documents ────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_compliance_documents (
      id                   BIGSERIAL PRIMARY KEY,
      contractor_user_id   INT NOT NULL,
      document_type        TEXT NOT NULL,
      applicability        TEXT NOT NULL DEFAULT 'REQUIRED',
      status               TEXT NOT NULL DEFAULT 'MISSING',
      file_name            TEXT,
      file_data            TEXT,
      issue_date           DATE,
      expiration_date      DATE,
      upload_later         BOOLEAN DEFAULT FALSE,
      uploaded_at          TIMESTAMPTZ,
      verified_at          TIMESTAMPTZ,
      verified_by          INT,
      rejected_at          TIMESTAMPTZ,
      rejected_by          INT,
      rejection_reason     TEXT,
      notes                TEXT,
      version              INT NOT NULL DEFAULT 1,
      is_current           BOOLEAN NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_compliance_current
    ON contractor_compliance_documents (contractor_user_id, document_type)
    WHERE is_current = true
  `);
  await pool.query(`ALTER TABLE contractor_compliance_documents ADD COLUMN IF NOT EXISTS policy_carrier TEXT`);
  await pool.query(`ALTER TABLE contractor_compliance_documents ADD COLUMN IF NOT EXISTS policy_number TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_compliance_alerts (
      id                   BIGSERIAL PRIMARY KEY,
      contractor_user_id   INT NOT NULL,
      document_type        TEXT NOT NULL,
      alert_type           TEXT NOT NULL,
      expiration_date      DATE,
      sent_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      recipient_role       TEXT NOT NULL DEFAULT 'contractor',
      recipient_email      TEXT,
      UNIQUE (contractor_user_id, document_type, alert_type, expiration_date)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_compliance_events (
      id                   BIGSERIAL PRIMARY KEY,
      contractor_user_id   INT NOT NULL,
      document_type        TEXT,
      action               TEXT NOT NULL,
      actor_user_id        INT,
      metadata             JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homeowner_acknowledgments (
      id                   BIGSERIAL PRIMARY KEY,
      user_id              INT NOT NULL,
      job_id               BIGINT,
      acknowledgment_type  TEXT NOT NULL,
      acknowledged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata             JSONB
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_ack_job_type
    ON homeowner_acknowledgments (user_id, job_id, acknowledgment_type)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS homeowner_acceptances (
      id                   BIGSERIAL PRIMARY KEY,
      user_id              INT NOT NULL,
      guest_session_id     TEXT,
      job_id               BIGINT,
      quote_id             BIGINT,
      change_order_id      BIGINT,
      payment_id           INT,
      acceptance_type      TEXT NOT NULL,
      document_key         TEXT,
      document_version     TEXT NOT NULL,
      document_title       TEXT,
      accepted             BOOLEAN NOT NULL DEFAULT TRUE,
      accepted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata             JSONB,
      snapshot_id          BIGINT,
      snapshot_data        JSONB,
      action_completed     BOOLEAN NOT NULL DEFAULT TRUE,
      idempotency_key      TEXT UNIQUE,
      ip_address           TEXT,
      user_agent           TEXT,
      source_route         TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_acceptances_user_type
    ON homeowner_acceptances (user_id, acceptance_type, document_version, accepted_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_homeowner_acceptances_job
    ON homeowner_acceptances (job_id, acceptance_type)
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_version TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_out_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS diy_safety_accepted_version TEXT`);

  // Channel-specific marketing consent (email vs SMS are independent)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_sms_opt_in BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_sms_opt_in_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_out_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_sms_opt_out_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_preferences_collected_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_method TEXT DEFAULT 'email'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_google_sub TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_avatar_url TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_google_sub ON users (oauth_google_sub) WHERE oauth_google_sub IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_consent_events (
      id               BIGSERIAL PRIMARY KEY,
      user_id          INT NOT NULL,
      channel          TEXT,
      action           TEXT,
      consented        BOOLEAN NOT NULL,
      channels         JSONB,
      consent_version  TEXT,
      source           TEXT,
      admin_user_id    INT,
      ip_address       TEXT,
      user_agent       TEXT,
      source_route     TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE marketing_consent_events ADD COLUMN IF NOT EXISTS channel TEXT`);
  await pool.query(`ALTER TABLE marketing_consent_events ADD COLUMN IF NOT EXISTS action TEXT`);
  await pool.query(`ALTER TABLE marketing_consent_events ADD COLUMN IF NOT EXISTS source TEXT`);
  await pool.query(`ALTER TABLE marketing_consent_events ADD COLUMN IF NOT EXISTS admin_user_id INT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_unsubscribe_tokens (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INT NOT NULL,
      channel     TEXT NOT NULL DEFAULT 'email',
      token_hash  TEXT NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marketing_unsub_token_hash ON marketing_unsubscribe_tokens (token_hash)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_marketing_email ON users (marketing_email_opt_in) WHERE role='homeowner'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_marketing_sms ON users (marketing_sms_opt_in) WHERE role='homeowner'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diy_safety_events (
      id                   BIGSERIAL PRIMARY KEY,
      user_id              INT NOT NULL,
      job_id               BIGINT,
      event_type           TEXT NOT NULL,
      risk_level           TEXT,
      previous_risk_level  TEXT,
      risk_reason_codes    JSONB,
      feedback_rating      TEXT,
      incident_type        TEXT,
      description          TEXT,
      metadata             JSONB,
      ip_address           TEXT,
      user_agent           TEXT,
      source_route         TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_diy_safety_events_user_created
    ON diy_safety_events (user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_diy_safety_events_job
    ON diy_safety_events (job_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_diy_safety_events_type
    ON diy_safety_events (event_type, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_authorization_snapshots (
      id                      BIGSERIAL PRIMARY KEY,
      user_id                 INT NOT NULL,
      job_id                  BIGINT,
      payment_id              INT,
      authorized_amount_cents INT NOT NULL,
      currency                TEXT DEFAULT 'usd',
      policy_document_version TEXT,
      acceptance_id           BIGINT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS professional_dispatch_snapshots (
      id                      BIGSERIAL PRIMARY KEY,
      job_id                  BIGINT NOT NULL,
      user_id                 INT NOT NULL,
      payment_id              INT,
      pricing_version         TEXT NOT NULL,
      lines                   JSONB NOT NULL,
      authorized_now_cents    INT NOT NULL,
      currency                TEXT DEFAULT 'usd',
      coupon_code             TEXT,
      coupon_discount_cents   INT DEFAULT 0,
      snapshot_data           JSONB,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_rules_versions (
      id               BIGSERIAL PRIMARY KEY,
      pricing_version  INT NOT NULL,
      rules            JSONB NOT NULL,
      effective_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by       INT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS quote_number TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_quote_number ON proposals (quote_number) WHERE quote_number IS NOT NULL`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none'`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS shipping_label TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS additional_charges JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'none'`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS tax_value NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS customer_notes TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS terms_conditions TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS internal_notes TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS contractor_quote_amount NUMERIC`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS contractor_notes TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS contractor_special_conditions TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS document_totals JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS converted_invoice_id INT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS company_name TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS bill_to JSONB`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_activity (
      id               BIGSERIAL PRIMARY KEY,
      proposal_id      INT,
      invoice_id       INT,
      job_id           BIGINT,
      actor_user_id    INT,
      action           TEXT NOT NULL,
      detail           JSONB,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quote_activity_proposal
    ON quote_activity (proposal_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_quote_activity_invoice
    ON quote_activity (invoice_id, created_at DESC)
  `);

  await pool.query(`ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'remote_quote'`);
  await pool.query(`ALTER TABLE job_invitations ADD COLUMN IF NOT EXISTS site_visit_window TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS estimate_confidence TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS access_instructions TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS quote_request_mode TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS similar_jobs_count INT DEFAULT 0`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS market_snapshot_id BIGINT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS service_subcategory TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id                          BIGSERIAL PRIMARY KEY,
      job_id                      BIGINT,
      property_zip                TEXT,
      city                        TEXT,
      state                       TEXT,
      service_category            TEXT,
      service_subcategory         TEXT,
      market_profile              JSONB NOT NULL,
      ai_estimate_low             NUMERIC,
      ai_estimate_high            NUMERIC,
      ai_recommended_value        NUMERIC,
      ai_confidence               TEXT,
      customer_estimate_low       NUMERIC,
      customer_estimate_high      NUMERIC,
      customer_recommended_value  NUMERIC,
      pricing_rule_id             TEXT DEFAULT 'default',
      pricing_rule_version        TEXT,
      generated_at                TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_snapshots_zip_trade
    ON market_snapshots (property_zip, service_category, generated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_snapshots_job
    ON market_snapshots (job_id, generated_at DESC)
  `);

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
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS proposal_id INT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none'`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS shipping_label TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS additional_charges JSONB`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS tax_mode TEXT DEFAULT 'none'`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS tax_value NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS total NUMERIC`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS customer_notes TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS terms_conditions TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS bill_to JSONB`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS paid_by INT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent TEXT`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE homeowner_invoices ADD COLUMN IF NOT EXISTS document_snapshot JSONB`);

  // ── Refer & Earn (peer referrals — separate from promo coupons / B2B partners) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_settings (
      id         TEXT PRIMARY KEY DEFAULT 'default',
      config     JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by INT
    )
  `);
  const existingReferralSettings = await pool.query(`SELECT id FROM referral_settings WHERE id='default'`);
  if (!existingReferralSettings.rows.length) {
    await pool.query(
      `INSERT INTO referral_settings (id, config) VALUES ('default', $1::jsonb)`,
      [
        JSON.stringify({
          homeowner_homeowner: {
            referrerRewardCents: 10000,
            referredRewardCents: 10000,
            rewardType: 'credit',
            qualifyOn: 'first_paid_service',
          },
          contractor_customer: {
            contractorRewardCents: 10000,
            rewardType: 'payout_bonus',
            qualifyOn: 'first_paid_service',
          },
          contractor_contractor: {
            contractorRewardCents: 7500,
            rewardType: 'payout_bonus',
            qualifyOn: 'approved_and_first_completed_job',
          },
          combineWithCoupons: false,
          maxCreditPerInvoiceCents: 10000,
          combineMultipleCredits: true,
        }),
      ]
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_relationships (
      id                   BIGSERIAL PRIMARY KEY,
      public_id            TEXT UNIQUE,
      type                 TEXT NOT NULL,
      referrer_user_id     INT NOT NULL,
      referred_user_id     INT,
      referral_code        TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'signed_up',
      referrer_reward_cents INT NOT NULL DEFAULT 0,
      referred_reward_cents INT NOT NULL DEFAULT 0,
      reward_type          TEXT NOT NULL DEFAULT 'credit',
      qualification_event  TEXT,
      related_job_id       BIGINT,
      qualified_at         TIMESTAMPTZ,
      reward_earned_at     TIMESTAMPTZ,
      reward_available_at  TIMESTAMPTZ,
      reward_used_at       TIMESTAMPTZ,
      invalid_reason       TEXT,
      hold_reason          TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (referred_user_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_referral_rel_referrer
    ON referral_relationships (referrer_user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_referral_rel_code
    ON referral_relationships (LOWER(referral_code))
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_referral_rel_status
    ON referral_relationships (status, type)
  `);
  try {
    await pool.query(`
      ALTER TABLE referral_relationships
      ADD CONSTRAINT chk_referral_no_self_referral
      CHECK (referred_user_id IS NULL OR referrer_user_id <> referred_user_id)
    `);
  } catch {
    /* constraint may already exist */
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_credits (
      id                BIGSERIAL PRIMARY KEY,
      user_id           INT NOT NULL,
      relationship_id   BIGINT,
      amount_cents      INT NOT NULL,
      kind              TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'available',
      related_job_id    BIGINT,
      note              TEXT,
      created_by        INT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_referral_credits_user
    ON referral_credits (user_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_payout_bonuses (
      id                  BIGSERIAL PRIMARY KEY,
      contractor_user_id  INT NOT NULL,
      relationship_id     BIGINT NOT NULL UNIQUE,
      amount_cents        INT NOT NULL,
      bonus_type          TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'available',
      note                TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      paid_at             TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_referral_payout_bonuses_contractor
    ON referral_payout_bonuses (contractor_user_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_notes (
      id                BIGSERIAL PRIMARY KEY,
      relationship_id   BIGINT NOT NULL,
      author_user_id    INT,
      author_label      TEXT NOT NULL DEFAULT 'System',
      body              TEXT NOT NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_code_meta (
      user_id      INT PRIMARY KEY,
      code         TEXT UNIQUE NOT NULL,
      disabled     BOOLEAN DEFAULT FALSE,
      regenerated_at TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── P0 hardening: payout uniqueness, holds, webhook status, quote snapshots ─
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS hold_reason TEXT`);
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS hold_related_payment_id INT`);
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS held_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS reversal_required BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS service_amount_cents INT DEFAULT 0`);
  await pool.query(`ALTER TABLE contractor_payouts ADD COLUMN IF NOT EXISTS tip_amount_cents INT DEFAULT 0`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_settlements (
      id               BIGSERIAL PRIMARY KEY,
      idempotency_key  TEXT NOT NULL UNIQUE,
      job_id           BIGINT,
      invoice_id       INT,
      payment_id       INT,
      status           TEXT NOT NULL DEFAULT 'completed',
      detail           JSONB,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS service_amount NUMERIC`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tip_amount NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key TEXT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency_key
    ON refunds (idempotency_key) WHERE idempotency_key IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_session_settled
    ON payments (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL AND status IN ('succeeded','paid')
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contractor_payouts_job_unique
    ON contractor_payouts (job_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_job_unique
    ON transfers (job_id)
    WHERE status IN ('paid','processing','pending')
  `).catch((e) => console.warn('[schema] transfers unique index:', e.message));

  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'received'`);
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0`);
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS last_error TEXT`);
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_acceptance_snapshots (
      id                BIGSERIAL PRIMARY KEY,
      proposal_id       BIGINT NOT NULL,
      quote_number      TEXT,
      version_number    INT NOT NULL DEFAULT 1,
      homeowner_user_id INT,
      property_id       INT,
      job_id            BIGINT,
      contractor_user_id INT,
      line_items        JSONB,
      subtotal          NUMERIC,
      discount_amount   NUMERIC,
      shipping_amount   NUMERIC,
      additional_charges NUMERIC,
      tax_amount        NUMERIC,
      total             NUMERIC,
      contractor_amount NUMERIC,
      terms             TEXT,
      warranty          TEXT,
      customer_notes    TEXT,
      document_snapshot JSONB NOT NULL,
      accepted_at       TIMESTAMPTZ DEFAULT NOW(),
      accepted_by       INT,
      UNIQUE (proposal_id, version_number)
    )
  `);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS version_number INT DEFAULT 1`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS previous_version_id BIGINT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS change_reason TEXT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_snapshot_id BIGINT`);
  await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ`);

  // Payment fee capture + financial ledger
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id TEXT`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_processing_fee_cents INT`);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_net_received_cents INT`);
  await pool.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_amount_cents INT`);
  await pool.query(`ALTER TABLE refunds ADD COLUMN IF NOT EXISTS stripe_fee_refund_cents INT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_ledger_events (
      id               BIGSERIAL PRIMARY KEY,
      event_type       TEXT NOT NULL,
      job_id           BIGINT,
      payment_id       INT,
      payout_id        INT,
      contractor_id    INT,
      amount_cents     INT,
      currency         TEXT DEFAULT 'usd',
      stripe_object_id TEXT,
      created_by       INT,
      metadata         JSONB,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_ledger_job ON financial_ledger_events (job_id, created_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_reconciliations (
      id                      SERIAL PRIMARY KEY,
      job_id                  BIGINT NOT NULL,
      payment_id              INT,
      refund_id               INT,
      contractor_payout_id    INT,
      refund_amount_cents     INT NOT NULL,
      platform_exposure_cents INT DEFAULT 0,
      status                  TEXT NOT NULL DEFAULT 'requires_reconciliation',
      notes                   TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Legacy admin_role_preset NULL + read-write must NOT escalate to super_admin
  await pool.query(`
    UPDATE users
    SET admin_role_preset='operations_admin'
    WHERE role='admin'
      AND (admin_role_preset IS NULL OR TRIM(admin_role_preset)='')
      AND COALESCE(admin_access_level,'read-write') IN ('read-write','write','')
  `);
  await pool.query(`
    UPDATE users
    SET admin_role_preset='read_only'
    WHERE role='admin'
      AND (admin_role_preset IS NULL OR TRIM(admin_role_preset)='')
      AND admin_access_level='read'
  `);

  // ── HomeCare Pro feature tables ───────────────────────────────────────────
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS priority_tier TEXT DEFAULT 'standard'`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS quote_second_opinion JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_services (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id INT NOT NULL,
      property_id INT NOT NULL,
      service_type TEXT NOT NULL,
      recurrence TEXT NOT NULL,
      preferred_day TEXT,
      preferred_time_window TEXT,
      start_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      next_service_date DATE,
      assigned_contractor_user_id INT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recurring_services_owner ON recurring_services (owner_user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_recurring_services_property ON recurring_services (property_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS household_invitations (
      id BIGSERIAL PRIMARY KEY,
      property_id INT NOT NULL,
      owner_user_id INT NOT NULL,
      invite_email TEXT NOT NULL,
      permission_level TEXT NOT NULL DEFAULT 'viewer',
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS household_invite_property_email_idx
    ON household_invitations (property_id, invite_email)
    WHERE status = 'pending'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS household_memberships (
      id BIGSERIAL PRIMARY KEY,
      property_id INT NOT NULL,
      user_id INT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      invited_by_user_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(property_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS home_health_reports (
      id BIGSERIAL PRIMARY KEY,
      property_id INT NOT NULL,
      owner_user_id INT NOT NULL,
      report_year INT,
      content JSONB NOT NULL,
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_home_health_reports_property ON home_health_reports (property_id, generated_at DESC)`);

  // ── Versioned legal documents + job evidence linkage ───────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_document_versions (
      id               BIGSERIAL PRIMARY KEY,
      document_key     TEXT NOT NULL,
      title            TEXT NOT NULL,
      version          TEXT NOT NULL,
      effective_date   DATE NOT NULL,
      status           TEXT NOT NULL DEFAULT 'current',
      route            TEXT,
      audience         TEXT DEFAULT 'public',
      content          JSONB NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by       INT,
      UNIQUE (document_key, version)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_legal_doc_versions_key_status
    ON legal_document_versions (document_key, status, effective_date DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_dispatch_evidence (
      id                                BIGSERIAL PRIMARY KEY,
      job_id                            BIGINT NOT NULL,
      homeowner_user_id                 INT,
      contractor_user_id                INT,
      professional_dispatch_snapshot_id BIGINT,
      authorized_now_cents              INT,
      currency                          TEXT DEFAULT 'usd',
      compliance_document_ids           JSONB DEFAULT '[]',
      compliance_status                 TEXT,
      dispatch_at                       TIMESTAMPTZ,
      created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_job_dispatch_evidence_job
    ON job_dispatch_evidence (job_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractor_agreement_acceptances (
      id               BIGSERIAL PRIMARY KEY,
      contractor_user_id INT NOT NULL,
      document_key     TEXT NOT NULL,
      document_version TEXT NOT NULL,
      document_title   TEXT,
      accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address       TEXT,
      user_agent       TEXT,
      source_route     TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contractor_agreement_acceptances_user
    ON contractor_agreement_acceptances (contractor_user_id, document_key, accepted_at DESC)
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_level TEXT DEFAULT 'level_1'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS solo_owner_status TEXT`);
  await pool.query(`ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS pricing_mode TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS solo_owner_acknowledgments (
      id                  BIGSERIAL PRIMARY KEY,
      contractor_user_id  INT NOT NULL,
      form_version        TEXT NOT NULL,
      provider_legal_name TEXT,
      owner_name          TEXT,
      fein_tax_id         TEXT,
      trades              TEXT,
      service_area        TEXT,
      gl_carrier          TEXT,
      gl_policy           TEXT,
      gl_expiration       DATE,
      acknowledgments     JSONB NOT NULL,
      status              TEXT NOT NULL DEFAULT 'under_review',
      accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by         INT,
      reviewed_at         TIMESTAMPTZ,
      rejection_reason    TEXT,
      ip_address          TEXT,
      user_agent          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_solo_owner_ack_contractor
    ON solo_owner_acknowledgments (contractor_user_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_authorizations (
      id                              BIGSERIAL PRIMARY KEY,
      job_id                          BIGINT NOT NULL,
      provider_id                     INT NOT NULL,
      provider_level                  TEXT,
      pricing_mode                    TEXT NOT NULL,
      trade                           TEXT,
      location                        TEXT,
      job_level                       TEXT,
      scope                           TEXT,
      nte_cents                       INT,
      provider_compensation_low_cents INT,
      provider_compensation_high_cents INT,
      customer_amount_low_cents       INT,
      customer_amount_high_cents      INT,
      contractor_agreement_version    TEXT,
      managed_addendum_version        TEXT,
      compliance_snapshot             JSONB,
      accepted_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address                      TEXT,
      user_agent                      TEXT,
      created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_job_authorizations_job
    ON job_authorizations (job_id, accepted_at DESC)
  `);

  try {
    const { seedLegalDocumentVersions } = await import('./legal-document-store.js');
    await seedLegalDocumentVersions(pool);
  } catch (e) {
    console.warn('[schema] legal document seed:', e.message);
  }

  console.log('[API] Managed schema ready');
}
