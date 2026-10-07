import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { sessions, retrieved } from './test-fixtures/checkout-state-stripe.mjs';

test('actual contractor capability route persists explicit selections with role and account isolation',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'',NEON_DATABASE_URL:'',SESSION_SECRET:'checkout-state-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'fixture-offline-only',STRIPE_WEBHOOK_SECRET:'offline-fixture-secret',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:'',RAILWAY_PROJECT_ID:'',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_SERVICE_ID:''});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});db.public.registerFunction({name:'lpad',args:['text','integer','text'],returns:'text',implementation:(value,width,fill)=>value.padStart(width,fill)});db.public.registerOperator({operator:'||',left:'jsonb',right:'jsonb',returns:'jsonb',implementation:(a,b)=>({...a,...b})});return db;};
  register(new URL('./test-fixtures/checkout-state-loader.mjs',import.meta.url),import.meta.url);
  const {default:app,pool,initDb}=await import('./app.js');let server;
  const realQuery=pool.query.bind(pool);
 pool.query=async(sql,args)=>{ if(typeof sql==='string' && sql.startsWith('UPDATE users SET contractor_application=COALESCE')) { const current=(await realQuery('SELECT contractor_application FROM users WHERE id=$1',[args[1]])).rows[0]?.contractor_application || {}; return realQuery("UPDATE users SET contractor_application=$1::jsonb WHERE id=$2 AND role='contractor' RETURNING *",[JSON.stringify({...current,...JSON.parse(args[0])}),args[1]]); } return realQuery(sql,args); };
 try {
 await initDb();
 await pool.query("INSERT INTO users(id,role,name,email,password,contractor_application) VALUES(991,'contractor','One','one@example.invalid','unused','{\"primaryServices\":[\"Plumbing\"]}'::jsonb),(992,'contractor','Two','two@example.invalid','unused','{}'::jsonb),(993,'homeowner','Owner','owner@example.invalid','unused','{}'::jsonb)");
 server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); const origin=`http://127.0.0.1:${server.address().port}`, jwt=require('jsonwebtoken');
 const save=async(id,role,selectedServiceIds)=>fetch(origin+'/api/contractor/service-capabilities',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role},process.env.SESSION_SECRET)}`},body:JSON.stringify({selectedServiceIds,userId:992})});
 const {defaultServiceOfferings}=await import('./service-offerings.js'); const all=defaultServiceOfferings().map(s=>s.id);
 for (const ids of [[],['plumbing'],all]) { const r=await save(991,'contractor',ids); assert.equal(r.status,200,await r.clone().text()); const body=await r.json(); assert.deepEqual(body.user.contractorApplication.selectedServiceIds,ids); const reload=(await pool.query('SELECT contractor_application FROM users WHERE id=991')).rows[0].contractor_application; assert.deepEqual(reload.selectedServiceIds,ids); assert.deepEqual(reload.primaryServices,['Plumbing']); }
 assert.equal((await save(991,'contractor',['unknown'])).status,400); assert.equal((await save(991,'contractor',['plumbing','plumbing'])).status,400); assert.equal((await save(993,'homeowner',['plumbing'])).status,403);
 assert.equal((await fetch(origin+'/api/contractor/service-capabilities',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.deepEqual((await pool.query('SELECT contractor_application FROM users WHERE id=992')).rows[0].contractor_application,{});
 const me=await fetch(origin+'/api/auth/me',{headers:{Authorization:`Bearer ${jwt.sign({id:991,role:'contractor'},process.env.SESSION_SECRET)}`}}); assert.deepEqual((await me.json()).user.contractorApplication.selectedServiceIds,all);
 } finally { if(server)await new Promise(r=>server.close(r));pool.query=realQuery;pgMem.newDb=original;await pool.end(); }
});
