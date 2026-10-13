import assert from 'node:assert/strict';
import test from 'node:test';

test('a timed-out provider request is aborted, not left running in the background', async () => {
  const keys = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY', 'AI_FETCH_TIMEOUT_MS', 'GEMINI_TIMEOUT_MS', 'FIXERA_AI_PROVIDER', 'FIXERA_ASSESSMENT_TIMEOUT_MS'];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const previousFetch = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-test-model';
  // Repair assessments use their own deadline; the adapter's default timer is far longer.
  process.env.FIXERA_ASSESSMENT_TIMEOUT_MS = '300';
  process.env.GEMINI_TIMEOUT_MS = '60000';
  const signals = [];
  // Provider that never answers until its request is aborted.
  globalThis.fetch = (url, options = {}) => new Promise((_, reject) => {
    signals.push(options.signal);
    options.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  try {
    const { analyzeRepair } = await import('../ai.js?timeout-cancellation');
    const started = Date.now();
    const result = await analyzeRepair({ category: 'plumbing', description: 'Slow drain in the bathroom sink.' });
    assert.equal(result.assessment, null);
    assert.ok(Date.now() - started < 5000, 'returns promptly after the timeout');
    assert.ok(signals.length >= 1);
    assert.ok(signals.every((s) => s?.aborted), 'every upstream request was cancelled');
  } finally {
    globalThis.fetch = previousFetch;
    for (const k of keys) {
      if (previous[k] == null) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
});
