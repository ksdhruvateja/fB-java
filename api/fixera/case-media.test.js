import assert from 'node:assert/strict';
import test from 'node:test';
import { storeFixeraCaseMedia } from './case-media.js';

test('repair media is stored against the authorized case, property, and equipment', async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) return { rows: [{ id: 41, homeowner_user_id: 7, property_id: 12, equipment_key: 'refrigerator-main' }] };
      return { rows: [{ id: 88, storage_key: params[6], content_type: params[7], byte_size: params[8], created_at: '2026-09-30T00:00:00Z' }] };
    },
  };

  const media = await storeFixeraCaseMedia(pool, {
    userId: 7,
    caseType: 'pending_service_request',
    caseId: 41,
    propertyId: 12,
    equipmentKey: 'refrigerator-main',
    dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
  });

  assert.equal(media.id, 88);
  assert.match(calls[0].sql, /homeowner_user_id=\$2/);
  assert.match(calls[1].sql, /pending_service_request_id/);
  assert.deepEqual(calls[1].params.slice(0, 6), [7, null, 41, 'pending_service_request', 12, 'refrigerator-main']);
  assert.equal(calls[1].params[7], 'image/jpeg');
  assert.equal(calls[1].params[9], 'data:image/jpeg;base64,ZmFrZQ==');
});

test('repair media cannot be attached to another homeowner case or mismatched property', async () => {
  let inserted = false;
  const pool = {
    async query(sql) {
      if (/SELECT id, homeowner_user_id/.test(sql)) return { rows: [] };
      inserted = true;
      return { rows: [] };
    },
  };

  await assert.rejects(() => storeFixeraCaseMedia(pool, {
    userId: 7,
    caseType: 'managed_job',
    caseId: 41,
    propertyId: 12,
    dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
  }), /not found/);
  assert.equal(inserted, false);
});

test('repair media rejects a property or equipment identity that differs from its authorized case', async () => {
  let inserted = false;
  const pool = {
    async query(sql) {
      if (/SELECT id, homeowner_user_id/.test(sql)) {
        return { rows: [{ id: 41, homeowner_user_id: 7, property_id: 12, equipment_key: 'refrigerator-main' }] };
      }
      inserted = true;
      return { rows: [] };
    },
  };
  const input = {
    userId: 7,
    caseType: 'managed_job',
    caseId: 41,
    dataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
  };

  await assert.rejects(() => storeFixeraCaseMedia(pool, { ...input, propertyId: 99, equipmentKey: 'refrigerator-main' }), /property does not match/);
  await assert.rejects(() => storeFixeraCaseMedia(pool, { ...input, propertyId: 12, equipmentKey: 'dishwasher-main' }), /equipment does not match/);
  assert.equal(inserted, false);
});