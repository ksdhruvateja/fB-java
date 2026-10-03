import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { checkoutCalls, refundCalls } from './test-fixtures/offline-stripe.mjs';

test('local Stripe mock preserves checkout totals and refund retry isolation; change orders require owner approval',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'',NEON_DATABASE_URL:'',SESSION_SECRET:'financial-flow-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'fixture-offline-only',STRIPE_WEBHOOK_SECRET:'',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:'',RAILWAY_PROJECT_ID:'',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_SERVICE_ID:''});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{
    const db=original({...o,noAstCoverageCheck:true});
    for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});
    // pg-mem lacks this PostgreSQL builtin. Supply the typed six-pair overload
    // used by the real change-order snapshot query; production SQL is unchanged.
    db.public.registerFunction({name:'jsonb_build_object',args:['text','text','text','float','text','float','text','jsonb','text','text','text','timestamptz'],returns:'jsonb',allowNullArguments:true,implementation:(...args)=>Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]))});
    return db;
  };
  register(new URL('./test-fixtures/stripe-loader.mjs',import.meta.url),import.meta.url);
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try{
    await initDb();
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(903,'contractor','Assigned','pro@example.invalid','unused'),(905,'admin','Admin','admin@example.invalid','unused')");
    await pool.query("UPDATE users SET admin_role_preset='super_admin',admin_access_level='write' WHERE id=905");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,assigned_contractor_user_id,status,description) VALUES(201,901,903,'work_started','Fixture scope')");
    await pool.query("INSERT INTO payments(id,user_id,payment_type,amount,status,stripe_payment_intent) VALUES(301,901,'subscription',100,'succeeded','pi_offline_fixture')");
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    const request=async(path,id,body={})=>{const role=id===905?'admin':id===903?'contractor':'homeowner';const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role},process.env.SESSION_SECRET)}`},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
    const {createCheckoutSession}=await import('./stripe.js');
    const checkout=await createCheckoutSession({lineItems:[{amountCents:10000,description:'Service'},{amountCents:1500,description:'Optional tip'}],successPath:'/success',cancelPath:'/cancel',metadata:{paymentType:'invoice'},idempotencyKey:'offline-checkout-repeat'});
    assert.equal(checkout.sessionId,'cs_offline_fixture');assert.deepEqual(checkoutCalls[0].params.line_items.map(x=>x.price_data.unit_amount),[10000,1500]);assert.equal(checkoutCalls[0].options.idempotencyKey,'offline-checkout-repeat');
    assert.equal((await request('/api/admin/payments/301/refund',901,{amount:25})).status,403);
    const refundBody={amount:25,reason:'Offline fixture',idempotencyKey:'offline-refund-repeat'};
    const refund=await request('/api/admin/payments/301/refund',905,refundBody);assert.equal(refund.status,200,JSON.stringify(refund.body));
    const retry=await request('/api/admin/payments/301/refund',905,refundBody);assert.equal(retry.status,200,JSON.stringify(retry.body));assert.equal(retry.body.alreadyRefunded,true);assert.equal(refundCalls.length,1);assert.equal(refundCalls[0].amount,2500);
    assert.equal((await request('/api/managed/jobs/201/change-orders',902,{description:'Forbidden',contractorNet:50})).status,403);
    const change=await request('/api/managed/jobs/201/change-orders',903,{description:'Additional fixture scope',contractorNet:50});assert.equal(change.status,200,JSON.stringify(change.body));const coId=change.body.changeOrder.id;
    const priced=await request(`/api/admin/change-orders/${coId}/price`,905,{retailAmount:75});assert.equal(priced.status,200,JSON.stringify(priced.body));assert.equal(Number(priced.body.changeOrder.retailAmount ?? priced.body.changeOrder.retail_amount),75);
    assert.equal((await request(`/api/managed/jobs/201/change-orders/${coId}/approve`,902,{})).status,403);
    const unacknowledged=await request(`/api/managed/jobs/201/change-orders/${coId}/approve`,901,{});assert.equal(unacknowledged.status,400,'additional scope cannot be approved without affirmative acknowledgement');
    const approved=await request(`/api/managed/jobs/201/change-orders/${coId}/approve`,901,{consents:{CHANGE_ORDER_APPROVAL:true}});assert.equal(approved.status,200,JSON.stringify(approved.body));
    assert.equal((await pool.query('SELECT status FROM change_orders WHERE id=$1',[coId])).rows[0].status,'approved');
    assert.equal((await request(`/api/managed/jobs/201/change-orders/${coId}/approve`,901,{consents:{CHANGE_ORDER_APPROVAL:true}})).status,409,'already approved scope cannot be approved again');
  }finally{if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
