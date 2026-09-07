/**
 * Google Identity Services — server-verified sign-in for homeowners, contractors, and admins.
 * Uses GOOGLE_CLIENT_ID (never expose GOOGLE_CLIENT_SECRET to the frontend).
 *
 * Architecture: GIS ID-token (credential) posted to POST /api/auth/google — not auth-code redirect.
 */

import { recordSignupMarketingConsents } from './marketing-consent-service.js';
import { checkActionConsentsFromBody, validateAndRecordActionConsents } from './homeowner-consent.js';
import { applyReferralCode, ensureReferralCode } from './referrals.js';
import { syncUserHomeCareEntitlement, toPublicHomeCareSubscriptionDto } from './subscription-state.js';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

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

function oauthLog(event, fields = {}) {
  // Never log tokens / secrets — only opaque correlation + safe metadata.
  const safe = { ...fields };
  delete safe.credential;
  delete safe.idToken;
  delete safe.token;
  delete safe.accessToken;
  delete safe.refreshToken;
  delete safe.password;
  console.info(JSON.stringify({ scope: 'oauth_google', event, ts: new Date().toISOString(), ...safe }));
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

/**
 * Server-side Google ID token verification via Google's tokeninfo endpoint.
 * Validates audience, issuer, expiration, and email_verified before trusting identity.
 */
async function verifyGoogleIdToken(idToken, { requestId } = {}) {
  const clientId = googleClientId();
  if (!clientId || !idToken) return { ok: false, reason: 'missing' };

  let res;
  try {
    res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
  } catch (err) {
    oauthLog('oauth_google_invalid_token', {
      requestId,
      reason: 'tokeninfo_network',
      detail: err?.message || 'network',
    });
    return { ok: false, reason: 'network' };
  }

  if (!res.ok) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'tokeninfo_http', status: res.status });
    return { ok: false, reason: 'invalid' };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'tokeninfo_parse' });
    return { ok: false, reason: 'invalid' };
  }

  const aud = data.aud;
  if (aud !== clientId) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'wrong_audience' });
    return { ok: false, reason: 'wrong_audience' };
  }

  const iss = String(data.iss || '');
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'wrong_issuer' });
    return { ok: false, reason: 'wrong_issuer' };
  }

  const exp = Number(data.exp);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'expired' });
    return { ok: false, reason: 'expired' };
  }

  const emailVerified = data.email_verified === true || data.email_verified === 'true';
  if (!emailVerified) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'email_unverified' });
    return { ok: false, reason: 'email_unverified' };
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!email) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'missing_email' });
    return { ok: false, reason: 'missing_email' };
  }

  const sub = String(data.sub || '').trim();
  if (!sub) {
    oauthLog('oauth_google_invalid_token', { requestId, reason: 'missing_sub' });
    return { ok: false, reason: 'missing_sub' };
  }

  return {
    ok: true,
    user: {
      sub,
      email,
      name: data.name || data.given_name || email.split('@')[0] || 'User',
      givenName: data.given_name || null,
      familyName: data.family_name || null,
      picture: data.picture || null,
    },
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

function pendingSecret() {
  return String(process.env.SESSION_SECRET || '').trim();
}

function googleProfileDto(googleUser) {
  return {
    email: googleUser.email,
    name: googleUser.name,
    givenName: googleUser.givenName,
    familyName: googleUser.familyName,
    picture: googleUser.picture || null,
  };
}

/** Short-lived server-signed pending signup. Identity comes from the verified Google token, not the client. */
function signPendingGoogleSignup(googleUser, targetRole) {
  const secret = pendingSecret();
  if (!secret) return null;
  return jwt.sign(
    {
      typ: 'google_pending',
      provider: 'google',
      providerUserId: googleUser.sub,
      email: googleUser.email,
      firstName: googleUser.givenName,
      lastName: googleUser.familyName,
      name: googleUser.name,
      picture: googleUser.picture || null,
      targetRole,
    },
    secret,
    { expiresIn: '15m', algorithm: 'HS256' }
  );
}

function readPendingGoogleSignup(token, targetRole) {
  const secret = pendingSecret();
  const raw = String(token || '').trim();
  if (!secret || !raw) return null;
  try {
    const data = jwt.verify(raw, secret, { algorithms: ['HS256'] });
    if (data?.typ !== 'google_pending' || data.provider !== 'google') return null;
    if (targetRole && data.targetRole !== targetRole) return null;
    const email = String(data.email || '').trim().toLowerCase();
    const sub = String(data.providerUserId || '').trim();
    if (!email || !sub) return null;
    return {
      sub,
      email,
      name: data.name || [data.firstName, data.lastName].filter(Boolean).join(' ') || email.split('@')[0],
      givenName: data.firstName || null,
      familyName: data.lastName || null,
      picture: data.picture || null,
    };
  } catch {
    return null;
  }
}

function portalLabel(role) {
  if (role === 'contractor') return 'Contractor portal';
  if (role === 'admin') return 'Admin sign-in';
  return 'Homeowner portal';
}

function rejectPortalMismatch(res, { requestId, role, existingRole }) {
  oauthLog('oauth_google_role_rejected', {
    requestId,
    role,
    code: 'ROLE_PORTAL_MISMATCH',
    existingRole,
  });
  return res.status(409).json({
    ok: false,
    code: 'ROLE_PORTAL_MISMATCH',
    existingRole,
    message: `This Google account is associated with a FixBridge ${existingRole} account. Sign in on the ${portalLabel(existingRole)} instead.`,
  });
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

  // Same email on another portal is a different user row, but one Google `sub` can only
  // belong to one FixBridge account. Do not create a second identity from the other portal.
  const { rows: otherRole } = await pool.query(
    `SELECT * FROM users WHERE role <> $1 AND LOWER(email)=LOWER($2) ORDER BY id ASC LIMIT 1`,
    [role, googleUser.email]
  );
  if (otherRole[0]) {
    return { conflict: 'ROLE_PORTAL_MISMATCH', user: otherRole[0] };
  }

  return { user: null };
}

async function linkGoogleToUser(pool, user, googleUser) {
  const existingSub = String(user.oauth_google_sub || '').trim();
  if (existingSub && existingSub !== googleUser.sub) {
    return { conflict: 'GOOGLE_SUB_MISMATCH', user };
  }
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
  return { user: rows[0] };
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

function contractorNeedsApplication(user) {
  const status = String(user?.compliance_status || '').toLowerCase();
  // Only shell / incomplete onboarding — do not force re-application for legacy null statuses.
  return status === 'draft' || status === 'incomplete';
}

async function applyGoogleLink(pool, user, googleUser, res, { requestId, role }) {
  const linked = await linkGoogleToUser(pool, user, googleUser);
  if (linked.conflict === 'GOOGLE_SUB_MISMATCH') {
    oauthLog('oauth_google_denied', { requestId, role, code: 'GOOGLE_SUB_MISMATCH' });
    res.status(409).json({
      ok: false,
      code: 'GOOGLE_ALREADY_LINKED',
      message: 'This email is already linked to a different Google account. Sign in with email and password, or use the originally linked Google account.',
    });
    return null;
  }
  return linked.user;
}

async function handleHomeownerGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt, requestId }) {
  const found = await findUserByGoogleIdentity(pool, { role: 'homeowner', googleUser });
  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE' || found.conflict === 'ROLE_PORTAL_MISMATCH') {
    return rejectPortalMismatch(res, {
      requestId,
      role: 'homeowner',
      existingRole: found.user?.role,
    });
  }

  let user = found.user;
  let isNew = false;
  let needsOnboarding = false;

  if (user) {
    if (!assertAccountActive(user, res)) return;
    const wasLinked = Boolean(user.oauth_google_sub);
    user = await applyGoogleLink(pool, user, googleUser, res, { requestId, role: 'homeowner' });
    if (!user) return;
    needsOnboarding = !user.marketing_preferences_collected_at;
    oauthLog(wasLinked ? 'oauth_google_existing_user' : 'oauth_google_linked_existing_email', {
      requestId,
      role: 'homeowner',
      userId: user.id,
    });
  } else {
    const accountConsent = checkActionConsentsFromBody(req.body, 'ACCOUNT_SIGNUP');
    if (!accountConsent.ok) {
      return res.status(400).json({
        ok: false,
        code: 'CONSENT_REQUIRED',
        message: 'Your Google account was verified. Please complete your FixBridge registration.',
        missingAcceptanceTypes: accountConsent.missing,
        pendingSignupToken: signPendingGoogleSignup(googleUser, 'homeowner'),
        googleProfile: googleProfileDto(googleUser),
      });
    }

    const phone = String(req.body?.phone || '').trim() || null;
    const randomPass = `GOOGLE_OAUTH_${googleUser.sub}`;
    const hashed = await bcrypt.hash(randomPass, 10);
    const referredByCode =
      typeof req.body?.referredByCode === 'string' && req.body.referredByCode.trim()
        ? req.body.referredByCode.trim().toUpperCase()
        : null;

    let createdNow = false;
    try {
      const { rows: inserted } = await pool.query(
        `INSERT INTO users (
           role, name, email, password, phone, oauth_google_sub, google_avatar_url, signup_method, referred_by_code
         ) VALUES ('homeowner', $1, $2, $3, $4, $5, $6, 'google', $7)
         RETURNING *`,
        [googleUser.name, googleUser.email, hashed, phone, googleUser.sub, googleUser.picture, referredByCode]
      );
      user = inserted[0];
      createdNow = true;
    } catch (insertErr) {
      // Race: another request created the same email/role — link instead of duplicate.
      if (insertErr?.code === '23505') {
        const retry = await findUserByGoogleIdentity(pool, { role: 'homeowner', googleUser });
        if (retry.user) {
          user = await applyGoogleLink(pool, retry.user, googleUser, res, { requestId, role: 'homeowner' });
          if (!user) return;
          isNew = false;
          needsOnboarding = !user.marketing_preferences_collected_at;
          oauthLog('oauth_google_existing_user', { requestId, role: 'homeowner', userId: user.id, raced: true });
        } else {
          oauthLog('oauth_google_denied', { requestId, role: 'homeowner', reason: 'insert_conflict' });
          return res.status(409).json({
            ok: false,
            code: 'ACCOUNT_CONFLICT',
            message: 'An account with this email already exists. Please sign in instead.',
          });
        }
      } else {
        throw insertErr;
      }
    }

    if (createdNow && user) {
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

      oauthLog('oauth_google_user_created', { requestId, role: 'homeowner', userId: user.id });
    }
  }

  await recordGoogleLogin(pool, user.id);
  const clientUser = await finalizeHomeownerUser(pool, user, rowToUser);
  const token = makeToken(clientUser, { authStage: 'complete' });
  oauthLog('oauth_google_session_created', { requestId, role: 'homeowner', userId: user.id, isNew });
  oauthLog('oauth_google_redirect', { requestId, role: 'homeowner', destination: 'homeowner-dashboard' });

  return res.json({
    ok: true,
    token,
    user: clientUser,
    isNew,
    needsMarketingOnboarding: needsOnboarding,
    googleProfile: googleProfileDto(googleUser),
  });
}

