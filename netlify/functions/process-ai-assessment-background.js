/**
 * Netlify Background Function — runs long AI assessments outside the synchronous API window.
 */
import { initDb, pool } from '../../api/app.js';
import {
  runAssessmentProcessor,
  verifyAssessmentWorkerRequest,
} from '../../api/assessment-worker.js';

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

  const jobId = Number(body.jobId);
  const actorUserId = Number(body.actorUserId);
  if (!jobId || !actorUserId) {
    return new Response(JSON.stringify({ ok: false, message: 'jobId and actorUserId required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ready) {
    await initDb();
    ready = true;
  }

  const started = Date.now();
  console.log('[assessment] background started', { jobId, actorUserId });
  try {
    const result = await runAssessmentProcessor(pool, { jobId, actorUserId });
    console.log('[assessment] background complete', {
      jobId,
      ok: result?.ok === true,
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: result?.ok === true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[assessment] background failed', {
      jobId,
      error: err?.message || String(err),
      durationMs: Date.now() - started,
    });
    return new Response(JSON.stringify({ ok: false, message: 'processor_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
