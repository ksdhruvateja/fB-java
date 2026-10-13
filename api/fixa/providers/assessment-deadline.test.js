import assert from 'node:assert/strict';
import test from 'node:test';

// A repair assessment with property history and photos can take Gemini longer than a chat reply.
// The adapter must use the deadline the caller passes, not only its shorter default.
test('Gemini honours the per-call deadline instead of its default', async () => {
  const previous = { key: process.env.GEMINI_API_KEY, timeout: process.env.GEMINI_TIMEOUT_MS, fetch: globalThis.fetch };
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_TIMEOUT_MS = '50';
  const { analyze } = await import(`./gemini.js?deadline=${Date.now()}`);
  // Answers after 200 ms unless aborted first.
  globalThis.fetch = (_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }), { status: 200 })), 200);
    init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  try {
    const short = await analyze({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(short.ok, false);
    assert.equal(short.code, 'provider_timeout');

    const long = await analyze({ messages: [{ role: 'user', content: 'hi' }], timeoutMs: 2000 });
    assert.equal(long.ok, true);
    assert.equal(long.text, '{"ok":true}');
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.key;
    if (previous.timeout === undefined) delete process.env.GEMINI_TIMEOUT_MS; else process.env.GEMINI_TIMEOUT_MS = previous.timeout;
  }
});

test('Gemini gets room to reason before answering, and a cut-off answer is reported as such', async () => {
  const previous = { key: process.env.GEMINI_API_KEY, fetch: globalThis.fetch };
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const { analyze } = await import(`./gemini.js?budget=${Date.now()}`);
  const bodies = [];
  let finishReason = 'MAX_TOKENS';
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      candidates: [{ finishReason, content: { parts: [{ text: 'reasoning', thought: true }, { text: '{"summary":"cut' }] } }],
    }), { status: 200 });
  };
  try {
    const cut = await analyze({ messages: [{ role: 'user', content: 'assess' }], maxTokens: 5000, json: true });
    assert.equal(cut.ok, false);
    assert.equal(cut.code, 'provider_max_tokens');
    assert.ok(bodies[0].generationConfig.maxOutputTokens >= 16384);

    finishReason = 'STOP';
    const done = await analyze({ messages: [{ role: 'user', content: 'assess' }], maxTokens: 5000, json: true });
    assert.equal(done.ok, true);
    // The model's reasoning is not part of the answer.
    assert.equal(done.text, '{"summary":"cut');
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.key;
  }
});
