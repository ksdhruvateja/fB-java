import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { checkoutPaymentState, reconcileSubscriptionCheckoutPayment } from './checkout-payment-state.js';

const session = (fields = {}) => ({ id: 'cs_fixture', metadata: { paymentType: 'subscription', userId: '1' }, status: 'open', payment_status: 'unpaid', ...fields });
for (const [name, fields, event, expected] of [
  ['closed browser is still open at provider', {}, '', 'pending'],
  ['completed delayed payment remains pending', { status:'complete' }, 'checkout.session.completed', 'pending'],
  ['provider-confirmed payment', { status:'complete', payment_status:'paid' }, '', 'succeeded'],
  ['completed zero-dollar trial', { status:'complete', payment_status:'no_payment_required', amount_total:0 }, '', 'succeeded'],
  ['open zero-dollar session is not complete', { payment_status:'no_payment_required' }, '', 'pending'],
  ['provider-confirmed expiry', { status:'expired' }, '', 'cancelled'],
  ['signed asynchronous failure', { status:'complete' }, 'checkout.session.async_payment_failed', 'failed'],
]) test(name, () => assert.equal(checkoutPaymentState(session(fields), event), expected));

async function fixture(status='pending') {
  const db = newDb();
  db.public.none(`CREATE TABLE payments (id int, user_id int, payment_type text, amount numeric, status text, stripe_session_id text, stripe_payment_intent text);
    INSERT INTO payments VALUES (1,1,'subscription',29,'${status}','cs_fixture',null);`);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const row = async () => (await pool.query('SELECT * FROM payments WHERE id=1')).rows[0];
  return { pool, row };
}
test('zero-dollar trial stores actual amount, not advertised monthly price', async () => {
  const f=await fixture();await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'complete',payment_status:'no_payment_required',amount_total:0}));
  assert.equal((await f.row()).status,'succeeded');assert.equal(Number((await f.row()).amount),0);
});
test('pending completion links intent, then asynchronous success settles once', async () => {
  const f=await fixture();await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'complete',payment_intent:'pi_fixture'}));
  assert.equal((await f.row()).status,'pending');assert.equal((await f.row()).stripe_payment_intent,'pi_fixture');
  const paid=session({status:'complete',payment_status:'paid',amount_total:2900});
  await reconcileSubscriptionCheckoutPayment(f.pool,paid,'checkout.session.async_payment_succeeded');
  await reconcileSubscriptionCheckoutPayment(f.pool,paid,'checkout.session.async_payment_succeeded');
  assert.equal((await f.row()).status,'succeeded');assert.equal(Number((await f.row()).amount),29);
});
test('late failure/expiry/open poll cannot overwrite successful payment', async () => {
  const f=await fixture('succeeded');
  for(const [state,event] of [[{status:'expired'},'checkout.session.expired'],[{status:'complete'},'checkout.session.async_payment_failed'],[{},'']]) await reconcileSubscriptionCheckoutPayment(f.pool,session(state),event);
  assert.equal((await f.row()).status,'succeeded');
});
test('verified success wins a prior expiry race; late events do not undo it', async () => {
  const f=await fixture();await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'expired'}),'checkout.session.expired');assert.equal((await f.row()).status,'cancelled');
  await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'complete',payment_status:'paid',amount_total:2900}));assert.equal((await f.row()).status,'succeeded');
});
test('provider failure differs from pending and canceled', async () => {
  const f=await fixture();await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'complete'}),'checkout.session.async_payment_failed');assert.equal((await f.row()).status,'failed');
  await reconcileSubscriptionCheckoutPayment(f.pool,session());assert.equal((await f.row()).status,'failed');
});
test('owner binding and unrelated checkout cannot change another payment', async () => {
  const f=await fixture();await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'expired',metadata:{paymentType:'subscription',userId:'2'}}));assert.equal((await f.row()).status,'pending');
  await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'expired',metadata:{paymentType:'retail_payment',userId:'1'}}));assert.equal((await f.row()).status,'pending');
});
test('late checkout cannot overwrite a refund', async () => {
  const f=await fixture('refunded');await reconcileSubscriptionCheckoutPayment(f.pool,session({status:'complete',payment_status:'paid',amount_total:2900}));assert.equal((await f.row()).status,'refunded');
});
