/** Default routing. All tasks use Google Gemini. */

import { GEMINI_MODEL } from '../providers/gemini.js';

const GEMINI_TASK = { primary: 'gemini', model: GEMINI_MODEL, fallback: null };

export const DEFAULT_POLICY = {
  id: 'default',
  mode: 'default',
  tasks: {
    repair_assessment: GEMINI_TASK,
    diy_guidance: GEMINI_TASK,
    reassessment: GEMINI_TASK,
    customer_support: GEMINI_TASK,
    document_extract: GEMINI_TASK,
    professional_handoff: { primary: null, model: null, fallback: null },
  },
};

export function policyForTask(task) {
  return DEFAULT_POLICY.tasks[task] || DEFAULT_POLICY.tasks.repair_assessment;
}
