/**
 * Shared smoke-test credential resolution (never hardcode production passwords).
 */
export function smokeCredentials() {
  const homeownerEmail = process.env.SMOKE_HOMEOWNER_EMAIL?.trim() || '';
  const homeownerPassword = process.env.SMOKE_HOMEOWNER_PASSWORD?.trim() || '';
  const otherEmail = process.env.SMOKE_OTHER_EMAIL?.trim() || '';
  const otherPassword = process.env.SMOKE_OTHER_PASSWORD?.trim() || homeownerPassword;
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL?.trim() || '';
  const contractorPassword = process.env.SMOKE_CONTRACTOR_PASSWORD?.trim() || '';
  const proEmail = process.env.SMOKE_PRO_HOMEOWNER_EMAIL?.trim() || '';
  const proPassword = process.env.SMOKE_PRO_HOMEOWNER_PASSWORD?.trim() || '';
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL?.trim() || '';
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD?.trim() || '';
  const cronSecret = process.env.SERVICE_REMINDER_CRON_SECRET?.trim() || '';

  const demoFallback =
    String(process.env.SMOKE_ALLOW_DEMO_FALLBACK || '').toLowerCase() === 'true';

  return {
    api: (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, ''),
    homeownerEmail: homeownerEmail || (demoFallback ? 'maria@example.com' : ''),
    homeownerPassword: homeownerPassword || (demoFallback ? 'demo123' : ''),
    otherEmail,
    otherPassword,
    contractorEmail,
    contractorPassword,
    proEmail,
    proPassword,
    adminEmail,
    adminPassword,
    cronSecret,
    demoFallback,
    hasHomeowner: Boolean(homeownerEmail || demoFallback),
    hasPro: Boolean(proEmail),
    hasOther: Boolean(otherEmail),
    hasContractor: Boolean(contractorEmail && contractorPassword),
  };
}

export function missingCredsMessage() {
  return 'SKIPPED — set SMOKE_HOMEOWNER_EMAIL and SMOKE_HOMEOWNER_PASSWORD (or SMOKE_ALLOW_DEMO_FALLBACK=true for local demo users)';
}
