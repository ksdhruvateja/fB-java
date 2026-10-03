import { getStripe } from './stripe.js';

// Never create another payment while a previous booking session is completed.
// Reuse matching open sessions; expire obsolete open sessions before repricing.
export async function reconcileBookingCheckout(pool, { entityId, userId, paymentType, amountCents, stripe = null }) {
  const { rows } = await pool.query(
    `SELECT * FROM payments WHERE user_id=$1 AND payment_type=$2 AND ${paymentType === 'dispatch_fee' ? 'job_id=$3' : "meta->>'pendingServiceRequestId'=$3"} ORDER BY id DESC`,
    [userId, paymentType, paymentType === 'dispatch_fee' ? entityId : String(entityId)]
  );
  if (rows.some((payment) => ['succeeded','paid','authorized','captured'].includes(String(payment.status)))) {
    throw Object.assign(new Error('This booking fee is already paid or authorized. Refresh your request.'), { status:409, code:'BOOKING_ALREADY_PAID' });
  }
  const provider = stripe || await getStripe();
  const sessions = [];
  const seen = new Set();
  for (const payment of rows) {
    if (!payment.stripe_session_id || seen.has(payment.stripe_session_id) || !provider) continue;
    seen.add(payment.stripe_session_id);
    const session = await provider.checkout.sessions.retrieve(payment.stripe_session_id);
    if (session.status === 'complete' || session.payment_status === 'paid') {
      throw Object.assign(new Error('Your payment is being confirmed. Refresh before trying again.'), { status:409, code:'BOOKING_PAYMENT_CONFIRMING' });
    }
    sessions.push({ payment, session });
  }
  const reusable = sessions.find(({ session }) => session.status === 'open' && Number(session.amount_total) === amountCents && session.url);
  for (const { payment, session } of sessions) {
    if (reusable?.session.id === session.id) continue;
    if (session.status === 'open') await provider.checkout.sessions.expire(session.id);
    await pool.query(`UPDATE payments SET status='canceled' WHERE stripe_session_id=$1 AND status='pending'`, [session.id]);
  }
  return { checkout:reusable ? { sessionId:reusable.session.id, url:reusable.session.url } : null, previousSessionId:rows[0]?.stripe_session_id || 'initial' };
}

// Reconcile signed provider evidence against the durable amount accepted at
// checkout, not today's setting. Admin changes must not rewrite prior payments.
export async function assertPendingBookingPayment(pool, session, userId, pendingId) {
  const { rows } = await pool.query(`SELECT user_id, amount, meta FROM payments WHERE stripe_session_id=$1 AND payment_type='pending_professional_fee' ORDER BY id DESC LIMIT 1`, [session.id]);
  const payment = rows[0];
  const meta = typeof payment?.meta === 'string' ? JSON.parse(payment.meta) : payment?.meta;
  const cents = Number(session.amount_total);
  if (!payment || Number(payment.user_id) !== Number(userId) || Number(meta?.pendingServiceRequestId) !== Number(pendingId) || !Number.isSafeInteger(cents) || cents <= 0 || cents !== Math.round(Number(payment.amount) * 100)) {
    throw Object.assign(new Error('Pending professional payment amount or owner mismatch.'), { status:400, code:'BOOKING_PAYMENT_MISMATCH' });
  }
  return cents;
}
export function withBookingCheckoutLock(pool, table, handler) {
  if (!['managed_jobs','pending_service_requests'].includes(table)) throw new Error('Invalid booking table');
  return async (req, res) => {
    const client = await pool.connect();
    const sendJson = res.json.bind(res);
    let payload;
    res.json = (body) => { payload = body; return res; };
    try {
      await client.query('BEGIN');
      await client.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`, [Number(req.params.id)]);
      req.bookingCheckoutPool = client;
      await handler(req, res);
      await client.query(res.statusCode >= 400 ? 'ROLLBACK' : 'COMMIT');
      res.json = sendJson;
      if (payload !== undefined) sendJson(payload);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      res.json = sendJson;
      if (!res.headersSent) res.status(error.status || 500).json({ ok:false, code:error.code || 'BOOKING_CHECKOUT_FAILED', message:'Could not prepare your booking payment. Please retry.' });
    } finally { client.release(); }
  };
}
