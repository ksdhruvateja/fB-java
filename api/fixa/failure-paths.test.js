import assert from 'node:assert/strict';
import test from 'node:test';

// Every configured provider fails at the network layer. Fixera must return its
// friendly error result, never throw (which surfaced as HTTP 500s).
function withFailingProviders(fn) {
  return async () => {
    const keys = ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY', 'FIXERA_AI_PROVIDER'];
    const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const previousFetch = globalThis.fetch;
    for (const k of keys) delete process.env[k];
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'gemini-test-model';
    globalThis.fetch = async () => { throw new Error('network unavailable'); };
    try {
      await fn();
    } finally {
      globalThis.fetch = previousFetch;
      for (const k of keys) {
        if (previous[k] == null) delete process.env[k];
        else process.env[k] = previous[k];
      }
    }
  };
}

test('analyzeRepairStructured returns an error result instead of throwing when all providers fail', withFailingProviders(async () => {
  const { analyzeRepairStructured } = await import('../ai.js?failure-paths-structured');
  const result = await analyzeRepairStructured({ category: 'plumbing', description: 'Kitchen sink is leaking.' });
  assert.equal(result.assessment, null);
  assert.equal(result.source, 'error');
  assert.ok(result.error);
}));

test('assessRepair returns the homeowner-safe error result when every provider fails', withFailingProviders(async () => {
  const { assessRepair } = await import('./core.js?failure-paths-core');
  const result = await assessRepair({ category: 'plumbing', description: 'Kitchen sink is leaking.' });
  assert.equal(result.assessment, null);
  assert.equal(result.source, 'error');
  assert.equal(typeof result.code, 'string');
  assert.match(result.error, /couldn't complete the assessment/);
}));

test('getFixaHealth resolves without inference (used by /api/fixera/health and admin providers)', async () => {
  const { getFixaHealth, getFixaAdminProviders } = await import('./core.js?failure-paths-health');
  const health = await getFixaHealth();
  assert.equal(health.assistant, 'Fixera');
  assert.ok(['configured_not_probed', 'not_connected'].includes(health.code));
  const admin = await getFixaAdminProviders();
  assert.equal(admin.assistant, 'Fixera');
});
