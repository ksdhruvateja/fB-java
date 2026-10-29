import { clampString } from './security.js';

const MAX_TITLE = 200;
const MAX_MESSAGE = 2000;

export async function initInAppNotificationSchema(pool) {
  await pool.query(`
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_role TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id BIGINT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, read, archived_at, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_archived
    ON notifications (user_id, archived_at, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_job
    ON notifications (job_id, created_at DESC)
    WHERE job_id IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON notifications (entity_type, entity_id)
    WHERE entity_type IS NOT NULL
  `);
}

export function defaultNotificationActionUrl({
  type,
  userRole = null,
  jobId = null,
  entityType = null,
  entityId = null,
} = {}) {
  const t = String(type || '').toLowerCase();
  const role = String(userRole || '').toLowerCase();
  const eid = entityId != null && Number.isFinite(Number(entityId)) ? Number(entityId) : null;
  const jid = jobId != null && Number.isFinite(Number(jobId)) ? Number(jobId) : null;
  const et = String(entityType || '').toLowerCase();

  if (et === 'conversation' && eid) {
    if (role === 'admin') return `/admin?tab=communications&conversation=${eid}`;
    if (role === 'contractor') return `/contractor?tab=messages&conversation=${eid}`;
    return `/homeowner?tab=inbox&conversation=${eid}`;
  }
  if (et === 'dispute' && eid) {
    if (role === 'admin') return `/admin?tab=disputes&dispute=${eid}`;
    return jid ? `/homeowner?tab=jobs&job=${jid}&focus=dispute` : '/homeowner?tab=jobs';
  }
  if (et === 'payout' && eid) {
    if (role === 'admin') return `/admin?tab=finance&payout=${eid}`;
    return `/contractor?tab=payouts&payout=${eid}`;
  }
  if (et === 'quote' && jid) {
    if (role === 'admin') return `/admin?job=${jid}&tab=quotes`;
    return `/homeowner?tab=jobs&job=${jid}&focus=quote`;
  }
  if (et === 'invoice' && jid) {
    return `/homeowner?tab=jobs&job=${jid}&focus=invoice`;
  }
  if (t.includes('compliance') && role === 'contractor') {
    return '/contractor?tab=compliance';
  }
  if (t.includes('invite') && role === 'contractor' && jid) {
    return `/contractor?tab=invites&job=${jid}`;
  }
  if (jid) {
    if (role === 'admin') return `/admin?job=${jid}`;
    if (role === 'contractor') return `/contractor?tab=jobs&job=${jid}`;
    if (t.includes('quote')) return `/homeowner?tab=jobs&job=${jid}&focus=quote`;
    if (t.includes('invoice') || t.includes('payment')) return `/homeowner?tab=jobs&job=${jid}&focus=invoice`;
    if (
      t.includes('dispatch') ||
      t.includes('arriv') ||
      t.includes('technician') ||
      t.includes('assigned') ||
      t.includes('travel')
    ) {
      return `/homeowner?tab=jobs&job=${jid}&focus=tracking`;
    }
    if (t.includes('complete')) return `/homeowner?tab=jobs&job=${jid}&focus=completion`;
    return `/homeowner?tab=jobs&job=${jid}`;
  }
  return null;
}

function rowToNotification(r) {
  const read = r.read === true || Boolean(r.read_at);
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userRole: r.user_role || null,
    jobId: r.job_id != null ? Number(r.job_id) : null,
    type: r.type,
    title: r.title,
    message: r.message,
    entityType: r.entity_type || null,
    entityId: r.entity_id != null ? Number(r.entity_id) : null,
    actionUrl: r.action_url || null,
    metadata: r.metadata || null,
    read,
    readAt: r.read_at || null,
    archivedAt: r.archived_at || null,
    createdAt: r.created_at,
  };
}

