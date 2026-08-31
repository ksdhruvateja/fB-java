/**
 * FixBridge Refer & Earn — peer referral relationships, credits, and contractor payout bonuses.
 * Separate from promo coupons (discount_codes) and B2B partner codes.
 */
import crypto from 'crypto';
import { brand } from './brand.js';
import {
  isSameReferralIdentity,
  logSelfReferralBlocked,
  referralRewardsAllowed,
  selfReferralError,
  SELF_REFERRAL_CODE,
} from './referral-self-guard.js';

export const REFERRAL_TYPES = {
  HOMEOWNER_HOMEOWNER: 'homeowner_homeowner',
  CONTRACTOR_CUSTOMER: 'contractor_customer',
  CONTRACTOR_CONTRACTOR: 'contractor_contractor',
};

const DEFAULT_CONFIG = {
  homeowner_homeowner: {
    referrerRewardCents: 10000,
    referredRewardCents: 10000,
    rewardType: 'credit',
    qualifyOn: 'first_paid_service',
  },
  contractor_customer: {
    contractorRewardCents: 10000,
    rewardType: 'payout_bonus',
    qualifyOn: 'first_paid_service',
  },
  contractor_contractor: {
    contractorRewardCents: 7500,
    rewardType: 'payout_bonus',
    qualifyOn: 'approved_and_first_completed_job',
  },
  combineWithCoupons: false,
  maxCreditPerInvoiceCents: 10000,
  combineMultipleCredits: true,
};

export function mergeReferralConfig(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!raw || typeof raw !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (raw[key] != null && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
      base[key] = { ...base[key], ...raw[key] };
    } else if (raw[key] != null) {
      base[key] = raw[key];
    }
  }
  return base;
}

export async function getReferralConfig(pool) {
  const { rows } = await pool.query(`SELECT config FROM referral_settings WHERE id='default'`);
  return mergeReferralConfig(rows[0]?.config);
}

export async function saveReferralConfig(pool, config, adminUserId) {
  const next = mergeReferralConfig(config);
  await pool.query(
    `INSERT INTO referral_settings (id, config, updated_at, updated_by)
     VALUES ('default', $1::jsonb, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET config=$1::jsonb, updated_at=NOW(), updated_by=$2`,
    [JSON.stringify(next), adminUserId || null]
  );
  return next;
}

function makePublicId() {
  return `REF-${Math.floor(10000 + Math.random() * 90000)}`;
}

function makeCodeFromName(name, role) {
  const clean = String(name || 'USER')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const prefix = clean.slice(0, role === 'contractor' ? 6 : 4) || (role === 'contractor' ? 'PRO' : 'USER');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return role === 'contractor' ? `${prefix}-${suffix}` : `${prefix}${suffix}`.slice(0, 8);
}

export async function ensureReferralCode(pool, userRow) {
  if (!userRow?.id) return null;
  if (userRow.referral_code) {
    await pool.query(
      `INSERT INTO referral_code_meta (user_id, code, disabled, updated_at)
       VALUES ($1,$2,FALSE,NOW())
       ON CONFLICT (user_id) DO UPDATE SET code=EXCLUDED.code, updated_at=NOW()`,
      [userRow.id, userRow.referral_code]
    );
    return userRow.referral_code;
  }
  for (let i = 0; i < 12; i++) {
    const code = makeCodeFromName(userRow.name, userRow.role);
    try {
      await pool.query(`UPDATE users SET referral_code=$1 WHERE id=$2 AND referral_code IS NULL`, [
        code,
        userRow.id,
      ]);
      const { rows } = await pool.query(`SELECT referral_code FROM users WHERE id=$1`, [userRow.id]);
      const finalCode = rows[0]?.referral_code || code;
      await pool.query(
        `INSERT INTO referral_code_meta (user_id, code, disabled, updated_at)
         VALUES ($1,$2,FALSE,NOW())
         ON CONFLICT (user_id) DO UPDATE SET code=EXCLUDED.code, updated_at=NOW()`,
        [userRow.id, finalCode]
      );
      userRow.referral_code = finalCode;
      return finalCode;
    } catch {
      /* collision */
    }
  }
  return null;
}

