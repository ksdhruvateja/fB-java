/**
 * Postgres / Neon TLS options.
 * Production validates certificates. Local/dev may opt out explicitly.
 */
export function postgresSslOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const insecure =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'false' ||
    String(process.env.PGSSLMODE || '').toLowerCase() === 'require-insecure';

  // Explicit insecure only outside production (e.g. odd local proxies).
  if (!isProduction && insecure) {
    return { rejectUnauthorized: false };
  }

  // Production (and default non-prod Neon): verify TLS certificates.
  // Neon uses publicly trusted CAs; Node's default CA store is sufficient.
  return { rejectUnauthorized: true };
}
