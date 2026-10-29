-- ── FIXBRIDGE DATABASE SCHEMA ──
-- This file contains the complete SQL DDL schema for the FixBridge application.
-- All tables are fully interlinked with Primary Keys and Foreign Keys.

-- 1. Users Table
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
  compliance_status       TEXT DEFAULT 'draft',
  photo_data_url          TEXT,
  phone                   TEXT,
  address                 TEXT,
  contact_email           TEXT,
  company_name            TEXT,
  company_details         TEXT,
  insurance_expires_at    DATE,
  license_expires_at      DATE,
  w9_document_name        TEXT,
  w9_document_data        TEXT,
  service_zips            JSONB,
  travel_radius_miles     INT,
  stripe_account_id       TEXT,
  stripe_onboarding_status TEXT,
  stripe_payouts_enabled   BOOLEAN DEFAULT FALSE,
  master_agreement_accepted_at TIMESTAMPTZ,
  min_trip_charge         NUMERIC,
  mfa_enabled             BOOLEAN DEFAULT FALSE,
  plan_code               TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, email)
);

-- 2. Properties Table
CREATE TABLE IF NOT EXISTS properties (
  id              SERIAL PRIMARY KEY,
  owner_user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
);

-- 3. Pricing Rules Table
CREATE TABLE IF NOT EXISTS pricing_rules (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  rules      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INT
);

-- 4. Managed Jobs Table
CREATE TABLE IF NOT EXISTS managed_jobs (
  id                              BIGSERIAL PRIMARY KEY,
  booking_id                      TEXT UNIQUE,
  homeowner_user_id               INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id                     INT REFERENCES properties(id) ON DELETE SET NULL,
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
  assigned_contractor_user_id     INT REFERENCES users(id) ON DELETE SET NULL,
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
  discount_code                   TEXT,
  discount_type                   TEXT,
  discount_value                  NUMERIC,
  discount_label                  TEXT,
  discount_amount_low             NUMERIC,
  discount_amount_high            NUMERIC,
  coverage_state                  TEXT DEFAULT 'unknown',
  invite_deadline_at              TIMESTAMPTZ,
  nte_limit                       NUMERIC,
  sla_hours                       INT,
  budget_view                     TEXT,
  media_storage_key               TEXT,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Job Invitations Table
CREATE TABLE IF NOT EXISTS job_invitations (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  contractor_user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'invited',
  expected_net_low     NUMERIC,
  expected_net_high    NUMERIC,
  message              TEXT,
  invited_by           INT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  responded_at         TIMESTAMPTZ,
  UNIQUE(job_id, contractor_user_id)
);

-- 6. Bids Table
CREATE TABLE IF NOT EXISTS bids (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  contractor_user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
);

-- 7. Proposals Table
CREATE TABLE IF NOT EXISTS proposals (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  bid_id               INT REFERENCES bids(id) ON DELETE SET NULL,
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
);

-- 8. Change Orders Table
CREATE TABLE IF NOT EXISTS change_orders (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  contractor_user_id   INT REFERENCES users(id) ON DELETE CASCADE,
  description          TEXT NOT NULL,
  media_data_url       TEXT,
  contractor_net       NUMERIC NOT NULL,
  retail_amount        NUMERIC,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  approved_at          TIMESTAMPTZ
);

-- 9. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT REFERENCES managed_jobs(id) ON DELETE SET NULL,
  user_id              INT REFERENCES users(id) ON DELETE CASCADE,
  payment_type         TEXT NOT NULL,
  amount               NUMERIC NOT NULL,
  currency             TEXT DEFAULT 'usd',
  status               TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id    TEXT,
  stripe_payment_intent TEXT,
  simulated            BOOLEAN DEFAULT FALSE,
  meta                 JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Transfers Table
CREATE TABLE IF NOT EXISTS transfers (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  contractor_user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount               NUMERIC NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  stripe_transfer_id   TEXT,
  simulated            BOOLEAN DEFAULT FALSE,
  hold_reason          TEXT,
  created_by           INT,
  reversed_at          TIMESTAMPTZ,
  parent_transfer_id   INT,
  reserve_amount       NUMERIC DEFAULT 0,
  reserve_release_at   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Partners Table
CREATE TABLE IF NOT EXISTS partners (
  id                   SERIAL PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,
  name                 TEXT NOT NULL,
  company              TEXT,
  email                TEXT,
  phone                TEXT,
  active               BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Partner Referrals Table
CREATE TABLE IF NOT EXISTS partner_referrals (
  id                   SERIAL PRIMARY KEY,
  partner_id           INT REFERENCES partners(id) ON DELETE CASCADE,
  partner_code         TEXT,
  job_id               BIGINT REFERENCES managed_jobs(id) ON DELETE CASCADE,
  homeowner_user_id    INT REFERENCES users(id) ON DELETE CASCADE,
  status               TEXT DEFAULT 'referral_received',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id                   SERIAL PRIMARY KEY,
  actor_user_id        INT,
  action               TEXT NOT NULL,
  entity_type          TEXT,
  entity_id            TEXT,
  detail               JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Job Status History Table
CREATE TABLE IF NOT EXISTS job_status_history (
  id                   SERIAL PRIMARY KEY,
  job_id               BIGINT NOT NULL REFERENCES managed_jobs(id) ON DELETE CASCADE,
  from_status          TEXT,
  to_status            TEXT NOT NULL,
  actor_user_id        INT REFERENCES users(id) ON DELETE SET NULL,
  note                 TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     SERIAL PRIMARY KEY,
  user_id                INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code              TEXT NOT NULL,
  plan_family            TEXT NOT NULL,
  status                 TEXT DEFAULT 'active',
  stripe_subscription_id TEXT,
  current_period_end     TIMESTAMPTZ,
  simulated              BOOLEAN DEFAULT FALSE,
  meta                   JSONB,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);
