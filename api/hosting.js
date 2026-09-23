/**
 * Hosting detection and public URL helpers (Netlify + Railway).
 */

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
  const fromEnv = String(process.env.APP_URL || process.env.URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return railwayPublicOrigin();
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
