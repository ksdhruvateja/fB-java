/**
 * Channel-specific marketing consent — FixBridge is the source of truth.
 * Email and SMS promotional consent are tracked independently.
 */

import crypto from 'crypto';

export const MARKETING_CHANNELS = ['email', 'sms'];

const CONSENT_VERSION = '2.0';

function requestMeta(req) {
  return {
    ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.socket?.remoteAddress || null,
    userAgent: req?.headers?.['user-agent'] || null,
    sourceRoute: req?.originalUrl || req?.url || null,
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function generateUnsubscribeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function getMarketingPreferences(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, role, name, email, phone,
            marketing_email_opt_in, marketing_sms_opt_in,
            marketing_email_opt_in_at, marketing_sms_opt_in_at,
            marketing_email_opt_out_at, marketing_sms_opt_out_at,
            marketing_preferences_collected_at,
            marketing_consent, marketing_consent_at, marketing_opt_out_at,
            signup_method, oauth_google_sub
     FROM users WHERE id=$1`,
    [userId]
  );
  const u = rows[0];
  if (!u) return null;
  return {
    userId: Number(u.id),
    email: u.email,
    phone: u.phone,
    name: u.name,
    signupMethod: u.signup_method || 'email',
    preferencesCollected: Boolean(u.marketing_preferences_collected_at),
    emailMarketing: {
      subscribed: u.marketing_email_opt_in === true,
      optedInAt: u.marketing_email_opt_in_at,
      optedOutAt: u.marketing_email_opt_out_at,
    },
    smsMarketing: {
      subscribed: u.marketing_sms_opt_in === true,
      optedInAt: u.marketing_sms_opt_in_at,
      optedOutAt: u.marketing_sms_opt_out_at,
    },
    legacyMarketingConsent: u.marketing_consent === true,
  };
}

export async function recordMarketingChannelConsent(pool, {
  userId,
  channel,
  optedIn,
  source,
  req = null,
  adminUserId = null,
  consentVersion = CONSENT_VERSION,
}) {
  const ch = String(channel || '').toLowerCase();
  if (!MARKETING_CHANNELS.includes(ch)) {
    throw new Error(`Invalid marketing channel: ${channel}`);
  }

  const rm = requestMeta(req);
  const action = optedIn === true ? 'opt_in' : 'opt_out';

  await pool.query(
    `INSERT INTO marketing_consent_events (
       user_id, channel, action, consented, channels, consent_version,
       source, admin_user_id, ip_address, user_agent, source_route
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      userId,
      ch,
      action,
      optedIn === true,
      JSON.stringify([ch]),
      consentVersion,
      source || 'unknown',
      adminUserId,
      rm.ipAddress,
      rm.userAgent,
      rm.sourceRoute,
    ]
  );

  if (ch === 'email') {
    await pool.query(
      `UPDATE users SET
         marketing_email_opt_in=$2,
         marketing_email_opt_in_at=CASE WHEN $2 THEN NOW() ELSE marketing_email_opt_in_at END,
         marketing_email_opt_out_at=CASE WHEN $2 THEN NULL ELSE NOW() END,
         marketing_preferences_collected_at=COALESCE(marketing_preferences_collected_at, NOW())
       WHERE id=$1`,
      [userId, optedIn === true]
    );
  } else if (ch === 'sms') {
    await pool.query(
      `UPDATE users SET
         marketing_sms_opt_in=$2,
         marketing_sms_opt_in_at=CASE WHEN $2 THEN NOW() ELSE marketing_sms_opt_in_at END,
         marketing_sms_opt_out_at=CASE WHEN $2 THEN NULL ELSE NOW() END,
         marketing_preferences_collected_at=COALESCE(marketing_preferences_collected_at, NOW())
       WHERE id=$1`,
      [userId, optedIn === true]
    );
  }

  // Legacy combined flag for backward compatibility
  const prefs = await getMarketingPreferences(pool, userId);
  const anyOn = prefs?.emailMarketing?.subscribed || prefs?.smsMarketing?.subscribed;
  await pool.query(
    `UPDATE users SET
       marketing_consent=$2,
       marketing_consent_at=CASE WHEN $2 THEN COALESCE(marketing_consent_at, NOW()) ELSE marketing_consent_at END,
       marketing_opt_out_at=CASE WHEN $2 THEN NULL ELSE COALESCE(marketing_opt_out_at, NOW()) END,
       marketing_consent_version=$3
     WHERE id=$1`,
    [userId, anyOn, consentVersion]
  );

  return getMarketingPreferences(pool, userId);
}

export async function recordSignupMarketingConsents(pool, {
  userId,
  emailOptIn = false,
  smsOptIn = false,
  source = 'signup',
  req = null,
}) {
  if (emailOptIn) {
    await recordMarketingChannelConsent(pool, {
      userId,
      channel: 'email',
      optedIn: true,
      source,
      req,
    });
  }
  if (smsOptIn) {
    await recordMarketingChannelConsent(pool, {
      userId,
      channel: 'sms',
      optedIn: true,
      source,
      req,
    });
  }
  await pool.query(
    `UPDATE users SET marketing_preferences_collected_at=NOW() WHERE id=$1`,
    [userId]
  );
  return getMarketingPreferences(pool, userId);
}

export async function updateMarketingPreferences(pool, {
  userId,
  emailOptIn,
  smsOptIn,
  source,
  req = null,
  adminUserId = null,
}) {
  const current = await getMarketingPreferences(pool, userId);
  if (!current) throw new Error('User not found');

  if (typeof emailOptIn === 'boolean' && emailOptIn !== current.emailMarketing.subscribed) {
    await recordMarketingChannelConsent(pool, {
      userId,
      channel: 'email',
      optedIn: emailOptIn,
      source,
      req,
      adminUserId,
    });
  }
  if (typeof smsOptIn === 'boolean' && smsOptIn !== current.smsMarketing.subscribed) {
    await recordMarketingChannelConsent(pool, {
      userId,
      channel: 'sms',
      optedIn: smsOptIn,
      source,
      req,
      adminUserId,
    });
  }
  await pool.query(
    `UPDATE users SET marketing_preferences_collected_at=NOW() WHERE id=$1`,
    [userId]
  );
  return getMarketingPreferences(pool, userId);
}

/** Admin may only opt OUT — never opt in without customer consent. */
export async function adminUnsubscribeMarketing(pool, {
  userId,
  channels = ['email', 'sms'],
  adminUserId,
  req,
}) {
  const results = [];
  for (const ch of channels) {
    if (!MARKETING_CHANNELS.includes(ch)) continue;
    results.push(
      await recordMarketingChannelConsent(pool, {
        userId,
        channel: ch,
        optedIn: false,
        source: 'admin_customer_request',
        req,
        adminUserId,
      })
    );
  }
  return results[results.length - 1] || getMarketingPreferences(pool, userId);
}

export async function createUnsubscribeToken(pool, userId, channel = 'email') {
  const token = generateUnsubscribeToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO marketing_unsubscribe_tokens (user_id, channel, token_hash, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [userId, channel, tokenHash, expiresAt]
  );
  return token;
}

export async function processUnsubscribeToken(pool, token, { channel = 'email', req = null } = {}) {
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT * FROM marketing_unsubscribe_tokens
     WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return { ok: false, code: 'INVALID_TOKEN' };

  const ch = row.channel || channel;
  await pool.query(`UPDATE marketing_unsubscribe_tokens SET used_at=NOW() WHERE id=$1`, [row.id]);

  await recordMarketingChannelConsent(pool, {
    userId: row.user_id,
    channel: ch,
    optedIn: false,
    source: ch === 'sms' ? 'sms_stop' : 'unsubscribe_link',
    req,
  });

  return { ok: true, userId: row.user_id, channel: ch };
}

export async function listMarketingSubscribers(pool, { q = '', channel = '', limit = 100, offset = 0 } = {}) {
  const clauses = [`u.role='homeowner'`, `(u.marketing_email_opt_in=true OR u.marketing_sms_opt_in=true)`];
  const params = [];
  let paramIdx = 1;

  if (channel === 'email') clauses.push(`u.marketing_email_opt_in=true`);
  if (channel === 'sms') clauses.push(`u.marketing_sms_opt_in=true`);
  if (channel === 'both') {
    clauses.push(`u.marketing_email_opt_in=true`);
    clauses.push(`u.marketing_sms_opt_in=true`);
  }

  const needle = String(q || '').trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  if (needle) {
    clauses.push(`(
      LOWER(u.name) LIKE $${paramIdx}
      OR LOWER(u.email) LIKE $${paramIdx}
      OR CAST(u.id AS TEXT) = $${paramIdx + 1}
      ${digits ? `OR regexp_replace(COALESCE(u.phone,''), '[^0-9]', '', 'g') LIKE $${paramIdx + 2}` : ''}
    )`);
    params.push(`%${needle}%`, needle, digits ? `%${digits}%` : null);
    paramIdx += digits ? 3 : 2;
  }

  params.push(limit, offset);
  const limitParam = paramIdx;
  const offsetParam = paramIdx + 1;

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at, u.signup_method, u.plan_code,
            u.marketing_email_opt_in, u.marketing_sms_opt_in,
            u.marketing_email_opt_in_at, u.marketing_sms_opt_in_at,
            u.marketing_email_opt_out_at, u.marketing_sms_opt_out_at,
            u.marketing_preferences_collected_at,
            (SELECT mce.source FROM marketing_consent_events mce
             WHERE mce.user_id=u.id AND mce.action='opt_in'
             ORDER BY mce.created_at DESC LIMIT 1) AS last_consent_source
     FROM users u
     WHERE ${clauses.join(' AND ')}
     ORDER BY u.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    email: r.email,
    phone: r.phone || null,
    signupMethod: r.signup_method || 'email',
    planCode: r.plan_code,
    createdAt: r.created_at,
    emailMarketing: r.marketing_email_opt_in === true,
    smsMarketing: r.marketing_sms_opt_in === true,
    emailOptInAt: r.marketing_email_opt_in_at,
    smsOptInAt: r.marketing_sms_opt_in_at,
    emailOptOutAt: r.marketing_email_opt_out_at,
    smsOptOutAt: r.marketing_sms_opt_out_at,
    lastConsentSource: r.last_consent_source,
    preferencesCollectedAt: r.marketing_preferences_collected_at,
    unsubscribeStatus:
      r.marketing_email_opt_out_at || r.marketing_sms_opt_out_at ? 'partial_or_full' : 'active',
  }));
}

