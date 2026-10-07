import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mergePricingRules, resolveCustomerVisitFee, getDispatchFee, validateBookingFeeCents } from './pricing.js';
import { buildProfessionalDispatchBreakdown } from './professional-dispatch-pricing.js';
import { reconcileBookingCheckout, assertPendingBookingPayment } from './professional-booking-checkout.js';

test('one positive canonical fee overrides legacy plan, timing and multi-line fees', () => {
  const input={ booking_fee_cents:13750, default_visit_fee:149, homecare_pro_coordination_fee:99, professional_dispatch_pricing:{lines:[{key:'old',amount_cents:9500,enabled:true}]},dispatch_fees:{same_day:{customer:350,contractor:150}} };
  const before=JSON.stringify(input), rules=mergePricingRules(input);
  assert.equal(JSON.stringify(input),before,'normalization cannot mutate stored history input');
  for(const homeCarePro of [false,true]) for(const emergency of [false,true]) assert.equal(resolveCustomerVisitFee(rules,{homeCarePro,emergency}),137.50);
  for(const service_timing of ['weekday','same-day','evening-weekend','commercial-emergency']) {
    assert.equal(getDispatchFee(service_timing,rules).customer,137.5);
    const breakdown=buildProfessionalDispatchBreakdown({service_timing},rules,{code:'OLD',type:'fixed',amount:25});
    assert.equal(breakdown.authorizedNowCents,13750);assert.equal(breakdown.lines.length,1);assert.equal(breakdown.couponDiscountCents,0);
  }
  for(const invalid of [0,-1,125.1,NaN,Infinity,'12500',100000000]) assert.equal(validateBookingFeeCents(invalid),false);
  assert.equal(resolveCustomerVisitFee(mergePricingRules({homecare_pro_coordination_fee:99})),125);
});

function checkoutFixture(rows,sessions) {
  const expires=[],updates=[];
  const pool={query:async(sql,args)=>sql.startsWith('SELECT')?{rows}:{rows:[],rowCount:1,...(updates.push(args)&&{})}};
  const stripe={checkout:{sessions:{retrieve:async id=>sessions[id],expire:async id=>{expires.push(id);return {id,status:'expired'};}}}};
  return {pool,stripe,expires,updates};
}
const booking={entityId:201,userId:901,paymentType:'dispatch_fee',amountCents:12500};
test('retry reuses one current open checkout and expires all older/obsolete open sessions', async()=>{
  const f=checkoutFixture([{id:3,status:'pending',stripe_session_id:'new'},{id:2,status:'pending',stripe_session_id:'duplicate'},{id:1,status:'pending',stripe_session_id:'old'}],{new:{id:'new',status:'open',amount_total:12500,url:'https://checkout.stripe.invalid/new'},duplicate:{id:'duplicate',status:'open',amount_total:12500,url:'https://checkout.stripe.invalid/duplicate'},old:{id:'old',status:'open',amount_total:9500,url:'https://checkout.stripe.invalid/old'}});
  const result=await reconcileBookingCheckout(f.pool,{...booking,stripe:f.stripe});assert.equal(result.checkout.sessionId,'new');assert.deepEqual(f.expires,['duplicate','old']);
});
test('any earlier paid record blocks another charge even behind newer canceled/pending rows', async()=>{
  const f=checkoutFixture([{id:2,status:'pending'},{id:1,status:'authorized'}],{});
  await assert.rejects(reconcileBookingCheckout(f.pool,{...booking,stripe:f.stripe}),error=>error.code==='BOOKING_ALREADY_PAID');
});
test('completed provider checkout blocks retry until durable reconciliation',async()=>{
  const f=checkoutFixture([{id:2,status:'pending',stripe_session_id:'old'}],{old:{id:'old',status:'complete',amount_total:9500,payment_status:'paid'}});
  await assert.rejects(reconcileBookingCheckout(f.pool,{...booking,stripe:f.stripe}),error=>error.code==='BOOKING_PAYMENT_CONFIRMING');assert.deepEqual(f.expires,[]);
});
test('signed old-price payment reconciles its original snapshot; owner/amount mismatches rejected',async()=>{
  const pool={query:async()=>({rows:[{user_id:901,amount:95,meta:{pendingServiceRequestId:301}}]})};
  assert.equal(await assertPendingBookingPayment(pool,{id:'old',amount_total:9500},901,301),9500);
  for(const [amount,id] of [[12500,901],[9500,902]]) await assert.rejects(assertPendingBookingPayment(pool,{id:'old',amount_total:amount},id,301),error=>error.code==='BOOKING_PAYMENT_MISMATCH');
});

