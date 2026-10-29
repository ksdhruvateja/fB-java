import {
  isObjectRef,
  objectStorageEnabled,
  presignedUrlForRef,
  putDataUrl,
  resolveMediaDataUrl as resolveObjectRef,
} from './object-storage.js';

/*
 * Where case photos live.
 *
 * Default (Neon): the photo bytes are stored once, as BYTEA, in media_objects.bytes. The case rows
 * (managed_jobs / pending_service_requests.media_data_url) keep only a short reference
 * "neonmedia:<media_objects.id>". Queries that read whole job rows therefore no longer pull photos
 * out of Neon, and the bytes take about a quarter less space than base64 text.
 *
 * Optional (MEDIA_STORAGE=s3): bytes go to an S3-compatible bucket instead (object-storage.js).
 *
 * Older rows that still hold a full "data:" URL keep working everywhere;
 * scripts/migrate-case-photos.mjs moves them to the configured store.
 */

export const NEON_REF_PREFIX = 'neonmedia:';

export function mediaBackend() {
  return objectStorageEnabled() ? 's3' : 'neon';
}

export function isNeonRef(value) {
  return typeof value === 'string' && value.startsWith(NEON_REF_PREFIX);
}

/** A stored reference (Neon or bucket) rather than the photo itself. */
export function isMediaRef(value) {
  return isNeonRef(value) || isObjectRef(value);
}

function neonId(ref) {
  const id = Number(ref.slice(NEON_REF_PREFIX.length));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) return null;
  return { contentType: m[1].toLowerCase(), body: Buffer.from(m[2], 'base64') };
}

/**
 * Stores photo bytes for a media_objects row. Returns { data_url, bytes } column values:
 * Neon keeps the bytes in the row; S3 keeps a bucket reference in data_url.
 */
export async function prepareStoredMedia(dataUrl, { prefix }) {
  if (mediaBackend() === 's3') {
    return { data_url: await putDataUrl(dataUrl, { prefix }), bytes: null };
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('Repair photo/video data is invalid.');
  return { data_url: null, bytes: parsed.body };
}

/** The reference a case row should hold for a stored media_objects row. */
export function referenceForMediaRow(row) {
  if (!row) return null;
  if (isObjectRef(row.data_url)) return row.data_url;
  if (row.has_bytes === true || row.bytes) return `${NEON_REF_PREFIX}${row.id}`;
  return null;
}

/** Bytes and type for a reference or data URL. { redirect } for a bucket reference when wanted. */
export async function readMedia(pool, value, { allowRedirect = false } = {}) {
  if (!value) return null;
  if (isNeonRef(value)) {
    const id = neonId(value);
    if (!id) return null;
    const { rows } = await pool.query(`SELECT content_type, bytes, data_url FROM media_objects WHERE id=$1`, [id]);
    const row = rows[0];
    if (!row) return null;
    if (row.bytes) return { contentType: row.content_type || 'application/octet-stream', body: Buffer.from(row.bytes) };
    return row.data_url ? readMedia(pool, row.data_url, { allowRedirect }) : null;
  }
  if (isObjectRef(value)) {
    if (allowRedirect) return { redirect: presignedUrlForRef(value) };
    const url = await resolveObjectRef(value);
    return url ? parseDataUrl(url) : null;
  }
  return parseDataUrl(value);
}

/** A data URL for the AI pipeline (it needs the bytes). Unreadable media returns null. */
export async function resolveMediaDataUrl(pool, value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('data:')) return value;
  try {
    const media = await readMedia(pool, value);
    return media ? `data:${media.contentType};base64,${media.body.toString('base64')}` : null;
  } catch (e) {
    console.warn('[media] read failed', e?.message || e);
    return null;
  }
}