export async function addReferralNote(
  pool,
  relationshipId,
  body,
  { authorUserId = null, authorLabel = 'System' } = {}
) {
  await pool.query(
    `INSERT INTO referral_notes (relationship_id, author_user_id, author_label, body)
     VALUES ($1,$2,$3,$4)`,
    [relationshipId, authorUserId, authorLabel, String(body).slice(0, 2000)]
  );
}

async function auditReferral(pool, actorId, action, relationshipId, detail = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail)
       VALUES ($1,$2,'referral',$3,$4::jsonb)`,
      [actorId || null, action, relationshipId || null, JSON.stringify(detail)]
    );
  } catch {
    /* non-fatal */
  }
}

function resolveType(referrerRole, referredRole) {
  if (referrerRole === 'contractor' && referredRole === 'contractor') {
    return REFERRAL_TYPES.CONTRACTOR_CONTRACTOR;
  }
  if (referrerRole === 'contractor') return REFERRAL_TYPES.CONTRACTOR_CUSTOMER;
  return REFERRAL_TYPES.HOMEOWNER_HOMEOWNER;
}

function rewardsForType(config, type) {
  if (type === REFERRAL_TYPES.CONTRACTOR_CONTRACTOR) {
    return {
      referrerRewardCents: Number(config.contractor_contractor.contractorRewardCents || 7500),
      referredRewardCents: 0,
      rewardType: 'payout_bonus',
    };
  }
  if (type === REFERRAL_TYPES.CONTRACTOR_CUSTOMER) {
    return {
      referrerRewardCents: Number(config.contractor_customer.contractorRewardCents || 10000),
      referredRewardCents: 0,
      rewardType: 'payout_bonus',
    };
  }
  return {
    referrerRewardCents: Number(config.homeowner_homeowner.referrerRewardCents || 10000),
    referredRewardCents: Number(config.homeowner_homeowner.referredRewardCents || 10000),
    rewardType: config.homeowner_homeowner.rewardType || 'credit',
  };
}

export function maskName(name) {
  const parts = String(name || 'Friend').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

export function serializeRelationship(row, extras = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    publicId: row.public_id,
    type: row.type,
    referrerUserId: Number(row.referrer_user_id),
    referredUserId: row.referred_user_id != null ? Number(row.referred_user_id) : null,
    referralCode: row.referral_code,
    status: row.status,
    referrerRewardCents: Number(row.referrer_reward_cents || 0),
    referredRewardCents: Number(row.referred_reward_cents || 0),
    rewardType: row.reward_type,
    qualificationEvent: row.qualification_event || null,
    relatedJobId: row.related_job_id != null ? Number(row.related_job_id) : null,
    qualifiedAt: row.qualified_at || null,
    rewardEarnedAt: row.reward_earned_at || null,
    rewardAvailableAt: row.reward_available_at || null,
    rewardUsedAt: row.reward_used_at || null,
    invalidReason: row.invalid_reason || null,
    holdReason: row.hold_reason || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...extras,
  };
}

/**
 * Attach a referred user to a referrer code once. Idempotent.
 */
export async function applyReferralCode(pool, referredUserId, rawCode, { actorId = null } = {}) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase();
  if (!code) return { ok: false, message: 'Referral code is required.' };

  const { rows: referredRows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [referredUserId]);
  const referred = referredRows[0];
  if (!referred) return { ok: false, message: 'User not found.' };

  const { rows: existingRel } = await pool.query(
    `SELECT * FROM referral_relationships WHERE referred_user_id=$1`,
    [referredUserId]
  );
  if (existingRel[0]) {
    return {
      ok: true,
      alreadyApplied: true,
      relationship: serializeRelationship(existingRel[0]),
      message: 'Referral already applied to this account.',
    };
  }

  if (referred.referred_by_code && referred.referred_by_code.toUpperCase() !== code) {
    return { ok: false, message: 'This account is already attributed to another referral.' };
  }

  const { rows: meta } = await pool.query(
    `SELECT user_id, code, disabled FROM referral_code_meta WHERE LOWER(code)=LOWER($1)`,
    [code]
  );
  if (meta[0]?.disabled) return { ok: false, message: 'This referral code is disabled.' };

  const { rows: referrers } = await pool.query(
    `SELECT id, name, email, role, referral_code FROM users WHERE LOWER(referral_code)=LOWER($1)`,
    [code]
  );
  const referrer = referrers[0];
  if (!referrer) return { ok: false, message: 'Referral code not found.' };

  const identity = isSameReferralIdentity(referrer, referred);
  if (identity.blocked) {
    await logSelfReferralBlocked(pool, auditReferral, {
      referrerUserId: referrer.id,
      referredUserId,
      reason: identity.reason,
      actorId: actorId || referredUserId,
      via: 'applyReferralCode',
    });
    return selfReferralError({
      reason: identity.reason,
      referrerUserId: Number(referrer.id),
      referredUserId: Number(referredUserId),
    });
  }

  const { rows: emailDup } = await pool.query(
    `SELECT r.id FROM referral_relationships r
     JOIN users u ON u.id = r.referred_user_id
     WHERE LOWER(u.email)=LOWER($1) AND r.referred_user_id != $2`,
    [referred.email, referredUserId]
  );
  if (emailDup[0]) {
    return { ok: false, message: 'A referral for this email already exists.' };
  }

  const config = await getReferralConfig(pool);
  const type = resolveType(referrer.role, referred.role);
  const rewards = rewardsForType(config, type);
  let publicId = makePublicId();
  for (let i = 0; i < 5; i++) {
    const { rows: clash } = await pool.query(`SELECT id FROM referral_relationships WHERE public_id=$1`, [
      publicId,
    ]);
    if (!clash[0]) break;
    publicId = makePublicId();
  }

  const { rows } = await pool.query(
    `INSERT INTO referral_relationships (
       public_id, type, referrer_user_id, referred_user_id, referral_code, status,
       referrer_reward_cents, referred_reward_cents, reward_type
     ) VALUES ($1,$2,$3,$4,$5,'pending_qualification',$6,$7,$8)
     ON CONFLICT (referred_user_id) DO NOTHING
     RETURNING *`,
    [
      publicId,
      type,
      referrer.id,
      referredUserId,
      referrer.referral_code,
      rewards.referrerRewardCents,
      rewards.referredRewardCents,
      rewards.rewardType,
    ]
  );

  let rel = rows[0];
  if (!rel) {
    const { rows: again } = await pool.query(
      `SELECT * FROM referral_relationships WHERE referred_user_id=$1`,
      [referredUserId]
    );
    return {
      ok: true,
      alreadyApplied: true,
      relationship: serializeRelationship(again[0]),
      message: 'Referral already applied to this account.',
    };
  }

  await pool.query(`UPDATE users SET referred_by_code=$1 WHERE id=$2`, [
    referrer.referral_code,
    referredUserId,
  ]);

  await addReferralNote(
    pool,
    rel.id,
    `Referral applied. Account signed up with code ${referrer.referral_code}.`
  );
  await auditReferral(pool, actorId || referredUserId, 'referral_applied', rel.id, {
    code: referrer.referral_code,
    type,
  });

  return {
    ok: true,
    relationship: serializeRelationship(rel),
    referrerName: maskName(referrer.name),
    message: 'Referral applied.',
  };
}

export async function getCreditBalances(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN kind='earn' AND status='pending' THEN amount_cents ELSE 0 END),0)::int AS pending,
            COALESCE(SUM(CASE WHEN kind='earn' AND status='available' THEN amount_cents
                              WHEN kind='spend' THEN amount_cents ELSE 0 END),0)::int AS available,
            COALESCE(SUM(CASE WHEN kind='spend' THEN ABS(amount_cents)
                              WHEN kind='earn' AND status='used' THEN amount_cents ELSE 0 END),0)::int AS used
     FROM referral_credits WHERE user_id=$1`,
    [userId]
  );
  return {
    availableCents: Math.max(0, Number(rows[0]?.available || 0)),
    pendingCents: Math.max(0, Number(rows[0]?.pending || 0)),
    usedCents: Math.max(0, Number(rows[0]?.used || 0)),
  };
}

