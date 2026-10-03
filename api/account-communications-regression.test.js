import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('local documents, messages and notifications preserve household isolation and retry behavior', async () => {
  Object.assign(process.env, { NODE_ENV:'test', DATABASE_URL:'', NEON_DATABASE_URL:'', SESSION_SECRET:'account-communications-fixture', ENABLE_DEMO_USERS:'false', ENABLE_DEMO_SEED:'false', DISABLE_OUTBOUND_EMAIL:'true', GMAIL_USER:'', GMAIL_APP_PASSWORD:'', STRIPE_SECRET_KEY:'', STRIPE_WEBHOOK_SECRET:'', SLACK_WEBHOOK_URL:'', N8N_WEBHOOK_URL:'', GEMINI_API_KEY:'', OPENAI_API_KEY:'', OPENROUTER_API_KEY:'', ANTHROPIC_API_KEY:'', NETLIFY:'', CONTEXT:'', FIXBRIDGE_HOSTING:'', RAILWAY_PROJECT_ID:'', RAILWAY_ENVIRONMENT_ID:'', RAILWAY_SERVICE_ID:'' });
  const require=createRequire(import.meta.url), pgMem=require('pg-mem'), original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});return db;};
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try {
    await initDb();
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(905,'admin','Admin','admin@example.invalid','unused')");
    await pool.query("INSERT INTO properties(id,owner_user_id,label,address_line1,city,state,zip) VALUES(101,901,'Owned','Fixture lane','Fixture','TX','78701'),(102,902,'Other','Other fixture','Fixture','TX','78701')");
    await pool.query("INSERT INTO managed_jobs(id,homeowner_user_id,status,title,description,booking_id) VALUES(201,902,'draft','Private fixture','Private','PRIVATE-OTHER-HOUSEHOLD')");
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    const request=async(method,path,id=901,body={})=>{
      const headers={'Content-Type':'application/json'};
      if(id)headers.Authorization=`Bearer ${jwt.sign({id,role:id===905?'admin':'homeowner'},process.env.SESSION_SECRET)}`;
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json()};
    };
    assert.equal((await request('GET','/api/messages/conversations',null)).status,401);
    assert.equal((await request('POST','/api/messages/conversations',901,{jobId:201,body:'Unauthorized job link'})).status,403,'conversation must not attach another household job');
    const doc={title:'Fixture receipt',category:'receipt',fileName:'receipt.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,JVBERi0xLjQK'};
    assert.equal((await request('POST','/api/properties/102/documents',901,doc)).status,404);
    const uploaded=await request('POST','/api/properties/101/documents',901,doc);assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));
    const docId=uploaded.body.document.id;
    assert.equal((await request('GET',`/api/properties/101/documents/${docId}`,902)).status,404);
    assert.equal((await request('GET',`/api/properties/101/documents/${docId}`)).status,200);
    assert.equal((await request('DELETE',`/api/properties/101/documents/${docId}`,902)).status,404);
    const created=await request('POST','/api/messages/conversations',901,{subject:'Fixture inquiry',body:'Initial fixture'});assert.equal(created.status,200,JSON.stringify(created.body));
    const convId=created.body.conversation.id;
    assert.equal((await request('GET',`/api/messages/conversations/${convId}`,902)).status,403);
    assert.equal((await request('POST',`/api/messages/conversations/${convId}/messages`,902,{body:'Forbidden'})).status,403);
    const sendBody={body:'Retry fixture',idempotencyKey:'account-message-repeat-001'};
    const sent=await request('POST',`/api/messages/conversations/${convId}/messages`,901,sendBody);assert.equal(sent.status,200,JSON.stringify(sent.body));
    const repeated=await request('POST',`/api/messages/conversations/${convId}/messages`,901,sendBody);assert.equal(repeated.status,200);assert.equal(repeated.body.message.id,sent.body.message.id);
    assert.equal((await request('POST',`/api/messages/conversations/${convId}/read`)).status,200);
    const {createInAppNotification}=await import('./in-app-notifications.js');
    const notice=await createInAppNotification(pool,{userId:901,userRole:'homeowner',type:'fixture',title:'Fixture notice',message:'Local only'});
    assert.equal((await request('POST',`/api/notifications/${notice.id}/read`,902)).status,200);
    assert.equal((await pool.query('SELECT read FROM notifications WHERE id=$1',[notice.id])).rows[0].read,false);
    assert.equal((await request('POST',`/api/notifications/${notice.id}/read`)).status,200);
    const readAt=(await pool.query('SELECT read_at FROM notifications WHERE id=$1',[notice.id])).rows[0].read_at;
    assert.equal((await request('POST',`/api/notifications/${notice.id}/read`)).status,200);
    assert.equal(new Date((await pool.query('SELECT read_at FROM notifications WHERE id=$1',[notice.id])).rows[0].read_at).getTime(),new Date(readAt).getTime());
    assert.equal((await request('DELETE',`/api/properties/101/documents/${docId}`)).status,200);
    assert.equal((await request('GET',`/api/properties/101/documents/${docId}`)).status,404);
  } finally {if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
