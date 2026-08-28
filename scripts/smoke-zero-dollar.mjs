/**
 * $0 checkout live test — 100% coupon, no Stripe session, idempotent retry.
 */
import pg from 'pg';
import { API, authH, json, loginHomeowner } from './smoke-auth.mjs';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const maria = await loginHomeowner();
  const homeownerId = Number(maria.user?.id);
  const code = `ZERO100-${Date.now()}`;

  await pool.query(
    `INSERT INTO discount_codes (code, label, discount_type, value, max_uses, active, uses_count)
     VALUES ($1,'Zero checkout test','percent',100,1,true,0)`,
    [code]
  );

  const { rows: jobRows } = await pool.query(
    `INSERT INTO managed_jobs (homeowner_user_id, category, title, description, status, contact_name, city_state_zip, discount_code, discount_type, discount_value, booking_id)
     VALUES ($1,'Plumbing','Zero dollar test','x','customer_review_pending','Maria','NY 10001',$2,'percent',100,$3)
     RETURNING id`,
    [homeownerId, code, `FB-ZERO-${Date.now()}`]
  );
  const jobId = jobRows[0].id;

  const invNum = `FBI-ZERO-${jobId}`;
  const { rows: invRows } = await pool.query(
    `INSERT INTO homeowner_invoices (job_id, homeowner_user_id, invoice_number, status, subtotal, total, amount_due, paid, discount_type, discount_value, discount_amount, line_items, bill_to)
     VALUES ($1,$2,$3,'due',100,0,0,0,'percent',100,100,'[]','{}')
     RETURNING id`,
    [jobId, homeownerId, invNum]
  );
  const invoiceId = invRows[0].id;

  const checkoutOnce = () =>
    fetch(`${API}/api/homeowner/invoices/${invoiceId}/checkout`, {
      method: 'POST',
      headers: authH(maria.token),
      body: JSON.stringify({ tipAmount: 0 }),
    }).then(json);

  const [a, b] = await Promise.all([checkoutOnce(), checkoutOnce()]);
  if (!a.zeroDollar && !b.zeroDollar) {
    console.log('checkout A:', a.status, a.message || a.raw);
    console.log('checkout B:', b.status, b.message || b.raw);
  }
  const ok = a.zeroDollar || b.zeroDollar;
  const hasStripe = Boolean(a.checkoutUrl || b.checkoutUrl);

  console.log(ok && !hasStripe ? 'PASS' : 'FAIL', '$0 checkout no Stripe session', `zero=${ok} stripe=${hasStripe}`);

  const { rows: inv } = await pool.query(`SELECT status, paid, total, amount_due, payment_method FROM homeowner_invoices WHERE id=$1`, [invoiceId]);
  const paid = String(inv[0]?.status).toLowerCase() === 'paid';
  console.log(paid ? 'PASS' : 'FAIL', 'invoice paid at $0', inv[0]);

  const uses = await pool.query(`SELECT uses_count FROM discount_codes WHERE code=$1`, [code]);
  const settlements = await pool.query(`SELECT COUNT(*)::int n FROM payment_settlements WHERE job_id=$1`, [jobId]);
  console.log(uses.rows[0]?.uses_count <= 1 ? 'PASS' : 'FAIL', 'single coupon redemption', `uses=${uses.rows[0]?.uses_count}`);
  console.log(settlements.rows[0]?.n === 1 ? 'PASS' : 'FAIL', 'single settlement', `n=${settlements.rows[0]?.n}`);

  await pool.end();
  if (!ok || hasStripe || !paid || settlements.rows[0]?.n !== 1) process.exit(1);
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
