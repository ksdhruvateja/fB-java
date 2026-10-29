/**
 * DIY safety guardrails smoke tests.
 * Usage: node --env-file=.env scripts/smoke-diy-safety-guardrails.mjs [API_BASE]
 */
import {
  classifyDiyRiskLevel,
  detectUserDiyStopRequest,
  guidancePolicyForRisk,
} from '../api/diy-safety.js';

const API = process.argv[2] || process.env.API_BASE || 'http://127.0.0.1:3001';

function ok(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, raw: text };
  }
}

async function signup(ts) {
  const email = `diy.guard.${ts}@example.com`;
  const password = 'SmokePass123!';
  const r = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'homeowner',
      name: 'DIY Guard Smoke',
      email,
      password,
      consents: { ACCOUNT_TERMS: true, PRIVACY_POLICY: true },
    }),
  }).then(json);
  return {
    r,
    h: r.token ? { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } : null,
  };
}

async function main() {
  console.log(`\nFixBridge DIY safety guardrails @ ${API}\n`);

  const spark = classifyDiyRiskLevel('The electrical panel is sparking.');
  ok('sparking panel → RED', spark.level === 'red', spark.reasonCodes.join(','));

  const sewage = classifyDiyRiskLevel('Sewage is backing up into the bathtub.');
  ok('sewage backup escalation → RED', sewage.level === 'red', sewage.reasonCodes.join(','));

  const slow = classifyDiyRiskLevel('My sink drains slowly.', {
    category: 'plumbing',
    complexity: 'low',
    safe_diy_allowed: true,
    diy_difficulty: 'easy',
  });
  ok('slow drain stays non-RED', slow.level !== 'red', slow.level);

  ok('user unsafe message detected', detectUserDiyStopRequest("I don't feel safe doing this.") === true);
  ok('user lacks experience detected', detectUserDiyStopRequest('I have never done electrical work before.') === true);

  const redPrompt = guidancePolicyForRisk('red').systemPrompt;
  ok('RED prompt blocks repair steps', /NO DANGEROUS REPAIR/i.test(redPrompt));
  ok('prompt discourages guaranteed safety claims', /Never represent an AI diagnosis as guaranteed/i.test(redPrompt));

  const ts = Date.now();
  const { h } = await signup(ts);
  if (!h) {
    console.log('Skipping API tests — signup failed.\n');
    return;
  }

  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      category: 'Plumbing',
      title: 'DIY guard smoke',
      description: 'Slow drain for DIY guard smoke test.',
      serviceTiming: 'weekday',
      contactName: 'DIY Guard',
      contactPhone: '555-0101',
    }),
  }).then(json);
  const jobId = created.job?.id;
  ok('job created for chat guard test', Boolean(jobId), created.message);

  const blocked = await fetch(`${API}/api/ai/chat`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      jobId,
      messages: [{ role: 'user', content: 'How do I fix this leak?' }],
    }),
  }).then(json);
  ok(
    'AI chat without DIY acknowledgment blocked',
    !blocked.ok && blocked.code === 'DIY_SAFETY_ACKNOWLEDGMENT_REQUIRED',
    blocked.message || blocked.code
  );

  const partial = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ actionKey: 'DIY_START', consents: { DIY_SAFETY: true } }),
  }).then(json);
  ok(
    'single checkbox insufficient',
    !partial.ok && partial.code === 'DIY_SAFETY_ACKNOWLEDGMENT_REQUIRED',
    partial.missingAcceptanceTypes?.join(', ')
  );

  const full = await fetch(`${API}/api/homeowner/consent/action`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      actionKey: 'DIY_START',
      consents: { DIY_SAFETY: true, DIY_SAFETY_ABILITY_ACK: true },
    }),
  }).then(json);
  ok('both DIY acknowledgments recorded', full.ok === true, full.message);

  const history = await fetch(`${API}/api/homeowner/legal/history`, { headers: h }).then(json);
  const diyRecords = (history.acceptances || []).filter((a) =>
    ['DIY_SAFETY', 'DIY_SAFETY_ABILITY_ACK'].includes(a.acceptance_type)
  );
  ok('acceptance records saved', diyRecords.length >= 2, `count=${diyRecords.length}`);
  ok(
    'document version saved',
    diyRecords.some((a) => a.document_version),
    diyRecords.map((a) => a.document_version).join(', ')
  );
  ok(
    'acceptance timestamp saved',
    diyRecords.every((a) => a.accepted_at),
    'timestamps present'
  );

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
