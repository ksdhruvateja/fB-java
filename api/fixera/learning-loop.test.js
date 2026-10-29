import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCasePayload, confirmedCasesContext, scrubPii } from './learning-loop.js';

test('scrubPii removes contact details and addresses but keeps the repair facts', () => {
  const out = scrubPii('Hi, my name is Jane Doe, 42 Oak Street Apt 3B, 78701, call 512-555-0199 or jane@example.com. Kitchen faucet drips from the base.');
  assert.doesNotMatch(out, /Jane|Oak Street|3B|78701|555-0199|example\.com/);
  assert.match(out, /Kitchen faucet drips from the base/);
});

test('case payload is de-identified and carries what review and reuse need', () => {
  const p = buildCasePayload({
    summary: 'Worn cartridge at 42 Oak Street',
    likely_causes: ['Worn O-ring'],
    diy_risk_level: 'green',
    diy_safety: { decision: 'diy_ok', factors: [{ code: 'chemical', severity: 'low' }] },
    diy_steps: ['Close the valves under the sink.', 'Replace the cartridge.'],
    materials_needed: [{ name: 'Faucet cartridge' }],
    follow_up_maintenance: [{ task: 'Check under-sink for leaks', interval_days: 90 }],
  }, { category: 'Plumbing', description: 'Email me at a@b.co, faucet drips' });
  assert.equal(p.category, 'plumbing');
  assert.doesNotMatch(JSON.stringify(p), /Oak Street|a@b\.co/);
  assert.deepEqual(p.diy_steps, ['Close the valves under the sink.', 'Replace the cartridge.']);
  assert.deepEqual(p.parts, ['Faucet cartridge']);
  assert.deepEqual(p.safety.factors, ['chemical:low']);
});

test('past cases are framed as reference, not evidence', () => {
  assert.equal(confirmedCasesContext({ items: [] }), '');
  const ctx = confirmedCasesContext({ items: ['Past plumbing case: ...'] });
  assert.match(ctx, /not evidence about this home/);
  assert.match(ctx, /every safety rule still applies/);
});
