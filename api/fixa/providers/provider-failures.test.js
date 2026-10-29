import assert from 'node:assert/strict';
import test from 'node:test';

test('provider network failures are not returned as fabricated successful assessments', async () => {
  const previous = {
    openRouterKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    openaiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL,
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    fetch: globalThis.fetch,
  };
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_MODEL = 'openrouter/test-model';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.ANTHROPIC_MODEL = 'claude-test-model';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-test-model';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-test-model';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    throw new Error('network unavailable');
  };

  try {
    const [
      { analyze: analyzeOpenRouter },
      { analyze: analyzeAnthropic },
      { analyze: analyzeOpenAI },
      { analyze: analyzeGemini },
    ] = await Promise.all([
      import('./openrouter.js?provider-failure-test'),
      import('./anthropic.js?provider-failure-test'),
      import('./openai.js?provider-failure-test'),
      import('./gemini.js?provider-failure-test'),
    ]);
    const imageDataUrl = 'data:image/jpeg;base64,ZmFrZQ==';
    const input = {
      json: true,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'My refrigerator is loud and not cooling.' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      }],
    };
    const [openRouter, anthropic, openai, gemini] = await Promise.all([
      analyzeOpenRouter(input),
      analyzeAnthropic(input),
      analyzeOpenAI(input),
      analyzeGemini(input),
    ]);

    assert.equal(openRouter.ok, false);
    assert.equal(openRouter.provider, 'openrouter');
    assert.equal(openRouter.code, 'provider_exception');
    assert.equal(openRouter.text, undefined);
    const openRouterRequest = requests.find((request) => request.url === 'https://openrouter.ai/api/v1/chat/completions');
    assert.ok(openRouterRequest);
    assert.equal(openRouterRequest.body.response_format.type, 'json_object');
    assert.match(JSON.stringify(openRouterRequest.body.messages), /My refrigerator is loud and not cooling/);
    assert.match(JSON.stringify(openRouterRequest.body.messages), /data:image\/jpeg;base64,ZmFrZQ==/);
    assert.equal(anthropic.ok, false);
    assert.equal(anthropic.provider, 'anthropic');
    assert.equal(anthropic.code, 'provider_exception');
    assert.equal(anthropic.text, undefined);
    const anthropicRequest = requests.find((request) => request.url === 'https://api.anthropic.com/v1/messages');
    assert.ok(anthropicRequest);
    assert.equal(anthropicRequest.body.system.includes('Return ONLY valid JSON'), true);
    assert.match(JSON.stringify(anthropicRequest.body.messages), /My refrigerator is loud and not cooling/);
    assert.match(JSON.stringify(anthropicRequest.body.messages), /ZmFrZQ==/);
    assert.equal(openai.ok, false);
    assert.equal(openai.provider, 'openai');
    const openaiRequest = requests.find((request) => request.url === 'https://api.openai.com/v1/chat/completions');
    assert.ok(openaiRequest);
    assert.match(JSON.stringify(openaiRequest.body.messages), /My refrigerator is loud and not cooling/);
    assert.match(JSON.stringify(openaiRequest.body.messages), /data:image\/jpeg;base64,ZmFrZQ==/);
    assert.equal(gemini.ok, false);
    assert.equal(gemini.provider, 'gemini');
    const geminiRequest = requests.find((request) => request.url.includes('/models/gemini-test-model:generateContent'));
    assert.ok(geminiRequest);
    assert.match(JSON.stringify(geminiRequest.body.contents), /My refrigerator is loud and not cooling/);
    assert.match(JSON.stringify(geminiRequest.body.contents), /ZmFrZQ==/);
  } finally {
    if (previous.openRouterKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous.openRouterKey;
    if (previous.openRouterModel == null) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previous.openRouterModel;
    if (previous.anthropicKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous.anthropicKey;
    if (previous.anthropicModel == null) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = previous.anthropicModel;
    if (previous.openaiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.openaiKey;
    if (previous.openaiModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previous.openaiModel;
    if (previous.geminiKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.geminiKey;
    if (previous.geminiModel == null) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previous.geminiModel;
    globalThis.fetch = previous.fetch;
  }
});