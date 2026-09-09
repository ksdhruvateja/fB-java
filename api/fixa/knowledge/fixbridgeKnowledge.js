/** Task-scoped FixBridge knowledge. Not a single giant prompt, and not a vector store. */

const PACKS = {
  repair_assessment: [
    'Separate OBSERVED, LIKELY, and NEEDS CONFIRMATION. Do not invent unseen damage.',
    'Do not invent visit fees, discounts, authorized amounts, or quote totals.',
    'Detailed DIY is sequential and specific. Typical safe issues use 4-10 steps.',
  ],
  diy_guidance: [
    'Answer only the current step unless the homeowner reports a new observation.',
    'Do not invent prices. Direct cost questions to FixBridge pricing, not a model estimate.',
  ],
  safety: [
    'Deterministic GREEN/YELLOW/RED rules override the model.',
    'RED blocks actionable DIY. YELLOW allows only conservative troubleshooting.',
  ],
  professional_handoff: [
    'Continue the same job. Do not ask for information already collected.',
    'Include media, assessment, risk, DIY attempt, completed steps, and the reason for escalation.',
  ],
  pricing: [
    'Payable amounts come only from backend pricing_rules and the job pricing snapshot.',
  ],
};

export function knowledgeForTask(task) {
  const key = PACKS[task] ? task : 'repair_assessment';
  return {
    task: key,
    items: [...(PACKS[key] || []), ...PACKS.safety],
  };
}
