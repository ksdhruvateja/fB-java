// Return URLs describe navigation; only Stripe evidence changes payment state.
export function checkoutPaymentState(session, eventType = '') {
  if (session?.payment_status === 'paid' || (session?.status === 'complete' && session?.payment_status === 'no_payment_required')) return 'succeeded';
  if (session?.status === 'expired' || eventType === 'checkout.session.expired') return 'cancelled';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  return 'pending';
}
export async function reconcileSubscriptionCheckoutPayment(pool, session, eventType = '') {
  const status = checkoutPaymentState(session, eventType);
  if (!session?.id || session.metadata?.paymentType !== 'subscription') return status;
  const userId = Number(session.metadata?.userId || session.metadata?.homeownerId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return status;
  const amount = status === 'succeeded' && Number.isFinite(session.amount_total) ? session.amount_total / 100 : null;
  await pool.query(
    `UPDATE payments SET status=$2, amount=COALESCE($3, amount), stripe_payment_intent=COALESCE($4, stripe_payment_intent)
     WHERE stripe_session_id=$1 AND payment_type='subscription' AND user_id=$5
       AND status IN ('pending','failed','cancelled','canceled') AND ($2='succeeded' OR status='pending')`,
    [session.id, status, amount, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
      userId]
  );
  return status;
}
