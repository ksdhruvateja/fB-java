/**
 * Admin universal search — parameterized, RBAC-protected.
 */

function clampQ(q) {
  return String(q || '').trim().slice(0, 120);
}

function isNumericish(q) {
  return /^[A-Za-z]*-?\d+$/.test(q) || /^\d+$/.test(q);
}

function numericTail(q) {
  const m = String(q).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function registerAdminSearchRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/admin/search', requireAuth, requireAdmin, async (req, res) => {
    try {
      const q = clampQ(req.query.q);
      if (q.length < 2) {
        return res.json({ ok: true, results: { jobs: [], homeowners: [], contractors: [], quotes: [], invoices: [], payments: [], payouts: [], tickets: [], technicians: [] } });
      }

      const like = `%${q.replace(/[%_]/g, '')}%`;
      const idGuess = numericTail(q);

      const jobs = await pool.query(
        `SELECT id, title, status, booking_id, contact_name, city_state_zip
         FROM managed_jobs
         WHERE CAST(id AS TEXT) = $1
            OR booking_id ILIKE $2
            OR title ILIKE $2
            OR contact_name ILIKE $2
            OR full_address ILIKE $2
            OR city_state_zip ILIKE $2
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 8`,
        [idGuess ? String(idGuess) : q, like],
      );

      const homeowners = await pool.query(
        `SELECT id, name, email, phone FROM users
         WHERE role='homeowner'
           AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR CAST(id AS TEXT) = $2)
         ORDER BY name ASC LIMIT 8`,
        [like, idGuess ? String(idGuess) : ''],
      );

      const contractors = await pool.query(
        `SELECT id, name, email, company_name
         FROM users
         WHERE role='contractor'
           AND (name ILIKE $1 OR email ILIKE $1 OR company_name ILIKE $1 OR CAST(id AS TEXT) = $2)
         ORDER BY COALESCE(company_name, name) ASC LIMIT 8`,
        [like, idGuess ? String(idGuess) : ''],
      );

      const quotes = await pool.query(
        `SELECT p.id, p.quote_number, p.job_id, p.status, p.retail_amount
         FROM proposals p
         WHERE p.quote_number ILIKE $1
            OR CAST(p.id AS TEXT) = $2
            OR CAST(p.job_id AS TEXT) = $2
         ORDER BY p.created_at DESC LIMIT 8`,
        [like, idGuess ? String(idGuess) : q],
      );

      const invoices = await pool.query(
        `SELECT id, invoice_number, job_id, status, amount_due
         FROM homeowner_invoices
         WHERE invoice_number ILIKE $1 OR CAST(id AS TEXT) = $2 OR CAST(job_id AS TEXT) = $2
         ORDER BY created_at DESC LIMIT 8`,
        [like, idGuess ? String(idGuess) : q],
      );

      const payments = await pool.query(
        `SELECT id, job_id, amount, status, stripe_payment_intent
         FROM payments
         WHERE CAST(id AS TEXT) = $1
            OR stripe_payment_intent ILIKE $2
            OR CAST(job_id AS TEXT) = $1
         ORDER BY created_at DESC LIMIT 8`,
        [idGuess ? String(idGuess) : q, like],
      );

      const payouts = await pool.query(
        `SELECT id, job_id, net_amount_cents, status, stripe_transfer_id
         FROM contractor_payouts
         WHERE CAST(id AS TEXT) = $1
            OR stripe_transfer_id ILIKE $2
            OR CAST(job_id AS TEXT) = $1
         ORDER BY created_at DESC LIMIT 8`,
        [idGuess ? String(idGuess) : q, like],
      );

      const tickets = await pool.query(
        `SELECT id, subject, status, user_id, related_job_id
         FROM support_tickets
         WHERE CAST(id AS TEXT) = $1 OR subject ILIKE $2 OR ticket_number ILIKE $2
         ORDER BY updated_at DESC NULLS LAST LIMIT 8`,
        [idGuess ? String(idGuess) : q, like],
      );

      const technicians = await pool.query(
        `SELECT e.id, e.full_name, e.contractor_user_id, e.job_title, u.name AS contractor_name
         FROM contractor_employees e
         LEFT JOIN users u ON u.id = e.contractor_user_id
         WHERE e.full_name ILIKE $1 OR CAST(e.id AS TEXT) = $2
         ORDER BY e.full_name ASC LIMIT 8`,
        [like, idGuess ? String(idGuess) : ''],
      );

      return res.json({
        ok: true,
        query: q,
        results: {
          jobs: jobs.rows.map((r) => ({
            id: r.id,
            label: r.booking_id || `FB-${r.id}`,
            subtitle: r.title,
            status: r.status,
            href: { tab: 'work-queue', jobId: r.id },
          })),
          homeowners: homeowners.rows.map((r) => ({
            id: r.id,
            label: r.name,
            subtitle: r.email,
            href: { tab: 'subscriptions', homeownerUserId: r.id },
          })),
          contractors: contractors.rows.map((r) => ({
            id: r.id,
            label: r.company_name || r.name,
            subtitle: r.email,
            href: { tab: 'contractors', contractorUserId: r.id },
          })),
          quotes: quotes.rows.map((r) => ({
            id: r.id,
            label: r.quote_number || `Quote #${r.id}`,
            subtitle: r.retail_amount != null ? `$${Number(r.retail_amount).toFixed(2)}` : null,
            jobId: r.job_id,
            href: { tab: 'work-queue', jobId: r.job_id, quoteId: r.id },
          })),
          invoices: invoices.rows.map((r) => ({
            id: r.id,
            label: r.invoice_number || `INV-${r.id}`,
            subtitle: r.status,
            jobId: r.job_id,
            href: { tab: 'finance', invoiceId: r.id },
          })),
          payments: payments.rows.map((r) => ({
            id: r.id,
            label: `Payment #${r.id}`,
            subtitle: r.status,
            jobId: r.job_id,
            href: { tab: 'finance', paymentId: r.id },
          })),
          payouts: payouts.rows.map((r) => ({
            id: r.id,
            label: `Payout #${r.id}`,
            subtitle: r.status,
            jobId: r.job_id,
            href: { tab: 'finance', payoutId: r.id },
          })),
          tickets: tickets.rows.map((r) => ({
            id: r.id,
            label: r.subject || `Ticket #${r.id}`,
            subtitle: r.status,
            href: { tab: 'support-tickets', ticketId: r.id },
          })),
          technicians: technicians.rows.map((r) => ({
            id: r.id,
            label: r.full_name,
            subtitle: r.contractor_name,
            contractorUserId: r.contractor_user_id,
            href: { tab: 'contractors', contractorUserId: r.contractor_user_id },
          })),
        },
      });
    } catch (e) {
      console.error('admin search:', e);
      return res.status(500).json({ ok: false, message: 'Search failed.' });
    }
  });
}
