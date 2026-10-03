import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRuntimeDatabase,isHostedProduction} from './runtime-database-config.js';
test('hosted startup never silently uses ephemeral accounts or local session policy',()=>{
  for(const signals of [{NODE_ENV:'production'},{CONTEXT:'production'},{FIXBRIDGE_HOSTING:'railway'},{FIXBRIDGE_HOSTING:'netlify'},{NETLIFY:'true'},{RAILWAY_PROJECT_ID:'fixture'},{RAILWAY_ENVIRONMENT_ID:'fixture'},{RAILWAY_SERVICE_ID:'fixture'}]) {
    assert.equal(isHostedProduction(signals),true);
    assert.throws(()=>resolveRuntimeDatabase(signals),/persistent PostgreSQL/);
    const config=resolveRuntimeDatabase({...signals,DATABASE_URL:'postgresql://fixture.invalid/fixbridge'});
    assert.equal(config.useInMemoryDb,false);assert.equal(config.deployed,true);
  }
  assert.equal(resolveRuntimeDatabase({NODE_ENV:'test'}).useInMemoryDb,true);
  assert.equal(resolveRuntimeDatabase({NEON_DATABASE_URL:'postgres://primary.invalid/app',DATABASE_URL:'postgres://secondary.invalid/app'}).connectionString,'postgres://primary.invalid/app');
  for(const invalid of ['bad-value','https://example.invalid/db','postgres://example.invalid/'])assert.throws(()=>resolveRuntimeDatabase({DATABASE_URL:invalid}),/configuration is invalid/);
});
