import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

test('quote approval never substitutes or accepts a stale revision; locked documents and invoice ownership fail closed',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',NEON_DATABASE_URL:'',SESSION_SECRET:'quote-safety-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:''});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});return db;};
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try {
    await initDb();
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(905,'admin','Read admin','read@example.invalid','unused'),(906,'admin','Write admin','write@example.invalid','unused'),(907,'broker','Unknown role','unknown@example.invalid','unused')");
    await pool.query("UPDATE users SET admin_access_level='read' WHERE id=905; UPDATE users SET admin_role_preset='super_admin' WHERE id=906");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,status,description) VALUES(201,901,'proposal_sent','Fixture')");
    await pool.query("INSERT INTO proposals(id,job_id,retail_amount,status,version_number,quote_number) VALUES(301,201,100,'superseded',1,'FQ-old'),(302,201,200,'sent',2,'FQ-new'),(303,201,200,'accepted',1,'FQ-locked')");
    await pool.query("INSERT INTO homeowner_invoices(id,job_id,homeowner_user_id,invoice_number,status,total,amount_due,paid,line_items,document_snapshot) VALUES(401,201,901,'FI-fixture','due',200,200,0,'[]',$1)",[JSON.stringify({versionNumber:2})]);
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    async function request(method,path,id,body={},claims={}){const role=id>=905?(id===907?'broker':'admin'):'homeowner';const res=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role,...claims},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};}
    const approve=(id,body)=>request('POST','/api/managed/jobs/201/approve-proposal',id,body);
    assert.equal((await approve(901,{})).body.code,'QUOTE_REVIEW_REQUIRED');
    assert.equal((await approve(901,{proposalId:301,expectedVersion:1})).body.code,'quote_not_active');
    assert.equal((await approve(901,{proposalId:302,expectedVersion:1})).body.code,'QUOTE_REVISION_CHANGED');
    assert.equal((await approve(902,{proposalId:302,expectedVersion:2})).status,403);
    assert.equal((await approve(905,{proposalId:302,expectedVersion:2})).status,403);
    assert.equal((await request('POST','/api/managed/jobs/201/approve-proposal',906,{proposalId:302,expectedVersion:2},{authStage:'mfa_pending'})).body.code,'mfa_required');
    const current=await approve(901,{proposalId:302,expectedVersion:2});assert.equal(current.status,400,JSON.stringify(current.body));
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM quote_acceptance_snapshots')).rows[0].n),0);
    assert.equal((await request('PUT','/api/admin/quotes/303/document',906,{scopeSummary:'Attempted replacement'})).body.code,'quote_locked');
    const revision=await request('PUT','/api/admin/quotes/302/document',906,{scopeSummary:'Revised fixture scope',lineItems:[{name:'Fixture work',quantity:1,unitPrice:250}]});
    assert.equal(revision.status,200,JSON.stringify(revision.body));
    const changed=(await pool.query('SELECT status,version_number FROM proposals WHERE id=302')).rows[0];
    assert.equal(changed.status,'draft');assert.equal(Number(changed.version_number),3);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM quote_revision_snapshots WHERE proposal_id=302')).rows[0].n),1);
    assert.equal((await approve(901,{proposalId:302,expectedVersion:2})).body.code,'QUOTE_REVISION_CHANGED');
    assert.equal((await approve(901,{proposalId:302,expectedVersion:3})).body.code,'quote_not_sent');
    assert.equal((await request('GET','/api/homeowner/invoices/401',907)).status,403);
    assert.equal((await request('GET','/api/homeowner/invoices/401',902)).status,403);
    const own=await request('GET','/api/homeowner/invoices/401',901);assert.equal(own.status,200);assert.equal(own.body.invoice.financialDocumentVersion,'2');
    // Both sends explicitly false: exercise SQL bookkeeping without any delivery.
    const send=await request('POST','/api/admin/invoices/401/send',906,{sendEmail:false,sendSms:false});assert.equal(send.status,200,JSON.stringify(send.body));
  } finally {if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
