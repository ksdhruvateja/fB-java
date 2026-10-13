import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateDiySafety,
  classifyDiyRiskLevel,
  enforceGuardrailsOnText,
  findGuardrailViolations,
} from '../diy-safety.js';
import { applyDiySafetyRules, computeDiyPartsCostEstimate, evaluateAssessmentEvidence, parseStructuredAssessment } from '../ai.js';
import {
  withholdUnconfirmedGuidance,
  diyGuidanceUnlocked,
  buildSafetyConfirmationRecord,
} from './safety-confirmation.js';
import { buildFollowUpMaintenanceItems, mergeMaintenanceItems, sanitizeMaintenanceUpdate } from './maintenance-reminders.js';
import { readCasePhotoList, MAX_CASE_PHOTOS } from './case-media.js';

const base = (over) => ({
  summary: '',
  confidence: 0.8,
  complexity: 'low',
  diy_difficulty: 'easy',
  safe_diy_allowed: true,
  professional_required: false,
  diy_steps: [],
  diy_guide_steps: [],
  tools_required: [],
  materials_needed: [],
  ...over,
});

test('HVAC, electrical and roofing are not blocked by category; the actual risk decides', () => {
  const ac = evaluateDiySafety(base({ category: 'hvac', summary: 'AC blowing warm air; the air filter is clogged', diy_steps: ['Turn the thermostat off.', 'Replace the air filter with the same size.'] }));
  assert.notEqual(ac.diy_risk_level, 'red');
  assert.equal(ac.safe_diy_allowed, true);
  assert.equal(ac.diy_steps.length, 2);

  const gfci = evaluateDiySafety(base({ category: 'electrical', summary: 'Bathroom outlet dead; GFCI tripped', diy_steps: ['Press the reset button on the GFCI outlet.'] }));
  assert.equal(gfci.diy_risk_level, 'yellow');
  assert.equal(gfci.diy_safety.requires_confirmation, true, 'mains electrical is a medium risk factor');
  assert.ok(gfci.diy_safety.prohibited_actions.some((p) => /panel/i.test(p)));

  const roof = evaluateDiySafety(base({ category: 'roofing', summary: 'Ceiling stain under the roof after rain', complexity: 'medium', diy_steps: ['Place a bucket and towels under the drip.', 'Climb onto the roof and replace the cracked shingle.'] }));
  assert.equal(roof.diy_risk_level, 'yellow');
  assert.deepEqual(roof.diy_steps, ['Place a bucket and towels under the drip.']);
  assert.equal(roof.diy_safety.removed_steps_count, 1);
});

test('active hazards stop DIY; negated mentions do not', () => {
  const gas = evaluateDiySafety(base({ summary: 'Homeowner smells gas near the water heater', diy_steps: ['Open a window.'] }));
  assert.equal(gas.diy_risk_level, 'red');
  assert.equal(gas.diy_safety.decision, 'emergency');
  assert.deepEqual(gas.diy_steps, []);

  const pilot = evaluateDiySafety(base({ summary: 'Water heater pilot is out; no gas smell', diy_steps: ['Relight the pilot following the label on the heater.'] }));
  assert.notEqual(pilot.diy_risk_level, 'red');
  assert.equal(pilot.diy_safety.requires_confirmation, true);
});

test('high-severity factors leave only safe actions; stop conditions are not hazards', () => {
  const panel = evaluateDiySafety(base({ summary: 'Breaker keeps tripping in the main electrical panel', diy_steps: ['Unplug devices on the circuit.'] }));
  assert.equal(panel.diy_risk_level, 'red');
  assert.equal(panel.diy_safety.decision, 'professional_only');

  const faucet = evaluateDiySafety(base({ summary: 'Kitchen faucet drips', stop_conditions: ['Stop if you smell gas or see sparking.'], diy_steps: ['Close the valves under the sink.', 'Replace the cartridge.'] }));
  assert.equal(faucet.diy_risk_level, 'green');
  assert.equal(faucet.diy_safety.requires_confirmation, false);
});

