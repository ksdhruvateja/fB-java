/**
 * Professional dispatch pricing + DIY safety classification smoke tests.
 * Usage: node --env-file=.env scripts/smoke-dispatch-diy-safety.mjs [API_BASE]
 */
import {
  buildProfessionalDispatchBreakdown,
  DEFAULT_PROFESSIONAL_DISPATCH_LINES,
} from '../api/professional-dispatch-pricing.js';
import { classifyDiyRiskLevel } from '../api/diy-safety.js';
import { applyDiySafetyRules } from '../api/ai.js';

const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

function jobStub(overrides = {}) {
  return {
    id: 1,
    homeowner_user_id: 1,
    property_id: 1,
    booking_id: 'FB-1',
    title: 'Test',
    category: 'plumbing',
    service_timing: 'weekday',
    ...overrides,
  };
}

function main() {
  console.log(`\nFixBridge dispatch pricing + DIY safety unit smoke\n`);

  const rules = {
    professional_dispatch_pricing: {
      version: 1,
      lines: DEFAULT_PROFESSIONAL_DISPATCH_LINES,
    },
  };

  const discounted = buildProfessionalDispatchBreakdown(jobStub(), rules, null);
  ok(
    'AUTHORIZED NOW with beta discount = $95',
    discounted.authorizedNowCents === 9500,
    `$${discounted.authorizedNow}`
  );

  const noDiscountRules = {
    professional_dispatch_pricing: {
      version: 2,
      lines: DEFAULT_PROFESSIONAL_DISPATCH_LINES.map((l) =>
        l.key === 'beta_discount' ? { ...l, enabled: false } : l
      ),
    },
  };
  const full = buildProfessionalDispatchBreakdown(jobStub(), noDiscountRules, null);
  ok('AUTHORIZED NOW without discount = $244', full.authorizedNowCents === 24400, `$${full.authorizedNow}`);

  const gas = classifyDiyRiskLevel('I smell gas near my furnace.');
  ok('gas smell → RED', gas.level === 'red', gas.reasonCodes.join(','));

  const panel = classifyDiyRiskLevel('My breaker panel is sparking.');
  ok('electrical panel spark → RED', panel.level === 'red');

  const roof = classifyDiyRiskLevel('How do I repair this leak from the roof?');
  ok('roof repair → RED', roof.level === 'red');

  const refrigerant = classifyDiyRiskLevel('How do I recharge my AC refrigerant?');
  ok('refrigerant → RED', refrigerant.level === 'red');

  const sewage = classifyDiyRiskLevel('Sewage is backing up into the shower.');
  ok('sewage backup → RED', sewage.level === 'red');

  const green = classifyDiyRiskLevel('My sink drains slowly.', {
    category: 'plumbing',
    complexity: 'low',
    safe_diy_allowed: true,
    diy_difficulty: 'easy',
  });
  ok('slow drain → GREEN', green.level === 'green');

  const redAssessment = applyDiySafetyRules(
    {
      category: 'plumbing',
      summary: 'Gas smell reported',
      diy_steps: ['Open gas valve', 'Tighten fitting'],
      tools_required: ['wrench'],
      safe_diy_allowed: true,
    },
    'gas smell'
  );
  ok('RED strips diy_steps', redAssessment.diy_risk_level === 'red' && redAssessment.diy_steps.length === 0);

  const escalate = classifyDiyRiskLevel('There is sewage coming back through the bathtub.', {
    category: 'plumbing',
    complexity: 'low',
    safe_diy_allowed: true,
  });
  ok('dynamic escalation to RED', escalate.level === 'red');

  const userStop = classifyDiyRiskLevel("I don't feel safe doing this.", { category: 'plumbing', safe_diy_allowed: true });
  ok('user unsafe → caution escalation', userStop.userStopRequested === true, userStop.level);

  console.log('\nDone.\n');
}

main();