test('admin setting propagates to all new previews; stale/unowned/paid checkouts remain guarded',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',NEON_DATABASE_URL:'',SESSION_SECRET:'booking-price-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:''});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});return db;};
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try {
    await initDb();await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(905,'admin','Read admin','read@example.invalid','unused'),(906,'admin','Write admin','write@example.invalid','unused')");
    await pool.query("UPDATE users SET admin_access_level='read' WHERE id=905");
    await pool.query("UPDATE users SET admin_role_preset='super_admin' WHERE id=906");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,status,description) VALUES(201,901,'awaiting_service_payment','Unpaid'),(202,901,'scheduled','Paid')");
    const historical={ok:true,lines:[{key:'historic',amount_cents:9500}],authorizedNow:95,authorizedNowCents:9500,finalAmount:95};
    await pool.query('UPDATE managed_jobs SET visit_fee_authorized=true,visit_fee_amount=95,checkout_snapshot=$1 WHERE id=202',[JSON.stringify(historical)]);
    await pool.query("INSERT INTO pending_service_requests(id,homeowner_user_id,category,title,description,status,checkout_expires_at) VALUES(301,901,'Plumbing','Fixture','Fixture','pending',$1)",[new Date(Date.now()+86400000)]);
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    async function request(method,path,id,body={},claims={}){const res=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role:id>=905?'admin':'homeowner',...claims},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};}
    assert.equal((await request('GET','/api/professional-booking-fee',901)).body.amountCents,12500);
    assert.equal((await request('PUT','/api/pricing/rules',901,{booking_fee_cents:14000})).status,403);
    assert.equal((await request('PUT','/api/pricing/rules',905,{booking_fee_cents:14000})).status,403);
    assert.equal((await request('PUT','/api/pricing/rules',906,{booking_fee_cents:14000},{authStage:'mfa_pending'})).body.code,'mfa_required');
    for(const amount of [0,-1,12.5])assert.equal((await request('PUT','/api/pricing/rules',906,{booking_fee_cents:amount})).status,400);
    const changed=await request('PUT','/api/pricing/rules',906,{booking_fee_cents:14025});assert.equal(changed.status,200,JSON.stringify(changed.body));
    assert.equal((await request('GET','/api/professional-booking-fee',901)).body.amountCents,14025);
    assert.equal((await request('GET','/api/managed/jobs/201/dispatch-pricing',901)).body.authorizedNowCents,14025);
    assert.equal((await request('GET','/api/managed/jobs/202/dispatch-pricing',901)).body.authorizedNowCents,9500);
    assert.equal((await request('POST','/api/pending-service-requests/301/professional-checkout',902,{acknowledged:true,authorizedAmountCents:14025})).status,403);
    const stale=await request('POST','/api/pending-service-requests/301/professional-checkout',901,{acknowledged:true,authorizedAmountCents:12500});assert.equal(stale.status,409);assert.equal(stale.body.code,'PRICING_MISMATCH');
    assert.equal((await request('POST','/api/managed/jobs/201/pay-dispatch',905,{authorizedAmount:140.25})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/201/prepare-checkout',906,{})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/201/pay-dispatch',901,{})).body.code,'PRICING_REVIEW_REQUIRED');
    const managedStale=await request('POST','/api/managed/jobs/201/pay-dispatch',901,{authorizedAmount:125,consents:{PROFESSIONAL_REQUEST_BETA_ACK:true},acknowledged:true});assert.equal(managedStale.body.code,'PRICING_MISMATCH');
    assert.equal((await request('POST','/api/managed/jobs/202/pay-dispatch',901,{authorizedAmount:95})).status,400);
    assert.equal(Number((await pool.query('SELECT visit_fee_amount FROM managed_jobs WHERE id=202')).rows[0].visit_fee_amount),95);
    // Synthetic Stripe adapter only: no provider HTTP, credential or real charge.
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fixture_not_a_real_key';
    const { getStripe } = await import('./stripe.js');
    const stripe = await getStripe(), sessions = new Map(), creates = [], expires = [];
    stripe.checkout.sessions.create = async (params, options) => {
      const id='cs_isolated_booking_'+(creates.length+1);
      const session={id,status:'open',payment_status:'unpaid',amount_total:params.line_items[0].price_data.unit_amount,url:'https://checkout.stripe.invalid/'+id};
      creates.push({params,options});sessions.set(id,session);return session;
    };
    stripe.checkout.sessions.retrieve = async (id) => sessions.get(id);
    stripe.checkout.sessions.expire = async (id) => { expires.push(id);sessions.get(id).status='expired';return sessions.get(id); };
    const pendingBody={acknowledged:true,authorizedAmountCents:14025,contactPhone:'5550001234'};
    const first=await request('POST','/api/pending-service-requests/301/professional-checkout',901,pendingBody);
    assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(creates.length,1);assert.ok(creates[0].options.idempotencyKey);
    const retry=await request('POST','/api/pending-service-requests/301/professional-checkout',901,pendingBody);
    assert.equal(retry.status,200,JSON.stringify(retry.body));assert.equal(creates.length,1);assert.equal(first.body.url,retry.body.url);
    assert.equal((await request('PUT','/api/pricing/rules',906,{booking_fee_cents:15000})).status,200);
    assert.equal((await request('POST','/api/pending-service-requests/301/professional-checkout',901,pendingBody)).status,409);
    const repriced=await request('POST','/api/pending-service-requests/301/professional-checkout',901,{...pendingBody,authorizedAmountCents:15000});
    assert.equal(repriced.status,200,JSON.stringify(repriced.body));assert.equal(creates.length,2);assert.deepEqual(expires,['cs_isolated_booking_1']);assert.equal(creates[1].params.line_items[0].price_data.unit_amount,15000);
    sessions.get('cs_isolated_booking_2').status='complete';sessions.get('cs_isolated_booking_2').payment_status='paid';
    const confirming=await request('POST','/api/pending-service-requests/301/professional-checkout',901,{...pendingBody,authorizedAmountCents:15000});
    assert.equal(confirming.status,409);assert.equal(confirming.body.code,'BOOKING_PAYMENT_CONFIRMING');assert.equal(creates.length,2);
    const managedBody={authorizedAmount:150,acknowledged:true,consents:{PROFESSIONAL_REQUEST_BETA_ACK:true}};
    const managedCheckout=await request('POST','/api/managed/jobs/201/pay-dispatch',901,managedBody);
    assert.equal(managedCheckout.status,200,JSON.stringify(managedCheckout.body));assert.equal(creates.length,3);
    const managedRetry=await request('POST','/api/managed/jobs/201/pay-dispatch',901,managedBody);
    assert.equal(managedRetry.status,200,JSON.stringify(managedRetry.body));assert.equal(creates.length,3);assert.equal(managedCheckout.body.url,managedRetry.body.url);
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM payments WHERE job_id=201 AND payment_type='dispatch_fee'")).rows[0].count),1);
    const perService={by_service:{plumbing:17000},additional_charges:[{key:'priority',label:'Priority coordination',amount_cents:75,enabled:true,basis:'flat',applies_when:'same-day',service_ids:['plumbing']}]};
    assert.equal((await request('PUT','/api/pricing/rules',901,{professional_dispatch_pricing:perService})).status,403);
    assert.equal((await request('PUT','/api/pricing/rules',905,{professional_dispatch_pricing:perService})).status,403);
    assert.equal((await request('PUT','/api/pricing/rules',906,{professional_dispatch_pricing:{by_service:{plumbing:-1}}})).status,400);
    assert.equal((await request('PUT','/api/pricing/rules',906,{professional_dispatch_pricing:perService})).status,200);
    await pool.query("INSERT INTO pending_service_requests(id,homeowner_user_id,category,title,description,status,checkout_expires_at) VALUES(302,901,'Plumbing','Fixture','Fixture','pending',$1)",[new Date(Date.now()+86400000)]);
    const specific=await request('GET','/api/professional-booking-fee?pendingServiceRequestId=302&serviceTiming=same-day',901);
    assert.equal(specific.body.amountCents,17075);assert.equal(specific.body.breakdown.lines.length,2);
    assert.equal((await request('GET','/api/professional-booking-fee?pendingServiceRequestId=302',902)).status,404);
    assert.equal((await request('POST','/api/pending-service-requests/302/professional-checkout',901,{...pendingBody,serviceTiming:'same-day',authorizedAmountCents:1})).status,409);
    const serviceCheckout=await request('POST','/api/pending-service-requests/302/professional-checkout',901,{...pendingBody,serviceTiming:'same-day',authorizedAmountCents:17075});assert.equal(serviceCheckout.status,200,JSON.stringify(serviceCheckout.body));assert.equal(creates.at(-1).params.line_items[0].price_data.unit_amount,17075);
    assert.equal((await request('GET','/api/managed/jobs/202/dispatch-pricing',901)).body.authorizedNowCents,9500,'accepted historic price remains unchanged');
    const receipt=(await pool.query("SELECT meta FROM payments WHERE payment_type='pending_professional_fee' ORDER BY id DESC LIMIT 1",[])).rows[0];
    assert.equal(receipt.meta.bookingBreakdown.authorizedNowCents,17075);
    assert.equal((await request('PUT','/api/pricing/rules',906,{professional_dispatch_pricing:{by_service:{plumbing:0},additional_charges:[]}})).status,200);
    assert.equal((await request('GET','/api/professional-booking-fee?pendingServiceRequestId=302',901)).body.amountCents,0);
    const beforeZero=creates.length;const zeroCheckout=await request('POST','/api/pending-service-requests/302/professional-checkout',901,{...pendingBody,authorizedAmountCents:0});assert.equal(zeroCheckout.status,400);assert.equal(zeroCheckout.body.code,'BOOKING_FEE_NOT_PAYABLE');assert.equal(creates.length,beforeZero,'no zero-dollar Stripe checkout created');
    process.env.STRIPE_SECRET_KEY = '';

  } finally {if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
