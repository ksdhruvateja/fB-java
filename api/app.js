import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { newDb } from 'pg-mem';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { analyzeRepairStructured, chatWithCustomer, getAiStatus } from './ai.js';
import { initManagedSchema } from './schema-managed.js';
import { initSupportTicketSchema, registerSupportTicketRoutes } from './support-tickets.js';
import { initInAppNotificationSchema, registerInAppNotificationRoutes } from './in-app-notifications.js';
import { initMessagingSchema, registerMessagingRoutes } from './messaging.js';
import { registerAttachmentAdminRoutes } from './attachment-storage.js';
import { initDisputeSchema } from './disputes.js';
import { initAvailabilitySchema, registerAvailabilityRoutes } from './availability-routes.js';
import { registerAdminSearchRoutes } from './admin-search.js';
import { initHomeownerAdminSchema, registerHomeownerAdminRoutes } from './homeowner-admin-routes.js';
import { registerFinanceRoutes } from './finance-routes.js';
import {
  initSubscriptionPlansSchema,
  registerSubscriptionPlanRoutes,
  getSubscriptionPlanByCode,
} from './subscription-plans.js';
import { registerManagedRoutes, processManagedJobAssessmentTask } from './managed-routes.js';
import { registerAssessmentProcessor } from './assessment-worker.js';
import { registerHomeCareProRoutes } from './homecare-pro-routes.js';
import { registerHomeCareAdminRoutes, initHomeCareSettingsSchema } from './homecare-admin-routes.js';
import { registerHomeAssistantRoutes, initPropertyMemorySchema } from './home-assistant-routes.js';
import { initServiceReminderSchema, getReminderSchedulerStatus } from './service-reminders.js';
import { registerPlatformRoutes } from './platform-routes.js';
import { registerPayoutRoutes } from './payout-routes.js';
import { registerReferralRoutes } from './referral-routes.js';
import { applyReferralCode, ensureReferralCode } from './referrals.js';
import { registerQuoteWorkspaceRoutes } from './quote-workspace-routes.js';
import { registerContractorEmployeeRoutes } from './contractor-employees-routes.js';
import { registerAddressRoutes } from './address-routes.js';
import { registerServiceAreaRoutes } from './service-area.js';
import { ensureComplianceDocuments, recalculateDispatchEligible } from './contractor-compliance.js';
import {
  checkActionConsentsFromBody,
  validateAndRecordActionConsents,
  requireDiySafetyAcknowledgment,
} from './homeowner-consent.js';
import { recordSignupMarketingConsents } from './marketing-consent-service.js';
import { registerMarketingRoutes, initMarketingConsent } from './marketing-routes.js';
import { registerGoogleAuthRoutes } from './google-auth-routes.js';
import { writeAudit } from './audit.js';
import { getStripe, stripeConfigured } from './stripe.js';
import {
  RESET_ROLES,
  findResetAccount,
  issuePasswordReset,
  completePasswordReset,
} from './password-reset.js';
import { mailStatus } from './mail.js';
import { uspsConfigured } from './usps-address.js';
import { EMAIL_FROM_ADDRESS, EMAIL_REPLY_TO } from './email/email-config.js';
import {
  loadJobForReview,
  insertJobReview,
  parseCategoryRatings,
  serializeSiteReview,
  deriveVerifiedFixBridgeJob,
} from './job-reviews.js';
import {
  syncUserHomeCareEntitlement,
  activateSubscriptionFromCheckout,
  toPublicHomeCareSubscriptionDto,
} from './subscription-state.js';
import {
  corsOriginDelegate,
  securityHeaders,
  publicErrorMessage,
  clampString,
  isPositiveInt,
} from './security.js';
import { postgresSslOptions } from './db-ssl.js';
import {
  requirePermission,
  resolveAdminPreset,
  canAssignPreset,
  presetToAccessLevel,
  VALID_ROLE_PRESETS,
  permissionsForUser,
  userHasPermission,
} from './rbac.js';

const isProduction = process.env.NODE_ENV === 'production';

/** Netlify may run with NODE_ENV unset; use hosting signals for health/status only. */
function isDeployedProduction() {
  return (
    isProduction ||
    process.env.CONTEXT === 'production' ||
    process.env.FIXBRIDGE_HOSTING === 'netlify'
  );
}
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

if (isProduction && useInMemoryDb) {
  throw new Error(
    '[FATAL] NEON_DATABASE_URL is required in production. In-memory database is not allowed.'
  );
}

if (isProduction && !stripeConfigured()) {
  throw new Error(
    '[FATAL] STRIPE_SECRET_KEY is required in production. Refusing to start without payment secrets.'
  );
}
if (isProduction && !String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()) {
  throw new Error(
    '[FATAL] STRIPE_WEBHOOK_SECRET is required in production. Refusing to start without webhook secrets.'
  );
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
      ssl: postgresSslOptions(),
      max: process.env.NETLIFY || process.env.NETLIFY_DEV ? 3 : 10,
    });
  }

  const db = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool: MemoryPool } = db.adapters.createPg();
  console.warn('[FixBridge API] NEON_DATABASE_URL not set; using in-memory local database.');
  return new MemoryPool();
}

/** Demo accounts only outside production, and only when explicitly enabled. */
function allowDemoSeed() {
  if (isProduction) return false;
  // ENABLE_DEMO_USERS or ENABLE_DEMO_SEED; default OFF (explicit opt-in).
  const flag = String(
    process.env.ENABLE_DEMO_USERS ?? process.env.ENABLE_DEMO_SEED ?? 'false'
  ).toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
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
  'HVAC & Heating/Cooling': ['hvac', 'heating', 'cooling', 'air conditioning', 'ventilation'],
  Painting: ['painting', 'painter', 'paint'],
  Roofing: ['roofing', 'roofer', 'roof', 'gutter'],
  'Roofing & Gutters': ['roofing', 'roofer', 'roof', 'gutter'],
  Flooring: ['flooring', 'floor', 'tile', 'hardwood', 'laminate'],
  Carpentry: ['carpentry', 'carpenter', 'framing', 'woodwork'],
  Appliances: ['appliance', 'appliances'],
  'Concrete & Driveways': ['concrete', 'asphalt', 'driveway'],
  'Doors & Hardware': ['door', 'hardware'],
  'Fences & Gates': ['fence', 'gate'],
  'Garage & Garage Doors': ['garage', 'door'],
  Handyman: ['handyman', 'general', 'maintenance'],
  'Landscaping & Yard': ['landscape', 'landscaping', 'lawn', 'yard', 'mulch', 'hedge', 'garden', 'leaf', 'mowing', 'trimming'],
  Landscaping: ['landscape', 'landscaping', 'lawn', 'yard', 'mulch', 'hedge', 'garden', 'leaf', 'mowing', 'trimming'],
  'Snow Removal': ['snow', 'snow removal', 'plow', 'plowing', 'shovel', 'de-ice', 'deice', 'salting', 'ice management'],
  Snow: ['snow', 'snow removal', 'plow', 'plowing', 'shovel', 'de-ice', 'salting'],
  Lighting: ['lighting', 'light', 'electrical'],
  'Locks & Security': ['lock', 'security'],
  'Pest Control': ['pest', 'exterminat'],
  Siding: ['siding'],
  'Windows & Glass': ['window', 'glass'],
  Bathroom: ['bathroom', 'plumbing', 'bath'],
  Kitchen: ['kitchen', 'appliance', 'plumbing'],
  'Water Damage': ['water damage', 'flood', 'restoration', 'mold'],
  'Drywall & Wall Repair': ['drywall', 'wall', 'plaster'],
  Cleaning: ['cleaning', 'clean', 'janitorial', 'maid', 'housekeeping', 'deep clean', 'move-out', 'move-in'],
  Janitorial: ['cleaning', 'clean', 'janitorial', 'maid', 'housekeeping'],
  'Smart Home & Technology': ['smart home', 'technology', 'tech', 'low voltage'],
  Other: ['contractor', 'handyman', 'general'],
  Others: ['contractor', 'handyman', 'general'],
};

function contractorTradeMatchesCategory(contractorTrade, category) {
  if (category === 'Others' || category === 'Other') return true;
  if (!contractorTrade) return false;
  const terms = TRADE_MATCH_TERMS[category];
  const normalizedTrade = String(contractorTrade).toLowerCase();
  if (terms?.some((term) => normalizedTrade.includes(term))) return true;
  // Fallback: match any significant word from the category label
  const words = String(category || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !['with', 'and', 'from', 'type'].includes(w));
  return words.some((w) => normalizedTrade.includes(w));
}

const PRIMARY_ADMIN_EMAIL = process.env.PRIMARY_ADMIN_EMAIL?.trim() || 'admin@fixbridge.com';
const LEGACY_ADMIN_EMAILS = ['admin@fixbridge.local', 'admin@fixbridge.us', 'ksdt2702@gmail.com'];

const DEMO_USERS = [
  { role: 'homeowner',   name: 'Maria Santos', email: 'maria@example.com',       plainPassword: 'demo123',  is_admin: false, trade: null,             license_number: null },
  { role: 'contractor',  name: 'James Park',   email: 'james@yourcompany.com',   plainPassword: 'demo123',  is_admin: false, trade: 'Master Plumber', license_number: 'NY-00231847' },
  { role: 'admin',       name: 'Ops Admin',    email: PRIMARY_ADMIN_EMAIL,       plainPassword: 'admin123', is_admin: true,  trade: null,             license_number: null },
];

