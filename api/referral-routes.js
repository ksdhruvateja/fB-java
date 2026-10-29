import {
  addReferralNote,
  applyReferralCode,
  auditReferral,
  contractorBonusSummary,
  ensureReferralCode,
  getCreditBalances,
  getReferralConfig,
  listReferralsForUser,
  maskName,
  mergeReferralConfig,
  qualifyContractorNetworkReferral,
  qualifyReferralOnPaidService,
  saveReferralConfig,
  serializeRelationship,
  spendReferralCredit,
} from './referrals.js';
import { brand } from './brand.js';
import { isAdminRole } from './auth-helpers.js';

function dollars(cents) {
  return Math.round(Number(cents || 0) / 100);
}

function statusLabel(status) {
  return String(status || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function registerReferralRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
  // ── Me: dashboard ─────────────────────────────────────────────────────────
  app.get('/api/referrals/me', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.authUser.id]);
      const user = rows[0];
      if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });
      const code = await ensureReferralCode(pool, user);
      const config = await getReferralConfig(pool);
      const referrals = await listReferralsForUser(pool, user.id);
      const credits = await getCreditBalances(pool, user.id);
      const bonuses = user.role === 'contractor' ? await contractorBonusSummary(pool, user.id) : null;
      const origin = String(req.headers.origin || process.env.APP_ORIGIN || '').replace(/\/$/, '');
      const sharePath =
        user.role === 'contractor'
          ? `/?ref=${encodeURIComponent(code || '')}`
          : `/?ref=${encodeURIComponent(code || '')}`;
      const link = origin ? `${origin}${sharePath}` : sharePath;

      const offer =
        user.role === 'contractor'
          ? {
              customerRewardCents: config.contractor_customer.contractorRewardCents,
            }
          : {
              youEarnCents: config.homeowner_homeowner.referrerRewardCents,
              friendEarnsCents: config.homeowner_homeowner.referredRewardCents,
            };

      const shareMessage =
        user.role === 'contractor'
          ? `I use ${brand.productName} for home services — great for homeowners who need reliable pros.

Use my referral code ${code} when you sign up and I'll earn a bonus after your first qualifying paid service.`
          : `I use ${brand.productName} for home services.

Use my referral code ${code} when you sign up and we can both earn ${brand.productName} credit after the qualifying service.`;

      const referralRows =
        user.role === 'contractor'
          ? referrals.filter((r) => r.type === 'contractor_customer')
          : referrals;

      res.json({
        ok: true,
        code,
        link,
        shareMessage,
        offer,
        credits,
        bonuses,
        referrals: referralRows.map((r) => ({
          ...r,
          statusLabel: statusLabel(r.status),
          rewardDisplayCents:
            r.status === 'reward_available' || r.status === 'reward_earned' || r.status === 'reward_used'
              ? r.referrerRewardCents
              : r.referrerRewardCents,
        })),
        config: {
          combineWithCoupons: config.combineWithCoupons,
          maxCreditPerInvoiceCents: config.maxCreditPerInvoiceCents,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/referrals/apply', requireAuth, async (req, res) => {
    try {
      const code = req.body?.code || req.body?.referralCode;
      const result = await applyReferralCode(pool, req.authUser.id, code, {
        actorId: req.authUser.id,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/referrals/credits', requireAuth, async (req, res) => {
    try {
      const credits = await getCreditBalances(pool, req.authUser.id);
      res.json({ ok: true, credits });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/referrals/credits/apply', requireAuth, async (req, res) => {
    try {
      const amountCents = Math.round(Number(req.body?.amountCents || 0));
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      const result = await spendReferralCredit(pool, req.authUser.id, amountCents, {
        jobId,
        note: req.body?.note || null,
      });
      if (!result.ok) return res.status(400).json(result);
      const credits = await getCreditBalances(pool, req.authUser.id);
      res.json({ ok: true, ...result, credits });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/referrals/:id', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM referral_relationships WHERE id=$1`, [id]);
      const rel = rows[0];
      if (!rel) return res.status(404).json({ ok: false, message: 'Not found.' });
      const isAdmin = isAdminRole(req.authUser);
      if (
        !isAdmin &&
        Number(rel.referrer_user_id) !== Number(req.authUser.id) &&
        Number(rel.referred_user_id) !== Number(req.authUser.id)
      ) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const { rows: notes } = await pool.query(
        `SELECT * FROM referral_notes WHERE relationship_id=$1 ORDER BY created_at ASC`,
        [id]
      );
      let extras = {};
      if (isAdmin) {
        const { rows: people } = await pool.query(
          `SELECT id, name, email, role, company_name FROM users WHERE id = ANY($1::int[])`,
          [[rel.referrer_user_id, rel.referred_user_id].filter(Boolean)]
        );
        extras = {
          referrer: people.find((p) => Number(p.id) === Number(rel.referrer_user_id)) || null,
          referred: people.find((p) => Number(p.id) === Number(rel.referred_user_id)) || null,
        };
      } else {
        const { rows: people } = await pool.query(`SELECT id, name FROM users WHERE id=$1`, [
          rel.referred_user_id,
        ]);
        extras = { referredName: maskName(people[0]?.name) };
      }
      res.json({
        ok: true,
        relationship: serializeRelationship(rel, extras),
        notes: notes.map((n) => ({
          id: Number(n.id),
          authorLabel: n.author_label,
          body: n.body,
          createdAt: n.created_at,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  app.get('/api/admin/referrals/overview', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE type='homeowner_homeowner' AND created_at >= date_trunc('month', NOW()))::int AS hh_month,
          COUNT(*) FILTER (WHERE type='homeowner_homeowner' AND status IN ('reward_available','reward_earned','reward_used') AND created_at >= date_trunc('month', NOW()))::int AS hh_qualified,
          COUNT(*) FILTER (WHERE type='homeowner_homeowner' AND status IN ('signed_up','pending_qualification') AND created_at >= date_trunc('month', NOW()))::int AS hh_pending,
          COUNT(*) FILTER (WHERE type='contractor_customer' AND created_at >= date_trunc('month', NOW()))::int AS cc_month,
          COUNT(*) FILTER (WHERE type='contractor_contractor' AND created_at >= date_trunc('month', NOW()))::int AS cn_month
        FROM referral_relationships
      `);
      const { rows: rewardRows } = await pool.query(`
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE kind='earn' AND status IN ('available','used')),0)::int AS issued,
          COALESCE(SUM(amount_cents) FILTER (WHERE kind='earn' AND status='pending'),0)::int AS pending_credits
        FROM referral_credits
      `);
      const { rows: bonusRows } = await pool.query(`
        SELECT
          COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('available','paid')),0)::int AS issued,
          COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('available','pending')),0)::int AS pending
        FROM referral_payout_bonuses
      `);
      const o = rows[0] || {};
      res.json({
        ok: true,
        overview: {
          homeownerReferrals: o.hh_month || 0,
          qualified: o.hh_qualified || 0,
          pending: o.hh_pending || 0,
          contractorCustomerRefs: o.cc_month || 0,
          contractorNetworkRefs: o.cn_month || 0,
          rewardsIssuedCents:
            Number(rewardRows[0]?.issued || 0) + Number(bonusRows[0]?.issued || 0),
          pendingRewardsCents:
            Number(rewardRows[0]?.pending_credits || 0) + Number(bonusRows[0]?.pending || 0),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/referrals/config', requireAuth, requireAdmin, async (req, res) => {
    try {
      const config = await getReferralConfig(pool);
      res.json({ ok: true, config });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.put('/api/admin/referrals/config', requireAuth, requireAdminWrite, async (req, res) => {
    try {
      const config = await saveReferralConfig(pool, req.body?.config || req.body, req.authUser.id);
      await auditReferral(pool, req.authUser.id, 'referral_config_updated', null, { config });
      res.json({ ok: true, config });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.get('/api/admin/referrals', requireAuth, requireAdmin, async (req, res) => {
    try {
      const type = req.query.type ? String(req.query.type) : null;
      const status = req.query.status ? String(req.query.status) : null;
      const q = req.query.q ? String(req.query.q).trim() : '';
      const params = [];
      const where = [];
      if (type) {
        params.push(type);
        where.push(`r.type=$${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`r.status=$${params.length}`);
      }
      if (q) {
        params.push(`%${q}%`);
        where.push(
          `(r.public_id ILIKE $${params.length} OR r.referral_code ILIKE $${params.length} OR ru.name ILIKE $${params.length} OR rr.name ILIKE $${params.length})`
        );
      }
      const sql = `
        SELECT r.*,
               rr.name AS referrer_name, rr.email AS referrer_email, rr.role AS referrer_role,
               ru.name AS referred_name, ru.email AS referred_email, ru.role AS referred_role,
               ru.company_name AS referred_company
        FROM referral_relationships r
        LEFT JOIN users rr ON rr.id = r.referrer_user_id
        LEFT JOIN users ru ON ru.id = r.referred_user_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC
        LIMIT 300`;
      const { rows } = await pool.query(sql, params);
      res.json({
        ok: true,
        referrals: rows.map((row) =>
          serializeRelationship(row, {
            referrerName: row.referrer_name,
            referrerEmail: row.referrer_email,
            referrerRole: row.referrer_role,
            referredName: row.referred_name,
            referredEmail: row.referred_email,
            referredRole: row.referred_role,
            referredCompany: row.referred_company,
            statusLabel: statusLabel(row.status),
          })
        ),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/admin/referrals/:id/action', requireAuth, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const action = String(req.body?.action || '').toLowerCase();
      const note = req.body?.note ? String(req.body.note).slice(0, 2000) : null;
      const { rows } = await pool.query(`SELECT * FROM referral_relationships WHERE id=$1`, [id]);
      const rel = rows[0];
      if (!rel) return res.status(404).json({ ok: false, message: 'Not found.' });

      if (action === 'approve_reward' || action === 'release_reward') {
        await pool.query(
          `UPDATE referral_relationships SET status='qualified', updated_at=NOW() WHERE id=$1`,
          [id]
        );
        await qualifyReferralOnPaidService(pool, {
          jobId: rel.related_job_id,
          homeownerUserId: rel.referred_user_id,
        });
      } else if (action === 'reject' || action === 'mark_invalid') {
        await pool.query(
          `UPDATE referral_relationships SET status='invalid', invalid_reason=$2, updated_at=NOW() WHERE id=$1`,
          [id, note || 'Marked invalid by admin']
        );
      } else if (action === 'hold_reward') {
        await pool.query(
          `UPDATE referral_relationships SET status='held', hold_reason=$2, updated_at=NOW() WHERE id=$1`,
          [id, note || 'Held by admin']
        );
      } else if (action === 'cancel') {
        await pool.query(
          `UPDATE referral_relationships SET status='cancelled', updated_at=NOW() WHERE id=$1`,
          [id]
        );
      } else if (action === 'reverse_unpaid') {
        await pool.query(
          `UPDATE referral_credits SET status='cancelled' WHERE relationship_id=$1 AND kind='earn' AND status='available'`,
          [id]
        );
        await pool.query(
          `UPDATE referral_payout_bonuses SET status='cancelled' WHERE relationship_id=$1 AND status='available'`,
          [id]
        );
        await pool.query(
          `UPDATE referral_relationships SET status='invalid', invalid_reason=$2, updated_at=NOW() WHERE id=$1`,
          [id, note || 'Unpaid reward reversed']
        );
      } else if (action === 'add_note') {
        if (!note) return res.status(400).json({ ok: false, message: 'Note required.' });
      } else {
        return res.status(400).json({ ok: false, message: 'Unknown action.' });
      }

      if (note) {
        await addReferralNote(pool, id, note, {
          authorUserId: req.authUser.id,
          authorLabel: 'Admin',
        });
      } else if (action !== 'add_note') {
        await addReferralNote(pool, id, `Admin action: ${action}`, {
          authorUserId: req.authUser.id,
          authorLabel: 'Admin',
        });
      }
      await auditReferral(pool, req.authUser.id, `referral_${action}`, id, { note });
      const { rows: fresh } = await pool.query(`SELECT * FROM referral_relationships WHERE id=$1`, [id]);
      res.json({ ok: true, relationship: serializeRelationship(fresh[0]) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/admin/referrals/codes/:userId/disable', requireAuth, requireAdminWrite, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [userId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'User not found.' });
      const code = await ensureReferralCode(pool, rows[0]);
      await pool.query(
        `INSERT INTO referral_code_meta (user_id, code, disabled, updated_at)
         VALUES ($1,$2,TRUE,NOW())
         ON CONFLICT (user_id) DO UPDATE SET disabled=TRUE, updated_at=NOW()`,
        [userId, code]
      );
      await auditReferral(pool, req.authUser.id, 'referral_code_disabled', null, { userId, code });
      res.json({ ok: true, code, disabled: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });

  app.post('/api/admin/referrals/codes/:userId/regenerate', requireAuth, requireAdminWrite, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [userId]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'User not found.' });
      // Clear and regenerate
      await pool.query(`UPDATE users SET referral_code=NULL WHERE id=$1`, [userId]);
      rows[0].referral_code = null;
      const code = await ensureReferralCode(pool, rows[0]);
      await pool.query(
        `INSERT INTO referral_code_meta (user_id, code, disabled, regenerated_at, updated_at)
         VALUES ($1,$2,FALSE,NOW(),NOW())
         ON CONFLICT (user_id) DO UPDATE SET code=$2, disabled=FALSE, regenerated_at=NOW(), updated_at=NOW()`,
        [userId, code]
      );
      await auditReferral(pool, req.authUser.id, 'referral_code_regenerated', null, { userId, code });
      res.json({ ok: true, code });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error' });
    }
  });
}

/** Called from payment / completion hooks */
export async function onReferralQualifyingPayment(pool, { jobId, homeownerUserId, contractorUserId }) {
  try {
    if (homeownerUserId) {
      await qualifyReferralOnPaidService(pool, { jobId, homeownerUserId });
    }
    if (contractorUserId) {
      await qualifyContractorNetworkReferral(pool, { contractorUserId, jobId });
    }
  } catch (e) {
    console.error('onReferralQualifyingPayment', e);
  }
}

export { mergeReferralConfig, dollars };
