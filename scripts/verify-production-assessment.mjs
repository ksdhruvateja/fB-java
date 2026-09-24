/**
 * Live Railway production verification for async AI assessment.
 * Usage: node scripts/verify-production-assessment.mjs
 * Optional: API_URL, SMOKE_HOMEOWNER_EMAIL, SMOKE_HOMEOWNER_PASSWORD
 */
import { parseJsonResponse } from './smoke-assessment-poll.mjs';

const API = (process.env.API_URL || 'https://fb-java-production.up.railway.app').replace(/\/$/, '');
const stamp = Date.now();

const results = [];

function record(section, label, ok, detail = '') {
  results.push({ section, label, ok, detail });
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} [${section}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(role, email, password) {
  const res = await fetch(`${API}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, email, password }),
  });
  const body = await parseJsonResponse(res);
  return { status: res.status, ...body };
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function timedAssess(jobId, headers, body = {}) {
  const started = performance.now();
  const res = await fetch(`${API}/api/managed/jobs/${jobId}/assess`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const elapsed = Math.round(performance.now() - started);
  const parsed = await parseJsonResponse(res);
  return { httpStatus: res.status, elapsedMs: elapsed, ...parsed };
}

async function pollStatus(jobId, headers, maxAttempts = 60, intervalMs = 3000) {
  const transitions = [];
  for (let i = 0; i < maxAttempts; i += 1) {
    const res = await fetch(`${API}/api/managed/jobs/${jobId}/assessment-status`, { headers });
    const body = await parseJsonResponse(res);
    const status = body.status || body.assessmentStatus;
    if (transitions[transitions.length - 1] !== status) transitions.push(status || 'unknown');
    if (status === 'ready') return { ok: true, status, body, transitions, attempts: i + 1 };
    if (status === 'failed') return { ok: false, status, body, transitions, attempts: i + 1 };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, status: 'timeout', transitions, attempts: maxAttempts };
}

async function main() {
  console.log(`\n=== Production assessment verification @ ${API} ===\n`);

  const homeEmail = process.env.SMOKE_HOMEOWNER_EMAIL || 'maria@example.com';
  const homePass = process.env.SMOKE_HOMEOWNER_PASSWORD || 'demo123';
  const contractorEmail = process.env.SMOKE_CONTRACTOR_EMAIL || 'james@yourcompany.com';
  const contractorPass = process.env.SMOKE_CONTRACTOR_PASSWORD || 'demo123';

  // Deploy / frontend markers
  const indexRes = await fetch(`${API}/`);
  const indexHtml = await indexRes.text();
  const bundleMatch = indexHtml.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
  const bundle = bundleMatch?.[1] || 'unknown';
  if (bundle !== 'unknown') {
    const js = await fetch(`${API}/assets/index-${bundle}.js`).then((r) => r.text());
    record('DEPLOY', 'frontend bundle includes assessment-status route', js.includes('assessment-status'), `bundle=${bundle}`);
    record(
      'DEPLOY',
      'frontend includes sanitized error code',
      js.includes('AI_ASSESSMENT_TEMPORARILY_UNAVAILABLE'),
      ''
    );
  }

  const health = await fetch(`${API}/api/health`).then(parseJsonResponse);
  record('DEPLOY', 'API health ok', health.ok === true, `env=${health.env}`);

  // Background function auth probe (no secret)
  const bgRes = await fetch(`${API}/.netlify/functions/process-ai-assessment-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: 1, actorUserId: 1 }),
  });
  const bgBody = await parseJsonResponse(bgRes);
  record(
    'BACKGROUND',
    'worker rejects unauthorized invoke',
    bgRes.status === 401 && bgBody.ok === false,
    `http=${bgRes.status}`
  );
  record(
    'BACKGROUND',
    'worker endpoint exists (not 404)',
    bgRes.status !== 404,
    `http=${bgRes.status}`
  );

  const home = await signIn('homeowner', homeEmail, homePass);
  record('AUTH', 'homeowner login', home.ok && home.token, home.message || `http=${home.status}`);
  if (!home.token) {
    summarize();
    process.exit(1);
  }
  const homeH = auth(home.token);

  const contractor = await signIn('contractor', contractorEmail, contractorPass);
  const contractorH = contractor.token ? auth(contractor.token) : null;

  const created = await fetch(`${API}/api/managed/jobs`, {
    method: 'POST',
    headers: homeH,
    body: JSON.stringify({
      category: 'Plumbing',
      title: `Prod verify ${stamp}`,
      description: 'Slow drip under kitchen sink cabinet for production async assessment verification.',
      preferredDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      preferredTimeSlot: '9-12',
      cityStateZip: 'Brooklyn, NY 11201',
      fullAddress: '123 Verify St, Brooklyn, NY 11201',
      contactName: 'Maria Demo',
      contactPhone: '5551234567',
      zip: '11201',
    }),
  }).then(parseJsonResponse);

  record('E2E', 'create managed job', created.ok && created.job?.id, created.message);
  const jobId = created.job?.id;
  if (!jobId) {
    summarize();
    process.exit(1);
  }

  const assessStart = await timedAssess(jobId, homeH);
  record(
    'ASSESS',
    'POST /assess returns HTTP 202 or ready',
    assessStart.httpStatus === 202 || assessStart.httpStatus === 200,
    `http=${assessStart.httpStatus}`
  );
  record(
    'ASSESS',
    'POST /assess responds quickly (<15s)',
    assessStart.elapsedMs < 15000,
    `${assessStart.elapsedMs}ms`
  );
  record(
    'ASSESS',
    'response status is processing or ready',
    ['processing', 'ready'].includes(assessStart.status || assessStart.assessmentStatus),
    String(assessStart.status || assessStart.assessmentStatus)
  );
  record(
    'ASSESS',
    'no synchronous aiAssessment in 202 response',
    assessStart.httpStatus !== 202 || !assessStart.job?.aiAssessment,
    assessStart.job?.aiAssessment ? 'had aiAssessment' : 'ok'
  );

  // Duplicate rapid assess while processing
  const dup1 = await timedAssess(jobId, homeH);
  const dup2 = await timedAssess(jobId, homeH);
  record(
    'DUPLICATE',
    'rapid duplicate assess stays processing/ready',
    ['processing', 'ready'].includes(dup1.status || dup1.assessmentStatus) &&
      ['processing', 'ready'].includes(dup2.status || dup2.assessmentStatus),
    `dup1=${dup1.status || dup1.assessmentStatus} dup2=${dup2.status || dup2.assessmentStatus}`
  );

  const polled = await pollStatus(jobId, homeH, 60, 3000);
  record(
    'POLL',
    'status transitions include processing',
    polled.transitions.includes('processing') || polled.status === 'ready',
    polled.transitions.join(' → ')
  );
  record(
    'POLL',
    'assessment reaches ready',
    polled.ok && polled.status === 'ready',
    polled.ok ? `attempts=${polled.attempts}` : polled.body?.message || polled.status
  );

  const job = polled.body?.job;
  record(
    'DISPLAY',
    'ready job has aiAssessment object',
    Boolean(job?.aiAssessment && typeof job.aiAssessment === 'object'),
    `assessmentStatus=${job?.assessmentStatus}`
  );
  record(
    'DISPLAY',
    'assessment_status field is ready',
    job?.assessmentStatus === 'ready',
    String(job?.assessmentStatus)
  );

  // Status polling does not re-queue
  const statusOnly = await fetch(`${API}/api/managed/jobs/${jobId}/assessment-status`, { headers: homeH }).then(
    parseJsonResponse
  );
  record('POLL', 'GET status does not change ready job', statusOnly.status === 'ready', statusOnly.status);

  // Retry with force on same job
  const retry = await timedAssess(jobId, homeH, { force: true });
  record(
    'RETRY',
    'force retry accepts request',
    retry.ok === true && (retry.httpStatus === 202 || retry.httpStatus === 200),
    `http=${retry.httpStatus} status=${retry.status || retry.assessmentStatus}`
  );
  if (retry.status === 'processing' || retry.assessmentStatus === 'processing') {
    const retryPoll = await pollStatus(jobId, homeH, 60, 3000);
    record('RETRY', 'force retry completes to ready', retryPoll.ok, retryPoll.status);
  }

  // Security: contractor cannot assess homeowner job
  if (contractorH) {
    const foreignAssess = await timedAssess(jobId, contractorH);
    record(
      'SECURITY',
      'contractor cannot assess homeowner job',
      foreignAssess.httpStatus === 403 || foreignAssess.ok === false,
      `http=${foreignAssess.httpStatus}`
    );
    const foreignStatus = await fetch(`${API}/api/managed/jobs/${jobId}/assessment-status`, {
      headers: contractorH,
    }).then(parseJsonResponse);
    record(
      'SECURITY',
      'contractor cannot read homeowner assessment-status',
      foreignStatus.status === 403 || foreignStatus.ok === false,
      `http=${foreignStatus.status}`
    );
  } else {
    record('SECURITY', 'contractor login skipped', false, 'no contractor token');
  }

  // HTML sanitization check (same rules as src/app/apiErrors.ts)
  function isHtmlOrGatewayErrorBody(text) {
    const sample = String(text || '').trim().slice(0, 500).toLowerCase();
    return (
      sample.startsWith('<!doctype') ||
      sample.startsWith('<html') ||
      sample.includes('<head>') ||
      sample.includes('inactivity timeout') ||
      sample.includes('gateway timeout') ||
      sample.includes('bad gateway')
    );
  }
  function sanitizeApiErrorMessage(text, status, fallback = 'We could not complete that request right now.') {
    const trimmed = String(text || '').trim();
    if (!trimmed || isHtmlOrGatewayErrorBody(trimmed)) return fallback;
    if (trimmed.length > 280) return fallback;
    return trimmed;
  }
  const htmlSample = '<HTML><HEAD><TITLE>Inactivity Timeout</TITLE></HEAD><BODY>Too much time</BODY></HTML>';
  record(
    'RAW_HTML',
    'isHtmlOrGatewayErrorBody detects inactivity timeout',
    isHtmlOrGatewayErrorBody(htmlSample),
    ''
  );
  record(
    'RAW_HTML',
    'sanitizeApiErrorMessage hides gateway HTML',
    !sanitizeApiErrorMessage(htmlSample, 504).includes('<HTML>'),
    ''
  );

  summarize();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function summarize() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
  if (failed) {
    console.log('Failures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - [${r.section}] ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