test('guardrails are enforced on steps and chat text, keeping warnings', () => {
  assert.deepEqual(findGuardrailViolations('Do not remove the panel cover.'), []);
  assert.deepEqual(findGuardrailViolations('Remove the panel cover and check the breaker.'), ['mains_electrical']);
  assert.deepEqual(findGuardrailViolations('Add refrigerant until the line is cold.'), ['refrigerant_sealed_system']);
  const chat = enforceGuardrailsOnText('Turn the breaker off. Then discharge the capacitor with a screwdriver. Never add refrigerant yourself.');
  assert.equal(chat.removed, 1);
  assert.match(chat.text, /Turn the breaker off\./);
  assert.match(chat.text, /Never add refrigerant yourself\./);
  assert.doesNotMatch(chat.text, /discharge the capacitor/);
});

test('chat text can escalate but a roof mention alone is not red', () => {
  assert.equal(classifyDiyRiskLevel('my roof leaks when it rains', null).level, 'yellow');
  assert.equal(classifyDiyRiskLevel('I smell gas in the kitchen', null).level, 'red');
});

test('unclear photos ask for clearer photos instead of blocking as unsafe', () => {
  const a = applyDiySafetyRules(base({
    summary: 'Something under the sink, unclear',
    confidence: 0.3,
    photo_assessment: { photos_received: 2, usable_photo_count: 0, evidence_sufficient: false, issues: ['blurry', 'too_dark'], photo_requests: ['Close-up of the trap with a flashlight'] },
    diy_steps: ['Tighten the slip nut.'],
  }), 'leak under sink', { imageCount: 2 });
  assert.equal(a.assessment_stage, 'needs_more_info');
  assert.notEqual(a.diy_risk_level, 'red');
  assert.equal(a.safe_diy_allowed, false);
  assert.deepEqual(a.diy_steps, []);
  assert.deepEqual(a.evidence_check.photo_requests, ['Close-up of the trap with a flashlight']);
  assert.equal(a.evidence_check.max_photos, 5);
  assert.match(a.evidence_check.message, /clearer photos/);
  assert.equal(evaluateAssessmentEvidence(base({ confidence: 0.9 }), { imageCount: 1 }).sufficient, true);
});

test('parts cost is a rough range from per-part prices, with a disclaimer', () => {
  const parsed = parseStructuredAssessment(JSON.stringify({
    summary: 'Worn faucet cartridge',
    materials_needed: [
      { name: 'Faucet cartridge', required: true, quantity: 1, estimated_cost_low_usd: 15, estimated_cost_high_usd: 45 },
      { name: "Plumber's grease", required: false, estimated_cost_low_usd: 4, estimated_cost_high_usd: 8 },
      { name: 'Teflon tape', required: true, quantity: 2, estimated_cost_low_usd: 2, estimated_cost_high_usd: 5000 },
    ],
  }));
  const est = computeDiyPartsCostEstimate(parsed.materials_needed);
  assert.equal(est.low, 19);
  assert.equal(est.high, 45 + 4000);
  assert.equal(est.basis, 'rough_ai_estimate');
  assert.match(est.disclaimer, /varies/);
  assert.match(est.disclaimer, /location/);
  assert.equal(computeDiyPartsCostEstimate([{ name: 'Unknown part' }]), null);
});

test('safety confirmation withholds steps until confirmed and never changes them', () => {
  const a = evaluateDiySafety(base({ summary: 'Outlet dead; GFCI tripped', diy_steps: ['Press reset on the GFCI outlet.'] }));
  const hidden = withholdUnconfirmedGuidance(a, null);
  assert.deepEqual(hidden.diy_steps, []);
  assert.equal(hidden.diy_steps_withheld, true);
  assert.equal(diyGuidanceUnlocked(a, null), false);

  const record = buildSafetyConfirmationRecord(a, { decision: 'continue', acknowledged: true });
  const report = { fixeraDiy: { safetyConfirmation: record } };
  const shown = withholdUnconfirmedGuidance(a, report);
  assert.deepEqual(shown.diy_steps, a.diy_steps);
  assert.equal(shown.safety_confirmation.confirmed, true);
  assert.equal(diyGuidanceUnlocked(a, report), true);

  const changed = { ...a, diy_steps: ['Press reset on the GFCI outlet.', 'Replace the outlet.'] };
  assert.equal(diyGuidanceUnlocked(changed, report), false, 'a different assessment needs a new confirmation');
});

