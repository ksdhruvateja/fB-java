/** Pure startup policy. Never log or expose the resolved connection string. */
export function isHostedProduction(env = process.env) {
  return env.NODE_ENV === 'production' || env.CONTEXT === 'production' ||
    ['netlify','railway'].includes(String(env.FIXBRIDGE_HOSTING || '').toLowerCase()) ||
    env.NETLIFY === 'true' || Boolean(env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_SERVICE_ID);
}
export function resolveRuntimeDatabase(env = process.env) {
  const deployed = isHostedProduction(env);
  const connectionString = String(env.NEON_DATABASE_URL || env.DATABASE_URL || '').trim();
  if (!connectionString && deployed) throw new Error('[FATAL] A persistent PostgreSQL connection is required on hosted environments. In-memory accounts are not allowed.');
  if (connectionString) {
    let parsed;
    try { parsed = new URL(connectionString); } catch { throw new Error('[FATAL] PostgreSQL connection configuration is invalid.'); }
    if (!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') throw new Error('[FATAL] PostgreSQL connection configuration is invalid.');
  }
  return {deployed,connectionString,useInMemoryDb:!connectionString};
}
