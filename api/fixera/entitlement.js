/**
 * Fixera AI access rule: AI assessment, reassessment and chat are HomeCare Pro features.
 * Homeowners without an active HomeCare Pro plan cannot use any Fixera AI; they can still pay
 * the platform fee and hire a professional. Admins are exempt (support and QA).
 */
import { getHomeCareEntitlement } from '../subscription-state.js';

export const HOMECARE_PLAN_REQUIRED = 'HOMECARE_PLAN_REQUIRED';
export const HOMECARE_PLAN_REQUIRED_MESSAGE =
  'Fixera AI assessment is included with HomeCare Pro. You can still hire a professional for this request.';

/** True when `userId` currently has an active HomeCare Pro entitlement. */
export async function userHasFixeraAiAccess(pool, userId) {
  if (userId == null) return false;
  try {
    const entitlement = await getHomeCareEntitlement(pool, userId);
    return entitlement?.hasAccess === true;
  } catch (error) {
    // Fail closed: a billing lookup error must not unlock a paid feature.
    console.warn('[fixera] HomeCare entitlement lookup failed', error?.message || error);
    return false;
  }
}

/**
 * Route guard. `ownerUserId` is the homeowner whose case is being assessed (defaults to the
 * caller). Sends 403 HOMECARE_PLAN_REQUIRED and returns false when access is not allowed.
 */
export async function requireFixeraAiAccess(pool, req, res, { ownerUserId } = {}) {
  if (req.authUser?.role === 'admin') return true;
  const subject = ownerUserId ?? req.authUser?.id;
  if (await userHasFixeraAiAccess(pool, subject)) return true;
  res.status(403).json({
    ok: false,
    code: HOMECARE_PLAN_REQUIRED,
    message: HOMECARE_PLAN_REQUIRED_MESSAGE,
    canHireProfessional: true,
  });
  return false;
}