test('maintenance reminders link to the issue, the repair and follow-up tasks', () => {
  const items = buildFollowUpMaintenanceItems({
    jobId: 7,
    jobTitle: 'AC not cooling',
    category: 'hvac',
    assessment: { summary: 'Clogged air filter restricting airflow', follow_up_maintenance: [{ task: 'Replace HVAC air filter', interval_days: 90, system: 'hvac', reason: 'A clogged filter caused this.' }] },
    repairSummary: 'Replaced filter',
    completedAt: '2026-10-01T10:00:00Z',
    source: 'HOMEOWNER_DIY',
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].dueDate, '2026-10-15');
  assert.equal(items[1].dueDate, '2026-12-30');
  assert.equal(items[1].recurrenceDays, 90);
  assert.equal(items[1].issue, 'Clogged air filter restricting airflow');
  assert.equal(items[1].repair, 'Replaced filter');
  assert.equal(items[1].relatedJobId, 7);

  const merged = mergeMaintenanceItems([{ label: 'Gutters', dueDate: '2026-11-01' }], items);
  assert.equal(merged.length, 3);
  const updated = sanitizeMaintenanceUpdate(merged, merged.map((m) => (m.id === items[1].id ? { ...m, completed: true, reason: 'client edit' } : m)));
  const done = updated.find((m) => m.id === items[1].id);
  assert.equal(done.reason, 'A clogged filter caused this.', 'Fixera fields are server-owned');
  assert.ok(updated.some((m) => m.id?.startsWith(`${items[1].id}~`) && !m.completed), 'next occurrence scheduled');
});

test('up to five photos per case', () => {
  const img = (n) => `data:image/jpeg;base64,${'A'.repeat(10)}${n}`;
  assert.equal(MAX_CASE_PHOTOS, 5);
  assert.equal(readCasePhotoList({ mediaDataUrl: img(0), mediaDataUrls: [img(0), img(1), img(2)] }).length, 3);
  assert.throws(() => readCasePhotoList({ mediaDataUrls: [1, 2, 3, 4, 5, 6].map(img) }), /up to 5/);
  assert.throws(() => readCasePhotoList({ mediaDataUrls: ['data:text/html;base64,AAAA'] }), /JPEG, PNG or WEBP/);
});

test('a faucet hot line is not treated as a water heater; a real heater still is', () => {
  const faucet = evaluateDiySafety(base({
    summary: 'Water pools around the base of a single-handle kitchen faucet.',
    risk_factors: [{ code: 'hot_water', severity: 'medium', evidence: 'Hot supply line under pressure; minor scalding risk if shutoffs are open.' }],
    diy_steps: ['Close both shutoff valves under the sink.'],
  }));
  const faucetCodes = faucet.diy_safety.factors.map((f) => f.code);
  assert.ok(!faucetCodes.includes('pressurized_hot_water'));
  assert.ok(!faucet.diy_safety.allowed_actions?.some((a) => /vacation mode/i.test(a)));
  // The concern itself is kept and still needs confirmation.
  assert.ok(faucetCodes.includes('hot_water'));
  assert.equal(faucet.diy_safety.requires_confirmation, true);

  const scaldAtFaucet = evaluateDiySafety(base({ summary: 'Faucet hot side may scald; cartridge seal is worn.' }));
  assert.ok(!scaldAtFaucet.diy_safety.factors.some((f) => f.code === 'pressurized_hot_water'));

  const heater = evaluateDiySafety(base({ summary: 'Water heater relief valve is dripping; scalding water on the floor.' }));
  assert.ok(heater.diy_safety.factors.some((f) => f.code === 'pressurized_hot_water' && f.severity === 'medium'));
  const heaterAlias = evaluateDiySafety(base({ summary: 'Tank is old.', risk_factors: [{ code: 'water_heater', severity: 'medium', evidence: 'Tank heater' }] }));
  assert.ok(heaterAlias.diy_safety.factors.some((f) => f.code === 'pressurized_hot_water'));
});
