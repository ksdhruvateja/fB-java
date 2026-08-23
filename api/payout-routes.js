import {
  serializePayout,
  calculateContractorPayout,
  calculateInstantPayoutFee,
  normalizePayoutSettings,
  PAYOUT_STATUS,
  formatCents,
} from './payout-service.js';
import {
  loadPayoutSettings,
  logPayoutAudit,
  syncContractorAccountFromUser,
  buildContractorPayoutAccountView,
  ensurePayoutRecordForJob,
  approveAndReleasePayout,
  requestInstantPayout,
} from './payout-db.js';
import {
  stripeConfigured,
  createConnectAccountLink,
  createConnectAccountUpdateLink,
  createConnectLoginLink,
  createExpressAccount,
  stripeConnectReturnUrl,
  stripeConnectRefreshUrl,
} from './stripe.js';

function payoutSettingsToApi(row) {
  const s = normalizePayoutSettings(row || {});
  return {
    instantPayoutEnabled: s.instant_payout_enabled,
    instantFeeType: s.instant_fee_type,
    instantFeePercentageBps: s.instant_fee_percentage_bps,
    instantFeePercentage: s.instant_fee_percentage_bps / 100,
    instantFeeFixedCents: s.instant_fee_fixed_cents,
    minimumInstantFeeCents: s.minimum_instant_fee_cents,
    maximumInstantFeeCents: s.maximum_instant_fee_cents,
    minimumInstantPayoutCents: s.minimum_instant_payout_cents,
    maximumInstantPayoutCents: s.maximum_instant_payout_cents,
    contractorAbsorbsFee: s.contractor_absorbs_fee,
    fixbridgeAbsorbsFee: s.fixbridge_absorbs_fee,
  };
}

