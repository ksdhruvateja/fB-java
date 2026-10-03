/**
 * Fixera core. Features call these methods. They do not choose a vendor.
 */

import { randomUUID } from 'node:crypto';
import { analyzeRepairStructured, chatWithCustomer, extractPropertyDocumentFields, getAiStatus } from '../ai.js';
import { buildFixaContext } from './core/context.js';
import { retrieveKnowledge } from './knowledge/retrieval.js';
import { selectProvider } from './router/router.js';
import { evaluateRepairAssessment } from './evaluator/responseEvaluator.js';
import { recordFixaEvent, fixaObservabilitySummary } from './observability/events.js';
import { recordLearningCandidate } from './learning/candidates.js';
import { listFixaProviders } from './providers.js';

export const FIXA_UNAVAILABLE = "We couldn't complete the assessment right now. Please try again.";

function requestId() {
  return randomUUID();
}

function propertyMemoryText(property = {}) {
  const lines = [];
  if (property.label) lines.push(`Property label: ${property.label}`);
  if (property.locality) lines.push(`Property area: ${property.locality}`);

  for (const equipment of Array.isArray(property.equipment) ? property.equipment.slice(0, 12) : []) {
    const identity = [equipment.name || equipment.key, equipment.brand, equipment.model]
      .filter(Boolean)
      .join(' ');
    if (!identity) continue;
    const verification = equipment.verification || equipment.source || 'USER_REPORTED';
    const details = [
      equipment.serialNumber ? `serial ${equipment.serialNumber}` : null,
      equipment.installedYear ? `installed ${equipment.installedYear}` : null,
      equipment.lastService ? `last service ${equipment.lastService}` : null,
    ].filter(Boolean).join(', ');
    lines.push(`Equipment (${verification}): ${identity}${details ? ` (${details})` : ''}`);
  }

  for (const service of Array.isArray(property.previousAssessments) ? property.previousAssessments.slice(0, 8) : []) {
    const description = [service.title, service.diagnosis, service.repair]
      .filter(Boolean)
      .map((value) => String(value).slice(0, 180))
      .join(' — ');
    if (!description) continue;
    lines.push(`Prior service (${service.verification || service.source || 'UNVERIFIED'}): ${description}`);
    if (Array.isArray(service.partsUsed) && service.partsUsed.length) {
      lines.push(`Reported parts: ${service.partsUsed.slice(0, 8).map((part) => typeof part === 'string' ? part : part?.name).filter(Boolean).join(', ')}`);
    }
  }

  for (const fact of Array.isArray(property.confirmedFacts) ? property.confirmedFacts.slice(0, 12) : []) {
    const value = typeof fact === 'string' ? fact : fact?.value || fact?.text;
    if (value) lines.push(`Verified property fact: ${String(value).slice(0, 180)}`);
  }
  return lines.join('\n');
}

function publicAssessment(result) {
  return {
    ...result,
    source: result?.assessment ? 'fixera' : 'error',
    assistant: 'Fixera',
  };
}

export function getContext(input, task = 'repair_assessment') {
  return {
    context: buildFixaContext(input, task),
    knowledge: retrieveKnowledge(task),
  };
}

export function getFixaPublicStatus() {
  const ai = getAiStatus();
  return {
    assistant: 'Fixera',
    configured: Boolean(ai.configured),
    provider: ai.provider || null,
    model: ai.model || null,
    fallbackProvider: ai.fallbackProvider || null,
    fallbackModel: ai.fallbackModel || null,
    fallbackProviders: ai.fallbackProviders || [],
  };
}

export async function getFixaHealth() {
  const ai = getAiStatus();
  return {
    assistant: 'Fixera',
    provider: ai.provider || null,
    model: ai.model || null,
    fallbackProvider: ai.fallbackProvider || null,
    fallbackModel: ai.fallbackModel || null,
    fallbackProviders: ai.fallbackProviders || [],
    code: ai.configured ? 'configured_not_probed' : 'not_connected',
  };
}

export async function getFixaAdminProviders() {
  const ai = getAiStatus();
  const health = await getFixaHealth();
  const route = {
    primary: ai.provider || null,
    model: ai.model || null,
    fallback: ai.fallbackProvider || null,
    fallbackModel: ai.fallbackModel || null,
  };
  return {
    assistant: 'Fixera',
    principle: 'Models may change. Fixera remains.',
    currentProvider: ai.provider || 'Not configured',
    currentModel: ai.model || 'Not configured',
    connection: ai.configured ? 'configured' : 'not_connected',
    health,
    routing: {
      repair_assessment: route,
      diy_guidance: route,
      customer_support: route,
    },
    providers: listFixaProviders(),
    observability: fixaObservabilitySummary(),
    note: 'Provider secrets stay in server environment storage. Connectivity is not probed by this status endpoint.',
  };
}