export async function createInAppNotification(pool, {
  userId,
  userRole = null,
  jobId = null,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  actionUrl = null,
  metadata = null,
}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const safeTitle = clampString(title, MAX_TITLE);
  const safeMessage = clampString(message, MAX_MESSAGE);
  const safeType = clampString(type, 80);
  if (!safeType || !safeTitle) return null;

  const resolvedUrl =
    actionUrl ||
    defaultNotificationActionUrl({
      type: safeType,
      userRole,
      jobId,
      entityType,
      entityId,
    });

  const { rows } = await pool.query(
    `INSERT INTO notifications
      (user_id, user_role, job_id, type, title, message, entity_type, entity_id, action_url, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      uid,
      userRole ? clampString(userRole, 40) : null,
      jobId != null ? Number(jobId) : null,
      safeType,
      safeTitle,
      safeMessage,
      entityType ? clampString(entityType, 60) : null,
      entityId != null ? Number(entityId) : null,
      resolvedUrl ? clampString(resolvedUrl, 500) : null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0] ? rowToNotification(rows[0]) : null;
}

export async function notifyAdmins(pool, { type, title, message, jobId = null, entityType = null, entityId = null, actionUrl = null, metadata = null }) {
  const { rows: admins } = await pool.query(
    `SELECT id, role FROM users WHERE role='admin' AND is_blocked IS NOT TRUE`,
  );
  const created = [];
  for (const admin of admins) {
    const n = await createInAppNotification(pool, {
      userId: admin.id,
      userRole: 'admin',
      jobId,
      type,
      title,
      message,
      entityType,
      entityId,
      actionUrl,
      metadata,
    });
    if (n) created.push(n);
  }
  return created;
}

export function registerInAppNotificationRoutes(app, { pool, requireAuth }) {
  app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE user_id=$1 AND read=false AND archived_at IS NULL`,
        [req.authUser.id],
      );
      return res.json({ ok: true, count: rows[0]?.count || 0 });
    } catch (e) {
      console.error('notifications unread-count:', e);
      return res.status(500).json({ ok: false, message: 'Could not load notification count.' });
    }
  });

  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const filter = String(req.query.filter || 'all');
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      let where = 'user_id=$1 AND archived_at IS NULL';
      if (filter === 'unread') where += ' AND read=false';
      if (filter === 'archived') where = 'user_id=$1 AND archived_at IS NOT NULL';

      const { rows } = await pool.query(
        `SELECT * FROM notifications WHERE ${where}
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.authUser.id, limit, offset],
      );
      return res.json({ ok: true, notifications: rows.map(rowToNotification) });
    } catch (e) {
      console.error('list notifications:', e);
      return res.status(500).json({ ok: false, message: 'Could not load notifications.' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query(
        `UPDATE notifications SET read=true, read_at=COALESCE(read_at, NOW())
         WHERE user_id=$1 AND id=$2`,
        [req.authUser.id, id],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('mark notification read:', e);
      return res.status(500).json({ ok: false, message: 'Could not mark notification read.' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE notifications SET read=true, read_at=COALESCE(read_at, NOW())
         WHERE user_id=$1 AND read=false AND archived_at IS NULL`,
        [req.authUser.id],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('mark all notifications read:', e);
      return res.status(500).json({ ok: false, message: 'Could not mark notifications read.' });
    }
  });

  app.post('/api/notifications/:id/archive', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await pool.query(
        `UPDATE notifications SET archived_at=NOW(), read=true, read_at=COALESCE(read_at, NOW())
         WHERE user_id=$1 AND id=$2`,
        [req.authUser.id, id],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('archive notification:', e);
      return res.status(500).json({ ok: false, message: 'Could not archive notification.' });
    }
  });

  app.post('/api/notifications/archive-read', requireAuth, async (req, res) => {
    try {
      await pool.query(
        `UPDATE notifications SET archived_at=NOW()
         WHERE user_id=$1 AND read=true AND archived_at IS NULL`,
        [req.authUser.id],
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('archive read notifications:', e);
      return res.status(500).json({ ok: false, message: 'Could not clear read notifications.' });
    }
  });

  // Backward-compatible bulk read endpoint
  app.post('/api/notifications/read', requireAuth, async (req, res) => {
    try {
      const { ids } = req.body || {};
      if (Array.isArray(ids) && ids.length > 0) {
        const normalizedIds = ids.map(Number).filter((n) => Number.isFinite(n));
        for (const id of normalizedIds) {
          await pool.query(
            `UPDATE notifications SET read=true, read_at=COALESCE(read_at, NOW())
             WHERE user_id=$1 AND id=$2`,
            [req.authUser.id, id],
          );
        }
      } else {
        await pool.query(
          `UPDATE notifications SET read=true, read_at=COALESCE(read_at, NOW())
           WHERE user_id=$1 AND read=false`,
          [req.authUser.id],
        );
      }
      const { rows } = await pool.query(
        'SELECT * FROM notifications WHERE user_id=$1 AND archived_at IS NULL ORDER BY created_at DESC LIMIT 50',
        [req.authUser.id],
      );
      return res.json(rows.map(rowToNotification));
    } catch (e) {
      console.error('mark notifications read:', e);
      return res.status(500).json({ error: 'Server error' });
    }
  });
}

export { rowToNotification };
