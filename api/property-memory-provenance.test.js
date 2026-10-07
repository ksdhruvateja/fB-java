import test from 'node:test';
import assert from 'node:assert/strict';
import { trustLevelForRecord, mergeEquipmentRecord, MEMORY_TRUST } from './property-memory.js';

test('an unconfirmed verification label cannot elevate an AI suggestion to homeowner trust', () => {
  for (const verification of ['pending', 'unconfirmed', 'ai_suggested']) {
    assert.equal(trustLevelForRecord({ source: 'ai_extraction', verification }), MEMORY_TRUST.ai_suggestion);
  }
  assert.equal(trustLevelForRecord({ source: 'contractor', verification: 'reported' }), MEMORY_TRUST.contractor_structured);
  assert.equal(trustLevelForRecord({ source: 'document', verification: 'unconfirmed' }), MEMORY_TRUST.verified_document);
});

test('lower-trust extraction cannot replace homeowner-confirmed equipment', () => {
  const existing = { key: 'hvac', model: 'OWNER-VERIFIED', source: 'homeowner', verification: 'confirmed' };
  assert.deepEqual(mergeEquipmentRecord(existing, { model: 'AI-GUESS', source: 'ai_extraction', verification: 'pending' }), existing);
});

test('new AI and contractor records retain their source without automatic homeowner confirmation', () => {
  const suggested = mergeEquipmentRecord(null, { key: 'hvac', model: 'AI-GUESS', source: 'ai_extraction' });
  assert.equal(trustLevelForRecord(suggested), MEMORY_TRUST.ai_suggestion);
  const reported = mergeEquipmentRecord(null, { key: 'hvac', model: 'PRO-REPORTED', source: 'contractor' });
  assert.equal(trustLevelForRecord(reported), MEMORY_TRUST.contractor_structured);
  const owner = mergeEquipmentRecord(null, { key: 'hvac', model: 'OWNER-ENTERED' });
  assert.equal(trustLevelForRecord(owner), MEMORY_TRUST.homeowner_confirmed);
});
