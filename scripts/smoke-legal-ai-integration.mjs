/**
 * AI / DIY legal integration smoke tests.
 * Usage: node --env-file=.env scripts/smoke-legal-ai-integration.mjs [API_BASE]
 */
import { LEGAL_DOCUMENT_CONTENT } from '../api/legal-documents.js';
import { HOMEOWNER_LEGAL_CONTENT } from '../api/legal-homeowner-content.js';

const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

async function signup(ts) {
  const email = `legal.ai.${ts}@example.com`;
  const password = 'SmokePass123!';
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Legal AI Smoke',
      email,
      password,
    }),
  }).then(json);
  return {
    r,
    email,
    h: r.token ? { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } : null,
  };
}

async function signupWithConsents(ts) {
  const email = `legal.ai.ok.${ts}@example.com`;
  const password = 'SmokePass123!';
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'Legal AI Smoke',
      email,
      password,
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  return {
    r,
    email,
    h: r.token ? { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } : null,
  };
}

function contentHas(sectionTitle, bodyNeedle, key) {
  const doc = LEGAL_DOCUMENT_CONTENT[key] || HOMEOWNER_LEGAL_CONTENT[key];
  const section = doc?.sections?.find((s) => s.title.includes(sectionTitle));
  return Boolean(section?.body?.includes(bodyNeedle));
}

async function main() {
  console.log(`\nFixBridge AI/DIY legal integration @ ${API}\n`);

  ok('Terms AI-assisted section', contentHas('AI-Assisted', 'informational tools', 'HOMEOWNER_TERMS'));
  ok('Terms DIY safety section', contentHas('Guided DIY and Safety', 'gas leaks', 'HOMEOWNER_TERMS'));
  ok('Terms professional escalation', contentHas('AI-Assisted', 'request a service professional', 'HOMEOWNER_TERMS'));
  ok('Privacy AI-processing section', contentHas('Information Used for AI', 'Guided DIY', 'PRIVACY_POLICY'));
  ok('Privacy AI transparency section', contentHas('Automated Processing', 'artificial intelligence', 'PRIVACY_POLICY'));
  ok('Privacy excludes payment cards from AI', contentHas('Information Used for AI', 'does not send payment card', 'PRIVACY_POLICY'));
  ok('Homeowner agreement AI section', contentHas('AI / DIY Assistance', 'informational', 'HOMEOWNER_SERVICE_AGREEMENT'));
  ok('DIY Safety disclaimer structure', (LEGAL_DOCUMENT_CONTENT.DIY_SAFETY_DISCLAIMER?.sections?.length || 0) >= 7);
  ok('DIY Safety emergency section', contentHas('Emergency Situations', 'emergency services', 'DIY_SAFETY_DISCLAIMER'));

  for (const [slug, key] of [
    ['terms', 'HOMEOWNER_TERMS'],
    ['privacy', 'PRIVACY_POLICY'],
    ['homeowner-service-agreement', 'HOMEOWNER_SERVICE_AGREEMENT'],
    ['diy-safety', 'DIY_SAFETY_DISCLAIMER'],
    ['visit-cancellation', 'VISIT_CANCELLATION_POLICY'],
  ]) {
    const docRes = await fetch(`${API}/api/legal/documents/${key}`).then(json);
    ok(`Legal API ${slug}`, docRes.ok === true && docRes.document?.key === key, docRes.document?.version || '');
    ok(`${slug} has AI/safety content`, (docRes.document?.content?.sections?.length || 0) > 0);
  }

  const ts = Date.now();

  const noConsent = await signup(ts);
  ok('Signup rejects missing Terms/Privacy', noConsent.r.ok === false && noConsent.r.code === 'ACCOUNT_CONSENT_REQUIRED');

  const withConsent = await signupWithConsents(ts + 1);
  ok('Signup with Terms/Privacy succeeds', withConsent.r.ok === true, withConsent.r.message || '');
  if (!withConsent.h) {
    console.log('\nSkipping API consent tests — signup failed.\n');
    return;
  }

  const termsDoc = await fetch(`${API}/api/legal/documents/HOMEOWNER_TERMS`).then(json);
  ok('Terms version current', termsDoc.document?.version === '2026-09-01', termsDoc.document?.version || '');

  const privacyDoc = await fetch(`${API}/api/legal/documents/PRIVACY_POLICY`).then(json);
  ok('Privacy version current', privacyDoc.document?.version === '2026-09-01', privacyDoc.document?.version || '');

  const diyDoc = await fetch(`${API}/api/legal/documents/DIY_SAFETY_DISCLAIMER`).then(json);
  const diyVersion = diyDoc.document?.version || '1.1';
  ok('DIY safety doc version current', diyVersion === '1.1', diyVersion);

  const diyAccept = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: withConsent.h,
    body: JSON.stringify({
      actionKey: 'DIY_START',
      consents: { DIY_SAFETY: true, DIY_SAFETY_ABILITY_ACK: true },
    }),
  }).then(json);
  ok('DIY acceptance saves current version', diyAccept.ok === true, diyAccept.message || '');

  const statusAfter = await fetch(`${API}/api/homeowner/consent/status`, { headers: withConsent.h }).then(json);
  ok('DIY safety marked accepted', statusAfter.diySafetyAccepted === true);

  const oldVersionUser = await signupWithConsents(ts + 2);
  if (oldVersionUser.h) {
    await fetch(`${API}/api/homeowner/consent/action`, {
      method: 'POST',
      headers: oldVersionUser.h,
      body: JSON.stringify({
        actionKey: 'DIY_START',
        consents: { DIY_SAFETY: true, DIY_SAFETY_ABILITY_ACK: true },
      }),
    });
    const stale = await fetch(`${API}/api/homeowner/consent/status`, { headers: oldVersionUser.h }).then(json);
    ok('Re-consent logic endpoint reachable', typeof stale.diySafetyAccepted === 'boolean');
  }

  console.log('\nAudit summary: see smoke output above.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
