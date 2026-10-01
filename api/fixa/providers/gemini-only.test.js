import assert from 'node:assert/strict';
import test from 'node:test';

test('Gemini is preferred when configured and completes a structured visual assessment', async () => {
  const envNames = [
    'FIXERA_AI_PROVIDER', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL',
    'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL',
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  process.env.FIXERA_AI_PROVIDER = '';
  process.env.OPENAI_API_KEY = '';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_MODEL = 'openrouter/test-fallback';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-test-model';
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p4sAAAAASUVORK5CYII=';
  let request;
  const assessment = {
    category: 'appliances',
    service_subcategory: 'refrigerator',
    summary: 'The reported cooling problem needs an interior temperature check before a cause can be determined.',
    confidence: 0.7,
    urgency: 'medium',
    recommended_trade: 'appliance_repair',
    professional_required: false,
    safe_diy_allowed: true,
    diy_risk_level: 'low',
    diy_difficulty: 'easy',
    tools_required: [],
    materials_needed: [],
    diy_steps: ['Check the refrigerator temperature display without opening electrical panels.'],
    diy_guide_steps: [{
      title: 'Check the temperature display',
      instruction: 'Check the refrigerator temperature display without opening electrical panels.',
      expected_result: 'The display shows the selected cooling temperature and no warning code.',
      if_not: 'Record any warning code and stop before removing panels or touching wiring.',
    }],
    stop_conditions: [],
    immediate_safety_steps: [],
    visual_findings: ['The uploaded image was received for review.'],
    observed_evidence: ['The homeowner reports a cooling issue.'],
    likely_causes: ['The cause cannot be confirmed from the available exterior evidence.'],
    needs_confirmation: ['Provide the inside temperature and appliance model label.'],
    questions_needed: [],
    completion_checks: ['Confirm the refrigerator returns to the selected temperature.'],
  };

  globalThis.fetch = async (url, options) => {
    request = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      modelVersion: 'gemini-test-model',
      candidates: [{ content: { parts: [{ text: JSON.stringify(assessment) }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const { analyzeRepairStructured, resolveAiProvider } = await import('../../ai.js?gemini-only-test');
    assert.equal(resolveAiProvider().provider, 'gemini');
    assert.equal(resolveAiProvider().fallback.provider, 'openrouter');
    const result = await analyzeRepairStructured({
      category: 'Appliances',
      description: 'My refrigerator is loud and not cooling properly.',
      imageDataUrl,
      locationContext: 'Authorized property equipment: refrigerator model RF-22.',
    });

    assert.ok(result.assessment);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.model, 'gemini-test-model');
    assert.ok(result.requestId);
    assert.equal(result.providerAttempts[0].success, true);
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
    assert.equal(request.headers['x-goog-api-key'], 'test-gemini-key');
    assert.match(JSON.stringify(request.body.contents), /My refrigerator is loud and not cooling properly/);
    assert.match(JSON.stringify(request.body.contents), /iVBORw0KGgo/);
    assert.match(JSON.stringify(request.body.contents), /Authorized property equipment: refrigerator model RF-22/);
    assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  } finally {
    for (const name of envNames) {
      if (previousEnv[name] == null) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
    globalThis.fetch = previousFetch;
  }
});