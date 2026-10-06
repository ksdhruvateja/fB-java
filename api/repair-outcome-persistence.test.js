import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildPropertyAIContext } from './property-ai-context.js';

test('repair outcomes persist, stay property-bound, and recover from failed history writes', async () => {
  Object.assign(process.env, { NODE_ENV:'test', NEON_DATABASE_URL:'', DATABASE_URL:'', SESSION_SECRET:'local-repair-fixture', ENABLE_DEMO_USERS:'false', ENABLE_DEMO_SEED:'false', DISABLE_OUTBOUND_EMAIL:'true', GMAIL_USER:'', GMAIL_APP_PASSWORD:'', STRIPE_SECRET_KEY:'', STRIPE_WEBHOOK_SECRET:'', GEMINI_API_KEY:'', OPENAI_API_KEY:'', OPENROUTER_API_KEY:'', ANTHROPIC_API_KEY:'', NETLIFY:'', CONTEXT:'', FIXBRIDGE_HOSTING:'' });
  const require=createRequire(import.meta.url), pgMem=require('pg-mem'), original=pgMem.newDb;
  let database;
  pgMem.newDb=options=>{database=original({...options,noAstCoverageCheck:true});for(const name of ['trim','btrim'])database.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});return database;};
  const {default:app,pool,initDb}=await import('./app.js');
  let server, failPropertyWrite=false;
  const query=pool.query.bind(pool), connect=pool.connect.bind(pool);
  try {
    await initDb();
    await query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(903,'contractor','Assigned','pro@example.invalid','unused')");
    await query("INSERT INTO properties(id,owner_user_id,address_line1,home_systems,health_profile) VALUES(101,901,'Fixture',$1,'{}'),(102,902,'Other fixture','[]','{}')",[JSON.stringify([{key:'hvac',name:'Air conditioner',model:'OWNER-MODEL',source:'homeowner',verification:'confirmed'}])]);
    await query("INSERT INTO subscriptions(user_id,plan_code,plan_family,status,simulated,stripe_subscription_id,current_period_end) VALUES(901,'homecare_pro','homecare_pro','active',false,'fixture',$1),(902,'homecare_pro','homecare_pro','active',false,'other-fixture',$1)",[new Date(Date.now()+86400000)]);
    await query("INSERT INTO managed_jobs(id,homeowner_user_id,property_id,equipment_key,category,title,status,assigned_contractor_user_id,ai_assessment) VALUES(201,901,101,'hvac','HVAC','Local repair','draft',NULL,$1),(202,901,101,'hvac','HVAC','Professional repair','work_started',903,NULL),(203,901,101,'hvac','HVAC','Danger fixture','draft',NULL,$2)",[JSON.stringify({summary:'AI hypothesis only',safe_diy_allowed:true,diy_steps:['Check the thermostat display']}),JSON.stringify({professional_required:true,diy_steps:['Blocked step']})]);
    const intercept=(sql,args)=>{if(failPropertyWrite && /^UPDATE properties SET (health_profile|home_systems)/.test(sql.trim()))throw new Error('Injected property write failure');return query(sql,args);};
    pool.query=intercept;
    // pg-mem does not implement PostgreSQL rollback. This explicit backup adapter
    // verifies route transaction boundaries, not real PostgreSQL crash durability.
    pool.connect=async()=>{const client=await connect();let backup;return {release:()=>client.release(),query:async(sql,args)=>{if(sql==='BEGIN'){backup=database.backup();return {rows:[]};}if(sql==='ROLLBACK'){backup.restore();return {rows:[]};}if(sql==='COMMIT')return {rows:[]};return intercept(sql,args);}};};
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    async function request(path,id,body,method='POST'){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role:id===903?'contractor':'homeowner',jti:Math.random().toString()},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
    const file='data:application/pdf;base64,JVBERi1maXh0dXJl';
    const upload=await request('/api/properties/101/documents',901,{title:'Fixture equipment manual',category:'manual',fileName:'fixture.pdf',mimeType:'application/pdf',dataUrl:file,systemKey:'hvac'});assert.equal(upload.status,200,JSON.stringify(upload.body));
    const docPath=`/api/properties/101/documents/${upload.body.document.id}`;
    assert.equal((await request(docPath,901,null,'GET')).body.document.dataUrl,file,'new session retrieves database-backed bytes');
    assert.equal((await request(docPath,902,null,'GET')).status,404);
    assert.equal((await request(docPath.replace('/101/','/102/'),901,null,'GET')).status,404);
    const review=await request(`${docPath}/analyze`,901,{});assert.equal(review.status,200);assert.equal(review.body.source,'not_analyzed');assert.deepEqual(review.body.extraction,{systemKey:'hvac'});
    assert.equal((await request(`${docPath}/analyze`,902,{})).status,404);
    let documentContext=await buildPropertyAIContext(pool,101,901,{includeAddress:false});assert.equal(documentContext.memory.passport.documents[0].id,upload.body.document.id);assert.match(documentContext.text,/contents not analyzed/);assert.doesNotMatch(JSON.stringify(documentContext),/JVBER|Fixture equipment manual/);
    failPropertyWrite=true;
    assert.equal((await request(`${docPath}/apply-extract`,901,{extraction:{systemKey:'hvac',date:'2026-10-01',summary:'Reviewed manually'}})).status,500);
    assert.equal((await query('SELECT notes FROM property_documents WHERE id=$1',[upload.body.document.id])).rows[0].notes,null,'failed review rolls back document metadata too');
    failPropertyWrite=false;
    assert.equal((await request(`${docPath}/apply-extract`,902,{extraction:{systemKey:'hvac',date:'2026-10-01'}})).status,404);
    for(let n=0;n<2;n++)assert.equal((await request(`${docPath}/apply-extract`,901,{extraction:{systemKey:'hvac',date:'2026-10-01'}})).status,200);
    const reviewedSystem=(await query('SELECT home_systems FROM properties WHERE id=101')).rows[0].home_systems[0];assert.equal(reviewedSystem.model,'OWNER-MODEL');assert.equal(reviewedSystem.documentSourceRefs.length,1);assert.equal(reviewedSystem.documentSourceRefs[0].verification,'HOMEOWNER_REPORTED');
    assert.equal((await request(docPath,901,{},'DELETE')).status,200);
    documentContext=await buildPropertyAIContext(pool,101,901,{includeAddress:false});assert.equal(documentContext.memory.passport.documents.length,0,'deleted vault files disappear from future document context');
    assert.equal((await request('/api/managed/jobs/201/fixera-diy',902,{event:'fixed'})).status,404);
    assert.equal((await request('/api/managed/jobs/203/fixera-diy',901,{event:'step_completed',stepIndex:0})).status,409);
    assert.equal((await request('/api/managed/jobs/201/fixera-diy',901,{event:'step_completed',stepIndex:0})).status,200);
    const before=(await query('SELECT completion_report FROM managed_jobs WHERE id=201')).rows[0].completion_report;
    failPropertyWrite=true;
    const failed=await request('/api/managed/jobs/201/fixera-diy',901,{event:'fixed',actualAction:'Adjusted thermostat'});assert.equal(failed.status,500);assert.equal(failed.body.code,'DIY_OUTCOME_SAVE_FAILED');
    assert.deepEqual((await query('SELECT completion_report FROM managed_jobs WHERE id=201')).rows[0].completion_report,before);
    failPropertyWrite=false;
    for(let n=0;n<2;n++)assert.equal((await request('/api/managed/jobs/201/fixera-diy',901,{event:'fixed',actualAction:'Adjusted thermostat',partsUsed:'No parts',toolsUsed:'No tools',cost:0})).status,200);
    let property=(await query('SELECT health_profile FROM properties WHERE id=101')).rows[0].health_profile;assert.equal(property.previousServices.length,1);
    let context=await buildPropertyAIContext(pool,101,901,{includeAddress:false,equipmentKey:'hvac'});assert.match(context.text,/Adjusted thermostat/);assert.match(context.text,/not a verified diagnosis/);assert.equal(await buildPropertyAIContext(pool,101,902),null);
    assert.equal((await request('/api/managed/jobs/201/fixera-diy',901,{event:'still_broken',actualAction:'Symptom returned'})).status,200);
    property=(await query('SELECT health_profile FROM properties WHERE id=101')).rows[0].health_profile;
    assert.equal(property.previousServices.length,1);assert.equal(property.previousServices[0].verification,'CUSTOMER_REPORTED_STILL_BROKEN');
    failPropertyWrite=true;
    const completion=await request('/api/managed/jobs/202/complete',903,{summary:'Replaced reported filter',materialsUsed:'Replacement filter',structuredEquipment:{key:'hvac',model:'PRO-REPORTED'}});assert.equal(completion.status,500,JSON.stringify(completion.body));assert.equal(completion.body.code,'PROPERTY_HISTORY_SYNC_FAILED');
    failPropertyWrite=false;
    for(let n=0;n<2;n++){const retry=await request('/api/managed/jobs/202/complete',903,{summary:'Must not replace saved report'});assert.equal(retry.status,200,JSON.stringify(retry.body));assert.equal(retry.body.alreadyCompleted,true);}
    property=(await query('SELECT health_profile,home_systems FROM properties WHERE id=101')).rows[0];assert.equal(property.health_profile.previousServices.filter(x=>x.id==='job-202').length,1);assert.equal(property.home_systems[0].model,'OWNER-MODEL');
    assert.equal(Number((await query("SELECT COUNT(*) AS n FROM property_memory_suggestions WHERE source_ref='202'")).rows[0].n),1);
    context=await buildPropertyAIContext(pool,101,901,{includeAddress:false});assert.match(context.text,/Replaced reported filter/);assert.match(context.text,/TECHNICIAN_REPORTED/);assert.doesNotMatch(context.text,/Must not replace saved report/);
    assert.deepEqual(context.memory.previousServices.find(item=>item.id===202).partsUsed,['Replacement filter']);assert.match(context.text,/parts: Replacement filter/);
    assert.deepEqual(property.health_profile.previousServices.find(item=>item.id==='job-202').partsUsed,['Replacement filter']);assert.equal(property.health_profile.previousServices.find(item=>item.id==='job-202').verification,'TECHNICIAN_REPORTED');
    assert.deepEqual((await query('SELECT health_profile FROM properties WHERE id=102')).rows[0].health_profile,{});
  } finally {pool.query=query;pool.connect=connect;if(server)await new Promise(r=>server.close(r));pgMem.newDb=original;await pool.end();}
});
