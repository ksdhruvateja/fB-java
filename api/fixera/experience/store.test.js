import assert from 'node:assert/strict';
import test from 'node:test';
import { persistFixeraInteraction, recordFixeraInteraction } from './store.js';

test('Fixera interaction persistence records provider attempt audit metadata', async () => {
  const attempts = [{
    provider: 'openai',
    model: 'gpt-test-model',
    requestId: 'provider-request-1',
    promptVersion: 'fixera-repair-v3',
    timestamp: '2026-09-30T12:00:00.000Z',
    latencyMs: 120,
    success: false,
    failureCode: 'provider_http_503',
  }];
  const row = recordFixeraInteraction({
    requestId: 'assessment-invocation-1',
    userId: 7,
    caseId: 41,
    caseType: 'managed_job',
    provider: 'openrouter',
    model: 'openrouter/test-model',
    providerRequestId: 'provider-request-2',
    promptVersion: 'fixera-repair-v3',
    latencyMs: 85,
    success: true,
    providerAttempts: [...attempts, {
      provider: 'openrouter',
      model: 'openrouter/test-model',
      requestId: 'provider-request-2',
      promptVersion: 'fixera-repair-v3',
      timestamp: '2026-09-30T12:00:00.120Z',
      latencyMs: 85,
      success: true,
      failureCode: null,
    }],
  });
  const calls = [];
  const pool = { async query(sql, params) { calls.push({ sql, params }); return { rows: [] }; } };

  const result = await persistFixeraInteraction(pool, row);

  assert.equal(result.persisted, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /provider_request_id, prompt_version, latency_ms, success, failure_code, provider_attempts/);
  assert.equal(calls[0].params[1], 7);
  assert.equal(calls[0].params[4], 41);
  assert.equal(calls[0].params[5], 'managed_job');
  assert.equal(calls[0].params[20], 'provider-request-2');
  assert.equal(calls[0].params[21], 'fixera-repair-v3');
  assert.equal(calls[0].params[22], 85);
  assert.equal(calls[0].params[23], true);
  assert.deepEqual(JSON.parse(calls[0].params[25]), row.provider_attempts);
});