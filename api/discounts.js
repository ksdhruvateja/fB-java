/**
 * Discount / promo codes for customer retail pricing.
 */

export function normalizeDiscountCode(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const asUrl = trimmed.includes('://') ? new URL(trimmed) : new URL(trimmed, 'https://local.invalid');
    const fromQuery = asUrl.searchParams.get('discount') || asUrl.searchParams.get('promo');
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  } catch {
    // not a URL
  }
  const match = trimmed.match(/[?&](?:discount|promo)=([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export async function lookupDiscountByCode(pool, code) {
  const normalized = normalizeDiscountCode(code);
  if (!normalized) return null;
  const { rows } = await pool.query(
    `SELECT * FROM discount_codes WHERE LOWER(code)=LOWER($1) LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

/** Returns { ok, discount?, message? } — public-safe validation. */
export function validateDiscountRow(row) {
  if (!row) return { ok: false, message: 'Discount code not found.' };
  if (row.active === false) return { ok: false, message: 'This discount code is inactive.' };
  if (row.expires_at) {
    const exp = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      return { ok: false, message: 'This discount code has expired.' };
    }
  }
  const maxUses = row.max_uses != null ? Number(row.max_uses) : null;
  const uses = Number(row.uses_count || 0);
  if (maxUses != null && Number.isFinite(maxUses) && uses >= maxUses) {
    return { ok: false, message: 'This discount code has reached its usage limit.' };
  }
  const type = String(row.discount_type || 'percent').toLowerCase() === 'amount' ? 'amount' : 'percent';
  const value = Number(row.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: 'Invalid discount code.' };
  }
  if (type === 'percent' && value > 90) {
    return { ok: false, message: 'Invalid discount code.' };
  }
  return {
    ok: true,
    discount: {
      id: Number(row.id),
      code: String(row.code).toUpperCase(),
      label: row.label || null,
      discountType: type,
      value,
    },
  };
}

export function publicDiscountView(discount) {
  if (!discount) return null;
  return {
    code: discount.code,
    label: discount.label,
    discountType: discount.discountType,
    value: discount.value,
    summary:
      discount.discountType === 'amount'
        ? `$${Math.round(discount.value)} off`
        : `${Math.round(discount.value)}% off`,
  };
}

/**
 * Apply a validated discount to a retail amount (dollars).
 * Returns { retail, discountAmount }.
 */
export function applyDiscountToAmount(retail, discount) {
  const base = Math.max(0, Number(retail) || 0);
  if (!discount) return { retail: base, discountAmount: 0 };
  let off = 0;
  if (discount.discountType === 'amount') {
    off = Math.min(base, Number(discount.value) || 0);
  } else {
    off = Math.round(base * (Number(discount.value) || 0) / 100);
  }
  off = Math.max(0, Math.round(off));
  return { retail: Math.max(0, base - off), discountAmount: off };
}

/** Apply discount to a preliminary retail pricing object (mutates copy). */
export function applyDiscountToPricing(pricing, discount) {
  if (!pricing || !discount) return pricing;
  if (pricing.show_price === false) {
    return {
      ...pricing,
      discount: {
        code: discount.code,
        label: discount.label,
        discountType: discount.discountType,
        value: discount.value,
        applied: false,
        note: 'Discount saved — will apply when a price is shown.',
      },
    };
  }
  const lowIn = pricing.customer_retail_estimate_low;
  const highIn = pricing.customer_retail_estimate_high;
  if (lowIn == null || highIn == null) return pricing;

  const low = applyDiscountToAmount(lowIn, discount);
  const high = applyDiscountToAmount(highIn, discount);
  const retailHigh = Math.max(low.retail, high.retail);

  return {
    ...pricing,
    customer_retail_estimate_low: low.retail,
    customer_retail_estimate_high: retailHigh,
    discount: {
      code: discount.code,
      label: discount.label,
      discountType: discount.discountType,
      value: discount.value,
      applied: true,
      amountLow: low.discountAmount,
      amountHigh: high.discountAmount,
      beforeLow: lowIn,
      beforeHigh: highIn,
    },
  };
}

export async function incrementDiscountUse(pool, discountId) {
  if (!discountId) return;
  await pool.query(
    `UPDATE discount_codes SET uses_count = COALESCE(uses_count,0) + 1 WHERE id=$1`,
    [discountId]
  );
}
