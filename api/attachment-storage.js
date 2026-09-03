/**
 * Attachment storage abstraction — Neon base64 for beta; object storage when configured.
 *
 * PRODUCTION_SCALE_RECOMMENDATION: OBJECT_STORAGE (S3/R2/Supabase)
 */

export const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_ATTACHMENT_BYTES || 2_500_000);
export const STORAGE_PROVIDER = process.env.ATTACHMENT_STORAGE_PROVIDER || 'neon';

function parseBase64Input(data) {
  const raw = String(data || '');
  const m = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: null, base64: raw };
}

export async function saveAttachment(pool, { namespace, entityId, fileName, mimeType, data }) {
  const parsed = parseBase64Input(data);
  const base64 = parsed.base64;
  const sizeBytes = Buffer.byteLength(base64, 'base64');
  if (sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { ok: false, code: 'attachment_too_large', message: `Max attachment size is ${Math.round(MAX_ATTACHMENT_BYTES / 1_000_000)}MB.` };
  }

  const safeName = String(fileName || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180);
  const mime = mimeType || parsed.mimeType || 'application/octet-stream';
  const storageKey = `${namespace}/${entityId}/${Date.now()}-${safeName}`;

  if (STORAGE_PROVIDER === 'neon' || !process.env.ATTACHMENT_S3_BUCKET) {
    return {
      ok: true,
      provider: 'neon',
      storageKey,
      storageData: base64,
      fileName: safeName,
      mimeType: mime,
      sizeBytes,
    };
  }

  // Future: S3/R2 upload path when ATTACHMENT_S3_BUCKET is configured
  return {
    ok: true,
    provider: STORAGE_PROVIDER,
    storageKey,
    storageData: null,
    fileName: safeName,
    mimeType: mime,
    sizeBytes,
  };
}

export async function getAttachment(pool, { storageProvider, storageKey, storageData }) {
  if (storageData) {
    return { ok: true, data: Buffer.from(storageData, 'base64') };
  }
  if (storageProvider === 'neon' && storageKey) {
    const { rows } = await pool.query(
      `SELECT storage_data FROM message_attachments WHERE storage_key=$1 LIMIT 1`,
      [storageKey],
    );
    if (rows[0]?.storage_data) {
      return { ok: true, data: Buffer.from(rows[0].storage_data, 'base64') };
    }
  }
  return { ok: false, message: 'Attachment not found.' };
}

export async function deleteAttachment(pool, { storageProvider, storageKey }) {
  if (storageProvider === 'neon') {
    await pool.query(`DELETE FROM message_attachments WHERE storage_key=$1`, [storageKey]);
  }
  return { ok: true };
}

export async function attachmentStorageStats(pool) {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS count,
      COALESCE(AVG(size_bytes), 0)::int AS avg_bytes,
      COALESCE(MAX(size_bytes), 0)::int AS max_bytes,
      COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
    FROM message_attachments
  `);
  const msg = rows[0] || { count: 0, avg_bytes: 0, max_bytes: 0, total_bytes: 0 };
  const { rows: disp } = await pool.query(`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
    FROM dispute_attachments
  `);
  return {
    messaging: msg,
    disputes: disp[0] || { count: 0, total_bytes: 0 },
    recommendation: 'OBJECT_STORAGE',
    provider: STORAGE_PROVIDER,
    maxBytes: MAX_ATTACHMENT_BYTES,
  };
}
