import { randomUUID } from 'node:crypto';

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
  const { rows } = await pool.query(
    `INSERT INTO media_objects (
       owner_user_id, job_id, pending_service_request_id, case_type, property_id,
       equipment_key, kind, storage_key, content_type, byte_size, data_url
     ) VALUES ($1,$2,$3,$4,$5,$6,'fixera_repair_case',$7,$8,$9,$10)
     RETURNING id, storage_key, content_type, byte_size, created_at`,
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
      source,
    ]
  );
  return rows[0] || null;
}