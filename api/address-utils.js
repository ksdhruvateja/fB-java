/**
 * Local address utilities — no external verification provider.
 * ZIP helpers used by property/profile routes and pricing.
 */

export function zip5(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : '';
}

export function zipPlus4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 4 && !zip5(value)) return digits;
  if (digits.length >= 9) return digits.slice(5, 9);
  return '';
}

/** Basic format check — does not claim the address physically exists. */
export function validateAddressFormat(input = {}) {
  const addressLine1 = String(input.addressLine1 || input.streetAddress || '').trim();
  const city = String(input.city || '').trim();
  const state = String(input.state || '').trim().toUpperCase();
  const zipRaw = String(input.zip || input.ZIPCode || '').trim();
  const zip = zip5(zipRaw);
  const missing = [];
  if (!addressLine1) missing.push('addressLine1');
  if (!city) missing.push('city');
  if (!state || state.length !== 2) missing.push('state');
  if (!zip || zip.length !== 5) missing.push('zip');
  if (missing.length) {
    return {
      ok: false,
      code: 'INVALID_ADDRESS_FORMAT',
      message: 'Please check the address and ZIP code.',
      missing,
    };
  }
  return {
    ok: true,
    address: {
      addressLine1,
      addressLine2: String(input.addressLine2 || input.secondaryAddress || '').trim() || null,
      city,
      state,
      zip,
      postalCodePlus4: zipPlus4(zipRaw) || null,
    },
  };
}
