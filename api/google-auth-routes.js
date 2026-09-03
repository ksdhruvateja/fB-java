/**
 * Google Identity Services — server-verified sign-in for homeowners, contractors, and admins.
 * Uses GOOGLE_CLIENT_ID (never expose GOOGLE_CLIENT_SECRET to the frontend).
 */

import { recordSignupMarketingConsents } from './marketing-consent-service.js';
import { checkActionConsentsFromBody, validateAndRecordActionConsents } from './homeowner-consent.js';
import { applyReferralCode, ensureReferralCode } from './referrals.js';
import { syncUserHomeCareEntitlement, toPublicHomeCareSubscriptionDto } from './subscription-state.js';

function looksLikeGoogleWebClientId(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^GOCSPX-/i.test(v)) return false;
  if (/^(sk_|pk_|whsec_|rk_)/i.test(v)) return false;
  return /^[\w-]+\.apps\.googleusercontent\.com$/i.test(v) && !v.toLowerCase().startsWith('gocspx-');
}

function googleClientId() {
  const raw =
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    '';
  if (!raw) return '';
  if (!looksLikeGoogleWebClientId(raw)) {
    console.warn('[google-auth] GOOGLE_CLIENT_ID is not a valid GIS client ID; ignoring.');
    return '';
  }
  return raw;
}

export function isGoogleOAuthConfigured() {
  return Boolean(googleClientId());
}

/** Public GIS client ID only — never returns secret-shaped or invalid values. */
export function getPublicGoogleClientId() {
  return googleClientId() || null;
}

/** Safe public OAuth status for browser clients. Omits clientId when disabled. */
export function getPublicGoogleOAuthStatus() {
  const clientId = getPublicGoogleClientId();
  const enabled = Boolean(clientId);
  if (!enabled) {
    return {
      ok: true,
      googleOAuthEnabled: false,
      configured: false,
    };
  }
  return {
    ok: true,
    googleOAuthEnabled: true,
    configured: true,
    clientId,
  };
}

async function verifyGoogleIdToken(idToken) {
  const clientId = googleClientId();
  if (!clientId || !idToken) return null;

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) return null;
  const data = await res.json();

  const aud = data.aud;
  if (aud !== clientId) return null;

  const iss = String(data.iss || '');
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') return null;

  const exp = Number(data.exp);
  if (Number.isFinite(exp) && exp * 1000 < Date.now()) return null;

  const emailVerified = data.email_verified === true || data.email_verified === 'true';
  if (!emailVerified) return null;

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) return null;

  return {
    sub: String(data.sub || ''),
    email,
    name: data.name || data.given_name || email.split('@')[0] || 'User',
    givenName: data.given_name || null,
    familyName: data.family_name || null,
    picture: data.picture || null,
  };
}

function assertAccountActive(user, res) {
  if (!user) return false;
  if (user.is_blocked === true) {
    res.status(403).json({
      ok: false,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This account is not active. Contact support if you need help.',
    });
    return false;
  }
  const compliance = String(user.compliance_status || '').toLowerCase();
  if (
    user.role === 'contractor' &&
    ['suspended', 'rejected', 'blocked'].includes(compliance)
  ) {
    res.status(403).json({
      ok: false,
      code: 'ACCOUNT_SUSPENDED',
      message: 'This contractor account is suspended or not eligible to sign in.',
    });
    return false;
  }
  return true;
}

async function findUserByGoogleIdentity(pool, { role, googleUser }) {
  const { rows: bySub } = await pool.query(
    `SELECT * FROM users WHERE oauth_google_sub=$1 LIMIT 1`,
    [googleUser.sub]
  );
  if (bySub[0]) {
    if (role && bySub[0].role !== role) {
      return { conflict: 'PROVIDER_LINKED_OTHER_ROLE', user: bySub[0] };
    }
    return { user: bySub[0] };
  }

  const { rows: byEmail } = await pool.query(
    `SELECT * FROM users WHERE role=$1 AND LOWER(email)=LOWER($2) LIMIT 1`,
    [role, googleUser.email]
  );
  if (byEmail[0]) return { user: byEmail[0] };

  return { user: null };
}

async function linkGoogleToUser(pool, user, googleUser) {
  await pool.query(
    `UPDATE users SET
       oauth_google_sub=COALESCE(oauth_google_sub, $2),
       google_avatar_url=COALESCE(google_avatar_url, $3),
       signup_method=COALESCE(signup_method, 'google'),
       updated_at=NOW()
     WHERE id=$1`,
    [user.id, googleUser.sub, googleUser.picture]
  );
  const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [user.id]);
  return rows[0];
}

async function recordGoogleLogin(pool, userId) {
  await pool.query(`UPDATE users SET updated_at=NOW() WHERE id=$1`, [userId]);
}

async function finalizeHomeownerUser(pool, user, rowToUser) {
  await ensureReferralCode(pool, user);
  let homeCareSubscription = null;
  const subState = await syncUserHomeCareEntitlement(pool, user.id);
  homeCareSubscription = toPublicHomeCareSubscriptionDto(subState);
  const clientUser = rowToUser(user, { homeCareSubscription });
  if (homeCareSubscription) {
    clientUser.planCode = homeCareSubscription.isPro ? homeCareSubscription.planCode : null;
  }
  return clientUser;
}