/** Move legacy demo admin email to PRIMARY_ADMIN_EMAIL and ensure super_admin access. */
async function migratePrimaryAdminEmail() {
  for (const legacy of LEGACY_ADMIN_EMAILS) {
    if (legacy.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) continue;
    const { rows: legacyRows } = await pool.query(
      `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
      [legacy]
    );
    const { rows: targetRows } = await pool.query(
      `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
      [PRIMARY_ADMIN_EMAIL]
    );
    if (legacyRows[0] && !targetRows[0]) {
      await pool.query(
        `UPDATE users SET email=$1, is_admin=true, admin_access_level='read-write', admin_role_preset='super_admin'
         WHERE id=$2`,
        [PRIMARY_ADMIN_EMAIL, legacyRows[0].id]
      );
      console.log(`[FixBridge API] Migrated admin ${legacy} → ${PRIMARY_ADMIN_EMAIL}`);
    } else if (legacyRows[0] && targetRows[0]) {
      await pool.query(`DELETE FROM users WHERE id=$1`, [legacyRows[0].id]);
      console.log(`[FixBridge API] Removed duplicate legacy admin ${legacy}`);
    }
  }
  const { rows: primary } = await pool.query(
    `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
    [PRIMARY_ADMIN_EMAIL]
  );
  if (primary[0]) {
    await pool.query(
      `UPDATE users SET is_admin=true, admin_access_level='read-write', admin_role_preset='super_admin'
       WHERE id=$1`,
      [primary[0].id]
    );
  }
}

// ── Schema init ───────────────────────────────────────────────────────────────

async function ensureDemoUsers() {
  // Seed / repair demo users — NEVER in production; non-prod requires ENABLE_DEMO_SEED (default true).
  if (!allowDemoSeed()) {
    if (isProduction) {
      console.log('[FixBridge API] Demo seed disabled (production).');
    } else {
      console.log('[FixBridge API] Demo seed disabled (ENABLE_DEMO_SEED=false).');
    }
    return;
  }

  for (const u of DEMO_USERS) {
    const hashed = await bcrypt.hash(u.plainPassword, 10);
    const existing = await pool.query(
      'SELECT id, password, is_admin FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)',
      [u.role, u.email]
    );
    const DEMO_DOC =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    if (existing.rows.length === 0) {
      if (u.role === 'contractor') {
        await pool.query(
          `INSERT INTO users (
             role,name,email,password,trade,license_number,is_admin,compliance_status,
             license_document_name,license_document_data,insurance_document_name,insurance_document_data,
             company_name,phone
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
          [
            u.role,
            u.name,
            u.email,
            hashed,
            u.trade,
            u.license_number,
            u.is_admin,
            'approved',
            'demo-license.png',
            DEMO_DOC,
            'demo-insurance.png',
            DEMO_DOC,
            'ABC Heating & Air',
            '(555) 204-8800',
          ]
        );
      } else if (u.role === 'admin') {
        await pool.query(
          `INSERT INTO users (role,name,email,password,trade,license_number,is_admin,compliance_status,admin_access_level,admin_role_preset)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
          [
            u.role,
            u.name,
            u.email,
            hashed,
            u.trade,
            u.license_number,
            u.is_admin,
            'draft',
            'read-write',
            'super_admin',
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO users (role,name,email,password,trade,license_number,is_admin,compliance_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [
            u.role,
            u.name,
            u.email,
            hashed,
            u.trade,
            u.license_number,
            u.is_admin,
            'draft',
          ]
        );
      }
      console.log(`[FixBridge API] Seeded demo ${u.role}: ${u.email}`);
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
    if (!passwordOk && pw !== 'GOOGLE_OAUTH' && pw !== 'APPLE_OAUTH' && pw !== 'AUTH0_OAUTH') {
      await pool.query(
        'UPDATE users SET password=$1, name=$2, trade=$3, license_number=$4 WHERE role=$5 AND LOWER(email)=LOWER($6)',
        [hashed, u.name, u.trade, u.license_number, u.role, u.email]
      );
      console.log(`[FixBridge API] Reset demo password for ${u.email}`);
    }

    if (u.is_admin && row.is_admin !== true) {
      await pool.query(
        `UPDATE users SET is_admin=true, admin_access_level='read-write', admin_role_preset='super_admin'
         WHERE role=$1 AND LOWER(email)=LOWER($2)`,
        [u.role, u.email]
      );
    }
    // Ensure contractor demo is never treated as admin
    if (u.role === 'contractor' && u.is_admin === false && row.is_admin === true) {
      await pool.query(
        'UPDATE users SET is_admin=false WHERE role=$1 AND LOWER(email)=LOWER($2)',
        [u.role, u.email]
      );
    }
    // Demo contractor must be invite-ready (include placeholder docs so compliance gates pass)
    if (u.role === 'contractor') {
      await pool.query(
        `UPDATE users SET compliance_status='approved',
           trade=COALESCE(NULLIF(trade,''), $1),
           license_number=COALESCE(NULLIF(license_number,''), $2),
           license_document_name=COALESCE(license_document_name, 'demo-license.png'),
           license_document_data=COALESCE(license_document_data, $3),
           insurance_document_name=COALESCE(insurance_document_name, 'demo-insurance.png'),
           insurance_document_data=COALESCE(insurance_document_data, $3),
           company_name=COALESCE(NULLIF(company_name,''), 'ABC Heating & Air'),
           phone=COALESCE(NULLIF(phone,''), '(555) 204-8800')
         WHERE role=$4 AND LOWER(email)=LOWER($5)`,
        [u.trade, u.license_number, DEMO_DOC, u.role, u.email]
      );
    }
  }
}

export async function initDb() {
  if (initDb._done) return;
  try {
    const check = await pool.query("SELECT id FROM users LIMIT 1");
    if (check.rows.length > 0) {
      console.log('[FixBridge API] DB already initialized, running managed schema checks...');
      await initManagedSchema(pool);
      await initHomeCareSettingsSchema(pool);
      await initPropertyMemorySchema(pool);
      await initServiceReminderSchema(pool);
      await initSupportTicketSchema(pool);
      await initInAppNotificationSchema(pool);
      await initMessagingSchema(pool);
      await initDisputeSchema(pool);
      await initAvailabilitySchema(pool);
      await initHomeownerAdminSchema(pool);
      await initSubscriptionPlansSchema(pool);
      await initMarketingConsent(pool);
      await migratePrimaryAdminEmail();
      await ensureDemoUsers();
      initDb._done = true;
      return;
    }
  } catch (e) {
    // Proceed with migrations if users table doesn't exist
  }

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
      compliance_status       TEXT DEFAULT 'draft',
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
  await pool.query(`ALTER TABLE job_lifecycle ADD COLUMN IF NOT EXISTS invoice_file_data TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id           BIGSERIAL PRIMARY KEY,
      user_id      TEXT,
      user_role    TEXT,
      user_name    TEXT,
      user_email   TEXT,
      subject      TEXT NOT NULL,
      related_job  TEXT,
      message      TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
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

  await migratePrimaryAdminEmail();
  await ensureDemoUsers();

  // Migrate any remaining plaintext passwords for other users
  const { rows: allUsers } = await pool.query(
    `SELECT role, email, password FROM users WHERE password NOT LIKE '$2%' AND password NOT IN ('GOOGLE_OAUTH', 'APPLE_OAUTH', 'AUTH0_OAUTH')`
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

  await initManagedSchema(pool);
  await initHomeCareSettingsSchema(pool);
  await initPropertyMemorySchema(pool);
  await initServiceReminderSchema(pool);
  await initSupportTicketSchema(pool);
  await initInAppNotificationSchema(pool);
  await initMessagingSchema(pool);
  await initDisputeSchema(pool);
  await initAvailabilitySchema(pool);
  await initHomeownerAdminSchema(pool);
  await initSubscriptionPlansSchema(pool);
  await initMarketingConsent(pool);

  console.log('[FixBridge API] DB ready ✓');
  initDb._done = true;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

// ── JWT helpers ───────────────────────────────────────────────────────────────

function makeToken(user, { authStage = 'complete', expiresIn = '7d' } = {}) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      isAdmin: user.isAdmin === true,
      authStage,
    },
    JWT_SECRET,
    { expiresIn, algorithm: 'HS256' }
  );
}

/** Reject requests that don't carry a valid JWT. */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Authentication required.' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [decoded.id]);
    if (!rows.length) {
      return res.status(401).json({ ok: false, message: 'User not found.' });
    }
    if (rows[0].is_blocked === true) {
      return res.status(403).json({ ok: false, message: 'This account has been blocked. Please contact support.' });
    }

    let planCode = rows[0].plan_code;
    let homeCareSubscription = null;
    if (rows[0].role === 'homeowner') {
      const subState = await syncUserHomeCareEntitlement(pool, rows[0].id);
      planCode = subState.isPro ? subState.effectivePlanCode : null;
      homeCareSubscription = toPublicHomeCareSubscriptionDto(subState);
    }

    req.authUser = {
      ...decoded,
      id: Number(rows[0].id),
      email: rows[0].email,
      name: rows[0].name,
      role: rows[0].role,
      planCode: planCode || null,
      homeCareSubscription,
      // P0-10: is_admin boolean alone must never grant admin / cross-user access
      isAdmin: rows[0].role === 'admin',
      isBlocked: rows[0].is_blocked === true,
      adminAccessLevel: rows[0].admin_access_level || 'read-write',
      adminRolePreset: rows[0].admin_role_preset || null,
      authStage: decoded.authStage || 'complete',
    };
    next();
  } catch {
    return res.status(401).json({ ok: false, message: 'Invalid or expired token.' });
  }
}

/** Reject requests from non-admin accounts (dedicated admin role only). */
function requireAdmin(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Admin access required. Use the staff admin login.' });
  }
  // P0-8: MFA-pending tokens cannot access admin APIs
  if (req.authUser?.authStage === 'mfa_pending') {
    return res.status(403).json({
      ok: false,
      code: 'mfa_required',
      message: 'Multi-factor authentication required before accessing admin APIs.',
    });
  }
  next();
}

function requireAdminWrite(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Admin access required.' });
  }
  const level = String(req.authUser?.adminAccessLevel || 'read-write').toLowerCase();
  if (level === 'read') {
    return res.status(403).json({ ok: false, message: 'Write access required. Your account has Read-Only permissions.' });
  }
  next();
}

function requireAdminRead(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ ok: false, message: 'Admin access required.' });
  }
  const level = String(req.authUser?.adminAccessLevel || 'read-write').toLowerCase();
  if (level === 'write') {
    return res.status(403).json({ ok: false, message: 'Read access required. Your account is Write-Only.' });
  }
  next();
}

/** Legacy board jobs: can this user read/mutate this jobId? */
async function getLegacyJobAccess(jobId, authUser) {
  if (!authUser) return { allowed: false, job: null, mutate: false };
  if (authUser.role === 'admin') {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
    return { allowed: true, job: rows[0] || null, mutate: true };
  }
  const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
  const job = rows[0] || null;
  if (!job) return { allowed: false, job: null, mutate: false };

  const email = String(authUser.email || '').toLowerCase();
  if (authUser.role === 'homeowner' && String(job.homeowner_email || '').toLowerCase() === email) {
    return { allowed: true, job, mutate: true };
  }
  if (authUser.role === 'contractor') {
    const { rows: lc } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    const assigned =
      lc[0] &&
      String(lc[0].contractor_email || '').toLowerCase() === email &&
      ['accepted', 'on-the-way', 'arrived', 'work-started', 'completed'].includes(lc[0].status);
    // Contractors may read board jobs (masked); mutate only if assigned
    return { allowed: true, job, mutate: Boolean(assigned), lifecycle: lc[0] || null };
  }
  return { allowed: false, job, mutate: false };
}

