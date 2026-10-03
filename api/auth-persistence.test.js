import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

test('password and Google identities restore the same persisted account and property',async()=>{
  Object.assign(process.env,{NODE_ENV:'test',NEON_DATABASE_URL:'',DATABASE_URL:'',SESSION_SECRET:'auth-persistence-fixture',ENABLE_DEMO_USERS:'false',ENABLE_DEMO_SEED:'false',DISABLE_OUTBOUND_EMAIL:'true',SLACK_WEBHOOK_URL:'',N8N_WEBHOOK_URL:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',GEMINI_API_KEY:'',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',NETLIFY:'',CONTEXT:'',FIXBRIDGE_HOSTING:'',RAILWAY_PROJECT_ID:'',RAILWAY_ENVIRONMENT_ID:'',RAILWAY_SERVICE_ID:'',GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com'});
  const require=createRequire(import.meta.url),pgMem=require('pg-mem'),original=pgMem.newDb;
  pgMem.newDb=o=>{const db=original({...o,noAstCoverageCheck:true});for(const name of ['trim','btrim'])db.public.registerFunction({name,args:['text'],returns:'text',implementation:v=>v.trim()});db.public.registerFunction({name:'nullif',args:['text','text'],returns:'text',implementation:(a,b)=>a===b?null:a});return db;};
  const nativeFetch=globalThis.fetch;
  let profile={email:'identity@example.invalid',sub:'fixture-google-sub'};
  globalThis.fetch=async(url,options)=>{
    if(String(url).startsWith('https://oauth2.googleapis.com/tokeninfo?'))return {ok:true,json:async()=>({aud:process.env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',exp:Math.floor(Date.now()/1000)+3600,email_verified:'true',...profile,name:'Fixture Google'})};
    if(!String(url).startsWith('http://127.0.0.1:'))throw Error('External network disabled');
    return nativeFetch(url,options);
  };
  const {default:app,pool,initDb}=await import('./app.js');let server;
  try{
    await initDb();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    async function post(path,body){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
    async function me(token){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`,{headers:{Authorization:`Bearer ${token}`}});return {status:response.status,body:await response.json()};}
    async function authenticated(method,path,token,body){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
    const consents={ACCOUNT_TERMS:true,PRIVACY_POLICY:true};
    const signup=await post('/api/auth/signup',{role:'homeowner',name:'Fixture Identity',email:'IDENTITY@example.invalid',password:'fixture-password-123',consents});
    assert.equal(signup.status,200,JSON.stringify(signup.body));const id=signup.body.user.id;
    const propertyCreated=await authenticated('POST','/api/properties',signup.body.token,{label:'Fixture home',addressLine1:'Local fixture',city:'Fixture City',state:'NJ',zip:'07001',timezone:'America/New_York'});
    assert.equal(propertyCreated.status,200,JSON.stringify(propertyCreated.body));const propertyId=propertyCreated.body.property.id;
    const healthProfile={beds:3,baths:2,sqft:1400,onboardingComplete:true,roofType:'shingle',notes:'Fixture saved onboarding'};
    const savedHealth=await authenticated('PUT',`/api/properties/${propertyId}/health`,signup.body.token,{healthProfile});assert.equal(savedHealth.status,200,JSON.stringify(savedHealth.body));
    const homeSystems=[{key:'hvac',name:'HVAC',notes:'Fixture passport entry'}];
    const passport=await authenticated('PUT',`/api/properties/${propertyId}`,signup.body.token,{yearBuilt:1999,homeSystems});assert.equal(passport.status,200,JSON.stringify(passport.body));
    const savedProfile=await authenticated('PUT','/api/auth/profile',signup.body.token,{name:'Fixture Saved Name',phone:'+15555550123',address:'Fixture profile address',contactEmail:'contact@example.invalid'});assert.equal(savedProfile.status,200,JSON.stringify(savedProfile.body));
    assert.equal((await post('/api/auth/signup',{role:'homeowner',name:'Duplicate fixture',email:' IDENTITY@EXAMPLE.INVALID ',password:'fixture-password-123',consents})).status,409);
    const signin=await post('/api/auth/signin',{role:'homeowner',email:'identity@example.invalid',password:'fixture-password-123'});assert.equal(signin.status,200);assert.equal(signin.body.user.id,id);
    const google=await post('/api/auth/google',{role:'homeowner',credential:'fixture-only-token'});assert.equal(google.status,200,JSON.stringify(google.body));assert.equal(google.body.user.id,id);
    const repeat=await post('/api/auth/google',{role:'homeowner',credential:'fixture-only-token'});assert.equal(repeat.body.user.id,id);
    for(const token of [signin.body.token,google.body.token]){
      const restored=(await me(token)).body.user;assert.equal(restored.id,id);assert.equal(restored.name,'Fixture Saved Name');assert.equal(restored.phone,'+15555550123');assert.equal(restored.address,'Fixture profile address');
      const properties=await authenticated('GET','/api/properties',token);assert.equal(properties.status,200,JSON.stringify(properties.body));assert.equal(properties.body.properties.length,1);
      const property=properties.body.properties[0];assert.equal(property.id,propertyId);assert.equal(property.yearBuilt,1999);assert.deepEqual(property.healthProfile,healthProfile);assert.deepEqual(property.homeSystems,homeSystems);
    }
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM users WHERE email='identity@example.invalid'")).rows[0].n),1);
    assert.equal(Number((await pool.query('SELECT owner_user_id FROM properties WHERE id=$1',[propertyId])).rows[0].owner_user_id),id);
    const peer=await post('/api/auth/signup',{role:'homeowner',name:'Peer fixture',email:'peer@example.invalid',password:'fixture-peer-password',consents});assert.equal(peer.status,200);
    assert.equal((await authenticated('GET','/api/properties',peer.body.token)).body.properties.length,0);
    assert.equal((await authenticated('PUT',`/api/properties/${propertyId}/health`,peer.body.token,{healthProfile:{beds:99}})).status,404);
    assert.deepEqual((await authenticated('GET','/api/properties',google.body.token)).body.properties[0].healthProfile,healthProfile);
    // Linking Google must not overwrite a valid password account's local password.
    assert.equal((await post('/api/auth/signin',{role:'homeowner',email:'identity@example.invalid',password:'fixture-password-123'})).status,200);
    const bcrypt=require('bcryptjs');await pool.query('UPDATE users SET password=$1 WHERE id=$2',[await bcrypt.hash('GOOGLE_OAUTH_fixture-google-sub',10),id]);
    assert.equal((await post('/api/auth/signin',{role:'homeowner',email:'identity@example.invalid',password:'GOOGLE_OAUTH_fixture-google-sub'})).status,401);
    // Errors after async role dispatch must become a bounded JSON failure, not an unhandled rejection.
    const originalQuery=pool.query.bind(pool);pool.query=async(sql,args)=>{if(String(sql).includes('oauth_google_sub=$1'))throw Object.assign(Error('fixture DB unavailable'),{code:'FIXTURE_FAILURE'});return originalQuery(sql,args);};
    const unavailable=await post('/api/auth/google',{role:'homeowner',credential:'fixture-only-token'});assert.equal(unavailable.status,500);assert.equal(unavailable.body.code,'GOOGLE_SIGNUP_FAILED');pool.query=originalQuery;
    profile={email:'new-google@example.invalid',sub:'fixture-new-sub'};
    const created=await post('/api/auth/google',{role:'homeowner',credential:'fixture-only-token',consents});assert.equal(created.status,200,JSON.stringify(created.body));
    const newUser=(await pool.query('SELECT id,password FROM users WHERE id=$1',[created.body.user.id])).rows[0];
    assert.equal(await bcrypt.compare('GOOGLE_OAUTH_fixture-new-sub',newUser.password),false,'Google subject is never a password');
    assert.equal((await post('/api/auth/google',{role:'homeowner',credential:'fixture-only-token'})).body.user.id,newUser.id);
  }finally{if(server)await new Promise(r=>server.close(r));globalThis.fetch=nativeFetch;pgMem.newDb=original;await pool.end();}
});