export function registerPayoutRoutes(app, { pool, requireAuth, requireAdmin, requireAdminWrite }) {
  // ── Admin payout settings ───────────────────────────────────────────────────
  app.get('/api/admin/payout-settings', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM payout_settings WHERE id='default'`);
      res.json({ ok: true, settings: payoutSettingsToApi(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load payout settings.' });
    }
  });

  app.put('/api/admin/payout-settings', requireAuth, requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      await pool.query(
        `UPDATE payout_settings SET
           instant_payout_enabled=COALESCE($1, instant_payout_enabled),
           instant_fee_type=COALESCE($2, instant_fee_type),
           instant_fee_percentage_bps=COALESCE($3, instant_fee_percentage_bps),
           instant_fee_fixed_cents=COALESCE($4, instant_fee_fixed_cents),
           minimum_instant_fee_cents=COALESCE($5, minimum_instant_fee_cents),
           maximum_instant_fee_cents=COALESCE($6, maximum_instant_fee_cents),
           minimum_instant_payout_cents=COALESCE($7, minimum_instant_payout_cents),
           maximum_instant_payout_cents=COALESCE($8, maximum_instant_payout_cents),
           contractor_absorbs_fee=COALESCE($9, contractor_absorbs_fee),
           fixbridge_absorbs_fee=COALESCE($10, fixbridge_absorbs_fee),
           updated_by=$11,
           updated_at=NOW()
         WHERE id='default'`,
        [
          b.instantPayoutEnabled,
          b.instantFeeType,
          b.instantFeePercentageBps ?? (b.instantFeePercentage != null ? Math.round(Number(b.instantFeePercentage) * 100) : null),
          b.instantFeeFixedCents,
          b.minimumInstantFeeCents,
          b.maximumInstantFeeCents,
          b.minimumInstantPayoutCents,
          b.maximumInstantPayoutCents,
          b.contractorAbsorbsFee,
          b.fixbridgeAbsorbsFee,
          req.authUser.id,
        ]
      );
      const { rows } = await pool.query(`SELECT * FROM payout_settings WHERE id='default'`);
      res.json({ ok: true, settings: payoutSettingsToApi(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not save payout settings.' });
    }
  });

  // ── Admin payouts dashboard ─────────────────────────────────────────────────
  app.get('/api/admin/payouts/summary', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT status, COUNT(*)::int AS count, COALESCE(SUM(net_amount_cents),0)::bigint AS total_cents
        FROM contractor_payouts
        GROUP BY status
      `);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { rows: paidMonth } = await pool.query(
        `SELECT COALESCE(SUM(net_amount_cents),0)::bigint AS total FROM contractor_payouts
         WHERE status='paid' AND paid_at >= $1`,
        [monthStart]
      );
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, { count: r.count, totalCents: Number(r.total_cents) }]));
      res.json({
        ok: true,
        summary: {
          pendingApproval: byStatus.pending_approval || { count: 0, totalCents: 0 },
          approved: byStatus.approved || { count: 0, totalCents: 0 },
          processing: byStatus.processing || { count: 0, totalCents: 0 },
          paidThisMonth: Number(paidMonth[0]?.total || 0),
          failed: byStatus.failed || { count: 0, totalCents: 0 },
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load summary.' });
    }
  });

  app.get('/api/admin/payouts', requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      const params = [];
      let where = '';
      if (status && status !== 'all') {
        params.push(status);
        where = `WHERE cp.status=$${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT cp.*, u.name AS contractor_name, u.email AS contractor_email, u.stripe_account_id
         FROM contractor_payouts cp
         JOIN users u ON u.id = cp.contractor_id
         ${where}
         ORDER BY cp.created_at DESC
         LIMIT 200`,
        params
      );
      res.json({
        ok: true,
        payouts: rows.map((r) =>
          serializePayout(r, {
            contractorName: r.contractor_name,
            contractorEmail: r.contractor_email,
            stripeAccountId: r.stripe_account_id,
          })
        ),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not list payouts.' });
    }
  });

  app.get('/api/admin/payouts/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { rows } = await pool.query(
        `SELECT cp.*, u.name AS contractor_name, mj.title AS job_title
         FROM contractor_payouts cp
         JOIN users u ON u.id = cp.contractor_id
         LEFT JOIN managed_jobs mj ON mj.id = cp.job_id
         WHERE cp.id=$1`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      const { rows: logs } = await pool.query(
        `SELECT * FROM payout_audit_logs WHERE payout_id=$1 ORDER BY created_at ASC`,
        [id]
      );
      const { rows: props } = await pool.query(
        `SELECT * FROM proposals WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [rows[0].job_id]
      );
      res.json({
        ok: true,
        payout: serializePayout(rows[0], {
          contractorName: rows[0].contractor_name,
          jobTitle: rows[0].job_title,
          proposal: props[0] || null,
        }),
        auditLogs: logs,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load payout.' });
    }
  });

  app.get('/api/admin/payouts/job/:jobId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const jobId = Number(req.params.jobId);
      const { rows } = await pool.query(
        `SELECT * FROM contractor_payouts WHERE job_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [jobId]
      );
      if (!rows[0]) {
        return res.json({ ok: true, payout: null });
      }
      res.json({ ok: true, payout: serializePayout(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load payout for job.' });
    }
  });

  app.post('/api/admin/payouts/:id/approve', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const adjustmentsCents = req.body?.adjustmentsCents != null ? Math.round(Number(req.body.adjustmentsCents)) : 0;
      const result = await approveAndReleasePayout(pool, id, req.authUser.id, {
        adjustmentsCents,
        note: req.body?.note,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json({ ok: true, payout: serializePayout(result.payout), transferId: result.transferId, simulated: result.simulated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not approve payout.' });
    }
  });

  app.post('/api/admin/payouts/:id/adjust', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const adjustmentsCents = Math.round(Number(req.body?.adjustmentsCents || 0));
      const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (![PAYOUT_STATUS.PENDING_APPROVAL, PAYOUT_STATUS.PENDING_JOB_COMPLETION].includes(rows[0].status)) {
        return res.status(400).json({ ok: false, message: 'Payout can no longer be adjusted.' });
      }
      const net = Math.max(0, Number(rows[0].gross_amount_cents) - Number(rows[0].platform_fee_cents) + adjustmentsCents);
      const prev = rows[0].status;
      await pool.query(
        `UPDATE contractor_payouts SET adjustments_cents=$1, net_amount_cents=$2, updated_at=NOW() WHERE id=$3`,
        [adjustmentsCents, net, id]
      );
      await logPayoutAudit(pool, {
        payoutId: id,
        action: 'adjusted',
        previousStatus: prev,
        newStatus: prev,
        performedBy: req.authUser.id,
        metadata: { adjustmentsCents, netAmountCents: net, reason: req.body?.reason },
      });
      const { rows: fresh } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [id]);
      res.json({ ok: true, payout: serializePayout(fresh[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not adjust payout.' });
    }
  });

  // Admin job payout — creates/updates contractor_payouts then approves release
  app.post('/api/admin/managed/jobs/:id/payout-v2', requireAuth, requireAdmin, requireAdminWrite, async (req, res) => {
    try {
      const jobId = Number(req.params.id);
      let payout = await ensurePayoutRecordForJob(pool, jobId, { actorUserId: req.authUser.id });
      if (!payout) return res.status(400).json({ ok: false, message: 'Could not create payout for job. Assign a contractor first.' });

      const amountOverride = req.body?.amount != null && req.body.amount !== '' ? Number(req.body.amount) : null;
      const adjustmentsCents =
        req.body?.adjustmentsCents != null ? Math.round(Number(req.body.adjustmentsCents)) : null;

      if (amountOverride != null && Number.isFinite(amountOverride) && amountOverride > 0) {
        const netCents = Math.round(amountOverride * 100);
        const grossCents = Math.round(netCents / 0.85);
        const platformFeeCents = Math.max(0, grossCents - netCents);
        await pool.query(
          `UPDATE contractor_payouts SET
             gross_amount_cents=$1,
             platform_fee_cents=$2,
             net_amount_cents=$3,
             updated_at=NOW()
           WHERE id=$4`,
          [grossCents, platformFeeCents, netCents, payout.id]
        );
        const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payout.id]);
        payout = rows[0];
      } else if (adjustmentsCents != null && Number.isFinite(adjustmentsCents)) {
        await pool.query(
          `UPDATE contractor_payouts SET adjustments_cents=$1, net_amount_cents=gross_amount_cents - platform_fee_cents + $1, updated_at=NOW() WHERE id=$2`,
          [adjustmentsCents, payout.id]
        );
        const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [payout.id]);
        payout = rows[0];
      }

      // Adjustments/amount already applied on the payout row above
      const result = await approveAndReleasePayout(pool, payout.id, req.authUser.id, {
        adjustmentsCents: 0,
        note: req.body?.note,
      });
      if (!result.ok) return res.status(400).json(result);

      const { rows: jobRows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [jobId]);
      res.json({
        ok: true,
        payout: serializePayout(result.payout),
        transferId: result.transferId,
        simulated: result.simulated,
        amount: Number(result.payout?.net_amount_cents || 0) / 100,
        job: jobRows[0] ? { id: jobId, status: jobRows[0].status } : null,
        message: `Payout of $${((Number(result.payout?.net_amount_cents || 0)) / 100).toFixed(2)} released.`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not release payout.' });
    }
  });

  // ── Contractor endpoints ────────────────────────────────────────────────────
  app.get('/api/contractor/payouts/summary', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const cid = req.authUser.id;
      const { rows } = await pool.query(
        `SELECT status, COALESCE(SUM(net_amount_cents),0)::bigint AS total
         FROM contractor_payouts WHERE contractor_id=$1 GROUP BY status`,
        [cid]
      );
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { rows: paidMonth } = await pool.query(
        `SELECT COALESCE(SUM(net_amount_cents),0)::bigint AS total FROM contractor_payouts
         WHERE contractor_id=$1 AND status='paid' AND paid_at >= $2`,
        [cid, monthStart]
      );
      const { rows: allTime } = await pool.query(
        `SELECT COALESCE(SUM(net_amount_cents),0)::bigint AS total FROM contractor_payouts WHERE contractor_id=$1`,
        [cid]
      );
      const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.total)]));
      res.json({
        ok: true,
        summary: {
          availableBalanceCents: map.approved || 0,
          pendingBalanceCents: (map.pending_approval || 0) + (map.pending_job_completion || 0) + (map.processing || 0),
          totalEarningsCents: Number(allTime[0]?.total || 0),
          paidThisMonthCents: Number(paidMonth[0]?.total || 0),
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load summary.' });
    }
  });

  app.get('/api/contractor/payouts', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(
        `SELECT * FROM contractor_payouts WHERE contractor_id=$1 ORDER BY created_at DESC`,
        [req.authUser.id]
      );
      res.json({
        ok: true,
        payouts: rows.map((r) => serializePayout(r)),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  app.get('/api/contractor/payouts/job/:jobId', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const jobId = Number(req.params.jobId);
      const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE job_id=$1`, [jobId]);
      if (!rows[0]) return res.json({ ok: true, payout: null });
      if (Number(rows[0].contractor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      res.json({ ok: true, payout: serializePayout(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  app.get('/api/contractor/payouts/:id', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const id = Number(req.params.id);
      const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(rows[0].contractor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      res.json({ ok: true, payout: serializePayout(rows[0]) });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Server error.' });
    }
  });

  app.post('/api/contractor/payouts/:id/instant', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const id = Number(req.params.id);
      const result = await requestInstantPayout(pool, id, req.authUser.id);
      if (!result.ok) return res.status(400).json(result);
      res.json({
        ok: true,
        payout: serializePayout(result.payout),
        instantFeeCents: result.instantFeeCents,
        netPayoutCents: result.netPayoutCents,
        simulated: result.simulated,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not process instant payout.' });
    }
  });

  app.post('/api/contractor/payouts/:id/preview-instant', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const id = Number(req.params.id);
      const settings = await loadPayoutSettings(pool);
      const { rows } = await pool.query(`SELECT * FROM contractor_payouts WHERE id=$1`, [id]);
      if (!rows[0]) return res.status(404).json({ ok: false, message: 'Not found.' });
      if (Number(rows[0].contractor_id) !== Number(req.authUser.id)) {
        return res.status(403).json({ ok: false, message: 'Not allowed.' });
      }
      const netCents = Number(rows[0].net_amount_cents);
      const fee = settings.fixbridge_absorbs_fee ? 0 : calculateInstantPayoutFee(netCents, settings);
      res.json({
        ok: true,
        availableCents: netCents,
        instantFeeCents: fee,
        youReceiveCents: Math.max(0, netCents - fee),
        formatted: {
          available: formatCents(netCents),
          instantFee: formatCents(fee),
          youReceive: formatCents(Math.max(0, netCents - fee)),
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not preview instant payout.' });
    }
  });

  app.get('/api/contractor/payout-account', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const account = await buildContractorPayoutAccountView(pool, req.authUser.id);
      if (!account) return res.status(404).json({ ok: false, message: 'Account not found.' });
      res.json({ ok: true, account });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'Could not load payout account.' });
    }
  });

  app.post('/api/contractor/payout-account/refresh', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const account = await buildContractorPayoutAccountView(pool, req.authUser.id);
      res.json({ ok: true, account });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not refresh payout account.' });
    }
  });

  app.post('/api/contractor/payout-account/connect', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.authUser.id]);
      let accountId = rows[0]?.stripe_account_id;
      if (!accountId) {
        const created = await createExpressAccount(req.authUser.email);
        accountId = created.accountId;
        await pool.query(
          `UPDATE users SET stripe_account_id=$1, stripe_onboarding_status=$2 WHERE id=$3`,
          [accountId, created.simulated ? 'simulated' : 'pending', req.authUser.id]
        );
      }
      if (!stripeConfigured()) {
        await pool.query(`UPDATE users SET stripe_onboarding_status='simulated', stripe_payouts_enabled=true WHERE id=$1`, [
          req.authUser.id,
        ]);
        const account = await buildContractorPayoutAccountView(pool, req.authUser.id);
        return res.json({ ok: true, simulated: true, accountId, account });
      }
      const link = await createConnectAccountLink(
        accountId,
        stripeConnectRefreshUrl(),
        stripeConnectReturnUrl()
      );
      await buildContractorPayoutAccountView(pool, req.authUser.id);
      res.json({ ok: true, simulated: false, url: link.url, accountId });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not start Stripe onboarding.' });
    }
  });

  app.post('/api/contractor/payout-account/add-bank', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(`SELECT stripe_account_id FROM users WHERE id=$1`, [req.authUser.id]);
      const accountId = rows[0]?.stripe_account_id;
      if (!accountId) {
        return res.status(400).json({ ok: false, message: 'Set up your payout account first.' });
      }
      if (!stripeConfigured()) {
        const account = await buildContractorPayoutAccountView(pool, req.authUser.id);
        return res.json({ ok: true, simulated: true, account, message: 'Simulated — bank account added in demo mode.' });
      }
      const link = await createConnectAccountUpdateLink(
        accountId,
        stripeConnectRefreshUrl(),
        stripeConnectReturnUrl()
      );
      res.json({ ok: true, url: link.url });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not open bank account setup.' });
    }
  });

  app.post('/api/contractor/payout-account/manage', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') return res.status(403).json({ ok: false, message: 'Contractors only.' });
      const { rows } = await pool.query(`SELECT stripe_account_id FROM users WHERE id=$1`, [req.authUser.id]);
      const accountId = rows[0]?.stripe_account_id;
      if (!accountId) return res.status(400).json({ ok: false, message: 'Connect Stripe first.' });
      if (!stripeConfigured()) {
        const account = await buildContractorPayoutAccountView(pool, req.authUser.id);
        return res.json({ ok: true, simulated: true, account, message: 'Stripe not configured — simulated account.' });
      }
      const link = await createConnectLoginLink(accountId);
      if (!link.url) {
        const onboarding = await createConnectAccountLink(
          accountId,
          stripeConnectRefreshUrl(),
          stripeConnectReturnUrl()
        );
        return res.json({ ok: true, url: onboarding.url });
      }
      res.json({ ok: true, url: link.url });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not open Stripe account.' });
    }
  });

  // Fee calculation preview (admin/internal)
  app.post('/api/payouts/calculate', requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await loadPayoutSettings(pool);
      const result = calculateContractorPayout({
        jobTotalCents: Math.round(Number(req.body?.jobTotalCents || 0)),
        platformFeeCents: req.body?.platformFeeCents != null ? Math.round(Number(req.body.platformFeeCents)) : undefined,
        contractorNetCents: req.body?.contractorNetCents != null ? Math.round(Number(req.body.contractorNetCents)) : undefined,
        adjustmentsCents: Math.round(Number(req.body?.adjustmentsCents || 0)),
        instantPayoutRequested: req.body?.instantPayoutRequested === true,
        instantPayoutSettings: settings,
      });
      res.json({ ok: true, breakdown: result });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Calculation failed.' });
    }
  });
}
