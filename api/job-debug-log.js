import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_LOG_FILE = path.join(__dirname, '..', 'logs', 'fixbridge-jobs-debug.json');
const MAX_EVENTS_PER_JOB = 1000;
const MAX_STRING = 2000;
const MAX_ARRAY = 50;

let writeQueue = Promise.resolve();

function clamp(value) {
  if (typeof value !== 'string') return value;
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
}

function sanitize(value, key = '', depth = 0) {
  if (depth > 5) return '[max-depth]';
  const lower = String(key).toLowerCase();
  if (/(password|passwd|token|secret|authorization|cookie|stripe_signature|refresh_token|access_token)/i.test(lower)) {
    return '[REDACTED]';
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return clamp(value);
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => sanitize(v, key, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) out[k] = sanitize(v, k, depth + 1);
    return out;
  }
  return String(value);
}

function firstPositiveInt(...values) {
  for (const value of values) {
    const match = String(value ?? '').match(/(?:^|[^0-9])(\d+)(?:$|[^0-9])/);
    const n = match ? Number(match[1]) : Number(value);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}

function extractJobId(req, responseBody) {
  const urlMatch = String(req.originalUrl || req.url || '').match(/(?:managed\/jobs|jobs|requests)\/(\d+)/i);
  return firstPositiveInt(
    urlMatch?.[1],
    req.params?.jobId,
    req.params?.managedJobId,
    req.params?.requestId,
    req.query?.jobId,
    req.query?.managedJobId,
    req.body?.jobId,
    req.body?.managedJobId,
    req.body?.requestId,
    responseBody?.job?.id,
    responseBody?.managedJob?.id,
    responseBody?.data?.job?.id,
    responseBody?.id,
  );
}

async function ensureStore(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.jobs && typeof parsed.jobs === 'object') return parsed;
  } catch {}
  return {
    schemaVersion: 1,
    description: 'FixBridge job/request debug log. One JSON object contains jobs 1..N and their request/response/database snapshots.',
    generatedAt: new Date().toISOString(),
    jobs: {},
    unscoped: [],
  };
}

async function enqueueWrite(file, jobId, event) {
  writeQueue = writeQueue.then(async () => {
    const store = await ensureStore(file);
    const key = jobId ? String(jobId) : '_unscoped';
    if (key === '_unscoped') {
      store.unscoped = [...(store.unscoped || []), event].slice(-MAX_EVENTS_PER_JOB);
    } else {
      const job = store.jobs[key] || { jobId: Number(jobId), events: [] };
      job.events = [...(job.events || []), event].slice(-MAX_EVENTS_PER_JOB);
      job.lastSeenAt = event.at;
      store.jobs[key] = job;
    }
    store.generatedAt = new Date().toISOString();
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }).catch((error) => {
    console.error('[JOB DEBUG] failed to write log:', error?.message || error);
  });
  return writeQueue;
}

async function snapshotJob(pool, jobId) {
  const snapshot = { jobId: Number(jobId), at: new Date().toISOString() };
  const queries = {
    managedJob: [`SELECT id, homeowner_user_id, status, assigned_contractor_user_id, assigned_employee_id, active_proposal_id, created_at, updated_at FROM managed_jobs WHERE id=$1 LIMIT 1`, [jobId]],
    invoices: [`SELECT id, invoice_number, job_id, homeowner_user_id, total, paid, amount_due, status, proposal_id, negotiation_id, payment_plan_percent, initial_payment_amount, initial_payment_completed, created_at, updated_at FROM homeowner_invoices WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]],
    bids: [`SELECT id, job_id, contractor_user_id, labor, materials, equipment, travel_diagnostic, permit_cost, disposal, net_total, status, created_at, updated_at FROM bids WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]],
    proposals: [`SELECT id, job_id, quote_number, status, retail_amount, converted_invoice_id, created_at FROM proposals WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]],
    negotiations: [`SELECT id, job_id, proposal_id, homeowner_user_id, requested_amount, admin_amount, action, created_at, resolved_at FROM proposal_negotiations WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]],
    payments: [`SELECT id, job_id, amount, status, payment_type, stripe_session_id, stripe_payment_intent, created_at FROM payments WHERE job_id=$1 ORDER BY created_at DESC, id DESC`, [jobId]],
  };
  for (const [name, [sql, params]] of Object.entries(queries)) {
    try {
      const result = await pool.query(sql, params);
      snapshot[name] = result.rows.map((row) => sanitize(row));
    } catch (error) {
      snapshot[name] = { queryError: error?.message || String(error) };
    }
  }
  return snapshot;
}

export function installJobDebugLogger(app, { pool, requireAdmin, file = DEFAULT_LOG_FILE }) {
  app.use('/api/', (req, res, next) => {
    if (req.path.startsWith('/debug/job-logs')) return next();

    const startedAt = new Date();
    const startedMs = Date.now();
    let responseBody = null;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };
    res.send = (body) => {
      if (responseBody == null && typeof body !== 'string') responseBody = body;
      return originalSend(body);
    };

    res.on('finish', async () => {
      const jobId = extractJobId(req, responseBody);
      const event = {
        at: new Date().toISOString(),
        requestId: req.id || null,
        method: req.method,
        route: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: Date.now() - startedMs,
        userId: req.authUser?.id ? Number(req.authUser.id) : null,
        role: req.authUser?.role || req.authUser?.role_preset || null,
        request: {
          params: sanitize(req.params),
          query: sanitize(req.query),
          body: sanitize(req.body),
        },
        response: sanitize(responseBody),
      };

      if (jobId) {
        try {
          event.database = await snapshotJob(pool, jobId);
        } catch (error) {
          event.database = { snapshotError: error?.message || String(error) };
        }
      }
      await enqueueWrite(file, jobId, event);
    });
    next();
  });

  app.get('/api/debug/job-logs', requireAdmin, async (_req, res) => {
    try {
      await writeQueue;
      const store = await ensureStore(file);
      res.json({ ok: true, file, jobs: store.jobs, unscoped: store.unscoped || [] });
    } catch (error) {
      res.status(500).json({ ok: false, message: error?.message || 'Unable to read job debug log.' });
    }
  });

  app.get('/api/debug/job-logs/:jobId', requireAdmin, async (req, res) => {
    const jobId = Number(req.params.jobId);
    if (!Number.isSafeInteger(jobId) || jobId <= 0) return res.status(400).json({ ok: false, message: 'Invalid jobId.' });
    try {
      await writeQueue;
      const store = await ensureStore(file);
      res.json({ ok: true, jobId, job: store.jobs[String(jobId)] || { jobId, events: [] } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error?.message || 'Unable to read job debug log.' });
    }
  });
}