function rowToJobBoard(r) {
  const job = rowToJob(r);
  // Hide customer PII on open board until contractor is assigned
  return {
    ...job,
    fullAddress: null,
    contactName: null,
    contactPhone: null,
  };
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

function rowToUser(r, { includeDocumentData = true, homeCareSubscription = null } = {}) {
  return {
    id: r.id != null ? Number(r.id) : undefined,
    role: r.role, name: r.name, email: r.email,
    // Never send the password hash to the client
    ...(r.trade                    && { trade: r.trade }),
    ...(r.license_number           && { licenseNumber: r.license_number }),
    ...(r.license_expires_at && {
      licenseExpiresAt:
        r.license_expires_at instanceof Date
          ? r.license_expires_at.toISOString().slice(0, 10)
          : String(r.license_expires_at).slice(0, 10),
    }),
    ...(r.insurance_expires_at && {
      insuranceExpiresAt:
        r.insurance_expires_at instanceof Date
          ? r.insurance_expires_at.toISOString().slice(0, 10)
          : String(r.insurance_expires_at).slice(0, 10),
    }),
    ...(r.license_document_name    && { licenseDocumentName: r.license_document_name }),
    ...(r.insurance_document_name  && { insuranceDocumentName: r.insurance_document_name }),
    ...(r.id_document_name         && { idDocumentName: r.id_document_name }),
    ...(includeDocumentData && r.license_document_data   && { licenseDocumentData: r.license_document_data }),
    ...(includeDocumentData && r.insurance_document_data && { insuranceDocumentData: r.insurance_document_data }),
    ...(includeDocumentData && r.id_document_data        && { idDocumentData: r.id_document_data }),
    ...(r.photo_data_url           && { photoDataUrl: r.photo_data_url }),
    ...(r.phone                    && { phone: r.phone }),
    ...(r.address                  && { address: r.address }),
    addressVerified: r.address_verified === true,
    ...(r.address_verified_at && { addressVerifiedAt: r.address_verified_at }),
    ...(r.address_verification_provider && { addressVerificationProvider: r.address_verification_provider }),
    ...(r.postal_code_plus4 && { postalCodePlus4: r.postal_code_plus4 }),
    ...(r.contact_email            && { contactEmail: r.contact_email }),
    ...(r.company_name             && { companyName: r.company_name }),
    ...(r.company_details          && { companyDetails: r.company_details }),
    ...(r.insurance_details        && { insuranceDetails: r.insurance_details }),
    ...(r.compliance_status        && { complianceStatus: r.compliance_status }),
    dispatchEligible: r.dispatch_eligible === true,
    level1Eligible: r.level1_eligible === true,
    level2Eligible: r.level2_eligible === true,
    ...(r.overall_compliance_status && { overallComplianceStatus: r.overall_compliance_status }),
    ...(r.w9_document_name         && { w9DocumentName: r.w9_document_name }),
    ...(includeDocumentData && r.w9_document_data && { w9DocumentData: r.w9_document_data }),
    ...(r.business_registration_name && { businessRegistrationName: r.business_registration_name }),
    ...(includeDocumentData && r.business_registration_data && { businessRegistrationData: r.business_registration_data }),
    ...(r.business_license_name    && { businessLicenseName: r.business_license_name }),
    ...(includeDocumentData && r.business_license_data && { businessLicenseData: r.business_license_data }),
    ...(r.diversity_document_name  && { diversityDocumentName: r.diversity_document_name }),
    ...(includeDocumentData && r.diversity_document_data && { diversityDocumentData: r.diversity_document_data }),
    ...(r.contractor_application != null && {
      contractorApplication:
        typeof r.contractor_application === 'string'
          ? JSON.parse(r.contractor_application)
          : r.contractor_application,
    }),
    emails: asStringArray(r.profile_emails),
    phones: asStringArray(r.profile_phones),
    addresses: asStringArray(r.profile_addresses),
    isAdmin: r.role === 'admin',
    isBlocked: r.is_blocked === true,
    isGoogleAccount: Boolean(r.oauth_google_sub) || r.signup_method === 'google',
    isAppleAccount: r.password === 'APPLE_OAUTH',
    isAuth0Account: r.password === 'AUTH0_OAUTH',
    planCode: r.plan_code || null,
    ...(homeCareSubscription ? { homeCareSubscription } : {}),
    visitFee: r.visit_fee != null ? Number(r.visit_fee) : null,
    emergencyVisitFee: r.emergency_visit_fee != null ? Number(r.emergency_visit_fee) : null,
    afterHoursFee: r.after_hours_fee != null ? Number(r.after_hours_fee) : null,
    weekendFee: r.weekend_fee != null ? Number(r.weekend_fee) : null,
    cancellationFee: r.cancellation_fee != null ? Number(r.cancellation_fee) : null,
    minimumLaborFee: r.minimum_labor_fee != null ? Number(r.minimum_labor_fee) : null,
    freeEstimate: r.free_estimate === true,
    visitAppliesToRepair: r.visit_applies_to_repair === true,
    serviceZips: r.service_zips ? (typeof r.service_zips === 'string' ? JSON.parse(r.service_zips) : r.service_zips) : null,
    travelRadiusMiles: r.travel_radius_miles != null ? Number(r.travel_radius_miles) : null,
    referralCode: r.referral_code || null,
    referredByCode: r.referred_by_code || null,
    gender: r.gender || null,
    dob: r.dob || null,
    adminAccessLevel: r.admin_access_level || 'read-write',
    adminRolePreset: r.admin_role_preset || resolveAdminPreset({
      role: r.role,
      adminAccessLevel: r.admin_access_level,
      adminRolePreset: r.admin_role_preset,
    }),
    permissions: r.role === 'admin'
      ? [...permissionsForUser({
          role: 'admin',
          adminAccessLevel: r.admin_access_level,
          adminRolePreset: r.admin_role_preset,
        })]
      : undefined,
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
    `SELECT id FROM users WHERE role='admin' AND COALESCE(is_blocked,false)=false`
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
    ...(r.invoice_file_data && { invoiceFileData: r.invoice_file_data }),
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
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(
  cors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
    maxAge: 86400,
  })
);
// Keep JSON body reasonably bounded; media uploads are still data-URLs in managed job create.
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || '20mb',
    verify: (req, _res, buf) => {
      // Needed for Stripe webhook signature verification.
      if (req.originalUrl?.includes('/api/stripe/webhook')) {
        req.rawBody = buf;
      }
    },
  })
);

// ── Rate limiters ─────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 400),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many requests. Please slow down and try again.' },
});

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: Number(process.env.SIGNIN_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? 15 : 200)),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }),
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.FORGOT_RATE_LIMIT_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many reset requests. Please wait before trying again.' }),
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RESET_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many reset attempts. Please wait before trying again.' }),
});

const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many reviews submitted. Please try again later.' }),
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'Too many sign-up attempts. Please wait and try again.' }),
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ ok: false, message: 'AI rate limit reached. Please wait a few minutes.' }),
});

app.use('/api/', apiLimiter);

