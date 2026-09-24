/** Default routing. All tasks use the connected Experiential Labs provider. No fallback. */

export const DEFAULT_POLICY = {
  id: 'default',
  mode: 'default',
  tasks: {
    repair_assessment: { primary: 'explabs', model: 'gpt-6-astra', fallback: null },
    diy_guidance: { primary: 'explabs', model: 'gpt-6-astra', fallback: null },
    reassessment: { primary: 'explabs', model: 'gpt-6-astra', fallback: null },
    customer_support: { primary: 'explabs', model: 'gpt-6-astra', fallback: null },
    document_extract: { primary: 'explabs', model: 'gpt-6-astra', fallback: null },
    professional_handoff: { primary: null, model: null, fallback: null },
  },
};

export function policyForTask(task) {
  return DEFAULT_POLICY.tasks[task] || DEFAULT_POLICY.tasks.repair_assessment;
}