async function handleContractorGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt, requestId }) {
  const intent = String(req.body?.intent || 'login').toLowerCase() === 'signup' ? 'signup' : 'login';
  const found = await findUserByGoogleIdentity(pool, { role: 'contractor', googleUser });

  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE' || found.conflict === 'ROLE_PORTAL_MISMATCH') {
    return rejectPortalMismatch(res, {
      requestId,
      role: 'contractor',
      existingRole: found.user?.role,
    });
  }

  let user = found.user;

  if (user) {
    if (!assertAccountActive(user, res)) return;
    user = await applyGoogleLink(pool, user, googleUser, res, { requestId, role: 'contractor' });
    if (!user) return;
    await recordGoogleLogin(pool, user.id);
    const clientUser = rowToUser(user);
    const needsApp = contractorNeedsApplication(user);
    oauthLog('oauth_google_existing_user', {
      requestId,
      role: 'contractor',
      userId: user.id,
      needsContractorApplication: needsApp,
    });
    oauthLog('oauth_google_session_created', { requestId, role: 'contractor', userId: user.id, isNew: false });
    oauthLog('oauth_google_redirect', {
      requestId,
      role: 'contractor',
      destination: needsApp ? 'contractor-onboarding' : 'contractor-dashboard',
    });
    return res.json({
      ok: true,
      token: makeToken(clientUser, { authStage: 'complete' }),
      user: clientUser,
      isNew: false,
      needsContractorApplication: needsApp,
    });
  }

  if (intent === 'login') {
    oauthLog('oauth_google_denied', { requestId, role: 'contractor', code: 'CONTRACTOR_SIGNUP_REQUIRED' });
    return res.status(400).json({
      ok: false,
      code: 'CONTRACTOR_SIGNUP_REQUIRED',
      message: 'Your Google account was verified. Please complete your FixBridge contractor registration.',
      pendingSignupToken: signPendingGoogleSignup(googleUser, 'contractor'),
      googleProfile: googleProfileDto(googleUser),
    });
  }

  if (req.body?.agreeContractorAgreementV4 !== true) {
    return res.status(400).json({
      ok: false,
      code: 'CONTRACTOR_AGREEMENT_REQUIRED',
      message: 'Your Google account was verified. Accept the required contractor agreements to finish registration.',
      pendingSignupToken: signPendingGoogleSignup(googleUser, 'contractor'),
      googleProfile: googleProfileDto(googleUser),
    });
  }

  const randomPass = `GOOGLE_OAUTH_${googleUser.sub}`;
  const hashed = await bcrypt.hash(randomPass, 10);
  try {
    const { rows: inserted } = await pool.query(
      `INSERT INTO users (
         role, name, email, password, oauth_google_sub, google_avatar_url, signup_method, compliance_status
       ) VALUES ('contractor', $1, $2, $3, $4, $5, 'google', 'draft')
       RETURNING *`,
      [googleUser.name, googleUser.email, hashed, googleUser.sub, googleUser.picture]
    );
    user = inserted[0];
  } catch (insertErr) {
    if (insertErr?.code === '23505') {
      const retry = await findUserByGoogleIdentity(pool, { role: 'contractor', googleUser });
      if (retry.user) {
        user = await applyGoogleLink(pool, retry.user, googleUser, res, { requestId, role: 'contractor' });
        if (!user) return;
        await recordGoogleLogin(pool, user.id);
        const clientUser = rowToUser(user);
        return res.json({
          ok: true,
          token: makeToken(clientUser, { authStage: 'complete' }),
          user: clientUser,
          isNew: false,
          needsContractorApplication: contractorNeedsApplication(user),
        });
      }
      return res.status(409).json({
        ok: false,
        code: 'ACCOUNT_CONFLICT',
        message: 'An account with this email already exists. Please sign in instead.',
      });
    }
    throw insertErr;
  }

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
  oauthLog('oauth_google_user_created', { requestId, role: 'contractor', userId: user.id });
  oauthLog('oauth_google_session_created', { requestId, role: 'contractor', userId: user.id, isNew: true });
  oauthLog('oauth_google_redirect', { requestId, role: 'contractor', destination: 'contractor-onboarding' });
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

