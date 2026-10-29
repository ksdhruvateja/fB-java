/**
 * Launch/beta compliance toggles.
 * Set REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED=true to restore mandatory FixBridge AI endorsement.
 */

function envTruthy(value) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function requireFixbridgeAdditionalInsured() {
  return envTruthy(process.env.REQUIRE_FIXBRIDGE_ADDITIONAL_INSURED);
}

export function complianceSettingsSnapshot() {
  return {
    requireFixbridgeAdditionalInsured: requireFixbridgeAdditionalInsured(),
  };
}
