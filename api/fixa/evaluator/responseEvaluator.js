const GENERIC = [
  /^inspect the component\.?$/i,
  /^fix if necessary\.?$/i,
  /^check the area\.?$/i,
  /^check the faucet\.?$/i,
  /^tighten the connection\.?$/i,
  /^test it\.?$/i,
];

function stepText(step) {
  return String(step?.instruction || step?.instructions || '').trim();
}

export function evaluateRepairAssessment(assessment) {
  const issues = [];
  if (!assessment || typeof assessment !== 'object') {
    return { ok: false, schemaValid: false, issues: ['missing_assessment'], retryable: false };
  }
  const steps = Array.isArray(assessment.diy_guide_steps) ? assessment.diy_guide_steps : [];
  const diyEligible = assessment.safe_diy_allowed === true && assessment.professional_required !== true;
  if (diyEligible && steps.length === 0 && !(assessment.diy_steps || []).length) {
    issues.push('diy_eligible_without_steps');
  }
  steps.forEach((step, index) => {
    const instruction = stepText(step);
    if (!step?.title) issues.push(`step_${index + 1}_missing_title`);
    if (instruction.length < 24) issues.push(`step_${index + 1}_instruction_too_short`);
    if (!step?.expected_result) issues.push(`step_${index + 1}_missing_expected_result`);
    if (!step?.if_not && !step?.failure_signs) issues.push(`step_${index + 1}_missing_failure_guidance`);
    if (GENERIC.some((pattern) => pattern.test(instruction))) issues.push(`step_${index + 1}_generic`);
  });
  const schemaValid = issues.length === 0;
  return {
    ok: schemaValid,
    schemaValid,
    issues,
    retryable: issues.some((issue) => issue.includes('generic') || issue.includes('too_short') || issue.includes('missing')),
    stepCount: steps.length,
  };
}
