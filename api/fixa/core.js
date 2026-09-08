/**
 * Fixa core. Features call these methods. They do not choose a vendor.
 */

import { randomUUID } from 'node:crypto';
import { analyzeRepairStructured, chatWithCustomer, extractPropertyDocumentFields } from '../ai.js';
import { buildFixaContext } from './core/context.js';
import { retrieveKnowledge } from './knowledge/retrieval.js';
import { selectProvider } from './router/router.js';
import { explabsProvider } from './providers/explabs.js';
import { evaluateRepairAssessment } from './evaluator/responseEvaluator.js';
import { recordFixaEvent, fixaObservabilitySummary } from './observability/events.js';
import { recordLearningCandidate } from './learning/candidates.js';
import { listFixaProviders } from './providers.js';
import { readExplabsKey } from './providers/explabs.js';

export const FIXA_UNAVAILABLE = "We couldn't complete the assessment right now. Please try again.";

function requestId() {
  return randomUUID();
}

function publicAssessment(result) {
  return {
    ...result,
    source: result?.assessment ? 'fixa' : 'error',
    assistant: 'Fixa',
    model: undefined,
    provider: undefined,
  };
}

export function getContext(input, task = 'repair_assessment') {
  return {
    context: buildFixaContext(input, task),
    knowledge: retrieveKnowledge(task),
  };
}

export function getFixaPublicStatus() {
  return {
    assistant: 'Fixa',
    configured: Boolean(readExplabsKey()),
    provider: 'experiential-labs',
    model: 'gpt-6-astra',
  };
}

export async function getFixaHealth() {
  const health = await explabsProvider.healthCheck();
  return {
    assistant: 'Fixa',
    provider: 'experiential-labs',
    model: 'gpt-6-astra',
    configured: Boolean(health.configured),
    authenticated: Boolean(health.authenticated),
    modelReachable: Boolean(health.modelReachable),
    healthy: Boolean(health.healthy),
    code: health.code,
    ...(health.providerStatus ? { providerStatus: health.providerStatus, httpStatus: health.providerStatus } : {}),
    ...(health.providerCode ? { providerCode: health.providerCode } : {}),
    ...(health.modelsHttpStatus != null ? { modelsHttpStatus: health.modelsHttpStatus } : {}),
    ...(health.modelListed != null ? { modelListed: health.modelListed } : {}),
    ...(health.returnedModel ? { returnedModel: health.returnedModel } : {}),
    ...(health.latencyMs != null ? { latencyMs: health.latencyMs } : {}),
    ...(health.usage ? { usage: health.usage } : {}),
    ...(health.text ? { text: health.text } : {}),
    ...(health.keyShape ? {
      keyShape: health.keyShape,
      keyLength: health.keyLength,
      matchesProviderFormat: health.matchesProviderFormat,
      prefixXpl: health.prefixXpl,
      bodyIsHex: health.bodyIsHex,
    } : {}),
  };
}

export async function getFixaAdminProviders() {
  const health = await explabsProvider.healthCheck();
  return {
    assistant: 'Fixa',
    principle: 'Models may change. Fixa remains.',
    currentProvider: 'Experiential Labs',
    currentModel: 'gpt-6-astra',
    connection: health.healthy ? 'connected' : health.configured ? 'error' : 'not_connected',
    health,
    routing: {
      repair_assessment: { primary: 'Experiential Labs', model: 'gpt-6-astra', fallback: null },
      diy_guidance: { primary: 'Experiential Labs', model: 'gpt-6-astra', fallback: null },
      customer_support: { primary: 'Experiential Labs', model: 'gpt-6-astra', fallback: null },
    },
    providers: listFixaProviders().map((provider) => ({
      ...provider,
      status: provider.id === 'explabs'
        ? (health.healthy ? 'connected' : health.configured ? 'error' : 'not_connected')
        : 'not_configured',
    })),
    observability: fixaObservabilitySummary(),
    note: 'Provider secrets stay in server environment storage. This screen never returns a raw key.',
  };
}

export async function assessRepair(input) {
  const started = Date.now();
  const id = requestId();
  const route = selectProvider('repair_assessment');
  const packed = getContext(input, 'repair_assessment');
  if (!route.provider) {
    recordFixaEvent({
      requestId: id,
      task: 'repair_assessment',
      startedAt: new Date(started).toISOString(),
      latencyMs: Date.now() - started,
      ok: false,
      code: 'not_connected',
      jobId: packed.context.jobId,
    });
    return { assessment: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await analyzeRepairStructured({
    ...input,
    description: [input.description, packed.knowledge.items.join(' ')].filter(Boolean).join('\n'),
  });
  const evaluation = result.assessment ? evaluateRepairAssessment(result.assessment) : { ok: false, schemaValid: false, issues: ['missing_assessment'] };
  recordFixaEvent({
    requestId: id,
    task: 'repair_assessment',
    provider: route.provider.id,
    model: route.model,
    startedAt: new Date(started).toISOString(),
    latencyMs: Date.now() - started,
    ok: Boolean(result.assessment),
    schemaValid: evaluation.schemaValid,
    safety: result.assessment?.diy_risk_level || null,
    evaluator: evaluation.ok ? 'pass' : 'fail',
    jobId: packed.context.jobId,
    code: result.assessment ? 'ok' : 'provider_error',
  });
  if (result.assessment) {
    recordLearningCandidate({
      requestId: id,
      task: 'repair_assessment',
      jobId: packed.context.jobId,
      provider: route.provider.id,
      model: route.model,
      safety: result.assessment.diy_risk_level,
      evaluator: evaluation.ok ? 'pass' : 'fail',
    });
  }
  return publicAssessment(result);
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
  const route = selectProvider(input?.task || 'customer_support');
  if (!route.provider) {
    return { reply: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await chatWithCustomer(input);
  recordFixaEvent({
    requestId: id,
    task: input?.task || 'customer_support',
    provider: route.provider.id,
    model: route.model,
    startedAt: new Date(started).toISOString(),
    latencyMs: Date.now() - started,
    ok: Boolean(result?.reply),
    jobId: input?.jobId || null,
    code: result?.reply ? 'ok' : 'provider_error',
  });
  return {
    ...result,
    source: result?.reply ? 'fixa' : 'error',
    assistant: 'Fixa',
    model: undefined,
    error: result?.reply ? result.error : FIXA_UNAVAILABLE,
  };
}

export const complete = chat;
export const respond = chat;

export async function extractDocument(input) {
  const route = selectProvider('document_extract');
  if (!route.provider) {
    return { extraction: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await extractPropertyDocumentFields(input);
  return { ...result, assistant: 'Fixa', model: undefined };
}

export function prepareProfessionalHandoff(input = {}) {
  const packed = getContext({ ...input, escalated: true }, 'professional_handoff');
  return {
    assistant: 'Fixa',
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