async function grantHomeownerCredits(pool, rel) {
  if (!referralRewardsAllowed(rel)) {
    await pool.query(
      `UPDATE referral_relationships SET status='invalid', invalid_reason=$2, updated_at=NOW() WHERE id=$1`,
      [rel.id, 'Self-referral blocked before credit issuance']
    );
    return;
  }
  const { rows: existing } = await pool.query(
    `SELECT id FROM referral_credits WHERE relationship_id=$1 AND kind='earn'`,
    [rel.id]
  );
  if (existing.length) return;

  if (Number(rel.referrer_reward_cents) > 0) {
    await pool.query(
      `INSERT INTO referral_credits (user_id, relationship_id, amount_cents, kind, status, note)
       VALUES ($1,$2,$3,'earn','available',$4)`,
      [rel.referrer_user_id, rel.id, rel.referrer_reward_cents, `Referral reward ${rel.public_id}`]
    );
  }
  if (Number(rel.referred_reward_cents) > 0 && rel.referred_user_id) {
    await pool.query(
      `INSERT INTO referral_credits (user_id, relationship_id, amount_cents, kind, status, note)
       VALUES ($1,$2,$3,'earn','available',$4)`,
      [rel.referred_user_id, rel.id, rel.referred_reward_cents, `Welcome referral credit ${rel.public_id}`]
    );
  }
}

