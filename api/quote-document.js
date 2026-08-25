/**
 * Professional quote / invoice document helpers.
 * Line items use qty × unitPrice; totals include discount, shipping, charges, tax.
 */

export const QUOTE_UNITS = [
  'Each',
  'Service',
  'Hour',
  'Day',
  'Foot',
  'Sq Ft',
  'Unit',
  'Flat Rate',
  'Custom',
];

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'approved', // legacy alias of accepted
  'declined',
  'converted',
  'paid',
  'canceled',
  'cancelled',
  'expired',
];

export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'due',
  'paid',
  'partially_paid',
  'past_due',
  'refunded',
  'partially_refunded',
  'void',
];

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export function newLineItemId() {
  return `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize a customer-facing line item to the professional shape. */
export function normalizeLineItem(raw = {}, index = 0) {
  const qty = Math.max(0, Number(raw.qty ?? raw.quantity ?? 1) || 0);
  const unitPrice =
    raw.unitPrice != null
      ? Number(raw.unitPrice)
      : raw.unit_price != null
        ? Number(raw.unit_price)
        : raw.amount != null && qty > 0 && raw.qty == null && raw.quantity == null
          ? Number(raw.amount)
          : Number(raw.unitPrice || raw.unit_price || 0);
  const amount =
    raw.amount != null && raw.qty == null && raw.quantity == null && raw.unitPrice == null
      ? roundMoney(raw.amount)
      : roundMoney(qty * (Number.isFinite(unitPrice) ? unitPrice : 0));

  return {
    id: String(raw.id || newLineItemId()),
    name: String(raw.name || raw.label || raw.item || `Item ${index + 1}`).trim() || `Item ${index + 1}`,
    description: String(raw.description || raw.note || '').trim(),
    qty,
    unit: String(raw.unit || 'Service').trim() || 'Service',
    unitPrice: roundMoney(Number.isFinite(unitPrice) ? unitPrice : 0),
    amount,
    visible: raw.visible !== false,
  };
}

export function normalizeLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, i) => normalizeLineItem(item, i));
}

export function normalizeCharge(raw = {}, index = 0) {
  return {
    id: String(raw.id || `ch_${Date.now().toString(36)}_${index}`),
    name: String(raw.name || raw.label || `Charge ${index + 1}`).trim(),
    description: String(raw.description || '').trim(),
    amount: roundMoney(raw.amount),
  };
}

/**
 * Compute quote totals from professional document fields.
 * Tax applies to (subtotal - discount + shipping + additionalCharges) by default.
 */
export function computeQuoteTotals({
  lineItems = [],
  discountType = 'none',
  discountValue = 0,
  shippingAmount = 0,
  additionalCharges = [],
  taxMode = 'none',
  taxValue = 0,
} = {}) {
  const items = normalizeLineItems(lineItems).filter((i) => i.visible !== false);
  const charges = (Array.isArray(additionalCharges) ? additionalCharges : []).map(normalizeCharge);
  const subtotal = roundMoney(items.reduce((s, i) => s + Number(i.amount || 0), 0));
  const chargesTotal = roundMoney(charges.reduce((s, c) => s + Number(c.amount || 0), 0));
  const shipping = roundMoney(Math.max(0, Number(shippingAmount) || 0));

  let discountAmount = 0;
  const dtype = String(discountType || 'none').toLowerCase();
  const dval = Number(discountValue) || 0;
  if (dtype === 'percent' || dtype === 'percentage') {
    discountAmount = roundMoney(subtotal * (Math.min(100, Math.max(0, dval)) / 100));
  } else if (dtype === 'fixed' || dtype === 'amount' || dtype === 'dollar') {
    discountAmount = roundMoney(Math.min(subtotal, Math.max(0, dval)));
  }

  const taxableBase = roundMoney(Math.max(0, subtotal - discountAmount + shipping + chargesTotal));
  let taxAmount = 0;
  const tmode = String(taxMode || 'none').toLowerCase();
  const tval = Number(taxValue) || 0;
  if (tmode === 'percent' || tmode === 'percentage') {
    taxAmount = roundMoney(taxableBase * (Math.max(0, tval) / 100));
  } else if (tmode === 'fixed' || tmode === 'amount' || tmode === 'custom') {
    taxAmount = roundMoney(Math.max(0, tval));
  }

  const total = roundMoney(taxableBase + taxAmount);

  return {
    lineItems: items,
    additionalCharges: charges,
    subtotal,
    discountAmount,
    shippingAmount: shipping,
    chargesTotal,
    taxAmount,
    taxableBase,
    total,
  };
}

/** Migrate legacy {label, amount} lines into professional items for display/edit. */
export function upgradeLegacyLineItems(items) {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((raw, i) => {
    if (raw && (raw.qty != null || raw.unitPrice != null || raw.unit_price != null || raw.name)) {
      return normalizeLineItem(raw, i);
    }
    const amount = Number(raw?.amount) || 0;
    return normalizeLineItem(
      {
        id: raw?.id,
        name: raw?.label || raw?.name || `Item ${i + 1}`,
        description: raw?.description || '',
        qty: 1,
        unit: amount < 0 ? 'Flat Rate' : 'Service',
        unitPrice: amount,
        amount,
        visible: raw?.visible !== false,
      },
      i
    );
  });
}

export function ensureFbiNumber(proposalId, invoiceId) {
  const base = proposalId != null ? String(proposalId).padStart(5, '0') : String(invoiceId || Date.now()).padStart(5, '0');
  return `FBI-${base}`;
}

export function displayQuoteStatus(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'approved') return 'accepted';
  if (s === 'cancelled') return 'canceled';
  if (s === 'converted_to_invoice' || s === 'invoiced') return 'converted';
  return s;
}

export function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0.00';
  return `$${v.toFixed(2)}`;
}
