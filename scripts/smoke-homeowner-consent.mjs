/**
 * Homeowner consent / acknowledgment smoke tests.
 * Usage: node --env-file=.env scripts/smoke-homeowner-consent.mjs [API_BASE]
 */
const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

const TERMS_CONSENTS = {
  ACCOUNT_TERMS: true,
  PRIVACY_POLICY: true,
};

const DISPATCH_CONSENTS = {
  PROFESSIONAL_DISPATCH_PROVIDER_ACK: true,
  PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK: true,
  VISIT_FEE_ACK: true,
  HOMEOWNER_SERVICE_AGREEMENT: true,
  VISIT_CANCELLATION_POLICY: true,
};

async function signupHomeowner(ts, body = {}) {
  const email = `consent.smoke.${ts}@example.com`;
  const password = 'SmokePass123!';
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Consent Smoke',
      email,
      password,
      ...body,
    }),
  }).then(json);
  return { r, email, password, h: r.token ? { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } : null };
}

async function main() {
  console.log(`\nFixBridge homeowner consent smoke @ ${API}\n`);

  const ts = Date.now();

  const noTerms = await signupHomeowner(`${ts}a`);
  ok('signup without terms blocked', !noTerms.r.ok && (noTerms.r.code === 'ACCOUNT_CONSENT_REQUIRED' || /consent|terms|privacy/i.test(noTerms.r.message || '')), noTerms.r.message);

  const withTerms = await signupHomeowner(`${ts}b`, { consents: TERMS_CONSENTS });
  ok('signup with terms allowed', withTerms.r.ok === true, withTerms.r.message);

  const noMarketing = await signupHomeowner(`${ts}c`, { consents: TERMS_CONSENTS, marketingConsent: false });
  ok('marketing unchecked still allows signup', noMarketing.r.ok === true, noMarketing.r.message);

  if (!withTerms.h) {
    console.log('\nSkipping authenticated tests — signup failed.\n');
    return;
  }

  const diyBlocked = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withTerms.h,
    body: JSON.stringify({ actionKey: 'DIY_START', consents: {} }),
  }).then(json);
  ok('DIY without disclaimer blocked', !diyBlocked.ok && diyBlocked.code === 'DIY_CONSENT_REQUIRED', diyBlocked.message);

  const diyOk = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withTerms.h,
    body: JSON.stringify({ actionKey: 'DIY_START', consents: { DIY_SAFETY: true } }),
  }).then(json);
  ok('DIY with current disclaimer allowed', diyOk.ok === true, diyOk.message);

  const status = await fetch(`${API}/api/homeowner/consent/status`, { headers: withTerms.h }).then(json);
  ok('DIY status reflects acceptance', status.ok && status.diySafetyAccepted === true);

  const legalDocs = await fetch(`${API}/api/legal/documents`).then(json);
  ok('legal documents registry exposed', legalDocs.ok && Array.isArray(legalDocs.documents) && legalDocs.documents.length >= 5);

  const partialDispatch = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withTerms.h,
    body: JSON.stringify({
      actionKey: 'PROFESSIONAL_DISPATCH',
      consents: {
        PROFESSIONAL_DISPATCH_PROVIDER_ACK: true,
        PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK: true,
      },
    }),
  }).then(json);
  ok(
    'dispatch 2/3 acknowledgments blocked',
    !partialDispatch.ok && partialDispatch.code === 'HOMEOWNER_DISPATCH_CONSENT_REQUIRED',
    partialDispatch.missingAcceptanceTypes?.join(', ')
  );

  const fullDispatch = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withTerms.h,
    body: JSON.stringify({ actionKey: 'PROFESSIONAL_DISPATCH', consents: DISPATCH_CONSENTS }),
  }).then(json);
  ok('dispatch full acknowledgments recorded', fullDispatch.ok === true, fullDispatch.message);

  const paymentBlocked = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withTerms.h,
    body: JSON.stringify({ actionKey: 'PAYMENT_AUTHORIZATION', consents: { PAYMENT_AUTHORIZATION: true } }),
  }).then(json);
  ok(
    'payment without policy blocked',
    !paymentBlocked.ok && paymentBlocked.code === 'PAYMENT_CONSENT_REQUIRED',
    paymentBlocked.message
  );

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
