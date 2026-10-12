/**
 * Task routing policy. Providers and models are resolved at runtime by api/ai.js
 * (resolveAiProvider: FIXERA_AI_PROVIDER / AI_PRIMARY_PROVIDER, then configured fallbacks),
 * so the policy only records which tasks use a model at all.
 */

const RUNTIME = { primary: null, model: null, fallback: null, resolvedAtRuntime: true };

export const DEFAULT_POLICY = {
  id: 'default',
  mode: 'runtime',
  tasks: {
    repair_assessment: RUNTIME,
    diy_guidance: RUNTIME,
    reassessment: RUNTIME,
    customer_support: RUNTIME,
    document_extract: RUNTIME,
    professional_handoff: { primary: null, model: null, fallback: null, resolvedAtRuntime: false },
  },
};

export function policyForTask(task) {
  return DEFAULT_POLICY.tasks[task] || DEFAULT_POLICY.tasks.repair_assessment;
}
