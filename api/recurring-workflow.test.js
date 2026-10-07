import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calendarDate, addRecurrenceDays } from './recurring-calendar.js';

test('all calendar cadences are UTC-safe and clamp month-end; event/custom require manual dates',()=>{
 assert.equal(addRecurrenceDays('2026-01-31','monthly'),'2026-02-28');
 assert.equal(addRecurrenceDays('2026-02-28','monthly','2026-01-31'),'2026-03-31');
 for(const [cadence,date] of Object.entries({weekly:'2026-02-07',biweekly:'2026-02-14',every_2_months:'2026-03-31',quarterly:'2026-04-30',seasonal:'2026-04-30',every_6_months:'2026-07-31',annually:'2027-01-31'}))assert.equal(addRecurrenceDays('2026-01-31',cadence),date);
 assert.equal(calendarDate('2026-02-31'),null);
 assert.equal(calendarDate(new Date('2026-10-03T12:00:00Z')),'2026-10-03');
 assert.equal(addRecurrenceDays('2026-10-03','custom'),null);assert.equal(addRecurrenceDays('2026-10-03','per_snow_event'),null);
});

test('recurring setup, coordination queue, repeat, skip, cancellation and ownership stay isolated', async()=>{
  Object.assign(process.env, {
    NODE_ENV: 'test', NEON_DATABASE_URL: '', SESSION_SECRET: 'local-access-fixture',
    ENABLE_DEMO_USERS: 'false', ENABLE_DEMO_SEED: 'false', DISABLE_OUTBOUND_EMAIL: 'true',
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
    GEMINI_API_KEY: '', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '',
    NETLIFY: '', CONTEXT: '', FIXBRIDGE_HOSTING: '',
  });
  const require = createRequire(import.meta.url);
  const pgMem = require('pg-mem');
  const originalNewDb = pgMem.newDb;
  pgMem.newDb = (options) => {
    const db = originalNewDb({ ...options, noAstCoverageCheck: true });
    for (const name of ['trim', 'btrim']) db.public.registerFunction({
      name, args: ['text'], returns: 'text', implementation: (value) => value.trim(),
    });
    return db;
  };

  const { default: app, pool, initDb } = await import('./app.js');
  let server;
  try {
    await initDb();
    await pool.query("INSERT INTO users(id,role,name,email,password) VALUES(901,'homeowner','Owner','owner@example.invalid','unused'),(902,'homeowner','Other','other@example.invalid','unused'),(905,'admin','Admin','admin@example.invalid','unused')");
    await pool.query("INSERT INTO subscriptions(user_id,plan_code,plan_family,status,simulated,stripe_subscription_id,current_period_end) VALUES(901,'homecare_pro','homecare_pro','active',false,'fixture',$1)",[new Date(Date.now()+86400000)]);
    await pool.query("INSERT INTO properties(id,owner_user_id,address_line1,city,state,zip) VALUES(101,901,'Fixture only','Austin','TX','78701'),(102,902,'Other fixture','Austin','TX','78701')");
    const { DEFAULT_HOMECARE_CONFIG,invalidateHomeCareConfigCache } = await import('./homecare-config.js');
    const config=JSON.parse(JSON.stringify(DEFAULT_HOMECARE_CONFIG));config.recurring.activationFee.enabled=false;
    await pool.query("INSERT INTO homecare_settings(id,config,config_version) VALUES('default',$1,1) ON CONFLICT(id) DO UPDATE SET config=$1",[JSON.stringify(config)]);invalidateHomeCareConfigCache();
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const jwt=require('jsonwebtoken');
    async function request(method,path,id,body={}){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt.sign({id,role:id===905?'admin':'homeowner'},process.env.SESSION_SECRET)}`},...(method==='GET'?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};}
    const today=calendarDate(new Date());const input={offeringId:'cleaning',propertyId:101,recurrence:'weekly',startDate:today,setupInvocationId:'fixture-recurring-setup'};
    assert.equal((await request('POST','/api/recurring-services/setup',901,{...input,recurrence:'annually'})).status,400);
    assert.equal((await request('POST','/api/recurring-services/setup',901,{...input,startDate:'2026-02-31'})).status,400);
    assert.equal((await request('POST','/api/recurring-services/setup',901,{...input,propertyId:102})).status,404);
    const created=await request('POST','/api/recurring-services/setup',901,input);assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.service.id;
    const repeated=await request('POST','/api/recurring-services/setup',901,input);assert.equal(repeated.body.service.id,id);assert.equal(repeated.body.jobId,created.body.jobId);
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM recurring_services')).rows[0].n),1);
    assert.equal((await request('POST','/api/recurring-services/setup',901,{...input,offeringId:'landscaping'})).status,409);
    const {processUpcomingRecurringServices,queueRecurringOccurrence}=await import('./recurring-scheduler.js');
    let sweep=await processUpcomingRecurringServices(pool);assert.equal(sweep.created,0,'first pricing job is reused');
    const next=addRecurrenceDays(today,'weekly');const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);sweep=await processUpcomingRecurringServices(pool,{asOf:tomorrow});assert.equal(sweep.created,1,JSON.stringify(sweep));const jobId=sweep.results[0].jobId;
    const job=(await pool.query('SELECT * FROM managed_jobs WHERE id=$1',[jobId])).rows[0];assert.equal(job.status,'awaiting_contractor');assert.equal(job.assigned_contractor_user_id,null);assert.equal(job.preferred_date,next);
    const sameDate=await request('POST',`/api/recurring-services/${id}/reschedule`,901,{newDate:next,preferredTimeWindow:'Evening'});assert.equal(sameDate.status,200);assert.equal((await pool.query('SELECT status,preferred_time_slot FROM managed_jobs WHERE id=$1',[jobId])).rows[0].status,'awaiting_contractor');
    await pool.query("UPDATE managed_jobs SET status='contractor_assigned' WHERE id=$1",[jobId]);
    assert.equal((await request('POST',`/api/recurring-services/${id}/reschedule`,901,{newDate:addRecurrenceDays(next,'weekly')})).status,409);
    assert.equal((await request('POST',`/api/recurring-services/${id}/skip`,901,{})).status,409);
    await pool.query("UPDATE managed_jobs SET status='awaiting_contractor' WHERE id=$1",[jobId]);
    const adminQueue=await request('GET','/api/admin/managed/jobs',905);assert.equal(adminQueue.status,200);assert.ok(adminQueue.body.jobs.some(item=>item.id===jobId && item.sourceRecurringServiceId===id && item.status==='awaiting_contractor'));
    assert.equal((await request('GET','/api/admin/managed/jobs',901)).status,403);
    const duplicate=await queueRecurringOccurrence(pool,{recurringServiceId:id,ownerUserId:901,expectedDate:next});assert.equal(duplicate.jobId,jobId);assert.equal(duplicate.created,false);
    assert.equal((await request('POST',`/api/recurring-services/${id}/request-visit`,902)).status,403);
    assert.equal((await request('PATCH',`/api/recurring-services/${id}`,901,{status:'cancelled'})).status,200);
    assert.equal((await pool.query('SELECT status FROM managed_jobs WHERE id=$1',[jobId])).rows[0].status,'canceled');
    assert.equal((await processUpcomingRecurringServices(pool)).created,0);
    // Reschedule, skip and pause preserve full-calendar cadences on a separately approved fixture.
    await pool.query("UPDATE recurring_services SET status='active', recurrence='quarterly', next_service_date=$2 WHERE id=$1",[id,today]);
    assert.equal((await request('POST',`/api/recurring-services/${id}/reschedule`,901,{newDate:'2026-02-31'})).status,400);
    const future=addRecurrenceDays(today,'biweekly');assert.equal((await request('POST',`/api/recurring-services/${id}/reschedule`,901,{newDate:future})).status,200);
    const skipped=await request('POST',`/api/recurring-services/${id}/skip`,901,{});assert.equal(skipped.status,200);assert.equal(skipped.body.service.nextServiceDate,addRecurrenceDays(future,'quarterly',today));
    assert.equal((await request('PATCH',`/api/recurring-services/${id}`,901,{status:'paused'})).status,200);assert.equal((await processUpcomingRecurringServices(pool)).created,0);
    // Custom/event schedules queue explicit requested dates, never invent a repeating interval.
    const eventSetup=await request('POST','/api/recurring-services/setup',901,{...input,offeringId:'snow_removal',recurrence:'per_snow_event',setupInvocationId:'fixture-snow-event'});assert.equal(eventSetup.status,200,JSON.stringify(eventSetup.body));const eventId=eventSetup.body.service.id;
    assert.equal((await processUpcomingRecurringServices(pool)).created,0);
    assert.equal((await request('POST',`/api/recurring-services/${eventId}/reschedule`,901,{newDate:next})).status,200);
    const explicit=await processUpcomingRecurringServices(pool);assert.equal(explicit.created,1);assert.equal((await processUpcomingRecurringServices(pool)).created,0);
    const pastEvent=new Date(next+'T12:00:00Z');pastEvent.setUTCDate(pastEvent.getUTCDate()+1);assert.equal((await processUpcomingRecurringServices(pool,{asOf:pastEvent})).created,0);
    assert.equal(calendarDate((await pool.query('SELECT next_service_date FROM recurring_services WHERE id=$1',[eventId])).rows[0].next_service_date),null);
    // Pause cannot bypass activation payment or elevate pending pricing to approved.
    assert.equal((await request('PATCH',`/api/recurring-services/${eventId}`,901,{status:'paused'})).status,200);
    assert.equal((await request('PATCH',`/api/recurring-services/${eventId}`,901,{status:'active'})).status,409);
    const feeMeta=(await pool.query('SELECT metadata FROM recurring_services WHERE id=$1',[eventId])).rows[0].metadata;feeMeta.activationFeeAmountCents=4900;feeMeta.activationFeeStatus='awaiting';feeMeta.pipelineStatus='awaiting_activation_fee';await pool.query("UPDATE recurring_services SET metadata=$2 WHERE id=$1",[eventId,JSON.stringify(feeMeta)]);
    assert.equal((await request('PATCH',`/api/recurring-services/${eventId}`,901,{status:'active'})).status,409);
    assert.equal((await processUpcomingRecurringServices(pool)).created,0);


  }finally{if(server)await new Promise(r=>server.close(r));pgMem.newDb=originalNewDb;await pool.end();}
});