// export async function assessRepair(input) {
//   const started = Date.now();
//   const id = requestId();
//   const route = {
//     provider: { id: 'explabs' },
//     model: 'gpt-6-astra'
//   };

//   const packed = getContext(input, 'repair_assessment');
//   // const route = selectProvider('repair_assessment');
//   // const packed = getContext(input, 'repair_assessment');
//   if (!route.provider) {
//     recordFixaEvent({
//       requestId: id,
//       task: 'repair_assessment',
//       startedAt: new Date(started).toISOString(),
//       latencyMs: Date.now() - started,
//       ok: false,
//       code: 'not_connected',
//       jobId: packed.context.jobId,
//     });
//     return { assessment: null, source: 'error', assistant: 'Fixera', error: FIXA_UNAVAILABLE };
//   }
//   const result = await analyzeRepairStructured({
//     ...input,
//     description: [input.description, packed.knowledge.items.join(' ')].filter(Boolean).join('\n'),
//   });
//   const evaluation = result.assessment ? evaluateRepairAssessment(result.assessment) : { ok: false, schemaValid: false, issues: ['missing_assessment'] };
//   recordFixaEvent({
//     requestId: id,
//     task: 'repair_assessment',
//     provider: route.provider.id,
//     model: route.model,
//     startedAt: new Date(started).toISOString(),
//     latencyMs: Date.now() - started,
//     ok: Boolean(result.assessment),
//     schemaValid: evaluation.schemaValid,
//     safety: result.assessment?.diy_risk_level || null,
//     evaluator: evaluation.ok ? 'pass' : 'fail',
//     jobId: packed.context.jobId,
//     code: result.assessment ? 'ok' : 'provider_error',
//   });
//   if (result.assessment) {
//     recordLearningCandidate({
//       requestId: id,
//       task: 'repair_assessment',
//       jobId: packed.context.jobId,
//       provider: route.provider.id,
//       model: route.model,
//       safety: result.assessment.diy_risk_level,
//       evaluator: evaluation.ok ? 'pass' : 'fail',
//     });
//   }
//   return publicAssessment(result);
// }

export async function assessRepair(input) {
  const started = Date.now();
  const id = requestId();
  const task = String(input.task || 'repair_assessment');
  const packed = getContext(input, task);
  const route = selectProvider(task);
  const knowledgeContext = packed.knowledge.items.map((item) => `- ${item}`).join('\n');
  const privatePropertyContext = propertyMemoryText(packed.context.property);
  const locationContext = [
    input.locationContext,
    privatePropertyContext ? `Authorized property/equipment history:\n${privatePropertyContext}` : '',
    knowledgeContext ? `Fixera safety and repair guidance:\n${knowledgeContext}` : '',
  ].filter(Boolean).join('\n\n');

  if (!route.configured) {
    recordFixaEvent({
      requestId: id,
      task,
      startedAt: new Date(started).toISOString(),
      latencyMs: Date.now() - started,
      ok: false,
      homeownerId: packed.context.homeownerId,
      jobId: packed.context.jobId,
      caseId: packed.context.jobId,
      propertyId: packed.context.propertyId,
      code: 'no_provider_configured',
    });
    return {
      assessment: null,
      source: 'error',
      assistant: 'Fixera',
      error: FIXA_UNAVAILABLE,
      code: 'no_provider_configured',
    };
  }

  let result;
  try {
    result = await analyzeRepairStructured({
      ...input,
      locationContext,
    });
  } catch (error) {
    result = {
      assessment: null,
      source: 'error',
      error: FIXA_UNAVAILABLE,
      providerCode: error?.code || 'provider_exception',
    };
  }

  const evaluation = result?.assessment
    ? evaluateRepairAssessment(result.assessment)
    : { ok: false, schemaValid: false, issues: ['missing_assessment'] };
  const usableAssessment = result?.assessment && evaluation.ok ? result.assessment : null;
  const code = !result?.assessment
    ? result?.providerCode || 'provider_error'
    : usableAssessment
      ? 'ok'
      : 'assessment_schema_invalid';

  recordFixaEvent({
    requestId: id,
    task,
    provider: result?.provider || result?.source || route.provider?.id || null,
    model: result?.model || route.model || null,
    providerRequestId: result?.requestId || null,
    promptVersion: result?.promptVersion || null,
    providerAttempts: result?.providerAttempts || [],
    startedAt: new Date(started).toISOString(),
    latencyMs: Date.now() - started,
    ok: Boolean(usableAssessment),
    homeownerId: packed.context.homeownerId,
    schemaValid: evaluation.schemaValid,
    safety: result?.assessment?.diy_risk_level || null,
    evaluator: evaluation.ok ? 'pass' : 'fail',
    jobId: packed.context.jobId,
    caseId: packed.context.jobId,
    propertyId: packed.context.propertyId,
    code,
  });

  if (usableAssessment) {
    recordLearningCandidate({
      requestId: id,
      task,
      jobId: packed.context.jobId,
      propertyId: packed.context.propertyId,
      provider: result?.provider || route.provider?.id || null,
      model: result?.model || route.model,
      safety: usableAssessment.diy_risk_level,
      evaluator: 'pass',
    });
    return publicAssessment({ ...result, assessment: usableAssessment });
  }

  return publicAssessment({
    assessment: null,
    source: 'error',
    error: FIXA_UNAVAILABLE,
    code,
    validationIssues: evaluation.issues,
  });
}

