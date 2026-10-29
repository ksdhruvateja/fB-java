/**
 * Attachment storage abstraction — Neon/database for beta; object storage when configured.
 *
 * PRODUCTION_SCALE_RECOMMENDATION: OBJECT_STORAGE (S3/R2) before public scale.
 */

const PROVIDER_ALIASES = {
  database: 'database',
  neon: 'database',
  db: 'database',
  object: 'object',
  s3: 'object',
};

function resolveProvider() {
  const raw = String(process.env.ATTACHMENT_STORAGE_PROVIDER || 'database').trim().toLowerCase();
  const mapped = PROVIDER_ALIASES[raw] || 'database';
  if (mapped === 'object') {
    // Object adapter is not implemented in this beta. Keep database to avoid silent data loss.
    return 'database';
  }
  return 'database';
}

export const STORAGE_PROVIDER = resolveProvider();

const sizeMbRaw = Number(process.env.MAX_ATTACHMENT_SIZE_MB);
export const MAX_ATTACHMENT_SIZE_MB =
  Number.isFinite(sizeMbRaw) && sizeMbRaw > 0 ? Math.min(sizeMbRaw, 10) : 2.5;
export const MAX_ATTACHMENT_BYTES = Math.round(MAX_ATTACHMENT_SIZE_MB * 1_000_000);
export const MAX_ATTACHMENTS_PER_MESSAGE = Math.min(
  10,
  Math.max(1, Number(process.env.MAX_ATTACHMENTS_PER_MESSAGE) || 5),
);

function parseBase64Input(data) {
  const raw = String(data || '');
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: null, base64: raw };
}

export async function saveAttachment(pool, {
  namespace,
  entityId,
  fileName,
  mimeType,
  data,
  uploaderUserId = null,
}) {
  const parsed = parseBase64Input(data);
  const base64 = parsed.base64;
  const sizeBytes = Buffer.byteLength(base64, 'base64');
  if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      code: 'attachment_too_large',
      message: `Max attachment size is ${MAX_ATTACHMENT_SIZE_MB}MB.`,
    };
  }

  const safeName = String(fileName || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180);
  const mime = mimeType || parsed.mimeType || 'application/octet-stream';
  const storageKey = `${namespace}/${entityId}/${Date.now()}-${safeName}`;
  const provider = STORAGE_PROVIDER;

  if (provider === 'database') {
    return {
      ok: true,
      provider: 'database',
      storageKey,
      storageData: base64,
      fileName: safeName,
      mimeType: mime,
      sizeBytes,
      uploaderUserId,
    };
  }

  return {
    ok: true,
    provider,
    storageKey,
    storageData: null,
    fileName: safeName,
    mimeType: mime,
    sizeBytes,
    uploaderUserId,
  };
}

export async function getAttachmentMetadata(pool, { id, namespace = 'message' }) {
  if (namespace === 'dispute') {
    const { rows } = await pool.query(
      `SELECT id, dispute_id AS entity_id, file_name, mime_type, size_bytes, storage_provider, storage_key, created_at
       FROM dispute_attachments WHERE id=$1`,
      [id],
    );
    if (!rows[0]) return { ok: false, message: 'Attachment not found.' };
    return { ok: true, attachment: serializeMeta(rows[0], 'dispute') };
  }
  const { rows } = await pool.query(
    `SELECT id, message_id, conversation_id, uploader_user_id, file_name, mime_type, byte_size AS size_bytes,
            storage_provider, storage_key, created_at
     FROM message_attachments WHERE id=$1`,
    [id],
  );
  if (!rows[0]) return { ok: false, message: 'Attachment not found.' };
  return { ok: true, attachment: serializeMeta(rows[0], 'message') };
}

function serializeMeta(row, namespace) {
  return {
    id: Number(row.id),
    namespace,
    entityId: row.entity_id != null ? Number(row.entity_id) : row.message_id != null ? Number(row.message_id) : null,
    messageId: row.message_id != null ? Number(row.message_id) : null,
    conversationId: row.conversation_id != null ? Number(row.conversation_id) : null,
    disputeId: namespace === 'dispute' ? Number(row.entity_id) : null,
    uploaderUserId: row.uploader_user_id != null ? Number(row.uploader_user_id) : null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    provider: row.storage_provider || 'database',
    storageKey: row.storage_key || null,
    createdAt: row.created_at,
  };
}

