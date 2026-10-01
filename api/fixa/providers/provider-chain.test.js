import assert from 'node:assert/strict';
import test from 'node:test';

test('Fixera falls back from the preferred OpenAI provider to OpenRouter with the same scenario and image', async () => {
  const envNames = [
    'FIXERA_AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL',
    'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY', 'AI_FETCH_TIMEOUT_MS',
  ];
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  process.env.FIXERA_AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-test-model';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.OPENROUTER_MODEL = 'openrouter/test-model';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.AI_FETCH_TIMEOUT_MS = '1000';
  const requests = [];
  let openAiOperational = false;
  const responseText = JSON.stringify({
    category: 'plumbing',
    service_subcategory: 'refrigerator',
    summary: 'The refrigerator is not cooling and the uploaded image shows the appliance exterior.',
    confidence: 0.82,
    urgency: 'medium',
    recommended_trade: 'appliance_repair',
    professional_required: false,
    safe_diy_allowed: true,
    diy_risk_level: 'low',
    diy_difficulty: 'easy',
    tools_required: [{ name: 'Thermometer', required: false, reason: 'Confirm the temperature without opening the appliance.' }],
    materials_needed: [{ name: 'Not determined', required: false, reason: 'Model label and inspection are needed before identifying a part.', exact_part_confirmed: false, information_needed: ['Appliance model number'] }],
    diy_steps: ['Confirm the refrigerator has clear ventilation space around the cabinet.'],
    diy_guide_steps: [{
      title: 'Check ventilation clearance',
      instruction: 'Check that the refrigerator has clear ventilation space around the cabinet.',
      expected_result: 'Air can circulate around the appliance without obstruction.',
      if_not: 'Move nearby items without pulling or tipping the appliance; stop if it is hard-wired or unstable.',
    }],
    stop_conditions: [],
    immediate_safety_steps: [],
    visual_findings: ['The image shows a refrigerator exterior.'],
    observed_evidence: ['The homeowner reports that cooling has stopped.'],
    likely_causes: ['The cause cannot be confirmed from the exterior image alone.'],
    needs_confirmation: ['Confirm the interior temperature and model label.'],
    questions_needed: [],
    completion_checks: ['Confirm the refrigerator returns to its normal temperature.'],
  });

  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).includes('api.openai.com')) {
      if (!openAiOperational) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify({
        model: 'gpt-test-model',
        choices: [{ message: { role: 'assistant', content: responseText } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      model: 'openrouter/test-model',
      choices: [{ message: { role: 'assistant', content: responseText } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const { analyzeRepairStructured, resolveAiProvider } = await import('../../ai.js?provider-chain-test');
    assert.equal(resolveAiProvider().provider, 'openai');
    const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p4sAAAAASUVORK5CYII=';
    const result = await analyzeRepairStructured({
      category: 'Appliances',
      description: 'My refrigerator is loud and not cooling properly.',
      imageDataUrl,
      locationContext: 'Authorized property equipment: refrigerator model RF-22; homeowner-reported prior service.',
    });

    assert.ok(result.assessment);
    assert.equal(result.provider, 'openrouter');
    assert.equal(result.model, 'openrouter/test-model');
    assert.ok(result.requestId);
    assert.equal(result.promptVersion, 'fixera-repair-v3');
    assert.equal(result.assessment.category, 'appliances');
    assert.equal(result.assessment.confidence, 0.55);
    assert.equal(result.assessment.safe_diy_allowed, false);
    assert.deepEqual(result.assessment.diy_steps, []);
    assert.ok(result.assessment.needs_confirmation.some((item) => item.includes('Confirm the category')));
    assert.deepEqual(result.assessment.tools_required[0], {
      name: 'Thermometer',
      required: false,
      reason: 'Confirm the temperature without opening the appliance.',
    });
    assert.equal(result.assessment.materials_needed[0].exact_part_confirmed, false);
    assert.deepEqual(result.assessment.materials_needed[0].information_needed, ['Appliance model number']);
    assert.deepEqual(result.providerAttempts.map((attempt) => [attempt.provider, attempt.success]), [
      ['openai', false],
      ['openrouter', true],
    ]);
    assert.ok(result.providerAttempts.every((attempt) => attempt.requestId && attempt.timestamp && attempt.promptVersion));
    assert.match(JSON.stringify(requests[1].body.messages), /My refrigerator is loud and not cooling properly/);
    assert.match(JSON.stringify(requests[1].body.messages), /Authorized property equipment: refrigerator model RF-22/);
    assert.match(JSON.stringify(requests[1].body.messages), /data:image\/png;base64/);

    openAiOperational = true;
    const openAiOnlyResult = await analyzeRepairStructured({
      category: 'Appliances',
      description: 'My refrigerator is loud and not cooling properly.',
      imageDataUrl,
    });
    assert.ok(openAiOnlyResult.assessment);
    assert.equal(openAiOnlyResult.provider, 'openai');
    assert.deepEqual(openAiOnlyResult.providerAttempts.map((attempt) => [attempt.provider, attempt.success]), [['openai', true]]);
  } finally {
    for (const name of envNames) {
      if (previousEnv[name] == null) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
    globalThis.fetch = previousFetch;
  }
});