async function handleHomeownerGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt }) {
  const found = await findUserByGoogleIdentity(pool, { role: 'homeowner', googleUser });
  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE') {
    return res.status(409).json({
      ok: false,
      code: 'GOOGLE_ALREADY_LINKED',
      message: 'This Google account is already connected to another FixBridge account.',
    });
  }

  let user = found.user;
  let isNew = false;
  let needsOnboarding = false;

  if (user) {
    if (!assertAccountActive(user, res)) return;
    user = await linkGoogleToUser(pool, user, googleUser);
    needsOnboarding = !user.marketing_preferences_collected_at;
  } else {
    const accountConsent = checkActionConsentsFromBody(req.body, 'ACCOUNT_SIGNUP');
    if (!accountConsent.ok) {
      return res.status(400).json({
        ok: false,
        code: 'CONSENT_REQUIRED',
        message: 'You must agree to the FixBridge Terms of Service and Privacy Policy.',
        missingAcceptanceTypes: accountConsent.missing,
        googleProfile: { email: googleUser.email, name: googleUser.name, picture: googleUser.picture },
      });
    }

    const phone = String(req.body?.phone || '').trim() || null;
    const randomPass = `GOOGLE_OAUTH_${googleUser.sub}`;
    const hashed = await bcrypt.hash(randomPass, 10);
    const referredByCode =
      typeof req.body?.referredByCode === 'string' && req.body.referredByCode.trim()
        ? req.body.referredByCode.trim().toUpperCase()
        : null;

    const { rows: inserted } = await pool.query(
      `INSERT INTO users (
         role, name, email, password, phone, oauth_google_sub, google_avatar_url, signup_method, referred_by_code
       ) VALUES ('homeowner', $1, $2, $3, $4, $5, $6, 'google', $7)
       RETURNING *`,
      [googleUser.name, googleUser.email, hashed, phone, googleUser.sub, googleUser.picture, referredByCode]
    );
    user = inserted[0];
    isNew = true;
    needsOnboarding = true;

    await validateAndRecordActionConsents(pool, req, {
      actionKey: 'ACCOUNT_SIGNUP',
      userId: user.id,
      idempotencyPrefix: `google-signup:${user.id}`,
    });

    try {
      if (referredByCode) {
        await applyReferralCode(pool, user.id, referredByCode, { actorId: user.id });
      }
      await ensureReferralCode(pool, user);
    } catch (refErr) {
      console.error('google signup referral:', refErr?.message || refErr);
    }

    const emailOptIn = req.body?.marketingEmailOptIn === true;
    const smsOptIn = req.body?.marketingSmsOptIn === true;
    if (emailOptIn || smsOptIn) {
      await recordSignupMarketingConsents(pool, {
        userId: user.id,
        emailOptIn,
        smsOptIn,
        source: 'google_signup',
        req,
      });
      needsOnboarding = false;
    }
  }

  await recordGoogleLogin(pool, user.id);
  const clientUser = await finalizeHomeownerUser(pool, user, rowToUser);
  const token = makeToken(clientUser, { authStage: 'complete' });

  return res.json({
    ok: true,
    token,
    user: clientUser,
    isNew,
    needsMarketingOnboarding: needsOnboarding,
    googleProfile: { email: googleUser.email, name: googleUser.name },
  });
}

