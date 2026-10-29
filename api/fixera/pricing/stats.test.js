import assert from 'node:assert/strict';
import {
  acceptanceBands,
  classifyQuoteVsRange,
  confidenceFromSample,
  isTestOrDemoRecord,
  summarizeAmounts,
} from './stats.js';
import { selectComparableQuotes } from './intelligence.js';

const stats = summarizeAmounts([100, 110, 120, 130, 140, 9000]);
assert.equal(stats.excludedCount > 0, true);
assert.ok(stats.median < 200);

assert.equal(confidenceFromSample(2, 'zip'), 'LOW');
assert.equal(confidenceFromSample(12, 'zip'), 'MEDIUM');
assert.equal(confidenceFromSample(24, 'zip'), 'HIGH');
assert.equal(confidenceFromSample(40, 'regional'), 'LOW');

assert.equal(isTestOrDemoRecord({ email: 'demo.homeowner.20260908a@example.com' }), true);
assert.equal(isTestOrDemoRecord({ email: 'homeowner@fixbridge.us' }), false);

const comparison = selectComparableQuotes([
  { id: 1, job_id: 11, contractor_quote_amount: 300, status: 'approved', approved_at: '2026-01-01', category: 'Plumbing', city_state_zip: 'Irving, TX 75039', email: 'a@customer.com' },
  { id: 2, job_id: 12, contractor_quote_amount: 320, status: 'approved', approved_at: '2026-01-02', category: 'Plumbing', city_state_zip: 'Irving, TX 75039', email: 'b@customer.com' },
  { id: 3, job_id: 13, contractor_quote_amount: 280, status: 'rejected', category: 'Plumbing', city_state_zip: 'Irving, TX 75039', email: 'c@customer.com' },
  { id: 4, job_id: 14, contractor_quote_amount: 10, status: 'approved', category: 'Plumbing', city_state_zip: 'Irving, TX 75039', email: 'demo.homeowner.x@example.com' },
], { zip: '75039', category: 'Plumbing' });

assert.equal(comparison.level, 'zip');
assert.equal(comparison.excludedTestRecords, 1);
assert.equal(comparison.stats.sampleSize, 3);

const signal = classifyQuoteVsRange(390, { sampleSize: 3, median: 300, p25: 280, p75: 320 });
assert.equal(signal.signal, 'above_range');
const outlier = classifyQuoteVsRange(500, { sampleSize: 3, median: 300, p25: 280, p75: 320 });
assert.equal(outlier.signal, 'significant_outlier_high');

const bands = acceptanceBands([
  { amount: 250, accepted: true },
  { amount: 260, accepted: true },
  { amount: 270, accepted: true },
  { amount: 280, accepted: true },
  { amount: 400, accepted: false },
  { amount: 410, accepted: false },
  { amount: 420, accepted: false },
  { amount: 430, accepted: false },
]);
assert.equal(bands.available, true);

console.log('fixera pricing stats: ok');
