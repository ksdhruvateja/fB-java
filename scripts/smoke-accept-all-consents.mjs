/**
 * Accept All dispatch acknowledgments — UI logic regression tests.
 * Usage: node scripts/smoke-accept-all-consents.mjs
 */

const DISPATCH_KEYS = [
  'PROFESSIONAL_DISPATCH_PROVIDER_ACK',
  'PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK',
  'VISIT_FEE_ACK',
  'HOMEOWNER_SERVICE_AGREEMENT',
  'VISIT_CANCELLATION_POLICY',
];

function isAcceptAllChecked(state, keys) {
  return keys.length > 0 && keys.every((key) => state[key] === true);
}

function applyAcceptAll(state, keys, checked) {
  const next = { ...state };
  for (const key of keys) {
    next[key] = checked;
  }
  return next;
}

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

function main() {
  console.log('\n=== Accept All dispatch acknowledgments ===\n');

  const initial = Object.fromEntries(DISPATCH_KEYS.map((k) => [k, false]));
  ok('Default: all individual false', DISPATCH_KEYS.every((k) => initial[k] === false));
  ok('Default: Accept All false', !isAcceptAllChecked(initial, DISPATCH_KEYS));

  const afterAcceptAll = applyAcceptAll(initial, DISPATCH_KEYS, true);
  ok('Accept All checks all required', isAcceptAllChecked(afterAcceptAll, DISPATCH_KEYS));
  ok(
    'Accept All sets each dispatch key',
    DISPATCH_KEYS.every((k) => afterAcceptAll[k] === true)
  );

  const afterUncheckAgreement = { ...afterAcceptAll, HOMEOWNER_SERVICE_AGREEMENT: false };
  ok('Uncheck one: agreement false', afterUncheckAgreement.HOMEOWNER_SERVICE_AGREEMENT === false);
  ok('Uncheck one: Accept All reflects unchecked', !isAcceptAllChecked(afterUncheckAgreement, DISPATCH_KEYS));

  const manual = { ...initial };
  for (const key of DISPATCH_KEYS) manual[key] = true;
  ok('Manual check all: Accept All true', isAcceptAllChecked(manual, DISPATCH_KEYS));

  const withMarketing = applyAcceptAll(
    { ...initial, MARKETING_SMS_EMAIL: false },
    DISPATCH_KEYS,
    true
  );
  ok(
    'Accept All does not check marketing',
    withMarketing.MARKETING_SMS_EMAIL === false && isAcceptAllChecked(withMarketing, DISPATCH_KEYS)
  );

  console.log('\nDone.\n');
}

main();