export async function getAttachment(pool, { id = null, namespace = 'message', storageProvider, storageKey, storageData }) {
  if (storageData) {
    return { ok: true, data: Buffer.from(storageData, 'base64') };
  }
  const provider = storageProvider || STORAGE_PROVIDER;
  if (id && namespace === 'dispute') {
    const { rows } = await pool.query(
      `SELECT storage_data, storage_provider, storage_key FROM dispute_attachments WHERE id=$1`,
      [id],
    );
    if (rows[0]?.storage_data) return { ok: true, data: Buffer.from(rows[0].storage_data, 'base64') };
  }
  if (id && namespace === 'message') {
    const { rows } = await pool.query(
      `SELECT storage_data, storage_provider, storage_key FROM message_attachments WHERE id=$1`,
      [id],
    );
    if (rows[0]?.storage_data) return { ok: true, data: Buffer.from(rows[0].storage_data, 'base64') };
  }
  if ((provider === 'database' || provider === 'neon') && storageKey) {
    const { rows } = await pool.query(
      `SELECT storage_data FROM message_attachments WHERE storage_key=$1 LIMIT 1`,
      [storageKey],
    );
    if (rows[0]?.storage_data) {
      return { ok: true, data: Buffer.from(rows[0].storage_data, 'base64') };
    }
    const { rows: disp } = await pool.query(
      `SELECT storage_data FROM dispute_attachments WHERE storage_key=$1 LIMIT 1`,
      [storageKey],
    );
    if (disp[0]?.storage_data) {
      return { ok: true, data: Buffer.from(disp[0].storage_data, 'base64') };
    }
  }
  return { ok: false, message: 'Attachment not found.' };
}

export async function deleteAttachment(pool, { id = null, namespace = 'message', storageProvider, storageKey }) {
  if (namespace === 'dispute' && id) {
    await pool.query(`DELETE FROM dispute_attachments WHERE id=$1`, [id]);
    return { ok: true };
  }
  if (id) {
    await pool.query(`DELETE FROM message_attachments WHERE id=$1`, [id]);
    return { ok: true };
  }
  if (storageKey) {
    await pool.query(`DELETE FROM message_attachments WHERE storage_key=$1`, [storageKey]);
    await pool.query(`DELETE FROM dispute_attachments WHERE storage_key=$1`, [storageKey]).catch(() => {});
  }
  return { ok: true };
}

export async function attachmentStorageStats(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(AVG(byte_size), 0)::int AS avg_bytes,
      COALESCE(MAX(byte_size), 0)::int AS max_bytes,
      COALESCE(SUM(byte_size), 0)::bigint AS total_bytes
    FROM message_attachments
  `);
  const msg = rows[0] || { count: 0, avg_bytes: 0, max_bytes: 0, total_bytes: 0 };
  const { rows: disp } = await pool.query(`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(AVG(size_bytes), 0)::int AS avg_bytes,
      COALESCE(MAX(size_bytes), 0)::int AS max_bytes,
      COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
    FROM dispute_attachments
  `);
  const d = disp[0] || { count: 0, avg_bytes: 0, max_bytes: 0, total_bytes: 0 };
  const totalCount = Number(msg.count || 0) + Number(d.count || 0);
  const totalBytes = Number(msg.total_bytes || 0) + Number(d.total_bytes || 0);
  const maxBytes = Math.max(Number(msg.max_bytes || 0), Number(d.max_bytes || 0));
  const avgBytes = totalCount > 0 ? Math.round(totalBytes / totalCount) : 0;
  return {
    provider: STORAGE_PROVIDER,
    maxAttachmentSizeMb: MAX_ATTACHMENT_SIZE_MB,
    maxAttachmentsPerMessage: MAX_ATTACHMENTS_PER_MESSAGE,
    messaging: msg,
    disputes: d,
    totals: {
      count: totalCount,
      totalBytes,
      averageBytes: avgBytes,
      largestBytes: maxBytes,
      estimatedDbGrowthMb: Math.round((totalBytes / 1_000_000) * 10) / 10,
    },
    recommendation: 'OBJECT_STORAGE',
    objectStorageNeededBefore: 'PUBLIC_SCALE',
  };
}

export function registerAttachmentAdminRoutes(app, { pool, requireAuth, requireAdmin }) {
  app.get('/api/admin/attachments/stats', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const stats = await attachmentStorageStats(pool);
      return res.json({ ok: true, stats });
    } catch (e) {
      console.error('attachment stats:', e);
      return res.status(500).json({ ok: false, message: 'Could not load attachment stats.' });
    }
  });
}