async function handleContractorGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt }) {
  const intent = String(req.body?.intent || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';
  const found = await findUserByGoogleIdentity(pool, { role: 'contractor', googleUser });

  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE') {
    return res.status(409).json({
      ok: false,
      code: 'GOOGLE_ALREADY_LINKED',
      message: 'This Google account is already connected to another FixBridge account.',
    });
  }

  let user = found.user;

  if (user) {
    if (!assertAccountActive(user, res)) return;
    user = await linkGoogleToUser(pool, user, googleUser);
    await recordGoogleLogin(pool, user.id);
    const clientUser = rowToUser(user);
    return res.json({
      ok: true,
      token: makeToken(clientUser, { authStage: 'complete' }),
      user: clientUser,
      isNew: false,
      needsContractorApplication: false,
    });
  }

  if (intent === 'login') {
    return res.status(404).json({
      ok: false,
      code: 'ACCOUNT_NOT_FOUND',
      message: 'No contractor account found for this Google email. Apply to join FixBridge first.',
    });
  }

  if (req.body?.agreeContractorAgreementV4 !== true) {
    return res.status(400).json({
      ok: false,
      code: 'CONTRACTOR_AGREEMENT_REQUIRED',
      message: 'You must accept the FixBridge Contractor Agreement before continuing with Google.',
    });
  }

  const randomPass = `GOOGLE_OAUTH_${googleUser.sub}`;
  const hashed = await bcrypt.hash(randomPass, 10);
  const { rows: inserted } = await pool.query(
    `INSERT INTO users (
       role, name, email, password, oauth_google_sub, google_avatar_url, signup_method, compliance_status
     ) VALUES ('contractor', $1, $2, $3, $4, $5, 'google', 'draft')
     RETURNING *`,
    [googleUser.name, googleUser.email, hashed, googleUser.sub, googleUser.picture]
  );
  user = inserted[0];

  try {
    const { recordContractorAgreementAcceptance } = await import('./contractor-agreement.js');
    const { AGREEMENT_V4_TITLE, AGREEMENT_V4_VERSION } = await import('./contractor-agreement-content.js');
    await recordContractorAgreementAcceptance(pool, {
      contractorUserId: user.id,
      documentVersion: AGREEMENT_V4_VERSION,
      documentTitle: AGREEMENT_V4_TITLE,
      req,
      sourceRoute: req.originalUrl || '/api/auth/google',
    });
  } catch (agrErr) {
    console.error('google contractor agreement:', agrErr);
  }

  try {
    const { ensureComplianceDocuments } = await import('./contractor-compliance.js');
    await ensureComplianceDocuments(pool, user.id);
  } catch (complianceErr) {
    console.error('google contractor compliance seed:', complianceErr);
  }

  await recordGoogleLogin(pool, user.id);
  const clientUser = rowToUser(user);
  return res.json({
    ok: true,
    token: makeToken(clientUser, { authStage: 'complete' }),
    user: clientUser,
    isNew: true,
    needsContractorApplication: true,
    googleProfile: {
      email: googleUser.email,
      name: googleUser.name,
      givenName: googleUser.givenName,
      familyName: googleUser.familyName,
    },
  });
}

async function handleAdminGoogle(pool, req, res, { googleUser, makeToken, rowToUser }) {
  const found = await findUserByGoogleIdentity(pool, { role: 'admin', googleUser });

  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE') {
    return res.status(409).json({
      ok: false,
      code: 'GOOGLE_ALREADY_LINKED',
      message: 'This Google account is already connected to another FixBridge account.',
    });
  }

  const user = found.user;
  if (!user) {
    return res.status(403).json({
      ok: false,
      code: 'ADMIN_NOT_AUTHORIZED',
      message: 'This Google account is not authorized for FixBridge Admin.',
    });
  }

  if (!assertAccountActive(user, res)) return;

  const linked = await linkGoogleToUser(pool, user, googleUser);
  await recordGoogleLogin(pool, linked.id);
  const clientUser = rowToUser(linked);

  return res.json({
    ok: true,
    mfaRequired: true,
    token: makeToken(clientUser, { authStage: 'mfa_pending', expiresIn: '15m' }),
    user: clientUser,
    message: 'Google identity verified. Complete MFA to finish sign-in.',
  });
}

export function registerGoogleAuthRoutes(app, {
  pool,
  makeToken,
  rowToUser,
  bcrypt,
  signupLimiter,
  requireAuth,
}) {
  app.post('/api/auth/google', signupLimiter, async (req, res) => {
    try {
      if (!isGoogleOAuthConfigured()) {
        return res.status(503).json({ ok: false, message: 'Google sign-in is not configured.' });
      }

      const idToken = String(req.body?.credential || req.body?.idToken || '').trim();
      if (!idToken) {
        return res.status(400).json({ ok: false, message: 'Google credential is required.' });
      }

      const googleUser = await verifyGoogleIdToken(idToken);
      if (!googleUser?.sub) {
        return res.status(401).json({ ok: false, message: 'We could not sign you in with Google. Please try again.' });
      }

      const role = String(req.body?.role || 'homeowner').toLowerCase();
      if (role === 'contractor') {
        return handleContractorGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt });
      }
      if (role === 'admin') {
        return handleAdminGoogle(pool, req, res, { googleUser, makeToken, rowToUser });
      }
      return handleHomeownerGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt });
    } catch (e) {
      console.error('google auth:', e);
      res.status(500).json({ ok: false, message: 'We could not sign you in with Google. Please try again.' });
    }
  });

  app.post('/api/auth/google/marketing-preferences', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }

      const emailOptIn = req.body?.marketingEmailOptIn === true;
      const smsOptIn = req.body?.marketingSmsOptIn === true;

      await recordSignupMarketingConsents(pool, {
        userId: req.authUser.id,
        emailOptIn,
        smsOptIn,
        source: 'google_signup',
        req,
      });

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not save preferences.' });
    }
  });

  app.get('/api/auth/google/linked', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT oauth_google_sub, google_avatar_url, signup_method, email, password
         FROM users WHERE id=$1`,
        [req.authUser.id]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ ok: false, message: 'User not found.' });
      const hasPassword = String(row.signup_method || 'email') !== 'google';
      res.json({
        ok: true,
        google: {
          connected: Boolean(row.oauth_google_sub),
          email: row.oauth_google_sub ? row.email : null,
          avatarUrl: row.google_avatar_url || null,
        },
        password: { enabled: hasPassword },
        signupMethod: row.signup_method || 'email',
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load sign-in methods.' });
    }
  });
}
