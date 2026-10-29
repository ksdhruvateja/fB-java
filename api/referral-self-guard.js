/**
 * Self-referral prevention for peer + partner referral attribution.
 */
import { normalizePhone } from './invoices.js';

export const SELF_REFERRAL_CODE = 'SELF_REFERRAL_NOT_ALLOWED';
export const SELF_REFERRAL_MESSAGE = 'You cannot use your own referral code for your account.';

export function normalizeReferralEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * @param {{ id?: number|string, email?: string|null, phone?: string|null }} referrer
 * @param {{ id?: number|string, email?: string|null, phone?: string|null }} referred
 */
export function isSameReferralIdentity(referrer, referred) {
  if (!referrer || !referred) return { blocked: false };

  if (
    referrer.id != null &&
    referred.id != null &&
    Number(referrer.id) === Number(referred.id)
  ) {
    return { blocked: true, reason: 'same_user_id', field: 'id' };
  }

  const referrerEmail = normalizeReferralEmail(referrer.email);
  const referredEmail = normalizeReferralEmail(referred.email);
  if (referrerEmail && referredEmail && referrerEmail === referredEmail) {
    return { blocked: true, reason: 'same_email', field: 'email' };
  }

  const referrerPhone = normalizePhone(String(referrer.phone || ''));
  const referredPhone = normalizePhone(String(referred.phone || ''));
  if (referrerPhone && referredPhone && referrerPhone === referredPhone) {
    return { blocked: true, reason: 'same_phone', field: 'phone' };
  }

  return { blocked: false };
}

export function selfReferralError(extra = {}) {
  return {
    ok: false,
    code: SELF_REFERRAL_CODE,
    message: SELF_REFERRAL_MESSAGE,
    selfReferralBlocked: true,
    ...extra,
  };
}

export function referralRewardsAllowed(relationship) {
  if (!relationship) return false;
  const referrerId = relationship.referrer_user_id ?? relationship.referrerUserId;
  const referredId = relationship.referred_user_id ?? relationship.referredUserId;
  if (referrerId == null || referredId == null) return true;
  return Number(referrerId) !== Number(referredId);
}

/**
 * Partner B2B: block when partner contact matches homeowner account.
 */
export function isPartnerSelfReferral(partner, homeownerUser) {
  if (!partner || !homeownerUser) return { blocked: false };
  return isSameReferralIdentity(
    { id: null, email: partner.email, phone: partner.phone },
    { id: homeownerUser.id, email: homeownerUser.email, phone: homeownerUser.phone }
  );
}

export async function logSelfReferralBlocked(pool, auditFn, {
  referrerUserId = null,
  referredUserId = null,
  reason = null,
  actorId = null,
  via = null,
  partnerId = null,
} = {}) {
  if (!auditFn) return;
  try {
    await auditFn(pool, actorId, 'SELF_REFERRAL_BLOCKED', null, {
      referrer_user_id: referrerUserId,
      referred_user_id: referredUserId,
      partner_id: partnerId,
      reason,
      via,
    });
  } catch {
    /* non-fatal */
  }
}
