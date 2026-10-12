import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { after, before, test } from 'node:test';

const SECRET = 'engine-test-secret';
const CANONICAL = {
  category: 'plumbing', category_conflict: false, summary: 'Water at the P-trap slip nut; likely loose connection.',
  urgency: 'medium', confidence: 0.6, recommended_trade: 'plumber', professional_required: false, safe_diy_allowed: true,
  immediate_safety_steps: ['Stop using the sink'], visual_findings: [], observed_evidence: ['Homeowner reports water under sink'],
  likely_causes: ['Loose slip nut'], needs_confirmation: [], estimated_labor_hours_min: 1, estimated_labor_hours_max: 2,
  complexity: 'low', service_subcategory: 'drain', problem_classification: 'leak', questions_needed: [], estimated_time: '20 minutes',
  preparation_steps: ['Clear the cabinet'], completion_checks: ['No drips after one minute'], diy_difficulty: 'easy',
  tools_required: [{ name: 'Bucket', required: true, reason: 'Catch water' }], materials_needed: [],
  diy_steps: ['Hand-tighten the slip nut'], diy_guide_steps: [], stop_conditions: ['Nut is cracked'], disclaimer: 'AI-assisted assessment, not a professional diagnosis.',
};

let server, url, received = [], mode = 'ok';
before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const ts = req.headers['x-fixera-timestamp'];
      const expected = `v1=${createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex')}`;
      if (req.headers['x-fixera-signature'] !== expected) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }));
      }
      const body = JSON.parse(raw || '{}');
      received.push(body);
      res.writeHead(mode === 'ok' ? 200 : 502, { 'content-type': 'application/json' });
      res.end(JSON.stringify(mode === 'ok'
        ? { ok: true, text: JSON.stringify(CANONICAL), provider: 'gemini', model: 'gemini-2.5-flash', request_id: 'eng-1', usage: { input_tokens: 10, output_tokens: 20 }, attempts: [], vision_used: false, image_count: 0 }
        : { ok: false, code: 'PROVIDER_FAILED', retryable: true, attempts: [] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const ENV_KEYS = ['FIXERA_AI_PROVIDER', 'AI_PRIMARY_PROVIDER', 'FIXERA_ENGINE_URL', 'FIXERA_ENGINE_SECRET', 'FIXERA_ENGINE_FALLBACK', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_API_KEY'];
async function withEnv(env, fn) {
  const prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { await fn(); } finally {
    for (const k of ENV_KEYS) { if (prev[k] == null) delete process.env[k]; else process.env[k] = prev[k]; }
  }
}

test('resolver puts the engine first only when selected and configured', () => withEnv({ GEMINI_API_KEY: 'g' }, async () => {
  const { resolveAiProvider } = await import('../../ai.js?engine-resolver');
  assert.equal(resolveAiProvider().provider, 'gemini');
  process.env.FIXERA_AI_PROVIDER = 'fixera-engine';
  assert.equal(resolveAiProvider().provider, 'gemini', 'selected but not configured: unchanged');
  process.env.FIXERA_ENGINE_URL = url;
  process.env.FIXERA_ENGINE_SECRET = SECRET;
  const chain = resolveAiProvider();
  assert.equal(chain.provider, 'fixera-engine');
  assert.equal(chain.fallback.provider, 'gemini', 'original provider kept as rollback');
  process.env.FIXERA_ENGINE_FALLBACK = 'none';
  assert.equal(resolveAiProvider().fallback, null);
}));

test('assessment flows through the engine with FixBridge parsing and safety still applied', () => withEnv({ FIXERA_AI_PROVIDER: 'fixera-engine', FIXERA_ENGINE_URL: url, FIXERA_ENGINE_SECRET: SECRET }, async () => {
  mode = 'ok';
  received = [];
  const { analyzeRepairStructured } = await import('../../ai.js?engine-flow');
  const result = await analyzeRepairStructured({ category: 'plumbing', description: 'Water is dripping under my kitchen sink from the curved pipe.' });
  assert.ok(result.assessment, JSON.stringify(result).slice(0, 300));
  assert.equal(result.source, 'fixera-engine');
  assert.equal(result.model, 'gemini:gemini-2.5-flash');
  assert.ok(result.assessment.diy_risk_level, 'deterministic DIY risk level was applied by FixBridge');
  assert.equal(received[0].contract_version, '2026-10-01');
  assert.equal(received[0].json, true);
  assert.equal(received[0].messages[0].role, 'system');
}));

test('red-risk descriptions are still blocked by FixBridge safety even if the engine says DIY is fine', () => withEnv({ FIXERA_AI_PROVIDER: 'fixera-engine', FIXERA_ENGINE_URL: url, FIXERA_ENGINE_SECRET: SECRET }, async () => {
  mode = 'ok';
  const { analyzeRepairStructured } = await import('../../ai.js?engine-safety');
  const result = await analyzeRepairStructured({ category: 'electrical', description: 'Sparks and a burning smell from the breaker panel, exposed live wires.' });
  assert.equal(result.assessment.safe_diy_allowed, false);
  assert.equal(result.assessment.diy_risk_level, 'red');
  assert.deepEqual(result.assessment.diy_steps, []);
}));

test('engine failure falls back to the original providers (rollback path)', () => withEnv({ FIXERA_AI_PROVIDER: 'fixera-engine', FIXERA_ENGINE_URL: url, FIXERA_ENGINE_SECRET: SECRET, GEMINI_API_KEY: 'g' }, async () => {
  mode = 'fail';
  const prevFetch = globalThis.fetch;
  const geminiCalls = [];
  globalThis.fetch = async (u, opts) => {
    if (String(u).startsWith(url)) return prevFetch(u, opts);
    geminiCalls.push(String(u));
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(CANONICAL) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { analyzeRepairStructured } = await import('../../ai.js?engine-fallback');
    const result = await analyzeRepairStructured({ category: 'plumbing', description: 'Slow drip under the bathroom sink.' });
    assert.ok(result.assessment);
    assert.equal(result.source, 'gemini');
    assert.ok(geminiCalls.length >= 1);
    assert.ok(result.providerAttempts.some((a) => a.provider === 'fixera-engine' && a.success === false));
  } finally {
    globalThis.fetch = prevFetch;
  }
}));
