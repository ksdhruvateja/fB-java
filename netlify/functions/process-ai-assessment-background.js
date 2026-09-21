/** Netlify Background Function — runs managed-job and pending-service assessments. */
import { initDb, pool } from '../../api/app.js';
import { runAssessmentProcessor, verifyAssessmentWorkerRequest } from '../../api/assessment-worker.js';

export const config = {
  background: true,
};

let ready = false;

export default async function handler(req) {
  if (!verifyAssessmentWorkerRequest(req)) {
    return new Response(JSON.stringify({ ok: false, message: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const recordType = body.recordType === 'pending_service_request' ? 'pending_service_request' : 'managed_job';
  const recordId = Number(recordType === 'pending_service_request' ? body.pendingServiceRequestId : body.jobId);
  const actorUserId = Number(body.actorUserId);
  if (!recordId || !actorUserId) {
    return new Response(JSON.stringify({ ok: false, message: 'A valid record ID and actorUserId are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ready) {
    await initDb();
    ready = true;
  }

  const payload = recordType === 'pending_service_request'
    ? { pendingServiceRequestId: recordId, actorUserId, recordType }
    : { jobId: recordId, actorUserId, recordType };

  const started = Date.now();
  console.log('[assessment] background started', payload);
  try {
    const result = await runAssessmentProcessor(pool, payload);
    console.log('[assessment] background complete', {
      ...payload,
      ok: result?.ok === true,
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: result?.ok === true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[assessment] background failed', {
      ...payload,
      error: err?.message || String(err),
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: false, message: 'processor_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
