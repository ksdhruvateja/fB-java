import { createHash } from 'node:crypto';

/*
 * Per-case safety confirmation. When the safety evaluation finds a concern that still allows
 * guarded DIY (diy_safety.requires_confirmation), the homeowner must confirm before Fixera gives
 * the DIY steps, guided steps or DIY chat for that case.
 *
 * Confirming never changes the guidance: the steps were already limited to what the guardrails
 * permit when the assessment was made, and they are served unchanged. A new assessment with a
 * different safety finding needs a new confirmation.
 */

export const SAFETY_CONFIRMATION_REQUIRED = 'SAFETY_CONFIRMATION_REQUIRED';

function parse(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Identifies the safety finding and the exact guidance the homeowner is confirming. */
export function safetyConfirmationKey(assessment) {
  const a = parse(assessment) || {};
  const s = a.diy_safety || {};
  const payload = JSON.stringify({
    codes: s.reason_codes || [],
    allowed: s.allowed_actions || [],
    prohibited: s.prohibited_actions || [],
    steps: a.diy_steps || [],
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function needsSafetyConfirmation(assessment) {
  const a = parse(assessment);
  return Boolean(a && a.diy_safety?.requires_confirmation === true && a.diy_risk_level !== 'red' && a.safe_diy_allowed !== false);
}

export function readSafetyConfirmation(assessment, completionReport) {
  const report = parse(completionReport) || {};
  const saved = report.fixeraDiy?.safetyConfirmation;
  if (!saved || saved.key !== safetyConfirmationKey(assessment)) return null;
  return saved;
}

/** True when DIY guidance for this case may be delivered now. */
export function diyGuidanceUnlocked(assessment, completionReport) {
  if (!needsSafetyConfirmation(assessment)) return true;
  return readSafetyConfirmation(assessment, completionReport)?.decision === 'continue';
}

/**
 * Homeowner view of an assessment: steps are withheld until the safety concern is confirmed.
 * Everything else (findings, reasons, guardrails, parts and cost) stays visible.
 */
export function withholdUnconfirmedGuidance(assessment, completionReport) {
  const a = parse(assessment);
  if (!a) return a;
  if (!needsSafetyConfirmation(a)) {
    return { ...a, safety_confirmation: { required: false, confirmed: false } };
  }
  const saved = readSafetyConfirmation(a, completionReport);
  if (saved?.decision === 'continue') {
    return { ...a, safety_confirmation: { required: true, confirmed: true, confirmed_at: saved.confirmedAt || null } };
  }
  const withheld = Math.max(a.diy_steps?.length || 0, a.diy_guide_steps?.length || 0);
  return {
    ...a,
    diy_steps: [],
    diy_guide_steps: [],
    diy_steps_withheld: true,
    withheld_step_count: withheld,
    safety_confirmation: {
      required: true,
      confirmed: false,
      declined: saved?.decision === 'hire_professional',
    },
  };
}

export function buildSafetyConfirmationRecord(assessment, { decision, acknowledged }) {
  const a = parse(assessment) || {};
  return {
    key: safetyConfirmationKey(a),
    decision,
    acknowledged: acknowledged === true,
    reasonCodes: a.diy_safety?.reason_codes || [],
    prohibitedActions: a.diy_safety?.prohibited_actions || [],
    confirmedAt: new Date().toISOString(),
  };
}
