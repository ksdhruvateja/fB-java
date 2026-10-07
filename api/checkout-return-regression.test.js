import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { sessions, retrieved } from './test-fixtures/checkout-state-stripe.mjs';

test('actual auth return and webhook handlers settle only provider-confirmed subscription states',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'',NEON_DATABASE_URL:'',SESSION_SECRET:'checkout-state-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'fixture-offline-only',STRIPE_WEBHOOK_SECRET:'offline-fixture-secret',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:'',RAILWAY_PROJECT_ID:'',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_SERVICE_ID:''});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});db.public.registerFunction({name:'lpad',args:['text','integer','text'],returns:'text',implementation:(value,width,fill)=>value.padStart(width,fill)});db.public.registerOperator({operator:'||',left:'jsonb',right:'jsonb',returns:'jsonb',implementation:(a,b)=>({...a,...b})});return db;};
  register(new URL('./test-fixtures/checkout-state-loader.mjs',import.meta.url),import.meta.url);
  const {default:app,pool,initDb}=await import('./app.js');let server;
  const realQuery=pool.query.bind(pool);
  // pg-mem implements JSONB || as string concatenation. Supply the equivalent
  // metadata merge only; all other SQL, writes and handler behavior are real.
  pool.query=async(sql,args)=>{
    const merge=typeof sql==='string' && sql.match(/meta\s*=\s*COALESCE\(meta, '\{\}'::jsonb\)\s*\|\|\s*\$(\d+)::jsonb/);
    if(merge){
      const table=sql.match(/^\s*UPDATE\s+(payments|subscriptions)\b/)?.[1];
      const key=sql.match(/WHERE\s+(stripe_session_id|id)\s*=\s*\$(\d+)/);
      if(table && key){
        const current=(await realQuery(`SELECT meta FROM ${table} WHERE ${key[1]}=$1`,[args[Number(key[2])-1]])).rows[0]?.meta || {};
        const nextArgs=[...args];nextArgs[Number(merge[1])-1]=JSON.stringify({...current,...JSON.parse(args[Number(merge[1])-1])});
        return realQuery(sql.replace(merge[0],`meta=$${merge[1]}::jsonb`),nextArgs);
      }
    }
    return realQuery(sql,args);
  };
  try{
    await initDb();
    // pg-mem incorrectly uses this partial settled-session index to select
    // pending rows. Remove it only from this disposable database; execute the
    // real PostgreSQL query and update predicates unchanged.
    await pool.query('DROP INDEX IF EXISTS idx_payments_stripe_session_settled');
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','checkout-owner@example.invalid','unused'),(902,'homeowner','Other','checkout-other@example.invalid','unused')");
    await pool.query("INSERT INTO payments(id,user_id,payment_type,amount,status,stripe_session_id) VALUES(301,901,'subscription',29,'pending','cs_closed'),(302,901,'subscription',29,'pending','cs_expired'),(303,901,'subscription',29,'pending','cs_delayed'),(304,902,'subscription',29,'pending','cs_foreign')");
    // pg-mem's nullable JSON OR evaluation differs from PostgreSQL. Real
    // checkout rows always include plan metadata; give fixtures the same shape.
    await pool.query("UPDATE payments SET meta='{\"planCode\":\"homecare_pro\"}'::jsonb");
    const session=(id,fields={})=>({id,metadata:{paymentType:'subscription',planCode:'homecare_pro',userId:'901'},mode:'subscription',status:'open',payment_status:'unpaid',currency:'usd',...fields});
    sessions.set('cs_closed',session('cs_closed'));sessions.set('cs_expired',session('cs_expired',{status:'expired'}));sessions.set('cs_delayed',session('cs_delayed',{status:'complete',payment_intent:'pi_delayed'}));sessions.set('cs_foreign',session('cs_foreign',{metadata:{paymentType:'subscription',userId:'902'}}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,jwt=require('jsonwebtoken');
    const me=async()=>{const r=await fetch(origin+'/api/auth/me?sync=checkout',{headers:{Authorization:`Bearer ${jwt.sign({id:901,role:'homeowner'},process.env.SESSION_SECRET)}`}});assert.equal(r.status,200);return r.json();};
    const webhook=async(id,type,object)=>{const r=await fetch(origin+'/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':'offline-fixture-signature'},body:JSON.stringify({id,type,data:{object}})});assert.equal(r.status,200,await r.text());};
    const row=async id=>(await pool.query('SELECT * FROM payments WHERE id=$1',[id])).rows[0];
    const initial=await me();assert.equal(initial.user.homeCareSubscription.isPro,false);assert.equal((await row(301)).status,'pending');assert.equal((await row(302)).status,'cancelled');assert.equal((await row(303)).status,'pending');assert.equal((await row(304)).status,'pending');assert(!retrieved.includes('cs_foreign'));
    await webhook('evt_pending','checkout.session.completed',sessions.get('cs_delayed'));assert.equal((await row(303)).status,'pending');assert.equal((await pool.query('SELECT * FROM subscriptions WHERE user_id=901')).rows.length,0);
    await webhook('evt_failed','checkout.session.async_payment_failed',sessions.get('cs_delayed'));assert.equal((await row(303)).status,'failed');
    const trial=session('cs_delayed',{status:'complete',payment_status:'no_payment_required',amount_total:0,subscription:'sub_trial',customer:'cus_fixture'});sessions.set('cs_delayed',trial);
    await webhook('evt_trial','checkout.session.completed',trial);assert.equal((await row(303)).status,'succeeded');assert.equal(Number((await row(303)).amount),0);
    await webhook('evt_late_expiry','checkout.session.expired',session('cs_delayed',{status:'expired'}));await webhook('evt_late_failure','checkout.session.async_payment_failed',session('cs_delayed',{status:'complete'}));assert.equal((await row(303)).status,'succeeded');
    await webhook('evt_duplicate','checkout.session.completed',trial);await webhook('evt_duplicate','checkout.session.completed',trial);assert.equal((await pool.query('SELECT * FROM subscriptions WHERE stripe_subscription_id=$1',['sub_trial'])).rows.length,1);
    const final=await me();assert.equal(final.user.homeCareSubscription.isPro,true);assert.equal((await row(301)).status,'pending');assert.equal((await row(304)).status,'pending');
  }finally{if(server)await new Promise(r=>server.close(r));pool.query=realQuery;pgMem.newDb=original;await pool.end();}
});