export async function reassessRepair(input) {
  const observation = String(input.observation || '').trim();
  const description = [
    input.description || '',
    observation ? `Homeowner observation on the current step: ${observation}` : '',
    'Revise only what the new observation requires. Keep confirmed findings.',
  ].filter(Boolean).join('\n');
  return assessRepair({ ...input, description, task: 'reassessment' });
}

export async function chat(input) {
  const started = Date.now();
  const id = requestId();
  const task = String(input?.task || 'customer_support');
  const route = selectProvider(task);

  if (!route.configured) {
    return { reply: null, source: 'error', assistant: 'Fixera', error: FIXA_UNAVAILABLE };
  }
  const result = await chatWithCustomer(input);
  recordFixaEvent({
    requestId: id,
    task,
    provider: route.provider?.id || null,
    model: route.model,
    startedAt: new Date(started).toISOString(),
    latencyMs: Date.now() - started,
    ok: Boolean(result?.reply),
    jobId: input?.jobId || null,
    code: result?.reply ? 'ok' : 'provider_error',
  });
  return {
    ...result,
    source: result?.reply ? 'fixera' : 'error',
    assistant: 'Fixera',
    model: undefined,
    error: result?.reply ? result.error : FIXA_UNAVAILABLE,
  };
}

export const complete = chat;
export const respond = chat;

export async function extractDocument(input) {
  const route = selectProvider('document_extract');
  if (!route.provider) {
    return { extraction: null, source: 'error', assistant: 'Fixera', error: FIXA_UNAVAILABLE };
  }
  const result = await extractPropertyDocumentFields(input);
  return { ...result, assistant: 'Fixera', model: undefined };
}

export function prepareProfessionalHandoff(input = {}) {
  const packed = getContext({ ...input, escalated: true }, 'professional_handoff');
  return {
    assistant: 'Fixera',
    sameJob: true,
    jobId: packed.context.jobId,
    summary: {
      issue: packed.context.description,
      propertyId: packed.context.propertyId,
      category: packed.context.category,
      subcategory: packed.context.subcategory,
      observedEvidence: packed.context.job.observedEvidence,
      likelyDiagnosis: packed.context.job.diagnosis,
      risk: packed.context.risk,
      diyAttempted: Boolean((input.completedSteps || []).length || input.failedStep),
      completedSteps: input.completedSteps || [],
      failedStep: input.failedStep || null,
      homeownerConcern: input.concern || input.observation || '',
      reason: input.reason || 'Homeowner requested a professional',
    },
  };
}

export function evaluateRepairOutcome(assessment) {
  return evaluateRepairAssessment(assessment);
}

export async function run(input = {}) {
  const task = String(input.task || 'repair_assessment');
  if (task === 'professional_handoff') return prepareProfessionalHandoff(input);
  if (task === 'reassessment') return reassessRepair(input);
  if (task === 'customer_support' || task === 'diy_guidance') return chat(input);
  if (task === 'document_extract') return extractDocument(input);
  return assessRepair(input);
}
