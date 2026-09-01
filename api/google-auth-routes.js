/**
 * Google OAuth for homeowner sign-up / sign-in (ID token verification).
 * Uses GOOGLE_CLIENT_ID — never expose GOOGLE_CLIENT_SECRET to the frontend.
 */

import { recordSignupMarketingConsents } from './marketing-consent-service.js';
import { checkActionConsentsFromBody } from './homeowner-consent.js';
import { validateAndRecordActionConsents } from './homeowner-consent.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';

export function isGoogleOAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

async function verifyGoogleIdToken(idToken) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.aud !== GOOGLE_CLIENT_ID) return null;
  if (data.email_verified !== 'true' && data.email_verified !== true) return null;
  return {
    sub: data.sub,
    email: String(data.email || '').trim().toLowerCase(),
    name: data.name || data.given_name || data.email?.split('@')[0] || 'Homeowner',
    picture: data.picture || null,
  };
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
      if (!googleUser?.email) {
        return res.status(401).json({ ok: false, message: 'Google authentication failed.' });
      }

      const { rows: existing } = await pool.query(
        `SELECT * FROM users WHERE role='homeowner' AND (
           LOWER(email)=LOWER($1) OR oauth_google_sub=$2
         ) LIMIT 1`,
        [googleUser.email, googleUser.sub]
      );

      let user = existing[0];
      let isNew = false;
      let needsOnboarding = false;

      if (user) {
        // Link Google sub if not already linked
        if (!user.oauth_google_sub) {
          await pool.query(
            `UPDATE users SET oauth_google_sub=$2, google_avatar_url=COALESCE(google_avatar_url, $3), signup_method=COALESCE(signup_method, 'google')
             WHERE id=$1`,
            [user.id, googleUser.sub, googleUser.picture]
          );
        }
        needsOnboarding = !user.marketing_preferences_collected_at;
      } else {
        // New Google signup — require terms acceptance
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

        const { rows: inserted } = await pool.query(
          `INSERT INTO users (role, name, email, password, phone, oauth_google_sub, google_avatar_url, signup_method)
           VALUES ('homeowner', $1, $2, $3, $4, $5, $6, 'google')
           RETURNING *`,
          [googleUser.name, googleUser.email, hashed, phone, googleUser.sub, googleUser.picture]
        );
        user = inserted[0];
        isNew = true;
        needsOnboarding = true;

        await validateAndRecordActionConsents(pool, req, {
          actionKey: 'ACCOUNT_SIGNUP',
          userId: user.id,
          idempotencyPrefix: `google-signup:${user.id}`,
        });

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

      const token = makeToken(rowToUser(user), { authStage: 'complete' });
      const clientUser = rowToUser(user);

      res.json({
        ok: true,
        token,
        user: clientUser,
        isNew,
        needsMarketingOnboarding: needsOnboarding,
        googleProfile: { email: googleUser.email, name: googleUser.name },
      });
    } catch (e) {
      console.error('google auth:', e);
      res.status(500).json({ ok: false, message: 'Google sign-in failed.' });
    }
  });

  // Complete marketing onboarding for Google users
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
}
