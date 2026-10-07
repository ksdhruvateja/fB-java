import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepairPhotos, repairPhotosFromRow, MAX_REPAIR_PHOTO_CHARS } from './repair-photos.js';

const png = 'data:image/png;base64,aGVsbG8=';
test('accepts six ordered photos and preserves legacy single-photo rows', () => {
  const batch = Array.from({ length: 6 }, () => png);
  assert.deepEqual(normalizeRepairPhotos(batch), batch);
  assert.deepEqual(normalizeRepairPhotos(null, png), [png]);
  assert.deepEqual(repairPhotosFromRow({ media_data_urls: JSON.stringify(batch) }), batch);
  assert.deepEqual(repairPhotosFromRow({ media_data_url: png }), [png]);
  assert.deepEqual(repairPhotosFromRow({ media_data_url: 'data:video/mp4;base64,aGVsbG8=' }), []);
});
test('rejects malformed batches, excessive photos and oversized payloads', () => {
  for (const input of [png, {}, 12]) assert.throws(() => normalizeRepairPhotos(input), { status: 400, code: 'INVALID_REPAIR_PHOTOS' });
  assert.throws(() => normalizeRepairPhotos(Array(7).fill(png)), { status: 400, code: 'TOO_MANY_REPAIR_PHOTOS' });
  for (const photo of ['data:image/svg+xml;base64,aGVsbG8=', 'https://example.invalid/image.png', 'data:image/png;base64,', 'data:image/png;base64,abc', 'data:image/png;base64,' + 'a'.repeat(MAX_REPAIR_PHOTO_CHARS)]) {
    assert.throws(() => normalizeRepairPhotos([photo]), { status: 400, code: 'INVALID_REPAIR_PHOTO' });
  }
});
test('explicit photo removal does not restore the legacy attachment', () => {
  assert.deepEqual(normalizeRepairPhotos([], png), []);
});
