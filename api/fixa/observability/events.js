const events = [];
const MAX = 40;

export function recordFixaEvent(event) {
  const row = {
    requestId: event.requestId,
    task: event.task,
    provider: event.provider || null,
    model: event.model || null,
    startedAt: event.startedAt,
    latencyMs: event.latencyMs,
    ok: Boolean(event.ok),
    schemaValid: event.schemaValid ?? null,
    safety: event.safety || null,
    retryCount: event.retryCount || 0,
    evaluator: event.evaluator || null,
    jobId: event.jobId || null,
    code: event.code || null,
  };
  events.unshift(row);
  if (events.length > MAX) events.length = MAX;
  console.info('[fixa]', {
    task: row.task,
    provider: row.provider,
    model: row.model,
    ok: row.ok,
    latencyMs: row.latencyMs,
    schemaValid: row.schemaValid,
    code: row.code,
    jobId: row.jobId,
  });
  return row;
}

export function fixaObservabilitySummary() {
  const recent = events.slice(0, 20);
  const total = recent.length;
  const ok = recent.filter((row) => row.ok).length;
  const schemaFailures = recent.filter((row) => row.schemaValid === false).length;
  const safetyRejections = recent.filter((row) => row.safety === 'red').length;
  const evaluatorFailures = recent.filter((row) => row.evaluator === 'fail').length;
  const latencies = recent.map((row) => row.latencyMs).filter((n) => Number.isFinite(n));
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
    : null;
  return {
    recentCount: total,
    successRate: total ? Math.round((ok / total) * 100) : null,
    avgLatencyMs,
    schemaFailures,
    safetyRejections,
    evaluatorFailures,
    recentErrors: recent.filter((row) => !row.ok).slice(0, 8).map((row) => ({
      requestId: row.requestId,
      task: row.task,
      code: row.code,
      latencyMs: row.latencyMs,
    })),
  };
}
