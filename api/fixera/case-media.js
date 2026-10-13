import { randomUUID } from 'node:crypto';
import { isObjectRef, objectStorageEnabled, putDataUrl, resolveMediaDataUrl } from '../object-storage.js';

export async function storeFixeraCaseMedia(pool, {
  userId,
  caseType,
  caseId,
  propertyId = null,
  equipmentKey = null,
  dataUrl,
}) {
  const source = String(dataUrl || '');
  if (!source) return null;
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match || source.length > 12_000_000) {
    throw new Error('Repair photo/video data is invalid or too large.');
  }
  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    throw new Error('Only image and video repair media can be attached.');
  }
  const byteSize = Buffer.byteLength(match[2], 'base64');
  if (byteSize <= 0 || byteSize > 8_500_000) {
    throw new Error('Repair media exceeds the supported upload size.');
  }

  const isManagedJob = caseType === 'managed_job';
  if (!isManagedJob && caseType !== 'pending_service_request') {
    throw new Error('Unsupported repair case type.');
  }
  const caseTable = isManagedJob ? 'managed_jobs' : 'pending_service_requests';
  const { rows: cases } = await pool.query(
    `SELECT id, homeowner_user_id, property_id, equipment_key
       FROM ${caseTable}
      WHERE id=$1 AND homeowner_user_id=$2`,
    [caseId, userId]
  );
  const repairCase = cases[0];
  if (!repairCase) throw new Error('Repair case was not found for this homeowner.');
  if (propertyId != null && Number(propertyId) !== Number(repairCase.property_id)) {
    throw new Error('Repair media property does not match its case.');
  }
  if (equipmentKey && repairCase.equipment_key !== equipmentKey) {
    throw new Error('Repair media equipment does not match its case.');
  }

  const storageKey = `fixera/${caseType}/${caseId}/${randomUUID()}`;
  // With object storage on, the bytes go to the bucket (under this case's own prefix) and the
  // row keeps only the reference.
  const stored = objectStorageEnabled()
    ? await putDataUrl(source, { prefix: `cases/${caseType}/${caseId}` })
    : source;
  const { rows } = await pool.query(
    `INSERT INTO media_objects (
       owner_user_id, job_id, pending_service_request_id, case_type, property_id,
       equipment_key, kind, storage_key, content_type, byte_size, data_url
     ) VALUES ($1,$2,$3,$4,$5,$6,'fixera_repair_case',$7,$8,$9,$10)
     RETURNING id, storage_key, content_type, byte_size, created_at, data_url`,
    [
      userId,
      isManagedJob ? caseId : null,
      isManagedJob ? null : caseId,
      caseType,
      repairCase.property_id || null,
      repairCase.equipment_key || null,
      storageKey,
      contentType,
      byteSize,
      stored,
    ]
  );
  return rows[0] || null;
}
/** Photos per repair case that Fixera reads and the homeowner can attach at once. */
export const MAX_CASE_PHOTOS = 5;
const MAX_PHOTO_CHARS = 6_000_000;

/**
 * Reads the photos a request attaches: `mediaDataUrls` (up to MAX_CASE_PHOTOS) plus the legacy
 * single `mediaDataUrl`. The first entry stays the case cover (`media_data_url`).
 * Throws a 400-style error for an invalid list.
 */
export function readCasePhotoList(body = {}, { arrayKey = 'mediaDataUrls', singleKey = 'mediaDataUrl' } = {}) {
  const list = [];
  const single = body?.[singleKey];
  if (typeof single === 'string' && single) list.push(single);
  const extra = body?.[arrayKey];
  if (extra != null && !Array.isArray(extra)) {
    throw Object.assign(new Error('Photos must be sent as a list.'), { code: 'INVALID_PHOTOS' });
  }
  for (const item of extra || []) {
    if (typeof item !== 'string' || !item) continue;
    if (!list.includes(item)) list.push(item);
  }
  if (list.length > MAX_CASE_PHOTOS) {
    throw Object.assign(new Error(`You can attach up to ${MAX_CASE_PHOTOS} photos.`), { code: 'TOO_MANY_PHOTOS' });
  }
  list.forEach((url, index) => {
    // The cover may be a video (existing behaviour); additional items must be photos.
    const ok = index === 0 && url === single ? /^data:(image|video)\//i.test(url) : /^data:image\/(jpeg|jpg|png|webp)/i.test(url);
    if (!ok || url.length > (index === 0 && url === single ? 12_000_000 : MAX_PHOTO_CHARS)) {
      throw Object.assign(new Error('Choose JPEG, PNG or WEBP photos under 6 MB each.'), { code: 'INVALID_PHOTOS' });
    }
  });
  return list;
}

/**
 * Stores each photo as case media. With object storage on, the case's cover column
 * (media_data_url) is switched to the first photo's reference, so the bytes are not also kept in
 * the database. Returns the stored rows.
 */
export async function storeFixeraCasePhotos(pool, { dataUrls = [], ...rest }) {
  const stored = [];
  for (const dataUrl of dataUrls.slice(0, MAX_CASE_PHOTOS)) {
    stored.push(await storeFixeraCaseMedia(pool, { ...rest, dataUrl }));
  }
  const rows = stored.filter(Boolean);
  if (rows[0] && isObjectRef(rows[0].data_url)) {
    const table = rest.caseType === 'managed_job' ? 'managed_jobs' : 'pending_service_requests';
    await pool.query(`UPDATE ${table} SET media_data_url=$1 WHERE id=$2 AND homeowner_user_id=$3`, [rows[0].data_url, rest.caseId, rest.userId]);
  }
  return rows;
}

/**
 * The most recent photos attached to a case, oldest first, for the AI (images only).
 * Falls back to the cover image when the case has no media rows (older cases).
 */
export async function listFixeraCaseImages(pool, { caseType, caseId, coverDataUrl = null, limit = MAX_CASE_PHOTOS }) {
  const column = caseType === 'managed_job' ? 'job_id' : 'pending_service_request_id';
  let urls = [];
  try {
    const { rows } = await pool.query(
      `SELECT data_url FROM media_objects
        WHERE kind='fixera_repair_case' AND ${column}=$1 AND content_type LIKE 'image/%' AND data_url IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [caseId, Math.min(Math.max(1, limit), MAX_CASE_PHOTOS)]
    );
    // Photos in object storage are fetched for the AI (it needs the bytes); unreadable ones are skipped.
    urls = (await Promise.all(rows.map((r) => resolveMediaDataUrl(r.data_url)))).filter(Boolean).reverse();
  } catch (err) {
    console.warn('[fixera] case photos unavailable', err?.code || err?.message);
  }
  if (!urls.length && coverDataUrl) {
    const cover = await resolveMediaDataUrl(coverDataUrl);
    if (typeof cover === 'string' && cover.startsWith('data:image/')) urls = [cover];
  }
  return urls;
}

