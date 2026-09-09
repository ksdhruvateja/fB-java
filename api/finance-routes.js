/**
 * Admin finance overview with date-range filtering.
 */
export function registerFinanceRoutes(app, { pool, requireAuth, requireAdmin }) {
  function rangeToSql(range, customFrom, customTo) {
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start, to: now };
    }
    if (range === '7d') {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from, to: now };
    }
    if (range === '30d') {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from, to: now };
    }
    if (range === 'this_month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now };
    }
    if (range === 'last_month') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to };
    }
    if (range === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from, to: now };
  }

  app.get('/api/admin/finance/overview', requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = String(req.query?.range || '30d');
      const { from, to } = rangeToSql(range, req.query?.from, req.query?.to);

      const { rows: payRows } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status='succeeded' AND amount > 0 THEN amount ELSE 0 END), 0) AS customer_payments,
           COALESCE(SUM(CASE WHEN status='succeeded' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refunds
         FROM payments WHERE created_at >= $1 AND created_at <= $2`,
        [from, to]
      );

      let contractorPayables = 0;
      let contractorPayouts = 0;
      let payoutFees = 0;
      try {
        const { rows: payoutRows } = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN status IN ('available','requested','processing','on_hold') THEN net_amount ELSE 0 END), 0) AS payables,
             COALESCE(SUM(CASE WHEN status='paid' THEN net_amount ELSE 0 END), 0) AS paid_out,
             COALESCE(SUM(CASE WHEN status='paid' THEN fee_amount ELSE 0 END), 0) AS fees
           FROM contractor_payouts WHERE created_at >= $1 AND created_at <= $2`,
          [from, to]
        );
        contractorPayables = Number(payoutRows[0]?.payables || 0);
        contractorPayouts = Number(payoutRows[0]?.paid_out || 0);
        payoutFees = Number(payoutRows[0]?.fees || 0);
      } catch {
        /* payout table optional */
      }

      const { rows: invRows } = await pool.query(
        `SELECT COALESCE(SUM(amount_due), 0) AS outstanding
         FROM homeowner_invoices WHERE status NOT IN ('paid','void','cancelled')`
      );

      const customerPayments = Number(payRows[0]?.customer_payments || 0);
      const refunds = Number(payRows[0]?.refunds || 0);
      const grossRevenue = customerPayments;
      const directContractorCost = contractorPayouts;
      const platformContribution = grossRevenue - directContractorCost - refunds;
      const estimatedNetProfit = platformContribution - payoutFees;

      res.json({
        ok: true,
        range: { from: from.toISOString(), to: to.toISOString(), preset: range },
        summary: {
          customerPayments,
          contractorPayables,
          contractorPayouts,
          outstandingInvoices: Number(invRows[0]?.outstanding || 0),
          refunds,
          grossRevenue,
          directContractorCost,
          platformContribution,
          estimatedNetProfit,
          payoutFees,
        },
      });
    } catch (e) {
      console.error('finance overview:', e);
      res.status(500).json({ ok: false, message: 'Could not load finance overview.' });
    }
  });

  app.get('/api/admin/finance/invoices', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT hi.*, u.name AS homeowner_name, p.quote_number
         FROM homeowner_invoices hi
         LEFT JOIN users u ON u.id = hi.homeowner_user_id
         LEFT JOIN proposals p ON p.id = hi.proposal_id
         ORDER BY hi.created_at DESC LIMIT 200`
      );
      res.json({
        ok: true,
        invoices: rows.map((inv) => ({
          id: Number(inv.id),
          invoiceNumber: inv.invoice_number,
          quoteNumber: inv.quote_number,
          jobId: Number(inv.job_id),
          homeownerName: inv.homeowner_name,
          total: Number(inv.total || 0),
          paid: Number(inv.paid || 0),
          amountDue: Number(inv.amount_due || 0),
          status: inv.status,
          dueDate: inv.due_date,
          createdAt: inv.created_at,
        })),
      });
    } catch (e) {
      console.error('finance invoices:', e);
      res.status(500).json({ ok: false, message: 'Could not load invoices.' });
    }
  });
}
