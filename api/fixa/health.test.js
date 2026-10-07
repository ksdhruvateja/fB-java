import test from 'node:test';
import assert from 'node:assert/strict';
import {getFixaHealth,getFixaAdminProviders} from './core.js';
test('Fixera provider status returns configuration without assessment-only variables or connectivity claims',async()=>{
  const health=await getFixaHealth();
  assert.ok(['configured_not_probed','not_connected'].includes(health.code));
  assert.equal(health.assistant,'Fixera');
  assert.equal('caseId' in health,false);
  assert.equal('propertyId' in health,false);
  const status=await getFixaAdminProviders();
  assert.equal(status.assistant,'Fixera');
  assert.deepEqual(status.health,health);
});