async function ensureUserReferralCode(pool, r) {
  if (r.referral_code) return r.referral_code;
  const nameClean = String(r.name || 'user').toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = nameClean.slice(0, 4) || 'USER';
  let referralCode = '';
  let attempts = 0;
  while (attempts < 10) {
    const random = Math.floor(1000 + Math.random() * 9000);
    referralCode = `REF-${prefix}-${random}`;
    try {
      await pool.query('UPDATE users SET referral_code=$1 WHERE id=$2', [referralCode, r.id]);
      r.referral_code = referralCode;
      break;
    } catch {
      attempts++;
    }
  }
  return referralCode;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signin', signInLimiter, async (req, res) => {
  try {
    const { role, email, password } = req.body;
    if (!role || !email || !password) return res.status(400).json({ ok: false, message: 'All fields are required.' });
    if (!['homeowner', 'contractor', 'admin'].includes(role)) {
      return res.status(400).json({ ok: false, message: 'Invalid account type.' });
    }

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

    // Former social-login accounts: no local password until they reset one
    if (['GOOGLE_OAUTH', 'APPLE_OAUTH', 'AUTH0_OAUTH'].includes(String(rows[0].password))) {
      return res.status(401).json({
        ok: false,
        message:
          'Social login has been removed. Use Forgot password to set a password for this account, or contact support.',
      });
    }

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Incorrect email or password.' });
    }

    await ensureUserReferralCode(pool, rows[0]);
    let homeCareSubscription = null;
    if (role === 'homeowner') {
      const subState = await syncUserHomeCareEntitlement(pool, rows[0].id);
      homeCareSubscription = toPublicHomeCareSubscriptionDto(subState);
    }
    const user = rowToUser(rows[0], { homeCareSubscription });
    if (homeCareSubscription) {
      user.planCode = homeCareSubscription.isPro ? homeCareSubscription.planCode : null;
    }
    // P0-8: admin credentials only yield an MFA-pending token until MFA succeeds
    if (role === 'admin') {
      return res.json({
        ok: true,
        mfaRequired: true,
        token: makeToken(user, { authStage: 'mfa_pending', expiresIn: '15m' }),
        user,
        message: 'Credentials verified. Complete MFA to finish sign-in.',
      });
    }
    return res.json({ ok: true, token: makeToken(user, { authStage: 'complete' }), user });
  } catch (e) {
    console.error('signin:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  try {
    const {
      role, name, email, password, trade, licenseNumber,
      licenseDocumentName, insuranceDocumentName, idDocumentName,
      licenseDocumentData, insuranceDocumentData, idDocumentData,
      w9DocumentName, w9DocumentData,
      businessRegistrationName, businessRegistrationData,
      businessLicenseName, businessLicenseData,
      diversityDocumentName, diversityDocumentData,
      contractorApplication,
      phone, address, contactEmail, companyName, companyDetails, insuranceDetails,
      serviceZips, travelRadiusMiles, visitFee, emergencyVisitFee, minimumLaborFee,
      afterHoursFee, weekendFee, cancellationFee, freeEstimate, visitAppliesToRepair,
      referredByCode,
    } = req.body;
    if (!role || !name || !email || !password) return res.status(400).json({ ok: false, message: 'All required fields must be filled.' });
    if (role !== 'homeowner' && role !== 'contractor') {
      return res.status(400).json({ ok: false, message: 'Public signup is only available for homeowners and contractors.' });
    }
    if (password.length < 6) return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters.' });

    if (role === 'homeowner') {
      const accountConsent = checkActionConsentsFromBody(req.body, 'ACCOUNT_SIGNUP');
      if (!accountConsent.ok) {
        return res.status(400).json({
          ok: false,
          code: accountConsent.code,
          message: 'You must agree to the FixBridge Terms of Service and Privacy Policy.',
          missingAcceptanceTypes: accountConsent.missing,
        });
      }
    }

    const docs = [
      { label: 'License', name: licenseDocumentName, data: licenseDocumentData },
      { label: 'Insurance', name: insuranceDocumentName, data: insuranceDocumentData },
      { label: 'ID Document', name: idDocumentName, data: idDocumentData },
      { label: 'W-9', name: w9DocumentName, data: w9DocumentData },
      { label: 'Business Registration', name: businessRegistrationName, data: businessRegistrationData },
      { label: 'Business License', name: businessLicenseName, data: businessLicenseData },
      { label: 'Diversity Certification', name: diversityDocumentName, data: diversityDocumentData },
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

    if (role === 'contractor') {
      const app = contractorApplication && typeof contractorApplication === 'object' ? contractorApplication : null;
      if (!app) {
        return res.status(400).json({ ok: false, message: 'Contractor application details are required.' });
      }
      if (!String(app.legalBusinessName || '').trim() || !String(app.ein || '').trim()) {
        return res.status(400).json({ ok: false, message: 'Legal business name and EIN are required.' });
      }
      if (!app.agreeAccurate) {
        return res.status(400).json({ ok: false, message: 'You must confirm the application information is accurate.' });
      }
      if (!app.agreeContractorAgreementV4) {
        return res.status(400).json({
          ok: false,
          message: 'You must review and accept the FixBridge Contractor Agreement Package v4.',
        });
      }
    }

    const existing = await pool.query(`SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2)`, [role, email.trim()]);
    if (existing.rows.length) return res.status(409).json({ ok: false, message: 'An account with that email already exists.' });

    const hashed = await bcrypt.hash(password, 10);
    const appJson = role === 'contractor' && contractorApplication
      ? JSON.stringify(contractorApplication)
      : null;
    const zipsJson = Array.isArray(serviceZips) ? JSON.stringify(serviceZips) : null;

    const licenseExpiresAt =
      role === 'contractor' && contractorApplication?.licenseExpiration
        ? String(contractorApplication.licenseExpiration).slice(0, 10)
        : null;
    const insuranceExpiresAt =
      role === 'contractor' && contractorApplication?.insuranceExpiration
        ? String(contractorApplication.insuranceExpiration).slice(0, 10)
        : null;

    const { rows } = await pool.query(
      `INSERT INTO users (
         role,name,email,password,trade,license_number,
         license_document_name,insurance_document_name,id_document_name,
         license_document_data,insurance_document_data,id_document_data,
         w9_document_name,w9_document_data,
         business_registration_name,business_registration_data,
         business_license_name,business_license_data,
         diversity_document_name,diversity_document_data,
         contractor_application,
         phone,address,contact_email,company_name,company_details,insurance_details,
         service_zips,travel_radius_miles,visit_fee,emergency_visit_fee,minimum_labor_fee,
         after_hours_fee,weekend_fee,cancellation_fee,free_estimate,visit_applies_to_repair,
         compliance_status,license_expires_at,insurance_expires_at,referred_by_code
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21::jsonb,$22,$23,$24,$25,$26,$27,$28::jsonb,$29,$30,$31,$32,$33,$34,$35,$36,$37,
         $38,$39,$40,$41
       ) RETURNING *`,
      [
        role, name.trim(), email.trim().toLowerCase(), hashed,
        trade?.trim()||null, licenseNumber?.trim()||null,
        licenseDocumentName||null, insuranceDocumentName||null, idDocumentName||null,
        licenseDocumentData||null, insuranceDocumentData||null, idDocumentData||null,
        w9DocumentName||null, w9DocumentData||null,
        businessRegistrationName||null, businessRegistrationData||null,
        businessLicenseName||null, businessLicenseData||null,
        diversityDocumentName||null, diversityDocumentData||null,
        appJson,
        phone?.trim()||null, address?.trim()||null, contactEmail?.trim()||null,
        companyName?.trim()||null, companyDetails?.trim()||null, insuranceDetails?.trim()||null,
        zipsJson,
        travelRadiusMiles != null && travelRadiusMiles !== '' ? Number(travelRadiusMiles) : null,
        visitFee != null && visitFee !== '' ? Number(visitFee) : null,
        emergencyVisitFee != null && emergencyVisitFee !== '' ? Number(emergencyVisitFee) : null,
        minimumLaborFee != null && minimumLaborFee !== '' ? Number(minimumLaborFee) : null,
        afterHoursFee != null && afterHoursFee !== '' ? Number(afterHoursFee) : null,
        weekendFee != null && weekendFee !== '' ? Number(weekendFee) : null,
        cancellationFee != null && cancellationFee !== '' ? Number(cancellationFee) : null,
        freeEstimate === true,
        visitAppliesToRepair === true,
        role === 'contractor' ? 'under_review' : null,
        licenseExpiresAt && /^\d{4}-\d{2}-\d{2}$/.test(licenseExpiresAt) ? licenseExpiresAt : null,
        insuranceExpiresAt && /^\d{4}-\d{2}-\d{2}$/.test(insuranceExpiresAt) ? insuranceExpiresAt : null,
        typeof referredByCode === 'string' && referredByCode.trim() ? referredByCode.trim().toUpperCase() : null,
      ]
    );
    await ensureUserReferralCode(pool, rows[0]);
    if (role === 'contractor') {
      try {
        const { recordContractorAgreementAcceptance } = await import('./contractor-agreement.js');
        const { AGREEMENT_V4_TITLE, AGREEMENT_V4_VERSION } = await import('./contractor-agreement-content.js');
        await recordContractorAgreementAcceptance(pool, {
          contractorUserId: rows[0].id,
          documentVersion: AGREEMENT_V4_VERSION,
          documentTitle: AGREEMENT_V4_TITLE,
          req,
          sourceRoute: req.originalUrl || '/api/auth/signup',
        });
      } catch (agrErr) {
        console.error('contractor agreement acceptance:', agrErr);
      }
    }
    try {
      const refCode =
        typeof referredByCode === 'string' && referredByCode.trim()
          ? referredByCode.trim()
          : rows[0].referred_by_code;
      if (refCode) {
        await applyReferralCode(pool, rows[0].id, refCode, { actorId: rows[0].id });
      }
      await ensureReferralCode(pool, rows[0]);
    } catch (refErr) {
      console.error('referral on signup:', refErr);
    }
    const user = rowToUser(rows[0]);
    if (role === 'homeowner') {
      try {
        await validateAndRecordActionConsents(pool, req, {
          actionKey: 'ACCOUNT_SIGNUP',
          userId: rows[0].id,
          idempotencyPrefix: `signup:${rows[0].id}`,
        });
        const emailOptIn =
          req.body?.marketingEmailOptIn === true || req.body?.marketingConsent === true;
        const smsOptIn =
          req.body?.marketingSmsOptIn === true || req.body?.marketingConsent === true;
        await recordSignupMarketingConsents(pool, {
          userId: rows[0].id,
          emailOptIn,
          smsOptIn,
          source: 'signup',
          req,
        });
      } catch (consentErr) {
        console.error('homeowner consent on signup:', consentErr);
      }
    }
    if (role === 'contractor') {
      try {
        await ensureComplianceDocuments(pool, rows[0].id);
        await recalculateDispatchEligible(pool, rows[0].id);
      } catch (complianceErr) {
        console.error('contractor compliance seed on signup:', complianceErr);
      }
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

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows: pendingPayments } = await pool.query(
      `SELECT * FROM payments WHERE user_id=$1 AND status='pending' AND stripe_session_id IS NOT NULL`,
      [req.authUser.id]
    );
    for (const payment of pendingPayments) {
      try {
        const stripe = await getStripe();
        if (stripe) {
          const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id);
          if (session.payment_status === 'paid' || session.status === 'complete') {
            await pool.query(
              `UPDATE payments SET status='succeeded' WHERE id=$1`,
              [payment.id]
            );
            const planCode = session.metadata?.planCode;
            if (payment.payment_type === 'subscription' && planCode) {
              let periodEnd = null;
              if (session.subscription && stripe) {
                try {
                  const sub = await stripe.subscriptions.retrieve(String(session.subscription));
                  if (sub?.current_period_end) {
                    periodEnd = new Date(sub.current_period_end * 1000).toISOString();
                  }
                } catch {
                  /* use default in activateSubscriptionFromCheckout */
                }
              }
              await activateSubscriptionFromCheckout(pool, {
                userId: req.authUser.id,
                planCode,
                stripeSubscriptionId: session.subscription || null,
                stripeCustomerId: session.customer || null,
                currentPeriodEnd: periodEnd,
                checkoutSessionId: session.id,
                meta: { activatedByAuthMeSync: true },
              });
            }
          }
        }
      } catch (err) {
        console.error('[Stripe sync error]', err.message);
      }
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
    if (!rows.length) return res.status(401).json({ ok: false, message: 'User not found.' });
    await ensureUserReferralCode(pool, rows[0]);
    let homeCareSubscription = req.authUser.homeCareSubscription || null;
    if (rows[0].role === 'homeowner') {
      const subState = await syncUserHomeCareEntitlement(pool, rows[0].id);
      homeCareSubscription = toPublicHomeCareSubscriptionDto(subState);
    }
    const user = rowToUser(rows[0], { homeCareSubscription });
    if (homeCareSubscription) {
      user.planCode = homeCareSubscription.isPro ? homeCareSubscription.planCode : null;
    }
    return res.json({ ok: true, user });
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

    const gender = typeof body.gender === 'string' ? body.gender.trim() : null;
    const dob = typeof body.dob === 'string' ? body.dob.trim() : null;

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
    const trade = typeof body.trade === 'string' ? body.trade.trim() : undefined;
    const emails = asStringArray(body.emails);
    const phones = asStringArray(body.phones);
    const addresses = asStringArray(body.addresses);

    const licenseDoc = parseDocumentField(body, 'licenseDocumentName', 'licenseDocumentData');
    const insuranceDoc = parseDocumentField(body, 'insuranceDocumentName', 'insuranceDocumentData');
    const idDoc = parseDocumentField(body, 'idDocumentName', 'idDocumentData');
    const w9Doc = parseDocumentField(body, 'w9DocumentName', 'w9DocumentData');
    const bizRegDoc = parseDocumentField(body, 'businessRegistrationName', 'businessRegistrationData');
    const bizLicDoc = parseDocumentField(body, 'businessLicenseName', 'businessLicenseData');
    const diversityDoc = parseDocumentField(body, 'diversityDocumentName', 'diversityDocumentData');
    for (const doc of [licenseDoc, insuranceDoc, idDoc, w9Doc, bizRegDoc, bizLicDoc, diversityDoc]) {
      if (doc.error) return res.status(400).json({ ok: false, message: doc.error });
    }

    // Clear photo when client explicitly sends null; omit field leaves existing value
    const clearPhoto = body.photoDataUrl === null;
    const setPhoto = typeof body.photoDataUrl === 'string';
    const setLicenseNumber = typeof licenseNumber === 'string';
    const setTrade = typeof trade === 'string';
    const setGender = typeof body.gender === 'string';
    const setDob = typeof body.dob === 'string';

    const { rows: beforeRows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
    if (!beforeRows.length) {
      return res.status(404).json({ ok: false, message: 'User not found.' });
    }
    const before = beforeRows[0];

    // Allow homeowner/contractor to update login email when provided and unique for their role.
    const nextEmailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (nextEmailRaw && nextEmailRaw !== String(before.email || '').toLowerCase()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmailRaw)) {
        return res.status(400).json({ ok: false, message: 'Enter a valid email address.' });
      }
      const { rows: emailTaken } = await pool.query(
        `SELECT id FROM users WHERE role=$1 AND LOWER(email)=LOWER($2) AND id<>$3`,
        [before.role, nextEmailRaw, req.authUser.id]
      );
      if (emailTaken.length) {
        return res.status(409).json({ ok: false, message: 'An account with that email already exists.' });
      }
      await pool.query(`UPDATE users SET email=$1 WHERE id=$2`, [nextEmailRaw, req.authUser.id]);
      before.email = nextEmailRaw;
    }

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
         trade = CASE WHEN $32::boolean THEN $33 ELSE trade END,
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
         END,
         gender = CASE WHEN $34::boolean THEN $35 ELSE gender END,
         dob = CASE WHEN $36::boolean THEN $37 ELSE dob END
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
        setTrade,
        setTrade ? (trade || null) : null,
        setGender,
        setGender ? gender : null,
        setDob,
        setDob ? dob : null,
      ]
    );

    let updated = rows[0];

    if (req.authUser.role === 'contractor') {
      await pool.query(
        `UPDATE users SET
           visit_fee = $1,
           emergency_visit_fee = $2,
           after_hours_fee = $3,
           weekend_fee = $4,
           cancellation_fee = $5,
           minimum_labor_fee = $6,
           free_estimate = $7,
           visit_applies_to_repair = $8,
           service_zips = $9,
           travel_radius_miles = $10,
           contractor_application = CASE WHEN $12::boolean THEN $13::jsonb ELSE contractor_application END,
           w9_document_name = CASE
             WHEN $14::boolean AND $15::boolean THEN NULL
             WHEN $14::boolean AND $16::boolean THEN $17
             WHEN $14::boolean AND $17::text IS NOT NULL AND NOT $16::boolean THEN $17
             ELSE w9_document_name
           END,
           w9_document_data = CASE
             WHEN $14::boolean AND $15::boolean THEN NULL
             WHEN $14::boolean AND $16::boolean THEN $18
             ELSE w9_document_data
           END,
           business_registration_name = CASE
             WHEN $19::boolean AND $20::boolean THEN NULL
             WHEN $19::boolean AND $21::boolean THEN $22
             WHEN $19::boolean AND $22::text IS NOT NULL AND NOT $21::boolean THEN $22
             ELSE business_registration_name
           END,
           business_registration_data = CASE
             WHEN $19::boolean AND $20::boolean THEN NULL
             WHEN $19::boolean AND $21::boolean THEN $23
             ELSE business_registration_data
           END,
           business_license_name = CASE
             WHEN $24::boolean AND $25::boolean THEN NULL
             WHEN $24::boolean AND $26::boolean THEN $27
             WHEN $24::boolean AND $27::text IS NOT NULL AND NOT $26::boolean THEN $27
             ELSE business_license_name
           END,
           business_license_data = CASE
             WHEN $24::boolean AND $25::boolean THEN NULL
             WHEN $24::boolean AND $26::boolean THEN $28
             ELSE business_license_data
           END,
           license_expires_at = CASE
             WHEN $12::boolean AND $29::text IS NOT NULL AND $29::text <> '' THEN $29::date
             WHEN $12::boolean THEN license_expires_at
             ELSE license_expires_at
           END,
           insurance_expires_at = CASE
             WHEN $12::boolean AND $30::text IS NOT NULL AND $30::text <> '' THEN $30::date
             WHEN $12::boolean THEN insurance_expires_at
             ELSE insurance_expires_at
           END
         WHERE id = $11`,
        [
          body.visitFee !== undefined ? (body.visitFee === null ? null : Number(body.visitFee)) : before.visit_fee,
          body.emergencyVisitFee !== undefined ? (body.emergencyVisitFee === null ? null : Number(body.emergencyVisitFee)) : before.emergency_visit_fee,
          body.afterHoursFee !== undefined ? (body.afterHoursFee === null ? null : Number(body.afterHoursFee)) : before.after_hours_fee,
          body.weekendFee !== undefined ? (body.weekendFee === null ? null : Number(body.weekendFee)) : before.weekend_fee,
          body.cancellationFee !== undefined ? (body.cancellationFee === null ? null : Number(body.cancellationFee)) : before.cancellation_fee,
          body.minimumLaborFee !== undefined ? (body.minimumLaborFee === null ? null : Number(body.minimumLaborFee)) : before.minimum_labor_fee,
          body.freeEstimate !== undefined ? Boolean(body.freeEstimate) : before.free_estimate,
          body.visitAppliesToRepair !== undefined ? Boolean(body.visitAppliesToRepair) : before.visit_applies_to_repair,
          body.serviceZips !== undefined ? JSON.stringify(body.serviceZips) : JSON.stringify(before.service_zips || []),
          body.travelRadiusMiles !== undefined ? (body.travelRadiusMiles === null ? null : Number(body.travelRadiusMiles)) : before.travel_radius_miles,
          req.authUser.id,
          body.contractorApplication !== undefined,
          body.contractorApplication !== undefined
            ? JSON.stringify((() => {
                const existing =
                  before.contractor_application == null
                    ? {}
                    : typeof before.contractor_application === 'string'
                      ? (() => {
                          try {
                            return JSON.parse(before.contractor_application) || {};
                          } catch {
                            return {};
                          }
                        })()
                      : before.contractor_application;
                const incoming =
                  body.contractorApplication && typeof body.contractorApplication === 'object'
                    ? body.contractorApplication
                    : {};
                return {
                  ...existing,
                  ...incoming,
                  primaryServices: Array.isArray(incoming.primaryServices)
                    ? incoming.primaryServices
                    : existing.primaryServices || [],
                  serviceStates: Array.isArray(incoming.serviceStates)
                    ? incoming.serviceStates
                    : existing.serviceStates || [],
                };
              })())
            : null,
          Boolean(w9Doc.provided),
          Boolean(w9Doc.clear),
          Boolean(w9Doc.set),
          w9Doc.provided ? w9Doc.name : null,
          w9Doc.provided ? w9Doc.data : null,
          Boolean(bizRegDoc.provided),
          Boolean(bizRegDoc.clear),
          Boolean(bizRegDoc.set),
          bizRegDoc.provided ? bizRegDoc.name : null,
          bizRegDoc.provided ? bizRegDoc.data : null,
          Boolean(bizLicDoc.provided),
          Boolean(bizLicDoc.clear),
          Boolean(bizLicDoc.set),
          bizLicDoc.provided ? bizLicDoc.name : null,
          bizLicDoc.provided ? bizLicDoc.data : null,
          body.contractorApplication?.licenseExpiration || body.licenseExpiresAt || null,
          body.contractorApplication?.insuranceExpiration || body.insuranceExpiresAt || null,
        ]
      );
      if (diversityDoc.provided) {
        await pool.query(
          `UPDATE users SET
             diversity_document_name = CASE
               WHEN $2::boolean THEN NULL
               WHEN $3::boolean THEN $4
               WHEN $4::text IS NOT NULL AND NOT $3::boolean THEN $4
               ELSE diversity_document_name
             END,
             diversity_document_data = CASE
               WHEN $2::boolean THEN NULL
               WHEN $3::boolean THEN $5
               ELSE diversity_document_data
             END
           WHERE id = $1`,
          [
            req.authUser.id,
            Boolean(diversityDoc.clear),
            Boolean(diversityDoc.set),
            diversityDoc.provided ? diversityDoc.name : null,
            diversityDoc.provided ? diversityDoc.data : null,
          ]
        );
      }
      // Google (or incomplete) contractors who submit a full application move into review.
      if (
        body.contractorApplication &&
        typeof body.contractorApplication === 'object' &&
        (!before.compliance_status || before.compliance_status === 'draft')
      ) {
        await pool.query(
          `UPDATE users SET compliance_status='under_review'
           WHERE id=$1 AND (compliance_status IS NULL OR compliance_status='draft')`,
          [req.authUser.id]
        );
      }
      const { rows: freshUser } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
      if (freshUser[0]) {
        updated = freshUser[0];
      }
      if (body.addressVerified !== undefined || body.postalCodePlus4 !== undefined) {
        await pool.query(
          `UPDATE users SET
             address_verified = $1,
             address_verified_at = CASE WHEN $1::boolean THEN NOW() ELSE NULL END,
             address_verification_provider = CASE WHEN $1::boolean THEN 'usps' ELSE NULL END,
             postal_code_plus4 = COALESCE($2, postal_code_plus4)
           WHERE id = $3`,
          [body.addressVerified === true, body.postalCodePlus4 || null, req.authUser.id]
        );
        const { rows: refreshed } = await pool.query('SELECT * FROM users WHERE id=$1', [req.authUser.id]);
        if (refreshed[0]) updated = refreshed[0];
      }
    }
    const changedLabels = [];
    if (licenseDoc.set && licenseDoc.data !== before.license_document_data) changedLabels.push('License');
    if (insuranceDoc.set && insuranceDoc.data !== before.insurance_document_data) changedLabels.push('Insurance');
    if (idDoc.set && idDoc.data !== before.id_document_data) changedLabels.push('ID Document');
    if (w9Doc.set && w9Doc.data !== before.w9_document_data) changedLabels.push('W-9');
    if (bizRegDoc.set && bizRegDoc.data !== before.business_registration_data) changedLabels.push('Business Registration');
    if (bizLicDoc.set && bizLicDoc.data !== before.business_license_data) changedLabels.push('Business License');
    if (diversityDoc.set && diversityDoc.data !== before.diversity_document_data) changedLabels.push('Diversity Certification');
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

    const user = rowToUser(updated);
    return res.json({ ok: true, user, token: makeToken(user) });
  } catch (e) {
    console.error('profile update:', e);
    return res.status(500).json({ ok: false, message: 'Server error.' });
  }
});

