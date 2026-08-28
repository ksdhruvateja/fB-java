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
  if (!row) return { ok: false, message: 'This coupon is not valid for this service.' };
  if (row.active === false) return { ok: false, message: 'This coupon is not valid for this service.' };
  if (row.starts_at) {
    const start = row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at);
    if (!Number.isNaN(start.getTime()) && start.getTime() > Date.now()) {
      return { ok: false, message: 'This coupon is not valid for this service.' };
    }
  }
  if (row.expires_at) {
    const exp = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      return { ok: false, message: 'This coupon has expired.' };
    }
  }
  const maxUses = row.max_uses != null ? Number(row.max_uses) : null;
  const uses = Number(row.uses_count || 0);
  if (maxUses != null && Number.isFinite(maxUses) && uses >= maxUses) {
    return { ok: false, message: 'This coupon is not valid for this service.' };
  }
  const type = String(row.discount_type || 'percent').toLowerCase() === 'amount' ? 'amount' : 'percent';
  const value = Number(row.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: 'This coupon is not valid for this service.' };
  }
  if (type === 'percent' && value > 90) {
    return { ok: false, message: 'This coupon is not valid for this service.' };
  }
  return {
    ok: true,
    discount: {
      id: Number(row.id),
      code: String(row.code).toUpperCase(),
      label: row.label || null,
      discountType: type,
      value,
      minPurchase: row.min_purchase != null ? Number(row.min_purchase) : null,
      maxDiscount: row.max_discount != null ? Number(row.max_discount) : null,
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
    off = Math.round((base * (Number(discount.value) || 0)) / 100);
  }
  if (discount.maxDiscount != null && Number.isFinite(Number(discount.maxDiscount))) {
    off = Math.min(off, Math.max(0, Number(discount.maxDiscount)));
  }
  if (discount.minPurchase != null && Number.isFinite(Number(discount.minPurchase)) && base < Number(discount.minPurchase)) {
    return { retail: base, discountAmount: 0, rejected: 'min_purchase' };
  }
  off = Math.max(0, Math.round(off * 100) / 100);
  return { retail: Math.max(0, Math.round((base - off) * 100) / 100), discountAmount: off };
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
  const result = await claimDiscountRedemption(pool, discountId);
  if (!result.ok) throw new Error(result.message || 'Coupon redemption failed.');
  return result;
}

/**
 * Atomically claim one coupon use. Returns { ok, alreadyAtMax?, usesCount? }.
 * Safe under concurrent redemption (max_uses = 1 → exactly one winner).
 */
export async function claimDiscountRedemption(pool, discountId) {
  if (!discountId) return { ok: false, message: 'Missing discount id.' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM discount_codes WHERE id=$1 FOR UPDATE`, [discountId]);
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, message: 'Coupon not found.' };
    }
    if (row.active === false) {
      await client.query('ROLLBACK');
      return { ok: false, message: 'This coupon is not valid for this service.' };
    }
    const maxUses = row.max_uses != null ? Number(row.max_uses) : null;
    const uses = Number(row.uses_count || 0);
    if (maxUses != null && Number.isFinite(maxUses) && uses >= maxUses) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'coupon_exhausted', message: 'This coupon has reached its usage limit.' };
    }
    const { rows: updated } = await client.query(
      `UPDATE discount_codes SET uses_count = COALESCE(uses_count,0) + 1 WHERE id=$1 RETURNING uses_count`,
      [discountId]
    );
    await client.query('COMMIT');
    return { ok: true, usesCount: Number(updated[0]?.uses_count || uses + 1) };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
