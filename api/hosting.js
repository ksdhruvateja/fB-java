/**
 * Hosting detection and public URL helpers (Netlify + Railway).
 *
 * Production source of truth is Railway (ksdhruvateja/fB-java main).
 * fixbridge.netlify.app is a leftover second deploy and must not be the fallback origin.
 */

export const RAILWAY_PRODUCTION_URL = 'https://fb-java-production.up.railway.app';

export function isLegacyNetlifyUrl(value = '') {
  return /fixbridge\.netlify\.app/i.test(String(value));
}

export function isRailwayRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.FIXBRIDGE_HOSTING === 'railway'
  );
}

export function isNetlifyRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.FIXBRIDGE_HOSTING === 'netlify' ||
      process.env.CONTEXT === 'production' ||
      process.env.CONTEXT === 'deploy-preview'
  );
}

/** Production health/status signal — Netlify may omit NODE_ENV. */
export function isDeployedProduction() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.CONTEXT === 'production' ||
    process.env.FIXBRIDGE_HOSTING === 'netlify' ||
    process.env.FIXBRIDGE_HOSTING === 'railway' ||
    isRailwayRuntime()
  );
}

export function resolveDatabaseUrl() {
  return String(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '').trim();
}

export function railwayPublicOrigin() {
  const staticUrl = String(process.env.RAILWAY_STATIC_URL || '').trim();
  if (staticUrl) return staticUrl.replace(/\/$/, '');
  const domain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (!domain) return '';
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/$/, '');
  return `https://${domain}`;
}

export function resolvePublicAppUrl() {
  const fromEnv = String(process.env.APP_URL || process.env.URL || process.env.BRAND_DOMAIN || '')
    .trim()
    .replace(/\/$/, '');
  if (fromEnv && !isLegacyNetlifyUrl(fromEnv)) return fromEnv;
  if (isRailwayRuntime()) return railwayPublicOrigin() || RAILWAY_PRODUCTION_URL;
  if (fromEnv) return RAILWAY_PRODUCTION_URL;
  if (process.env.NODE_ENV === 'production' || isDeployedProduction()) {
    return railwayPublicOrigin() || RAILWAY_PRODUCTION_URL;
  }
  return 'http://localhost:5000';
}

export function resolveBuildId() {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.COMMIT_REF ||
    process.env.DEPLOY_ID ||
    process.env.FIXBRIDGE_HOSTING ||
    null
  );
}