async function grantContractorBonus(pool, rel) {
  if (!referralRewardsAllowed(rel)) {
    await pool.query(
      `UPDATE referral_relationships SET status='invalid', invalid_reason=$2, updated_at=NOW() WHERE id=$1`,
      [rel.id, 'Self-referral blocked before bonus issuance']
    );
    return;
  }
  const { rows: existing } = await pool.query(
    `SELECT id FROM referral_payout_bonuses WHERE relationship_id=$1`,
    [rel.id]
  );
  if (existing[0]) return;
  const bonusType =
    rel.type === REFERRAL_TYPES.CONTRACTOR_CONTRACTOR
      ? 'contractor_referral_bonus'
      : 'customer_referral_bonus';
  await pool.query(
    `INSERT INTO referral_payout_bonuses
      (contractor_user_id, relationship_id, amount_cents, bonus_type, status, note)
     VALUES ($1,$2,$3,$4,'available',$5)`,
    [rel.referrer_user_id, rel.id, rel.referrer_reward_cents, bonusType, `Referral ${rel.public_id}`]
  );
}

export async function qualifyReferralOnPaidService(pool, { jobId, homeownerUserId }) {
  if (!homeownerUserId) return { ok: false };
  const { rows: rels } = await pool.query(
    `SELECT * FROM referral_relationships
     WHERE referred_user_id=$1
       AND status IN ('signed_up','pending_qualification','qualified')`,
    [homeownerUserId]
  );
  const rel = rels[0];
  if (!rel) return { ok: true, skipped: true };
  if (!referralRewardsAllowed(rel)) {
    await pool.query(
      `UPDATE referral_relationships SET status='invalid', invalid_reason='Self-referral blocked', updated_at=NOW() WHERE id=$1`,
      [rel.id]
    );
    return { ok: true, skipped: true, selfReferralBlocked: true };
  }
  if (['reward_earned', 'reward_available', 'reward_used'].includes(rel.status)) {
    return { ok: true, alreadyRewarded: true };
  }
  if (['cancelled', 'invalid', 'held'].includes(rel.status)) {
    return { ok: true, skipped: true };
  }

  await pool.query(
    `UPDATE referral_relationships SET
       status='qualified',
       qualification_event='First paid service completed',
       related_job_id=$2,
       qualified_at=NOW(),
       updated_at=NOW()
     WHERE id=$1 AND status NOT IN ('reward_earned','reward_available','reward_used','cancelled','invalid','held')`,
    [rel.id, jobId || null]
  );

  const { rows: locked } = await pool.query(
    `UPDATE referral_relationships SET
       status='reward_available',
       reward_earned_at=NOW(),
       reward_available_at=NOW(),
       updated_at=NOW()
     WHERE id=$1 AND status='qualified'
     RETURNING *`,
    [rel.id]
  );
  const updated = locked[0];
  if (!updated) return { ok: true, alreadyRewarded: true };

  if (updated.reward_type === 'payout_bonus') {
    await grantContractorBonus(pool, updated);
  } else {
    await grantHomeownerCredits(pool, updated);
  }

  await addReferralNote(
    pool,
    updated.id,
    `Qualified after first paid service${jobId ? ` (job #${jobId})` : ''}. Rewards issued once.`
  );
  await auditReferral(pool, null, 'referral_rewarded', updated.id, { jobId });

  try {
    const { sendEmailSafe } = await import('./notify.js');
    const { rows: people } = await pool.query(
      `SELECT id, name, email, role FROM users WHERE id = ANY($1::int[])`,
      [[updated.referrer_user_id, updated.referred_user_id].filter(Boolean)]
    );
    const byId = Object.fromEntries(people.map((p) => [Number(p.id), p]));
    const referrer = byId[Number(updated.referrer_user_id)];
    const referred = byId[Number(updated.referred_user_id)];
    const dollars = (Number(updated.referrer_reward_cents) / 100).toFixed(0);
    if (referrer?.email) {
      if (updated.reward_type === 'payout_bonus') {
        await sendEmailSafe({
          to: referrer.email,
          subject: `Referral bonus earned — $${dollars}`,
          html: `<p>Hi ${referrer.name || 'there'},</p>
            <p>Your referred homeowner completed their qualifying service.</p>
            <p><strong>$${dollars}</strong> has been added to your ${brand.productName} payout balance as a referral bonus.</p>`,
        });
      } else {
        await sendEmailSafe({
          to: referrer.email,
          subject: `Referral update — you've earned $${dollars} credit`,
          html: `<p>Hi ${referrer.name || 'there'},</p>
            <p>${maskName(referred?.name)} completed their first qualifying service.</p>
            <p>You've earned <strong>$${dollars}</strong> in ${brand.productName} credit.</p>`,
        });
      }
    }
    if (referred?.email && Number(updated.referred_reward_cents) > 0) {
      const welcome = (Number(updated.referred_reward_cents) / 100).toFixed(0);
      await sendEmailSafe({
        to: referred.email,
        subject: `You've earned $${welcome} FixBridge credit`,
        html: `<p>Hi ${referred.name || 'there'},</p>
          <p>You've received <strong>$${welcome}</strong> in ${brand.productName} referral credit for your next eligible service.</p>`,
      });
    }
  } catch {
    /* non-fatal */
  }

  return { ok: true, relationship: serializeRelationship(updated) };
}

export async function qualifyContractorNetworkReferral(pool, { contractorUserId, jobId }) {
  const { rows: users } = await pool.query(`SELECT compliance_status FROM users WHERE id=$1`, [
    contractorUserId,
  ]);
  if (users[0]?.compliance_status !== 'approved') {
    return { ok: true, pending: true };
  }
  return qualifyReferralOnPaidService(pool, { jobId, homeownerUserId: contractorUserId });
}

export async function spendReferralCredit(pool, userId, amountCents, { jobId = null, note = null } = {}) {
  const bal = await getCreditBalances(pool, userId);
  const config = await getReferralConfig(pool);
  const maxPer = Number(config.maxCreditPerInvoiceCents || 0);
  let spend = Math.min(Number(amountCents) || 0, bal.availableCents);
  if (maxPer > 0) spend = Math.min(spend, maxPer);
  if (spend <= 0) return { ok: false, message: 'No referral credit available.', spentCents: 0 };

  await pool.query(
    `INSERT INTO referral_credits (user_id, amount_cents, kind, status, related_job_id, note)
     VALUES ($1,$2,'spend','used',$3,$4)`,
    [userId, -Math.abs(spend), jobId, note || 'Applied to service']
  );
  return { ok: true, spentCents: spend };
}

export async function listReferralsForUser(pool, userId) {
  const { rows } = await pool.query(
    `SELECT r.*,
            ru.name AS referred_name,
            ru.company_name AS referred_company
     FROM referral_relationships r
     LEFT JOIN users ru ON ru.id = r.referred_user_id
     WHERE r.referrer_user_id=$1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [userId]
  );
  return rows.map((row) =>
    serializeRelationship(row, {
      referredName: maskName(row.referred_name || row.referred_company || 'Referral'),
      referredCompany: row.referred_company || null,
    })
  );
}

export async function contractorBonusSummary(pool, contractorUserId) {
  const { rows } = await pool.query(
    `SELECT status, amount_cents FROM referral_payout_bonuses WHERE contractor_user_id=$1`,
    [contractorUserId]
  );
  let total = 0;
  let pending = 0;
  let paid = 0;
  for (const r of rows) {
    const amt = Number(r.amount_cents || 0);
    total += amt;
    if (r.status === 'paid') paid += amt;
    else pending += amt;
  }
  return { totalCents: total, pendingCents: pending, paidCents: paid };
}

export { DEFAULT_CONFIG, auditReferral, SELF_REFERRAL_CODE };
