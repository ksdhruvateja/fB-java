import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

test('job lifecycle preserves role permissions and completed-work confirmation', async () => {
  Object.assign(process.env, { NODE_ENV:'test', NEON_DATABASE_URL:'', SESSION_SECRET:'local-role-fixture', ENABLE_DEMO_USERS:'false', ENABLE_DEMO_SEED:'false', DISABLE_OUTBOUND_EMAIL:'true', GMAIL_USER:'', GMAIL_APP_PASSWORD:'', STRIPE_SECRET_KEY:'', STRIPE_WEBHOOK_SECRET:'', GEMINI_API_KEY:'', OPENAI_API_KEY:'', OPENROUTER_API_KEY:'', ANTHROPIC_API_KEY:'', NETLIFY:'', CONTEXT:'', FIXBRIDGE_HOSTING:'' });
  const require=createRequire(import.meta.url), pgMem=require('pg-mem'), original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim']) db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});for(const [name,implementation] of [['abs',Math.abs],['round',Math.round]]) db.public.registerFunction({name,args:['float'],returns:'float',implementation});return db;};
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try {
    await initDb();
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES (901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(903,'contractor','Assigned','assigned@example.invalid','unused'),(904,'contractor','Other pro','pro@example.invalid','unused'),(905,'admin','Admin','admin@example.invalid','unused')");
    await pool.query("UPDATE users SET admin_access_level='read' WHERE id=905");
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES (906,'admin','Write admin','write@example.invalid','unused')");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,assigned_contractor_user_id,status,description) VALUES (201,901,903,'draft','Draft fixture'),(202,901,903,'customer_review_pending','Completed fixture'),(203,901,903,'scheduled','Scheduled fixture')");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,assigned_contractor_user_id,status,description) VALUES (204,901,903,'work_started','Retry fixture')");
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    async function request(method,path,id,body={},claims={}) {const role=id>=905?'admin':id>=903?'contractor':'homeowner';const res=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role,...claims},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};}
    const draftClose=await request('POST','/api/managed/jobs/201/status',901,{status:'closed'});
    assert.equal(draftClose.status,409,'homeowner must not close uncompleted work');
    assert.equal((await pool.query('SELECT status FROM managed_jobs WHERE id=201')).rows[0].status,'draft');
    assert.equal((await request('POST','/api/managed/jobs/202/status',902,{status:'closed'})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/201/status',905,{status:'closed'},{adminAccessLevel:'read'})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/201/complete',905,{summary:'not authorized'},{adminAccessLevel:'read'})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/202/confirm-completion',905)).status,403);
    assert.equal((await request('POST','/api/contractor/managed/jobs/203/mark-travel',904)).status,403);
    assert.equal((await request('POST','/api/contractor/managed/jobs/203/mark-travel',905,{}, {adminAccessLevel:'read'})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/202/status',901,{status:'closed'})).status,200);
    assert.equal((await request('POST','/api/managed/jobs/202/status',901,{status:'closed'})).status,200,'closure retry is idempotent');
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM job_status_history WHERE job_id=202 AND to_status='closed'")).rows[0].count),1,'closure retry must not append duplicate history');
    assert.equal((await request('POST','/api/managed/jobs/202/status',901,{status:'customer_review_pending'})).status,409,'closed jobs cannot reopen through homeowner status API');
    for (const action of ['mark-travel','mark-arrived','mark-started']) {
      const result=await request('POST',`/api/contractor/managed/jobs/203/${action}`,903);
      assert.equal(result.status,200,JSON.stringify(result.body));
    }
    assert.equal((await request('POST','/api/managed/jobs/203/complete',904,{summary:'Foreign completion'})).status,403);
    const completion=await request('POST','/api/managed/jobs/203/complete',903,{summary:'Fixture work completed'});
    assert.equal(completion.status,200,JSON.stringify(completion.body));
    assert.equal((await request('POST','/api/managed/jobs/203/status',901,{status:'closed'})).status,200);
    assert.equal((await request('POST','/api/admin/partners',905,{name:'Fixture partner',code:'FIXTURE'})).status,403);
    const partner=await request('POST','/api/admin/partners',906,{name:'Fixture partner',code:'FIXTURE'});
    assert.equal(partner.status,200,JSON.stringify(partner.body));
    assert.equal((await request('DELETE',`/api/admin/partners/${partner.body.partner.id}`,906)).status,200);
    const note=await request('POST','/api/contractor/crm/notes',903,{customerName:'Synthetic customer',note:'Local-only note'});
    assert.equal(note.status,200,JSON.stringify(note.body));
    const otherNotes=await request('GET','/api/contractor/crm/notes',904);
    assert.equal(otherNotes.body.notes.length,0,'contractor notes must stay isolated');
    const mfaDenied=await request('POST','/api/managed/jobs/201/status',906,{status:'closed'},{authStage:'mfa_pending'});
    assert.equal(mfaDenied.status,403);
    assert.equal(mfaDenied.body.code,'mfa_required');
    const completions=await Promise.all([request('POST','/api/managed/jobs/204/complete',903,{summary:'First fixture report'}),request('POST','/api/managed/jobs/204/complete',903,{summary:'Second fixture report'})]);
    assert.ok(completions.every(r=>r.status===200),JSON.stringify(completions));
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM job_status_history WHERE job_id=204 AND to_status='work_completed'")).rows[0].count),1,'concurrent completion creates one milestone');
    const report=(await pool.query('SELECT completion_report FROM managed_jobs WHERE id=204')).rows[0].completion_report;
    assert.equal((await request('POST','/api/managed/jobs/204/complete',903,{summary:'Retry must not overwrite report'})).status,200);
    assert.deepEqual((await pool.query('SELECT completion_report FROM managed_jobs WHERE id=204')).rows[0].completion_report,report);
    if(process.env.ROLE_INVENTORY==='true') {
      const routes=new Set();
      for(const file of readdirSync(new URL('.',import.meta.url)).filter(f=>f.endsWith('.js'))) {
        const source=readFileSync(new URL(file,import.meta.url),'utf8');
        for(const match of source.matchAll(/app\.get\('((?:\/api\/admin\/|\/api\/contractor\/)[^']+)'/g))
          if(!match[1].includes(':')) routes.add(match[1]);
      }
      const results=[];
      for(const path of routes) {
        const actor=path.startsWith('/api/admin/')?905:903;
        const result=await request('GET',path,actor);
        const foreign=await request('GET',path,901);
        results.push({path,authorizedStatus:result.status,homeownerStatus:foreign.status});
      }
      writeFileSync(new URL('../../role-api-matrix.json',import.meta.url),JSON.stringify(results,null,2));
    }
  } finally {if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
