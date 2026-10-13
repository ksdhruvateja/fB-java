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
