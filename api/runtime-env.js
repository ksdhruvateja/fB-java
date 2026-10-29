/**
 * One place to decide "are we in production?" and to read the session signing secret.
 *
 * NODE_ENV alone is not reliable: on Netlify it is often unset at function runtime
 * (see netlify.toml), so production is also detected from hosting signals.
 */

const DEV_SECRET = 'local-dev-secret';

/** True for the live production deployment. */
export function isDeployedProduction() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.CONTEXT === 'production' ||
    process.env.FIXBRIDGE_HOSTING === 'netlify'
  );
}

/**
 * True whenever the code runs on any hosted environment (production, deploy previews,
 * branch deploys, serverless functions). A well-known development secret must never be
 * used on any of these, because anyone could then forge sign-in tokens.
 */
export function isHostedEnvironment() {
  return (
    isDeployedProduction() ||
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT) ||
    Boolean(process.env.REPLIT_DEPLOYMENT)
  );
}

/**
 * The secret used to sign sessions, media links and derived keys.
 * Throws on hosted environments when SESSION_SECRET is missing instead of
 * silently falling back to a value that is published in this repository.
 */
export function getSessionSecret() {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  if (secret) return secret;
  if (isHostedEnvironment()) {
    throw new Error(
      '[FATAL] SESSION_SECRET environment variable is not set. ' +
        'Set it in your hosting provider (for Netlify: Site settings → Environment variables) before deploying.'
    );
  }
  return DEV_SECRET;
}

/** Optional dedicated secret (e.g. MEDIA_SIGNING_SECRET), falling back to the session secret. */
export function getDerivedSecret(envName) {
  const own = String(process.env[envName] || '').trim();
  return own || getSessionSecret();
}
