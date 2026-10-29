/**
 * Async AI assessment worker scheduling (Netlify background function + local fallback).
 */

import { enqueueAssessment } from './assessment-queue.js';

let assessmentProcessor = null;
let assessmentQueue = null;

/** Set by server.js once the durable queue worker is running on this instance. */
export function attachAssessmentQueue(queue) {
  assessmentQueue = queue;
}

export function getAssessmentProcessor() {
  return assessmentProcessor;
}

export function registerAssessmentProcessor(fn) {
  assessmentProcessor = fn;
}

export async function runAssessmentProcessor(pool, payload) {
  if (!assessmentProcessor) {
    throw new Error('Assessment processor is not registered.');
  }
  return assessmentProcessor(pool, payload);
}

function isNetlifyRuntime() {
  return Boolean(
    process.env.NETLIFY ||
      process.env.FIXBRIDGE_HOSTING === 'netlify' ||
      process.env.CONTEXT === 'production' ||
      process.env.CONTEXT === 'deploy-preview'
  );
}

function workerSecret() {
  return (
    process.env.ASSESSMENT_WORKER_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    ''
  );
}

function backgroundFunctionUrl() {
  const base =
    process.env.URL?.trim() ||
    process.env.DEPLOY_PRIME_URL?.trim() ||
    process.env.DEPLOY_URL?.trim() ||
    'http://localhost:8888';
  return `${base.replace(/\/$/, '')}/.netlify/functions/process-ai-assessment-background`;
}

export function verifyAssessmentWorkerRequest(req) {
  const expected = workerSecret();
  if (!expected) return false;
  const provided =
    req?.headers?.['x-assessment-secret'] ||
    req?.headers?.['X-Assessment-Secret'] ||
    '';
  return String(provided) === expected;
}

/**
 * Queue assessment processing without blocking the HTTP response.
 */
export function scheduleAssessmentJob(pool, { jobId, actorUserId }) {
  return scheduleAssessmentPayload(pool, {
    jobId: Number(jobId),
    actorUserId: Number(actorUserId),
    recordType: 'managed_job',
  });
}

export function schedulePendingServiceRequestAssessment(pool, { pendingServiceRequestId, actorUserId }) {
  return scheduleAssessmentPayload(pool, {
    pendingServiceRequestId: Number(pendingServiceRequestId),
    actorUserId: Number(actorUserId),
    recordType: 'pending_service_request',
  });
}

function scheduleAssessmentPayload(pool, payload) {
  const isPending = payload.recordType === 'pending_service_request';
  const recordId = Number(isPending ? payload.pendingServiceRequestId : payload.jobId);
  const actorId = Number(payload.actorUserId);

  if (!Number.isFinite(recordId) || recordId <= 0 || !Number.isFinite(actorId) || actorId <= 0) {
    return Promise.resolve({ ok: false, reason: 'invalid_payload' });
  }

  const normalized = {
    ...(isPending ? { pendingServiceRequestId: recordId } : { jobId: recordId }),
    actorUserId: actorId,
    recordType: isPending ? 'pending_service_request' : 'managed_job',
  };

  if (isNetlifyRuntime()) {
    const secret = workerSecret();
    if (!secret) {
      console.error('[assessment] cannot schedule — worker secret not configured');
      return Promise.resolve({ ok: false, reason: 'worker_secret_missing' });
    }
    return fetch(backgroundFunctionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Assessment-Secret': secret,
      },
      body: JSON.stringify(normalized),
    })
      .then((res) => {
        if (res.status === 202 || res.ok) {
          console.log('[assessment] background queued', normalized);
          return { ok: true, mode: 'background' };
        }
        console.warn('[assessment] background queue failed', { ...normalized, status: res.status});
        return { ok: false, reason: 'background_invoke_failed', status: res.status };
      })
      .catch((err) => {
        console.error('[assessment] background invoke error', {
          ...normalized,
          error: err?.message || String(err),
        });
        return { ok: false, reason: 'background_invoke_error' };
      });
  }

  // Long-running servers: put the work in the durable queue (see assessment-queue.js). Instances
  // with the worker switched off enqueue for a separate worker service when
  // FIXERA_QUEUE_EXTERNAL_WORKER=true.
  if (assessmentQueue || process.env.FIXERA_QUEUE_EXTERNAL_WORKER === 'true') {
    return enqueueAssessment(pool, {
      recordType: normalized.recordType,
      recordId,
      actorUserId: actorId,
    })
      .then((r) => {
        assessmentQueue?.kick();
        return { ok: true, mode: 'queue', queued: r.queued };
      })
      .catch((err) => {
        console.error('[assessment] enqueue failed; running in-process', err?.message || err);
        return runInProcess(pool, normalized);
      });
  }
  return runInProcess(pool, normalized);
}

function runInProcess(pool, normalized) {
  setImmediate(() => {
    runAssessmentProcessor(pool, normalized).catch((err) => {
      console.error('[assessment] local processor failed', {
        ...normalized,
        error: err?.message || String(err),
      });
    });
  });
  return Promise.resolve({ ok: true, mode: 'local' });
}

export function resolveAssessmentStatus(row) {
  if (!row) return 'pending';
  const stored = String(row.assessment_status || '').toLowerCase();
  if (stored === 'failed') return 'failed';
  const assessment = row.ai_assessment;
  const hasAssessment =
    assessment &&
    (typeof assessment === 'object'
      ? Object.keys(assessment).length > 0
      : String(assessment).length > 2);
  if (hasAssessment || stored === 'ready') return 'ready';
  if (stored === 'processing') return 'processing';
  return stored || 'pending';
}

export const ASSESSMENT_ERROR_MESSAGES = {
  AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE:
    "We couldn't finish the assessment right now. Please try again in a moment.",
  AI_ASSESSMENT_FAILED: "We couldn't finish the assessment right now. Please try again.",
  AI_TIMEOUT: "The assessment took too long. Try a smaller photo or continue your request.",
  WORKER_UNAVAILABLE:
    "We're preparing your assessment. Please wait a moment and try again.",
  HOMECARE_PLAN_REQUIRED:
    'Fixera AI assessment is included with HomeCare Pro. You can still hire a professional for this request.',
};
