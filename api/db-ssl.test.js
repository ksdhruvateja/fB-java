import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresSslOptions} from './db-ssl.js';

test('all hosted signals enforce verified TLS despite local insecure flags',()=>{
  for(const signal of [{NODE_ENV:'production'},{CONTEXT:'production'},{FIXBRIDGE_HOSTING:'railway'},{FIXBRIDGE_HOSTING:'netlify'},{NETLIFY:'true'},{RAILWAY_PROJECT_ID:'fixture'},{RAILWAY_ENVIRONMENT_ID:'fixture'},{RAILWAY_SERVICE_ID:'fixture'}]) {
    for(const option of [{DB_SSL_REJECT_UNAUTHORIZED:'false'},{PGSSLMODE:'require-insecure'}]) assert.deepEqual(postgresSslOptions({...signal,...option,DATABASE_URL:'postgresql://fixture.invalid/app'}),{rejectUnauthorized:true});
  }
  assert.deepEqual(postgresSslOptions({NODE_ENV:'development',DB_SSL_REJECT_UNAUTHORIZED:'false'}),{rejectUnauthorized:false});
  assert.deepEqual(postgresSslOptions({NODE_ENV:'development'}),{rejectUnauthorized:true});
});
