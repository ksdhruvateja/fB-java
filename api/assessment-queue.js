import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

/*
 * Durable AI-assessment queue in PostgreSQL.
 *
 * - Survives restarts and deploys: work is a row, not an in-memory callback.
 * - Any number of API or worker instances can process it: rows are claimed with
 *   FOR UPDATE SKIP LOCKED, so each assessment runs once.
 * - Bounded: each instance runs at most FIXERA_WORKER_CONCURRENCY assessments at a time, so a
 *   burst of requests queues instead of overloading the AI provider or the database.
 * - Fair: a homeowner never has more than one assessment running while others are waiting, so
 *   one heavy user cannot delay everyone else.
 * - Recovers work held by an instance that died (lock older than FIXERA_QUEUE_STALE_MS).
 */

const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const MAX_ATTEMPTS = 3;

export async function ensureAssessmentQueueSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fixera_assessment_queue (
      id            BIGSERIAL PRIMARY KEY,
      record_type   TEXT NOT NULL,
      record_id     BIGINT NOT NULL,
      actor_user_id INT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'queued',
      attempts      INT NOT NULL DEFAULT 0,
      available_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_by     TEXT,
      locked_at     TIMESTAMPTZ,
      last_error    TEXT,
      result_code   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // One open entry per case: re-submitting while queued or running does not add work.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fixera_queue_open_case
      ON fixera_assessment_queue (record_type, record_id) WHERE status IN ('queued','running')
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fixera_queue_claim
      ON fixera_assessment_queue (status, available_at, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fixera_queue_user_running
      ON fixera_assessment_queue (actor_user_id) WHERE status = 'running'
  `);
}

export async function enqueueAssessment(pool, { recordType, recordId, actorUserId }) {
  const { rows } = await pool.query(
    `INSERT INTO fixera_assessment_queue (record_type, record_id, actor_user_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (record_type, record_id) WHERE status IN ('queued','running') DO NOTHING
     RETURNING id`,
    [recordType, recordId, actorUserId]
  );
  return { queued: Boolean(rows[0]), id: rows[0] ? Number(rows[0].id) : null };
}

async function claimNext(pool) {
  const { rows } = await pool.query(
    `UPDATE fixera_assessment_queue q
        SET status='running', locked_by=$1, locked_at=NOW(), attempts=q.attempts+1, updated_at=NOW()
      WHERE q.id = (
        SELECT c.id FROM fixera_assessment_queue c
         WHERE c.status='queued' AND c.available_at <= NOW()
           AND NOT EXISTS (
             SELECT 1 FROM fixera_assessment_queue r
              WHERE r.status='running' AND r.actor_user_id = c.actor_user_id
           )
         ORDER BY c.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [WORKER_ID]
  );
  return rows[0] || null;
}

async function recoverStale(pool, staleMs) {
  await pool.query(
    `UPDATE fixera_assessment_queue
        SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,
            last_error = COALESCE(last_error, 'worker_lost'),
            locked_by = NULL, locked_at = NULL, updated_at = NOW()
      WHERE status='running' AND locked_at < NOW() - ($1::text || ' milliseconds')::interval`,
    [String(staleMs), MAX_ATTEMPTS]
  );
}

async function finish(pool, item, { ok, code, error }) {
  if (error && item.attempts < MAX_ATTEMPTS) {
    const backoffSeconds = 15 * 2 ** (item.attempts - 1);
    await pool.query(
      `UPDATE fixera_assessment_queue
          SET status='queued', available_at=NOW() + ($2::text || ' seconds')::interval,
              last_error=$3, locked_by=NULL, locked_at=NULL, updated_at=NOW()
        WHERE id=$1`,
      [item.id, String(backoffSeconds), String(error).slice(0, 500)]
    );
    return;
  }
  await pool.query(
    `UPDATE fixera_assessment_queue
        SET status=$2, result_code=$3, last_error=$4, locked_by=NULL, locked_at=NULL, updated_at=NOW()
      WHERE id=$1`,
    [item.id, error ? 'failed' : 'done', code || (ok ? 'ok' : null), error ? String(error).slice(0, 500) : null]
  );
}

/**
 * Starts the queue worker for this instance. `processor(pool, payload)` is the existing
 * assessment processor. Returns { kick, stop, stats }.
 */
export function startAssessmentQueueWorker(pool, processor, {
  concurrency = Number(process.env.FIXERA_WORKER_CONCURRENCY || 4),
  pollMs = Number(process.env.FIXERA_QUEUE_POLL_MS || 2000),
  staleMs = Number(process.env.FIXERA_QUEUE_STALE_MS || 10 * 60 * 1000),
} = {}) {
  let running = 0;
  let stopped = false;
  let pumping = false;
  let lastRecover = 0;
  const stats = { processed: 0, failed: 0, workerId: WORKER_ID };

  async function runOne(item) {
    const payload = item.record_type === 'pending_service_request'
      ? { pendingServiceRequestId: Number(item.record_id), actorUserId: item.actor_user_id, recordType: item.record_type }
      : { jobId: Number(item.record_id), actorUserId: item.actor_user_id, recordType: 'managed_job' };
    try {
      const result = await processor(pool, payload);
      await finish(pool, item, { ok: result?.ok !== false, code: result?.code });
      stats.processed += 1;
    } catch (e) {
      stats.failed += 1;
      await finish(pool, item, { error: e?.message || String(e) }).catch(() => {});
    }
  }

  async function pump() {
    if (pumping || stopped) return;
    pumping = true;
    try {
      if (Date.now() - lastRecover > Math.min(staleMs, 60_000)) {
        lastRecover = Date.now();
        await recoverStale(pool, staleMs).catch(() => {});
      }
      while (!stopped && running < concurrency) {
        const item = await claimNext(pool);
        if (!item) break;
        running += 1;
        runOne(item).finally(() => {
          running -= 1;
          setImmediate(pump);
        });
      }
    } catch (e) {
      console.warn('[assessment-queue] poll failed', e?.message || e);
    } finally {
      pumping = false;
    }
  }

  const timer = setInterval(pump, pollMs);
  timer.unref?.();
  setImmediate(pump);
  return {
    kick: () => setImmediate(pump),
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    stats: () => ({ ...stats, running, concurrency }),
  };
}