/** Forgot password — generates hashed reset token and emails the link (enumeration-safe). */
app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const role = String(req.body?.role || '').toLowerCase();
    if (!email || !RESET_ROLES.includes(role)) {
      // Still generic — do not reveal validation details that help attackers
      return res.json({ ok: true });
    }

    const account = await findResetAccount(pool, role, email);
    if (account) {
      await issuePasswordReset(pool, account);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('forgot-password:', e);
    // Enumeration-safe even on error
    return res.json({ ok: true });
  }
});

/** Reset password — validates hashed token and sets new bcrypt password only (no role/data changes). */
app.post('/api/auth/reset-password', resetLimiter, async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const role = String(req.body?.role || '').toLowerCase();
    const password = String(req.body?.password || '');
    const result = await completePasswordReset(pool, { rawToken: token, role, password });
    if (!result.ok) {
      const status = result.code === 'weak_password' ? 400 : 400;
      return res.status(status).json({
        ok: false,
        message: result.message || 'This reset link has expired or is no longer valid.',
        code: result.code || 'invalid',
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('reset-password:', e);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
});

/**
 * Admin triggers the same secure reset email for a user.
 * Does not reveal or set passwords. Permission depends on target role.
 */
app.post(
  '/api/admin/users/:userId/send-password-reset',
  requireAuth,
  requireAdmin,
  requireAdminWrite,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ ok: false, message: 'Invalid user id.' });
      }

      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [userId]);
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: 'User not found.' });
      }

      const target = rows[0];
      const role = String(target.role || '').toLowerCase();
      const needed =
        role === 'admin'
          ? 'staff.edit'
          : role === 'contractor'
            ? 'contractors.edit'
            : role === 'homeowner'
              ? 'homeowners.edit'
              : null;

      if (!needed || !userHasPermission(req.authUser, needed)) {
        return res.status(403).json({
          ok: false,
          code: 'FORBIDDEN_PERMISSION',
          message: 'You do not have permission to send a password reset for this account.',
        });
      }

      const account = await findResetAccount(pool, role, target.email);
      if (!account) {
        return res.status(400).json({ ok: false, message: 'Unable to send password reset for this account.' });
      }

      await issuePasswordReset(pool, account, { triggeredByUserId: req.authUser.id });
      return res.json({ ok: true, message: 'Password reset email sent if the account can receive one.' });
    } catch (e) {
      console.error('admin send-password-reset:', e);
      return res.status(500).json({ ok: false, message: 'Could not send password reset email.' });
    }
  }
);

// Requires a valid token. Returns only contractor public info (no passwords, no document file bytes).
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    if (!['admin', 'contractor'].includes(req.authUser.role)) {
      return res.status(403).json({ ok: false, message: 'Not allowed.' });
    }
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
    // P0-12: metadata only — never return document bytes in list responses
    return res.json({ ok: true, users: rows.map((r) => rowToUser(r, { includeDocumentData: false })) });
  } catch (e) {
    console.error('admin users:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.params.userId]);
    if (!rows.length) return res.status(404).json({ ok: false, message: 'User not found.' });
    return res.json({ ok: true, user: rowToUser(rows[0], { includeDocumentData: false }) });
  } catch (e) {
    console.error('admin user detail:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get(
  '/api/admin/users/:userId/documents',
  requireAuth,
  requireAdmin,
  requirePermission('contractors.view'),
  async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.params.userId]);
      if (!rows.length) return res.status(404).json({ ok: false, message: 'User not found.' });
      const u = rows[0];
      const documents = [];
      const push = (documentType, fileName, uploadedAt, data) => {
        if (!fileName && !data) return;
        documents.push({
          documentType,
          fileName: fileName || null,
          uploadedAt: uploadedAt || null,
          verificationStatus: u.compliance_status || null,
          hasData: Boolean(data),
          dataUrl: data || null,
        });
      };
      push('license', u.license_document_name, u.license_expires_at, u.license_document_data);
      push('insurance', u.insurance_document_name, u.insurance_expires_at, u.insurance_document_data);
      push('government_id', u.id_document_name, null, u.id_document_data);
      push('w9', u.w9_document_name, null, u.w9_document_data);
      push('business_registration', u.business_registration_name, null, u.business_registration_data);
      push('business_license', u.business_license_name, null, u.business_license_data);
      push('diversity', u.diversity_document_name, null, u.diversity_document_data);
      await writeAudit(pool, req.authUser.id, 'admin_view_user_documents', 'user', Number(req.params.userId), {
        documentCount: documents.length,
      });
      return res.json({ ok: true, documents });
    } catch (e) {
      console.error('admin user documents:', e);
      return res.status(500).json({ ok: false, message: 'Server error' });
    }
  }
);

