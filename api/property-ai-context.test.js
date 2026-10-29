import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPropertyAIContext } from './property-ai-context.js';
import { propertyMemoryFromRecord } from './fixa/memory/propertyMemory.js';

test('property Passport retrieval stops before reading another owner property', async () => {
  let queryCount = 0;
  const pool = {
    async query(sql, params) {
      queryCount += 1;
      assert.match(sql, /household_memberships/);
      assert.deepEqual(params, [77, 12]);
      return { rows: [] };
    },
  };

  const context = await buildPropertyAIContext(pool, 77, 12);

  assert.equal(context, null);
  assert.equal(queryCount, 1);
});

test('property context scopes equipment and completion history to the authorized property owner', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [{ id: 77, owner_user_id: 12 }] };
      if (calls.length === 2) return { rows: [{
        id: 77,
        owner_user_id: 12,
        label: 'Main home',
        address_line1: '123 Private Street',
        city: 'Irving',
        state: 'TX',
        zip: '75039',
        home_systems: [{ key: 'hvac', name: 'HVAC', brand: 'Example', model: 'A-1', serialNumber: 'S-1' }],
        health_profile: {
          passport: {},
          previousServices: [{
            id: 'fixera-diy-92',
            title: 'HVAC filter housing repair',
            system: 'HVAC',
            date: '2026-09-03',
            notes: 'Homeowner confirmed fixed; Fixera hypothesis not independently verified.',
            source: 'HOMEOWNER_DIY',
            verification: 'CUSTOMER_CONFIRMED_OUTCOME',
            relatedJobId: 92,
            completedStepIndexes: [0, 1],
          }],
        },
      }] };
      if (calls.length === 3) return { rows: [
        {
          id: 91,
          title: 'HVAC service',
          category: 'hvac',
          status: 'completed',
          created_at: '2026-09-01T00:00:00Z',
          customer_confirmed_at: '2026-09-02T00:00:00Z',
          completion_report: { actualDiagnosis: 'Capacitor failed', actualRepair: 'Capacitor replaced', partsUsed: ['capacitor'] },
        },
        {
          id: 92,
          title: 'HVAC filter housing repair',
          category: 'hvac',
          status: 'assessment_ready',
          created_at: '2026-09-03T00:00:00Z',
          customer_confirmed_at: null,
          completion_report: { fixeraDiy: { outcome: 'CUSTOMER_CONFIRMED_STILL_BROKEN', completedStepIndexes: [0, 1] } },
        },
      ] };
      throw new Error('unexpected query');
    },
  };

  const context = await buildPropertyAIContext(pool, 77, 12, { includeAddress: false });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].params, [77, 12]);
  assert.deepEqual(calls[1].params, [77, 12]);
  assert.deepEqual(calls[2].params, [77, 12, null]);
  assert.match(context.text, /model A-1/);
  assert.match(context.text, /CUSTOMER_CONFIRMED/);
  assert.match(context.text, /CUSTOMER_CONFIRMED_OUTCOME/);
  assert.match(context.text, /HOMEOWNER_REPORTED_STILL_BROKEN/);
  assert.match(context.text, /not a verified diagnosis/);
  assert.match(context.text, /Capacitor replaced/);
  assert.match(context.text, /Fixera hypothesis not independently verified/);
  assert.doesNotMatch(context.text, /123 Private Street/);
  assert.equal(context.memory.previousServices[0].verification, 'CUSTOMER_CONFIRMED');
  const confirmedDiy = context.memory.previousServices.find((service) => service.id === 'fixera-diy-92');
  assert.equal(confirmedDiy.verification, 'CUSTOMER_CONFIRMED_OUTCOME');
  assert.equal(confirmedDiy.relatedJobId, 92);
  const reportedFailedAttempt = context.memory.previousServices.find((service) => service.id === 92);
  assert.equal(reportedFailedAttempt.verification, 'CUSTOMER_REPORTED_STILL_BROKEN');
  assert.deepEqual(reportedFailedAttempt.completedStepIndexes, [0, 1]);
});

test('property memory keeps equipment/history provenance and omits street address', () => {
  const memory = propertyMemoryFromRecord({
    id: 77,
    address_line1: '123 Private Street',
    city: 'Irving',
    state: 'TX',
    zip: '75039',
    home_systems: [{ key: 'refrigerator', name: 'Refrigerator', brand: 'Example', model: 'RF-1', serialNumber: 'SERIAL-1' }],
    previousServices: [{ id: 4, title: 'Refrigerator repair', diagnosis: 'Drain pump failed', source: 'CUSTOMER_CONFIRMED' }],
  });

  assert.equal(memory.propertyId, 77);
  assert.equal(memory.locality, 'Irving, TX, 75039');
  assert.equal(memory.equipment[0].model, 'RF-1');
  assert.equal(memory.equipment[0].serialNumber, 'SERIAL-1');
  assert.equal(memory.previousAssessments[0].verification, 'CUSTOMER_CONFIRMED');
  assert.equal(JSON.stringify(memory).includes('123 Private Street'), false);
});

test('selected equipment context excludes other equipment service history', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [{ id: 77, owner_user_id: 12 }] };
      if (calls.length === 2) return { rows: [{
        id: 77,
        owner_user_id: 12,
        label: 'Main home',
        home_systems: [
          { key: 'refrigerator-main', name: 'Refrigerator', model: 'RF-22' },
          { key: 'dishwasher-main', name: 'Dishwasher', model: 'DW-12' },
        ],
        health_profile: { passport: {}, previousServices: [
          { id: 'fridge-service', title: 'Refrigerator fan repair', equipmentKey: 'refrigerator-main', notes: 'Fan replaced.' },
          { id: 'dishwasher-service', title: 'Dishwasher pump repair', equipmentKey: 'dishwasher-main', notes: 'Pump replaced.' },
        ] },
      }] };
      if (calls.length === 3) return { rows: [{
        id: 91,
        title: 'Refrigerator repair',
        category: 'appliances',
        equipment_key: 'refrigerator-main',
        status: 'completed',
        created_at: '2026-09-03T00:00:00Z',
        completion_report: { fixeraDiy: { outcome: 'CUSTOMER_CONFIRMED_FIXED', latestOutcomeDetails: { actualAction: 'Replaced fan', partsUsed: ['fan motor'] } } },
      }] };
      throw new Error('unexpected query');
    },
  };

  const context = await buildPropertyAIContext(pool, 77, 12, { equipmentKey: 'refrigerator-main' });

  assert.deepEqual(calls[2].params, [77, 12, 'refrigerator-main']);
  assert.match(context.text, /Refrigerator fan repair/);
  assert.match(context.text, /Replaced fan/);
  assert.doesNotMatch(context.text, /Dishwasher pump repair/);
  assert.doesNotMatch(context.text, /Pump replaced/);
});