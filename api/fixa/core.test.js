import assert from 'node:assert/strict';
import test from 'node:test';

test('assessRepair fails closed when no model provider is configured', async () => {
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.OPENROUTER_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';

  try {
    const { assessRepair, getFixaPublicStatus } = await import('./core.js');
    const result = await assessRepair({ category: 'plumbing', description: 'A pipe is leaking.' });

    assert.equal(getFixaPublicStatus().configured, false);
    assert.equal(result.assessment, null);
    assert.equal(result.source, 'error');
    assert.equal(result.code, 'no_provider_configured');
  } finally {
    if (previousOpenRouterKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    if (previousAnthropicKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }
});