app.put('/api/admin/users/:userId/block', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
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
    await writeAudit(pool, req.authUser.id, normalizedBlocked ? 'user_blocked' : 'user_unblocked', 'user', userId, {
      email: rows[0].email,
      role: rows[0].role,
    });
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('block user:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.get('/api/admin/staff', requireAuth, requireAdmin, requirePermission('staff.view'), async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE role='admin' ORDER BY name ASC");
    return res.json({ ok: true, staff: rows.map(rowToUser) });
  } catch (e) {
    console.error('admin staff list:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.post('/api/admin/staff/access', requireAuth, requireAdmin, requirePermission('staff.edit'), async (req, res) => {
  try {
    const { userId } = req.body;
    let accessLevel = String(req.body?.accessLevel || '').toLowerCase();
    let rolePreset = String(req.body?.rolePreset || req.body?.adminRolePreset || '').toLowerCase();

    if (!userId) {
      return res.status(400).json({ ok: false, message: 'userId is required.' });
    }

    // Prefer explicit preset; map legacy access levels.
    if (!rolePreset || !VALID_ROLE_PRESETS.includes(rolePreset)) {
      if (['read', 'write', 'read-write'].includes(accessLevel)) {
        rolePreset = accessLevel === 'read' ? 'read_only' : accessLevel === 'write' ? 'operations_admin' : 'super_admin';
      } else {
        return res.status(400).json({ ok: false, message: 'Invalid rolePreset or accessLevel.' });
      }
    }
    accessLevel = presetToAccessLevel(rolePreset);

    if (!canAssignPreset(req.authUser, rolePreset)) {
      return res.status(403).json({
        ok: false,
        code: 'CANNOT_ASSIGN_ROLE',
        message: 'You cannot assign that role or elevate privileges.',
      });
    }

    // Prevent self-elevation
    if (Number(userId) === Number(req.authUser.id)) {
      const current = resolveAdminPreset(req.authUser);
      const rank = (p) => (p === 'super_admin' ? 3 : p === 'read_only' ? 0 : 1);
      if (rank(rolePreset) > rank(current)) {
        return res.status(403).json({
          ok: false,
          code: 'SELF_ELEVATION',
          message: 'You cannot increase your own privileges.',
        });
      }
    }

    const { rows: prevRows } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='admin'`, [userId]);
    if (!prevRows.length) {
      return res.status(404).json({ ok: false, message: 'Staff member not found.' });
    }

    const prevPreset = resolveAdminPreset({
      role: 'admin',
      adminAccessLevel: prevRows[0].admin_access_level,
      adminRolePreset: prevRows[0].admin_role_preset,
    });

    // Do not demote the last super admin
    if (prevPreset === 'super_admin' && rolePreset !== 'super_admin') {
      const { rows: supers } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM users
         WHERE role='admin' AND COALESCE(is_blocked,false)=false
           AND (
             LOWER(COALESCE(admin_role_preset,''))='super_admin'
             OR (admin_role_preset IS NULL AND COALESCE(admin_access_level,'read-write')='read-write')
           )`
      );
      if ((supers[0]?.c || 0) <= 1) {
        return res.status(400).json({
          ok: false,
          code: 'LAST_SUPER_ADMIN',
          message: 'Cannot demote the last Super Admin account.',
        });
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET admin_access_level=$1, admin_role_preset=$2
       WHERE id=$3 AND role='admin' RETURNING *`,
      [accessLevel, rolePreset, userId]
    );
    await writeAudit(pool, req.authUser.id, 'staff_access_updated', 'user', userId, {
      email: rows[0].email,
      previousLevel: prevRows[0].admin_access_level || 'read-write',
      previousPreset: prevPreset,
      accessLevel,
      rolePreset,
    });
    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('admin staff access update:', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

app.post('/api/admin/staff/create', requireAuth, requireAdmin, requirePermission('staff.create'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    let rolePreset = String(req.body?.rolePreset || req.body?.adminRolePreset || '').toLowerCase();
    let accessLevel = String(req.body?.accessLevel || '').toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 8 characters.' });
    }

    if (!rolePreset || !VALID_ROLE_PRESETS.includes(rolePreset)) {
      if (['read', 'write', 'read-write'].includes(accessLevel)) {
        rolePreset = accessLevel === 'read' ? 'read_only' : accessLevel === 'write' ? 'operations_admin' : 'operations_admin';
      } else {
        rolePreset = 'operations_admin';
      }
    }
    // Never allow creating super_admin unless actor is super_admin
    if (rolePreset === 'super_admin' && resolveAdminPreset(req.authUser) !== 'super_admin') {
      return res.status(403).json({
        ok: false,
        code: 'CANNOT_ASSIGN_ROLE',
        message: 'Only a Super Admin can create another Super Admin.',
      });
    }
    if (!canAssignPreset(req.authUser, rolePreset)) {
      return res.status(403).json({
        ok: false,
        code: 'CANNOT_ASSIGN_ROLE',
        message: 'You cannot assign that role.',
      });
    }
    accessLevel = presetToAccessLevel(rolePreset);

    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE role='admin' AND LOWER(email)=LOWER($1)`,
      [email]
    );
    if (existing.length) {
      return res.status(409).json({ ok: false, message: 'A staff account with this email already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (role, name, email, password, is_admin, admin_access_level, admin_role_preset, compliance_status)
       VALUES ('admin', $1, $2, $3, true, $4, $5, 'approved')
       RETURNING *`,
      [name, email, hashed, accessLevel, rolePreset]
    );

    await writeAudit(pool, req.authUser.id, 'staff_created', 'user', rows[0].id, {
      email,
      name,
      accessLevel,
      rolePreset,
    });

    return res.json({ ok: true, user: rowToUser(rows[0]) });
  } catch (e) {
    console.error('admin staff create:', e);
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, message: 'Email already in use.' });
    }
    return res.status(500).json({ ok: false, message: 'Could not create staff account.' });
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

app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    // Contractors see open board jobs (PII masked); admins see all; homeowners use /api/jobs/my.
    if (req.authUser.role === 'homeowner') {
      return res.status(403).json({ error: 'Use /api/jobs/my for your jobs.' });
    }
    const { rows } = await pool.query('SELECT * FROM jobs ORDER BY created_at DESC');
    if (req.authUser.role === 'admin') {
      return res.json(rows.map(rowToJob));
    }
    return res.json(rows.map(rowToJobBoard));
  } catch (e) {
    console.error('jobs list:', e);
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
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

// ── Notifications (in-app) ───────────────────────────────────────────────────
registerInAppNotificationRoutes(app, { pool, requireAuth });
registerMessagingRoutes(app, { pool, requireAuth, requireAdmin });
registerAttachmentAdminRoutes(app, { pool, requireAuth, requireAdmin });
registerAvailabilityRoutes(app, { pool, requireAuth, requireAdmin });
registerAdminSearchRoutes(app, { pool, requireAuth, requireAdmin });

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.get('/api/lifecycle', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_lifecycle');
    return res.json(rows.map(rowToLifecycle));
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

app.get('/api/lifecycle/:jobId', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const access = await getLegacyJobAccess(req.params.jobId, req.authUser);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [req.params.jobId]);
    return res.json(rows.length ? rowToLifecycle(rows[0]) : { jobId: Number(req.params.jobId), status: 'open' });
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

app.put('/api/lifecycle/:jobId/status', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const { jobId } = req.params;
    const access = await getLegacyJobAccess(jobId, req.authUser);
    if (!access.job && req.authUser.role !== 'admin') {
      return res.status(404).json({ error: 'Job not found.' });
    }
    const status = clampString(req.body?.status, 40);
    const allowed = ['open', 'accepted', 'on-the-way', 'arrived', 'work-started', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    // Homeowners cannot set contractor progress; contractors may accept open jobs or update assigned ones
    let contractorName = null;
    let contractorEmail = null;
    if (req.authUser.role === 'admin') {
      contractorName = clampString(req.body?.contractorName, 120) || null;
      contractorEmail = clampString(req.body?.contractorEmail, 200) || null;
    } else if (req.authUser.role === 'contractor') {
      if (status === 'accepted') {
        contractorName = req.authUser.name || null;
        contractorEmail = req.authUser.email;
      } else if (!access.mutate) {
        return res.status(403).json({ error: 'Accept this job before updating status.' });
      } else {
        contractorName = req.authUser.name || null;
        contractorEmail = req.authUser.email;
      }
    } else if (req.authUser.role === 'homeowner') {
      return res.status(403).json({ error: 'Homeowners cannot update contractor job status.' });
    } else {
      return res.status(403).json({ error: 'Not allowed.' });
    }

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
      [jobId, status, contractorName, contractorEmail, now]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    console.error('update status:', e);
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

app.put('/api/lifecycle/:jobId/invoice', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const { jobId } = req.params;
    const access = await getLegacyJobAccess(jobId, req.authUser);
    if (!access.mutate && req.authUser.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    const amount = Number(req.body?.amount);
    const fileName = clampString(req.body?.fileName, 200) || null;
    const fileData = req.body?.fileData;
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      return res.status(400).json({ error: 'Invalid invoice amount.' });
    }
    if (fileData && typeof fileData === 'string' && fileData.length > 5_000_000) {
      return res.status(400).json({ error: 'Invoice file is too large.' });
    }
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,invoice_amount,invoice_file_name,invoice_file_data,updated_at)
       VALUES ($1,'completed',$2,$3,$4,NOW())
       ON CONFLICT (job_id) DO UPDATE SET
         invoice_amount=$2,
         invoice_file_name=$3,
         invoice_file_data=COALESCE($4, job_lifecycle.invoice_file_data),
         updated_at=NOW()`,
      [jobId, amount, fileName, typeof fileData === 'string' ? fileData : null]
    );
    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    console.error('update invoice:', e);
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});


app.put('/api/lifecycle/:jobId/rating', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const { jobId } = req.params;
    const access = await getLegacyJobAccess(jobId, req.authUser);
    // Only the homeowner (or admin) may rate
    if (req.authUser.role !== 'admin' && !(req.authUser.role === 'homeowner' && access.mutate)) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    const rating = Math.round(Number(req.body?.rating));
    const review = clampString(req.body?.review, 2000);
    let images = [];
    try {
      images = normalizeReviewImages(req.body?.images);
    } catch (imgErr) {
      return res.status(imgErr.status || 400).json({ error: imgErr.message || 'Invalid images.' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1–5.' });
    }
    await pool.query(
      `INSERT INTO job_lifecycle (job_id,status,rating,review,updated_at)
       VALUES ($1,'completed',$2,$3,NOW())
       ON CONFLICT (job_id) DO UPDATE SET rating=$2, review=$3, updated_at=NOW()`,
      [jobId, rating, review]
    );

    // Auto-publish public site review when homeowner leaves text feedback
    if (review && review.trim().length >= 12) {
      try {
        let verified = false;
        const { rows: mjRows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1 LIMIT 1`, [jobId]);
        if (mjRows[0]) {
          verified = deriveVerifiedFixBridgeJob(mjRows[0]);
        }
        await pool.query(
          `INSERT INTO site_reviews
             (author_name, location, service_type, rating, body, verified, published, user_id, job_id, images)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9)
           ON CONFLICT DO NOTHING`,
          [
            clampString(req.authUser.name || 'Homeowner', 80),
            clampString(req.body?.location || 'United States', 80),
            clampString(req.body?.serviceType || 'Home repair', 60),
            rating,
            review.trim(),
            verified,
            req.authUser.id || null,
            Number(jobId),
            images.length ? JSON.stringify(images) : null,
          ]
        );
      } catch (pubErr) {
        console.warn('site review publish skipped:', pubErr.message);
      }
    }

    const { rows } = await pool.query('SELECT * FROM job_lifecycle WHERE job_id=$1', [jobId]);
    return res.json(rowToLifecycle(rows[0]));
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

// ── Public site reviews (Customer Trust) ──────────────────────────────────────

function parseReviewImages(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((u) => typeof u === 'string' && u.startsWith('data:image/'))
      .slice(0, 4);
  } catch {
    return [];
  }
}

function normalizeReviewImages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    if (typeof item !== 'string' || !item.startsWith('data:image/')) continue;
    if (item.length > 1_800_000) {
      throw Object.assign(new Error('One of the images is too large. Please use smaller photos.'), { status: 400 });
    }
    out.push(item);
    if (out.length >= 4) break;
  }
  return out;
}

function rowToSiteReview(r) {
  const base = serializeSiteReview(r);
  return {
    ...base,
    images: parseReviewImages(r.images),
    verifiedFixBridgeJob: base.verified === true && r.job_id != null,
  };
}

app.get('/api/reviews', async (req, res) => {
  try {
    const jobId = Number(req.query?.jobId);
    const filterJob = Number.isFinite(jobId) && jobId > 0;

    const { rows } = await pool.query(
      filterJob
        ? `SELECT id, author_name, location, service_type, rating, body, verified, published, images, created_at, job_id,
                  rating_quality, rating_communication, rating_punctuality, rating_cleanliness, rating_value, contractor_user_id
           FROM site_reviews
           WHERE published = TRUE AND job_id = $1
           ORDER BY created_at DESC
           LIMIT 10`
        : `SELECT id, author_name, location, service_type, rating, body, verified, published, images, created_at, job_id,
                  rating_quality, rating_communication, rating_punctuality, rating_cleanliness, rating_value, contractor_user_id
           FROM site_reviews
           WHERE published = TRUE
           ORDER BY created_at DESC
           LIMIT 60`,
      filterJob ? [jobId] : []
    );
    const reviews = rows.map(rowToSiteReview);
    const count = reviews.length;
    const avg =
      count === 0
        ? 0
        : Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10;
    return res.json({ ok: true, reviews, stats: { count, average: avg } });
  } catch (e) {
    console.error('reviews list:', e);
    return res.status(500).json({ ok: false, message: 'Could not load reviews.' });
  }
});

/** Verified job reviews only — identity from JWT; job must be owned + completed. */
app.post('/api/reviews', requireAuth, reviewLimiter, async (req, res) => {
  try {
    if (req.authUser.role !== 'homeowner') {
      return res.status(403).json({
        ok: false,
        code: 'HOMEOWNER_ONLY',
        message: 'Only homeowners can submit job reviews.',
      });
    }

    const jobId = Number(req.body?.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({
        ok: false,
        code: 'JOB_REQUIRED',
        message: 'A completed job is required to leave a review.',
      });
    }

    const location = clampString(req.body?.location, 80) || 'Local area';
    const body = clampString(req.body?.text || req.body?.body || req.body?.review, 2000);
    const rating = Math.round(Number(req.body?.rating));
    let images = [];
    try {
      images = normalizeReviewImages(req.body?.images);
    } catch (imgErr) {
      return res.status(imgErr.status || 400).json({ ok: false, message: imgErr.message || 'Invalid images.' });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, message: 'Rating must be 1–5 stars.' });
    }

    const access = await loadJobForReview(pool, jobId, req.authUser.id);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        code: access.code,
        message: access.message,
      });
    }

    const { rows: existing } = await pool.query(
      `SELECT id FROM site_reviews WHERE user_id=$1 AND job_id=$2 LIMIT 1`,
      [req.authUser.id, jobId]
    );
    if (existing.length) {
      return res.status(409).json({
        ok: false,
        code: 'DUPLICATE_REVIEW',
        message: 'You already submitted a review for this job.',
      });
    }

    const categories = parseCategoryRatings(req.body);
    const imagesJson = images.length ? JSON.stringify(images) : null;
    const serviceType = clampString(req.body?.serviceType || access.job.category || 'Home repair', 60);

    const row = await insertJobReview(pool, {
      job: access.job,
      homeownerUser: req.authUser,
      rating,
      body: body?.trim() || '',
      location,
      serviceType,
      imagesJson,
      categories,
    });

    await writeAudit(pool, req.authUser.id, 'job_review_created', 'managed_job', jobId, { rating, categories });

    return res.status(201).json({
      ok: true,
      review: rowToSiteReview(row),
      message: 'Thanks for your feedback.',
    });
  } catch (e) {
    if (e?.code === '23505') {
      return res.status(409).json({
        ok: false,
        code: 'DUPLICATE_REVIEW',
        message: 'You already submitted a review for this job.',
      });
    }
    console.error('reviews create:', e);
    return res.status(500).json({ ok: false, message: 'Could not publish review. Please try again.' });
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.get('/api/chat', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_chat_messages ORDER BY created_at ASC');
    const byJob = {};
    for (const r of rows) {
      const k = String(r.job_id);
      if (!byJob[k]) byJob[k] = [];
      byJob[k].push(rowToMessage(r));
    }
    return res.json(byJob);
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

app.get('/api/chat/:jobId', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const access = await getLegacyJobAccess(req.params.jobId, req.authUser);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    // Homeowners always; contractors only when assigned (or admin)
    if (
      req.authUser.role === 'contractor' &&
      !access.mutate &&
      req.authUser.role !== 'admin'
    ) {
      return res.status(403).json({ error: 'Accept the job before opening chat.' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM job_chat_messages WHERE job_id=$1 ORDER BY created_at ASC',
      [req.params.jobId]
    );
    return res.json(rows.map(rowToMessage));
  } catch (e) {
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

app.post('/api/chat/:jobId', requireAuth, async (req, res) => {
  try {
    if (!isPositiveInt(req.params.jobId)) {
      return res.status(400).json({ error: 'Invalid job id.' });
    }
    const { jobId } = req.params;
    const access = await getLegacyJobAccess(jobId, req.authUser);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    if (req.authUser.role === 'contractor' && !access.mutate) {
      return res.status(403).json({ error: 'Accept the job before chatting.' });
    }
    // Never trust client-supplied identity
    const senderRole = req.authUser.role;
    const senderName = clampString(req.authUser.name || req.authUser.email || 'User', 120);
    const text = clampString(req.body?.text, 4000);
    const imageDataUrl = req.body?.imageDataUrl;
    if (!text && !(typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:'))) {
      return res.status(400).json({ error: 'Message text or image is required.' });
    }
    if (typeof imageDataUrl === 'string' && imageDataUrl.length > 5_000_000) {
      return res.status(400).json({ error: 'Image is too large.' });
    }
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const { rows } = await pool.query(
      `INSERT INTO job_chat_messages (id,job_id,sender_role,sender_name,text,image_data_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, jobId, senderRole, senderName, text, typeof imageDataUrl === 'string' ? imageDataUrl : null]
    );
    return res.json(rowToMessage(rows[0]));
  } catch (e) {
    console.error('add message:', e);
    return res.status(500).json({ error: publicErrorMessage(e) });
  }
});

// ── Multi-provider AI assessment (Gemini / OpenAI / OpenRouter / custom) ──────
app.get('/api/ai/status', requireAuth, (_req, res) => {
  return res.json(getAiStatus());
});

app.post('/api/ai/assess', requireAuth, aiLimiter, async (req, res) => {
  try {
    const invocationId = String(req.body?.assessmentInvocationId || req.body?.invocationId || '').trim();
    if (!invocationId) {
      return res.status(400).json({
        ok: false,
        code: 'AI_ASSESSMENT_ACK_REQUIRED',
        message: 'AI assessment acknowledgment is required before continuing.',
      });
    }
    const consentCheck = checkActionConsentsFromBody(req.body, 'AI_ASSESSMENT');
    if (!consentCheck.ok) {
      return res.status(400).json({
        ok: false,
        code: consentCheck.code,
        message: 'You must acknowledge the AI assessment disclaimer before continuing.',
        missingAcceptanceTypes: consentCheck.missing,
      });
    }
    const consentResult = await validateAndRecordActionConsents(pool, req, {
      actionKey: 'AI_ASSESSMENT',
      userId: req.authUser.id,
      jobId: req.body?.jobId || null,
      idempotencyPrefix: `AI_ASSESSMENT:${req.authUser.id}:${req.body?.jobId || 'direct'}:${invocationId}`,
    });
    if (!consentResult.ok) {
      return res.status(400).json({
        ok: false,
        code: consentResult.code,
        message: consentResult.message || 'You must acknowledge the AI assessment disclaimer before continuing.',
        missingAcceptanceTypes: consentResult.missingAcceptanceTypes || consentResult.missing,
      });
    }

    const { category, description, imageDataUrl, mode } = req.body || {};
    const desc = clampString(description, 4000);
    const cat = clampString(category, 80);
    const hasImage = typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:');
    if (hasImage && imageDataUrl.length > 6_000_000) {
      return res.status(400).json({ ok: false, message: 'Image is too large.' });
    }
    if (!cat || (!desc && !hasImage)) {
      return res.status(400).json({
        ok: false,
        message: 'category and either a description or a photo are required.',
      });
    }
    // Prefer structured assessment (no invented prices). Legacy UI still receives mapped fields.
    const structured = await analyzeRepairStructured({
      category: cat,
      description: desc || 'No written description provided. Analyze the attached photo and infer the repair issue.',
      imageDataUrl: hasImage ? imageDataUrl : null,
    });
    const a = structured.assessment;
    return res.json({
      assessment: a
        ? {
            overview: a.summary,
            imageObservations: a.visual_findings,
            diagnosis: a.summary,
            likelyRootCause: '',
            professionalSteps: [],
            partsNeeded: a.materials_needed || [],
            workScope: [],
            toolsRequired: a.tools_required || [],
            diySteps: a.diy_steps || [],
            diyGuideImages: [],
            suggestions: a.immediate_safety_steps || [],
            estimatedCost: '',
            estimatedDuration: `${a.estimated_labor_hours_min}-${a.estimated_labor_hours_max} hours`,
            urgency: a.urgency,
            safetyNotes: (a.immediate_safety_steps || []).join(' '),
            professionalRecommended: a.professional_required,
            ...a,
          }
        : null,
      source: structured.source,
      model: structured.model,
      error: structured.error,
      mode: mode === 'detail' ? 'detail' : 'summary',
    });
  } catch (e) {
    console.error('ai assess:', e);
    // Persist AI failures to error_logs for admin review (spec §7)
    try {
      await pool.query(
        `INSERT INTO error_logs (source, job_id, user_id, error_code, message) VALUES ($1,$2,$3,$4,$5)`,
        ['ai_assess', req.body?.jobId || null, req.authUser?.id || null, e.code || 'UNKNOWN', String(e.message).slice(0, 500)]
      );
    } catch (_) { /* don't mask original error */ }
    return res.status(500).json({
      assessment: null,
      source: 'error',
      error: 'Assessment unavailable. Please retry or request a professional.',
    });
  }
});

  registerManagedRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, requirePermission, makeToken, rowToUser });
  registerMarketingRoutes(app, { pool, requireAuth, requireAdmin, requirePermission });
  registerGoogleAuthRoutes(app, { pool, makeToken, rowToUser, bcrypt, signupLimiter: signInLimiter, requireAuth });
  registerAssessmentProcessor(processManagedJobAssessmentTask);
  registerHomeCareProRoutes(app, { pool, requireAuth, requireAdmin });
  registerHomeCareAdminRoutes(app, { pool, requireAuth, requireAdmin });
  registerHomeAssistantRoutes(app, { pool, requireAuth });
  registerQuoteWorkspaceRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite });
  registerContractorEmployeeRoutes(app, { pool, requireAuth, requireAdmin });
registerSupportTicketRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite });
registerHomeownerAdminRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite });
registerFinanceRoutes(app, { pool, requireAuth, requireAdmin });
registerSubscriptionPlanRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite });
registerPlatformRoutes(app, {
  pool,
  requireAuth,
  requireAdmin,
  requireAdminWrite,
  requirePermission,
  getSubscriptionPlanByCode,
  makeToken,
  rowToUser,
});
registerPayoutRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite, requirePermission });
registerReferralRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite });
registerAddressRoutes(app, { requireAuth });
registerServiceAreaRoutes(app);

app.post('/api/ai/chat', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { messages, jobId } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, message: 'messages array is required.' });
    }
    if (messages.length > 40) {
      return res.status(400).json({ ok: false, message: 'Too many messages in request.' });
    }
    const normalized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: clampString(m.content, 4000) }))
      .filter((m) => m.content.length > 0)
      .slice(-20);
    if (!normalized.some((m) => m.role === 'user')) {
      return res.status(400).json({ ok: false, message: 'At least one user message is required.' });
    }

    let riskLevel = 'green';
    let assessment = null;
    let jobIdNum = null;
    if (jobId != null && req.authUser.role === 'homeowner') {
      jobIdNum = Number(jobId);
      const { rows } = await pool.query(
        `SELECT ai_assessment, diy_risk_level, description, homeowner_user_id FROM managed_jobs WHERE id=$1`,
        [jobIdNum]
      );
      const job = rows[0];
      if (!job || Number(job.homeowner_user_id) !== Number(req.authUser.id)) {
        return res.status(404).json({ ok: false, message: 'Job not found.' });
      }

      const ackOk = await requireDiySafetyAcknowledgment(pool, req, res, { jobId: jobIdNum });
      if (!ackOk) return;

      assessment = typeof job.ai_assessment === 'string' ? JSON.parse(job.ai_assessment) : job.ai_assessment;
        const lastUser = normalized.filter((m) => m.role === 'user').pop()?.content || '';
        const {
          classifyDiyRiskLevel,
          detectUserDiyStopRequest,
          detectPromptInjection,
          redSafetyReply,
          yellowStopReply,
          isEmergencyHazard,
        } = await import('./diy-safety.js');
        const { recordDiySafetyEvent } = await import('./diy-safety-events.js');

        if (detectPromptInjection(lastUser)) {
          await recordDiySafetyEvent(pool, {
            userId: req.authUser.id,
            jobId: jobIdNum,
            eventType: 'prompt_injection_blocked',
            riskLevel: 'red',
            previousRiskLevel: job.diy_risk_level,
            riskReasonCodes: ['PROMPT_INJECTION'],
            metadata: { excerpt: lastUser.slice(0, 200) },
            req,
          });
          await pool.query(`UPDATE managed_jobs SET diy_risk_level='red', updated_at=NOW() WHERE id=$1`, [jobIdNum]);
          return res.json({
            ok: true,
            reply: redSafetyReply(),
            source: 'safety_policy',
            riskLevel: 'red',
            promptInjectionBlocked: true,
            emergencyRecommended: true,
          });
        }

        const classified = classifyDiyRiskLevel(`${lastUser} ${job.description || ''}`, assessment);
        riskLevel = classified.level;

        if (detectUserDiyStopRequest(lastUser) || classified.userStopRequested) {
          await recordDiySafetyEvent(pool, {
            userId: req.authUser.id,
            jobId: jobIdNum,
            eventType: 'user_stop',
            riskLevel: 'yellow',
            previousRiskLevel: job.diy_risk_level,
            riskReasonCodes: classified.reasonCodes,
            req,
          });
          return res.json({
            ok: true,
            reply: yellowStopReply(),
            source: 'safety_policy',
            riskLevel: 'yellow',
            userStopRequested: true,
          });
        }

        if (riskLevel === 'red') {
          const escalated = job.diy_risk_level !== 'red';
          await pool.query(`UPDATE managed_jobs SET diy_risk_level='red', updated_at=NOW() WHERE id=$1`, [jobIdNum]);
          if (escalated) {
            await recordDiySafetyEvent(pool, {
              userId: req.authUser.id,
              jobId: jobIdNum,
              eventType: 'risk_escalation',
              riskLevel: 'red',
              previousRiskLevel: job.diy_risk_level,
              riskReasonCodes: classified.reasonCodes,
              metadata: { emergencyRecommended: isEmergencyHazard(classified) },
              req,
            });
          }
          return res.json({
            ok: true,
            reply: redSafetyReply(),
            source: 'safety_policy',
            riskLevel,
            escalated,
            emergencyRecommended: isEmergencyHazard(classified),
            reasonCodes: classified.reasonCodes,
          });
        }

        if (classified.level !== job.diy_risk_level) {
          await pool.query(`UPDATE managed_jobs SET diy_risk_level=$2, updated_at=NOW() WHERE id=$1`, [
            jobIdNum,
            classified.level,
          ]);
          if (classified.level === 'yellow' && job.diy_risk_level === 'green') {
            await recordDiySafetyEvent(pool, {
              userId: req.authUser.id,
              jobId: jobIdNum,
              eventType: 'risk_escalation',
              riskLevel: 'yellow',
              previousRiskLevel: job.diy_risk_level,
              riskReasonCodes: classified.reasonCodes,
              req,
            });
          }
        }
    }

    const result = await chatWithCustomer({ messages: normalized, riskLevel, assessment });
    return res.json({ ...result, riskLevel });
  } catch (e) {
    console.error('ai chat:', e);
    return res.status(500).json({
      reply: null,
      source: 'error',
      error: 'Chat unavailable. Please try again.',
    });
  }
});

