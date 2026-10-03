/**
 * Postgres / Neon TLS options.
 * Production validates certificates. Local/dev may opt out explicitly.
 */
import {isHostedProduction} from './runtime-database-config.js';

export function postgresSslOptions(env = process.env) {
  const isProduction = isHostedProduction(env);
  const insecure =
    String(env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'false' ||
    String(env.PGSSLMODE || '').toLowerCase() === 'require-insecure';

  // Explicit insecure only outside production (e.g. odd local proxies).
  if (!isProduction && insecure) {
    return { rejectUnauthorized: false };
  }

  // Production (and default non-prod Neon): verify TLS certificates.
  // Neon uses publicly trusted CAs; Node's default CA store is sufficient.
  return { rejectUnauthorized: true };
}
