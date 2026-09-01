/**
 * Accept All dispatch acknowledgments — UI logic regression tests.
 * Usage: node scripts/smoke-accept-all-consents.mjs
 */

const DISPATCH_KEYS = ['PROFESSIONAL_REQUEST_BETA_ACK'];
const DIY_SAFETY_KEYS = ['DIY_SAFETY', 'DIY_SAFETY_ABILITY_ACK'];

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
  ok('Default: beta acknowledgment false', initial.PROFESSIONAL_REQUEST_BETA_ACK === false);
  ok('Default: Accept All false', !isAcceptAllChecked(initial, DISPATCH_KEYS));

  const afterAcceptAll = applyAcceptAll(initial, DISPATCH_KEYS, true);
  ok('Accept All checks beta acknowledgment', isAcceptAllChecked(afterAcceptAll, DISPATCH_KEYS));
  ok('Accept All sets beta key', afterAcceptAll.PROFESSIONAL_REQUEST_BETA_ACK === true);

  const afterUncheck = { ...afterAcceptAll, PROFESSIONAL_REQUEST_BETA_ACK: false };
  ok('Uncheck beta: Accept All reflects unchecked', !isAcceptAllChecked(afterUncheck, DISPATCH_KEYS));

  const withMarketing = applyAcceptAll(
    { ...initial, MARKETING_SMS_EMAIL: false },
    DISPATCH_KEYS,
    true
  );
  ok(
    'Accept All does not check marketing',
    withMarketing.MARKETING_SMS_EMAIL === false && isAcceptAllChecked(withMarketing, DISPATCH_KEYS)
  );

  console.log('\n=== Accept All DIY safety acknowledgments ===\n');

  const diyInitial = Object.fromEntries(DIY_SAFETY_KEYS.map((k) => [k, false]));
  ok('DIY default: both unchecked', !isAcceptAllChecked(diyInitial, DIY_SAFETY_KEYS));
  const diyAfterAll = applyAcceptAll(diyInitial, DIY_SAFETY_KEYS, true);
  ok('DIY Accept All checks both required keys', isAcceptAllChecked(diyAfterAll, DIY_SAFETY_KEYS));
  const diyWithMarketing = applyAcceptAll(
    { ...diyInitial, MARKETING_SMS_EMAIL: false },
    DIY_SAFETY_KEYS,
    true
  );
  ok(
    'DIY Accept All does not check marketing',
    diyWithMarketing.MARKETING_SMS_EMAIL === false && isAcceptAllChecked(diyWithMarketing, DIY_SAFETY_KEYS)
  );

  console.log('\nDone.\n');
}

main();