app.get('/api/health', async (_req, res) => {
  const production = isDeployedProduction();
  let dbOk = true;
  if (!useInMemoryDb) {
    try {
      await pool.query('SELECT 1');
    } catch {
      dbOk = false;
    }
  }
  let reminders = null;
  try {
    reminders = await getReminderSchedulerStatus(pool);
  } catch {
    reminders = { deliveryConfigured: false };
  }
  res.json({
    ok: dbOk,
    service: 'fixbridge-api',
    version: process.env.npm_package_version || '0.0.2',
    build: process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.FIXBRIDGE_HOSTING || null,
    env: production ? 'production' : 'development',
    database: useInMemoryDb ? 'memory' : dbOk ? 'neon' : 'neon_unreachable',
    stripeConfigured: stripeConfigured(),
    gmail: mailStatus(),
    paymentsSimulateAllowed: !production && !stripeConfigured(),
    demoSeedAllowed: allowDemoSeed(),
    reminders,
  });
});

app.get('/api/admin/production-config', requireAuth, requireAdmin, requirePermission('settings.view'), (_req, res) => {
  const production = isProduction;
  const appUrl = (process.env.APP_URL || process.env.URL || '').trim();
  const fromEmail = EMAIL_FROM_ADDRESS;
  const replyTo = EMAIL_REPLY_TO;
  const classify = (ok, invalid = false) => {
    if (invalid) return 'INVALID_FORMAT';
    if (!ok) return 'MISSING';
    return 'PRESENT';
  };
  const appUrlInvalid = Boolean(appUrl) && /localhost|127\.0\.0\.1|\.example\.com/i.test(appUrl);
  const emailInvalid = Boolean(fromEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail);
  const replyInvalid = Boolean(replyTo) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);
  const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const stripeInvalid = Boolean(stripeKey) && !/^sk_(test|live)_/.test(stripeKey);
  const googleRaw = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const googleId = googleRaw && /^[\w-]+\.apps\.googleusercontent\.com$/i.test(googleRaw) && !/^GOCSPX-/i.test(googleRaw)
    ? googleRaw
    : '';
  const googleIdInvalid = Boolean(googleRaw) && !googleId;
  const checks = [
    { key: 'SESSION_SECRET', status: classify(Boolean(process.env.SESSION_SECRET)), required: production },
    { key: 'NEON_DATABASE_URL', status: classify(Boolean(process.env.NEON_DATABASE_URL)), required: production },
    { key: 'STRIPE_SECRET_KEY', status: classify(stripeConfigured(), stripeInvalid), required: production },
    { key: 'STRIPE_WEBHOOK_SECRET', status: classify(Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())), required: production },
    { key: 'APP_URL', status: classify(Boolean(appUrl), production && appUrlInvalid), required: production, localhost: appUrlInvalid },
    { key: 'FIXBRIDGE_FROM_EMAIL', status: classify(Boolean(fromEmail), emailInvalid), required: false },
    { key: 'FIXBRIDGE_REPLY_TO_EMAIL', status: classify(Boolean(replyTo), replyInvalid), required: false },
    { key: 'EMAIL_CREDENTIALS', status: classify(mailStatus().configured), required: false },
    { key: 'USPS', status: classify(uspsConfigured()), required: false },
    { key: 'GOOGLE_CLIENT_ID', status: classify(Boolean(googleId), googleIdInvalid), required: false },
    { key: 'ATTACHMENT_STORAGE_PROVIDER', status: classify(true), required: false },
    { key: 'demo_seed_disabled_in_prod', status: classify(production ? !allowDemoSeed() : true), required: true },
    { key: 'ssl_reject_unauthorized', status: classify(postgresSslOptions().rejectUnauthorized === true || !production), required: production },
  ].map((c) => ({ ...c, ok: c.status === 'PRESENT' }));
  const missingRequired = checks.filter((c) => c.required && c.status !== 'PRESENT').map((c) => c.key);
  res.json({
    ok: missingRequired.length === 0,
    production,
    checks,
    missingRequired,
    note: 'Secret values are never returned — only presence flags.',
  });
});

export default app;
