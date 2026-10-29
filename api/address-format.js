/** Server-side structured address helpers (mirrors src/app/addressFormat.ts). */

export function formatAddressLines(a = {}) {
  const line1 = String(a.addressLine1 || a.address_line1 || '').trim();
  const line2 = String(a.addressLine2 || a.address_line2 || '').trim();
  const city = String(a.city || '').trim();
  const state = String(a.state || '').trim();
  const zip = String(a.zip || '').trim();
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line1, line2, cityStateZip].filter(Boolean);
}

export function formatCityStateZip(a = {}) {
  const city = String(a.city || '').trim();
  const state = String(a.state || '').trim();
  const zip = String(a.zip || '').trim();
  return [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function formatAddressSingleLine(a = {}) {
  return formatAddressLines(a).join(', ');
}

export function isAddressComplete(a = {}) {
  return Boolean(
    String(a.addressLine1 || a.address_line1 || '').trim() &&
      String(a.city || '').trim() &&
      String(a.state || '').trim() &&
      String(a.zip || '').trim()
  );
}

export function structuredFromProperty(p) {
  if (!p) return { addressLine1: '', addressLine2: '', city: '', state: '', zip: '' };
  return {
    addressLine1: p.address_line1 || p.addressLine1 || '',
    addressLine2: p.address_line2 || p.addressLine2 || '',
    city: p.city || '',
    state: p.state || '',
    zip: p.zip || '',
  };
}

export function normalizeBillToAddress(billTo = {}) {
  let addressLine1 = String(billTo.addressLine1 || billTo.street || '').trim();
  let addressLine2 = String(billTo.addressLine2 || '').trim();
  let city = String(billTo.city || '').trim();
  let state = String(billTo.state || '').trim();
  let zip = String(billTo.zip || '').trim();

  const csz = String(billTo.cityStateZip || '').trim();
  if ((!city || !state || !zip) && csz) {
    const m = csz.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      if (!city) city = m[1].trim();
      if (!state) state = m[2].toUpperCase();
      if (!zip) zip = m[3];
    } else if (!city) {
      city = csz;
    }
  }

  const lines = formatAddressLines({ addressLine1, addressLine2, city, state, zip });
  return {
    ...billTo,
    addressLine1,
    addressLine2: addressLine2 || null,
    city,
    state,
    zip,
    street: addressLine1,
    cityStateZip: formatCityStateZip({ city, state, zip }),
    address: lines.join(', ') || billTo.address || null,
  };
}

export function billToHtmlBlock(billTo, escapeHtml) {
  const addr = normalizeBillToAddress(billTo || {});
  const lines = formatAddressLines(addr);
  return lines.map((line) => `<p style="margin:4px 0 0;color:#444;">${escapeHtml(line)}</p>`).join('');
}
