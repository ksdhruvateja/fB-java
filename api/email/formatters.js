/**
 * Safe formatting helpers for email template data.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeName(firstName, fallback = 'Hello') {
  const name = String(firstName ?? '').trim();
  if (!name || name.toLowerCase() === 'undefined' || name.toLowerCase() === 'null') {
    return fallback;
  }
  return name;
}

export function greetingLine(firstName) {
  const name = String(firstName ?? '').trim();
  if (!name || name.toLowerCase() === 'undefined' || name.toLowerCase() === 'null') {
    return 'Hello,';
  }
  return `Hi ${name},`;
}

export function formatCurrency(amount, { cents = false } = {}) {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '—';
  const n = cents ? Number(amount) / 100 : Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function formatDate(value, { includeTime = false } = {}) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = includeTime
    ? { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleString('en-US', opts);
}

export function safeText(value, fallback = '—') {
  const s = String(value ?? '').trim();
  if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null' || s === 'NaN') {
    return fallback;
  }
  return s;
}

export function safeAddress(address) {
  if (!address) return '—';
  if (typeof address === 'string') return safeText(address);
  const lines = [];
  if (address.addressLine1 || address.line1) lines.push(address.addressLine1 || address.line1);
  if (address.addressLine2 || address.line2) lines.push(address.addressLine2 || address.line2);
  const cityLine = [address.city, address.state, address.zip || address.postalCode]
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ',');
  if (cityLine) lines.push(cityLine);
  if (address.country && address.country !== 'US') lines.push(address.country);
  return lines.length ? lines.join('\n') : safeText(address.address || address.full);
}

export function detailsRows(rows = []) {
  return rows
    .filter((r) => r && r.label)
    .map((r) => ({
      label: safeText(r.label),
      value: safeText(r.value, '—'),
    }));
}
