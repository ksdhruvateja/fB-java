/**
 * Read-only pricing tool. Fixa must not invent payable amounts.
 * Authoritative totals stay in api/pricing.js and the job snapshot.
 */

import { resolveCustomerVisitFee } from '../../pricing.js';

export function readAuthoritativeVisitFee(rules, options = {}) {
  if (!rules) return null;
  return resolveCustomerVisitFee(rules, options);
}

export const PRICING_RULE = 'Fixa may explain that price comes from FixBridge. It must not invent fees, discounts, or Stripe amounts.';
