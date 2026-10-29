/** Poll async AI assessment until ready, failed, or timeout (for smoke tests). */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return { status: res.status, ...(JSON.parse(text) || {}) };
  } catch {
    return { status: res.status, ok: false, message: text || res.statusText };
  }
}

/**
 * Start (or join) assessment and wait for completion.
 * Works with async 202 + background/local processor.
 */
export async function waitForAssessment(API, jobId, headers, options = {}) {
  const maxAttempts = options.maxAttempts ?? 45;
  const intervalMs = options.intervalMs ?? 2000;

  const start = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.force ? { force: true } : {}),
  }).then(parseJsonResponse);

  if (!start.ok) return start;
  if (start.status === 'ready' && start.job) return { ...start, ok: true };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(intervalMs);
    const status = await fetch(`${API}/api/managed/jobs/${jobId}/assessment-status`, {
      headers,
    }).then(parseJsonResponse);
    if (!status.ok) continue;
    if (status.status === 'ready' && status.job) {
      return {
        ok: true,
        status: 'ready',
        job: status.job,
        pricing: status.pricing,
      };
    }
    if (status.status === 'failed') {
      return {
        ok: false,
        status: 'failed',
        message: status.message,
        code: status.errorCode || status.code,
      };
    }
  }

  return {
    ok: false,
    status: 'timeout',
    message: 'Assessment did not complete in time',
  };
}
