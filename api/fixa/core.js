/**
 * Fixa — FixBridge's central assistant.
 * Features call Fixa. Fixa may call a registered provider. Models are replaceable.
 * Production learning is not automatic; candidate examples are not stored here.
 */

import { analyzeRepairStructured, chatWithCustomer, extractPropertyDocumentFields } from '../ai.js';
import { getConnectedProvider, listFixaProviders, FIXA_MODEL } from './providers.js';

export const FIXA_UNAVAILABLE = "We couldn't complete the assessment right now. Please try again.";

const TASK_POLICY = {
  repair_assessment: { primary: 'explabs', fallback: null },
  diy_guidance: { primary: 'explabs', fallback: null },
  customer_support: { primary: 'explabs', fallback: null },
  document_extract: { primary: 'explabs', fallback: null },
};

function routeTask(task) {
  const policy = TASK_POLICY[task] || TASK_POLICY.repair_assessment;
  const provider = getConnectedProvider(policy.primary);
  return {
    task,
    provider,
    fallback: null,
    model: provider ? FIXA_MODEL : null,
  };
}

function logFixa(event) {
  const safe = {
    assistant: 'fixa',
    task: event.task,
    provider: event.provider || null,
    model: event.model || null,
    ok: Boolean(event.ok),
    latencyMs: event.latencyMs,
    error: event.error ? 'provider_error' : undefined,
  };
  console.info('[fixa]', safe);
}

function publicResult(result, started, route) {
  const ok = Boolean(result?.assessment || result?.reply || result?.extraction);
  logFixa({
    task: route.task,
    provider: route.provider?.id || null,
    model: route.model,
    ok,
    latencyMs: Date.now() - started,
    error: ok ? null : result?.error || 'unavailable',
  });
  return {
    ...result,
    source: ok ? 'fixa' : 'error',
    assistant: 'Fixa',
    model: undefined,
  };
}

export function getFixaPublicStatus() {
  const connected = getConnectedProvider('explabs');
  return {
    configured: Boolean(connected),
    assistant: 'Fixa',
    provider: 'fixa',
  };
}

export function getFixaAdminProviders() {
  const providers = listFixaProviders();
  return {
    assistant: 'Fixa',
    principle: 'Models may change. Fixa remains.',
    routing: {
      repair_assessment: { primary: 'Experiential Labs', model: FIXA_MODEL, fallback: null },
      diy_guidance: { primary: 'Experiential Labs', model: FIXA_MODEL, fallback: null },
      customer_support: { primary: 'Experiential Labs', model: FIXA_MODEL, fallback: null },
    },
    providers,
    note: 'Provider secrets stay in server environment storage. This screen never returns a raw key.',
  };
}

export async function assessRepair(input) {
  const started = Date.now();
  const route = routeTask('repair_assessment');
  if (!route.provider) {
    console.error('[fixa] Experiential Labs is not connected');
    logFixa({ task: route.task, provider: null, model: null, ok: false, latencyMs: Date.now() - started, error: 'not_connected' });
    return { assessment: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await analyzeRepairStructured(input);
  return publicResult(result, started, route);
}

export async function complete(input) {
  const started = Date.now();
  const route = routeTask(input?.task || 'customer_support');
  if (!route.provider) {
    console.error('[fixa] Experiential Labs is not connected');
    return { reply: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await chatWithCustomer(input);
  const next = publicResult(result, started, route);
  if (!next.reply) {
    return { ...next, reply: null, error: FIXA_UNAVAILABLE };
  }
  return next;
}

export async function extractDocument(input) {
  const started = Date.now();
  const route = routeTask('document_extract');
  if (!route.provider) {
    return { extraction: null, source: 'error', assistant: 'Fixa', error: FIXA_UNAVAILABLE };
  }
  const result = await extractPropertyDocumentFields(input);
  return publicResult(result, started, route);
}

export async function run(input = {}) {
  const task = String(input.task || 'repair_assessment');
  if (task === 'customer_support' || task === 'diy_guidance') {
    return complete(input);
  }
  if (task === 'document_extract') {
    return extractDocument(input);
  }
  return assessRepair(input);
}
