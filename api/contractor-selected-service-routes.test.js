import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
test('actual contractor capability boundaries reject mismatches before writes and preserve historical assignment',async()=>{
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:'',NEON_DATABASE_URL:'',SESSION_SECRET:'capability-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:'',RAILWAY_PROJECT_ID:'',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_SERVICE_ID:''});
 const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
 pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});return db;};
 const {default:app,pool,initDb}=await import('./app.js');let server;
 const originalQuery=pool.query.bind(pool);
 // pg-mem does not evaluate the parameterized ANY(int[]) lookup faithfully.
 // Adapt only that provider lookup; all endpoint gates/writes remain real SQL.
 pool.query=async(sql,args)=>{if(typeof sql==='string' && sql.includes('SELECT * FROM users WHERE id = ANY($1::int[])')){const result=await originalQuery("SELECT * FROM users WHERE role='contractor'");return {...result,rows:result.rows.filter(row=>args[0].map(Number).includes(Number(row.id)))};}
 // pg-mem lacks PostgreSQL interval casts; preserve the equivalent fixture deadline.
 if(typeof sql==='string' && sql.includes('UPDATE managed_jobs SET coverage_state='))return originalQuery('UPDATE managed_jobs SET coverage_state=$1, invite_deadline_at=$2, updated_at=NOW() WHERE id=$3',[args[0],new Date(Date.now()+Number(args[1])*3600000),args[2]]);
 return originalQuery(sql,args);};
 try{await initDb();
 await pool.query("INSERT INTO users(id,role,name,email,password,is_admin) VALUES(901,'homeowner','Owner','cap-owner@example.invalid','unused',false),(905,'admin','Admin','cap-admin@example.invalid','unused',true),(906,'contractor','Provider','cap-provider@example.invalid','unused',false)");
 await pool.query("UPDATE users SET contractor_application=$1,trade='Plumber',dispatch_eligible=true,service_zips='[\"78701\"]'::jsonb WHERE id=906",[JSON.stringify({selectedServiceIds:['electrical']})]);
 await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,status,category,title,zip) VALUES(701,901,'awaiting_contractor','Plumbing','Private fixture title','78701'),(702,901,'approved','Plumbing','Historical assigned fixture','78701')");
 await pool.query('UPDATE managed_jobs SET assigned_contractor_user_id=906 WHERE id=702');
 await pool.query("INSERT INTO homeowner_invoices(invoice_number,job_id,homeowner_user_id,amount_due,initial_payment_completed) VALUES('CAP-FIXTURE',702,901,0,true)");
 await pool.query("INSERT INTO job_invitations(id,job_id,contractor_user_id,status) VALUES(801,701,906,'invited')");
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
 const request=async(method,path,id,body={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role:id===905?'admin':id===906?'contractor':'homeowner'},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const denied=await request('POST','/api/admin/managed/jobs/701/invite',905,{contractorUserId:906});assert.equal(denied.status,409,JSON.stringify(denied.body));assert.equal(denied.body.code,'CONTRACTOR_SERVICE_NOT_SELECTED');assert.equal((await pool.query('SELECT status FROM job_invitations WHERE id=801')).rows[0].status,'invited');
 const accept=await request('POST','/api/contractor/invitations/801/respond',906,{action:'accept'});assert.equal(accept.status,409);assert.equal(accept.body.code,'CONTRACTOR_SERVICE_NOT_SELECTED');assert.equal((await pool.query('SELECT status FROM job_invitations WHERE id=801')).rows[0].status,'invited');
 await pool.query("UPDATE job_invitations SET status='accepted' WHERE id=801");
 const bid=await request('POST','/api/contractor/bids',906,{jobId:701,labor:120});assert.equal(bid.status,409);assert.equal(bid.body.code,'CONTRACTOR_SERVICE_NOT_SELECTED');assert.equal((await pool.query('SELECT * FROM bids WHERE job_id=701')).rows.length,0);
 const profile=await request('PUT','/api/admin/contractors/906/profile',905,{name:'Changed fixture',contractorApplication:{selectedServiceIds:['unknown']}});assert.equal(profile.status,400);assert.equal(profile.body.code,'INVALID_SELECTED_SERVICES');assert.equal((await pool.query('SELECT name FROM users WHERE id=906')).rows[0].name,'Provider');
 const replay=await request('POST','/api/admin/managed/jobs/702/assign',905,{contractorUserId:906});assert.equal(replay.status,200);assert.equal(replay.body.alreadyAssigned,true);
 const dispatch=await request('POST','/api/admin/managed/jobs/702/request-dispatch',905);assert.equal(dispatch.status,409);assert.equal(dispatch.body.code,'CONTRACTOR_SERVICE_NOT_SELECTED');assert.equal((await pool.query('SELECT status FROM managed_jobs WHERE id=702')).rows[0].status,'approved');
 const matchNone=await request('POST','/api/admin/managed/jobs/701/match',905);assert.equal(matchNone.status,200,JSON.stringify(matchNone.body));assert.deepEqual(matchNone.body.matches,[]);
 await pool.query('UPDATE users SET contractor_application=$1 WHERE id=906',[JSON.stringify({selectedServiceIds:['plumbing']})]);
 const match=await request('POST','/api/admin/managed/jobs/701/match',905);assert.equal(match.status,200,JSON.stringify(match.body));assert.deepEqual(match.body.matches.map(c=>c.id),[906]);assert.deepEqual(Object.keys(match.body.matches[0]).sort(),['email','id','name','score','trade']);
 await pool.query('INSERT INTO contractor_availability(contractor_user_id,temporary_unavailable) VALUES(906,true)');
 const unavailable=await request('POST','/api/admin/managed/jobs/701/match',905);assert.equal(unavailable.status,200);assert.deepEqual(unavailable.body.matches,[]);
 await pool.query('UPDATE contractor_availability SET temporary_unavailable=false WHERE contractor_user_id=906');
 const available=await request('POST','/api/admin/managed/jobs/701/match',905);assert.equal(available.status,200);assert.deepEqual(available.body.matches.map(c=>c.id),[906]);
 await pool.query('UPDATE users SET dispatch_eligible=false WHERE id=906');
 const unverified=await request('POST','/api/admin/managed/jobs/701/match',905);assert.equal(unverified.status,200);assert.deepEqual(unverified.body.matches,[]);
 const decline=await request('POST','/api/contractor/invitations/801/respond',906,{action:'decline'});assert.equal(decline.status,200);assert.equal((await pool.query('SELECT status FROM job_invitations WHERE id=801')).rows[0].status,'declined');
 const foreign=await request('POST','/api/admin/managed/jobs/701/invite',901,{contractorUserId:906});assert.equal(foreign.status,403);
 }finally{if(server)await new Promise(r=>server.close(r));pool.query=originalQuery;pgMem.newDb=original;await pool.end();}
});