export async function listAllCustomers(pool, { q = '', limit = 100, offset = 0 } = {}) {
  const clauses = [`u.role='homeowner'`];
  const params = [];
  let paramIdx = 1;

  const needle = String(q || '').trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  if (needle) {
    clauses.push(`(
      LOWER(u.name) LIKE $${paramIdx}
      OR LOWER(u.email) LIKE $${paramIdx}
      OR CAST(u.id AS TEXT) = $${paramIdx + 1}
      ${digits ? `OR regexp_replace(COALESCE(u.phone,''), '[^0-9]', '', 'g') LIKE $${paramIdx + 2}` : ''}
    )`);
    params.push(`%${needle}%`, needle, digits ? `%${digits}%` : null);
    paramIdx += digits ? 3 : 2;
  }

  params.push(limit, offset);
  const limitParam = paramIdx;
  const offsetParam = paramIdx + 1;

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at, u.signup_method, u.plan_code,
            u.is_blocked, u.marketing_email_opt_in, u.marketing_sms_opt_in,
            (SELECT COUNT(*)::int FROM properties hp WHERE hp.owner_user_id=u.id) AS property_count,
            (SELECT MAX(mj.updated_at) FROM managed_jobs mj WHERE mj.homeowner_user_id=u.id) AS last_job_activity
     FROM users u
     WHERE ${clauses.join(' AND ')}
     ORDER BY u.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    email: r.email,
    phone: r.phone || null,
    signupMethod: r.signup_method || 'email',
    planCode: r.plan_code,
    accountStatus: r.is_blocked ? 'blocked' : 'active',
    createdAt: r.created_at,
    propertyCount: Number(r.property_count) || 0,
    lastActivity: r.last_job_activity,
    emailMarketing: r.marketing_email_opt_in === true,
    smsMarketing: r.marketing_sms_opt_in === true,
    marketingSummary:
      r.marketing_email_opt_in && r.marketing_sms_opt_in
        ? 'Email + SMS'
        : r.marketing_email_opt_in
          ? 'Email'
          : r.marketing_sms_opt_in
            ? 'SMS'
            : 'None',
  }));
}

/** Migrate legacy marketing_consent=true to email opt-in on boot. */
export async function migrateLegacyMarketingConsent(pool) {
  await pool.query(`
    UPDATE users SET marketing_email_opt_in=true, marketing_email_opt_in_at=marketing_consent_at
    WHERE role='homeowner' AND marketing_consent=true AND marketing_email_opt_in IS NOT TRUE
  `);
}