async function handleAdminGoogle(pool, req, res, { googleUser, makeToken, rowToUser, requestId }) {
  const found = await findUserByGoogleIdentity(pool, { role: 'admin', googleUser });

  if (found.conflict === 'PROVIDER_LINKED_OTHER_ROLE' || found.conflict === 'ROLE_PORTAL_MISMATCH') {
    return rejectPortalMismatch(res, {
      requestId,
      role: 'admin',
      existingRole: found.user?.role,
    });
  }

  const user = found.user;
  if (!user) {
    oauthLog('oauth_google_role_rejected', {
      requestId,
      role: 'admin',
      code: 'ADMIN_NOT_AUTHORIZED',
      emailDomain: googleUser.email.split('@')[1] || null,
    });
    return res.status(403).json({
      ok: false,
      code: 'ADMIN_NOT_AUTHORIZED',
      message: 'This Google account is not authorized to access FixBridge Admin.',
    });
  }

  if (!assertAccountActive(user, res)) return;

  const linked = await applyGoogleLink(pool, user, googleUser, res, { requestId, role: 'admin' });
  if (!linked) return;
  await recordGoogleLogin(pool, linked.id);
  const clientUser = rowToUser(linked);
  oauthLog('oauth_google_existing_user', { requestId, role: 'admin', userId: linked.id });
  oauthLog('oauth_google_session_created', {
    requestId,
    role: 'admin',
    userId: linked.id,
    authStage: 'mfa_pending',
  });
  oauthLog('oauth_google_redirect', { requestId, role: 'admin', destination: 'admin-mfa' });

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
    const requestId = String(req.headers['x-request-id'] || randomUUID()).slice(0, 64);
    res.setHeader('X-Request-Id', requestId);

    try {
      if (!isGoogleOAuthConfigured()) {
        oauthLog('oauth_google_denied', { requestId, reason: 'not_configured' });
        return res.status(503).json({ ok: false, message: 'Google sign-in is not configured.' });
      }

      const role = String(req.body?.role || 'homeowner').toLowerCase();
      if (!['homeowner', 'contractor', 'admin'].includes(role)) {
        oauthLog('oauth_google_role_rejected', { requestId, role, code: 'INVALID_ROLE' });
        return res.status(400).json({ ok: false, code: 'INVALID_ROLE', message: 'Invalid sign-in portal.' });
      }

      oauthLog('oauth_google_started', { requestId, role, intent: req.body?.intent || null });

      const pendingUser = readPendingGoogleSignup(req.body?.pendingSignupToken, role);
      let googleUser = pendingUser;
      if (!googleUser) {
        const idToken = String(req.body?.credential || req.body?.idToken || '').trim();
        if (!idToken) {
          oauthLog('oauth_google_denied', { requestId, reason: 'missing_credential' });
          return res.status(400).json({ ok: false, message: 'Google credential is required.' });
        }
        const verified = await verifyGoogleIdToken(idToken, { requestId });
        if (!verified.ok || !verified.user?.sub) {
          return res.status(401).json({
            ok: false,
            code: 'INVALID_GOOGLE_TOKEN',
            message: 'We could not sign you in with Google. Please try again.',
          });
        }
        googleUser = verified.user;
      }
      oauthLog('oauth_google_verified', {
        requestId,
        role,
        subSuffix: googleUser.sub.slice(-6),
        emailDomain: googleUser.email.split('@')[1] || null,
      });

      if (role === 'contractor') {
        return handleContractorGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt, requestId });
      }
      if (role === 'admin') {
        return handleAdminGoogle(pool, req, res, { googleUser, makeToken, rowToUser, requestId });
      }
      return handleHomeownerGoogle(pool, req, res, { googleUser, makeToken, rowToUser, bcrypt, requestId });
    } catch (e) {
      console.error('google auth:', e?.message || e);
      oauthLog('oauth_google_denied', { requestId, reason: 'server_error' });
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
