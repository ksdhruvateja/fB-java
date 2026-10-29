/**
 * Job review verification, submission, and contractor rating aggregation.
 * Verified FixBridge Job status is ALWAYS derived server-side — never from client input.
 */

export const REVIEWABLE_JOB_STATUSES = new Set([
  'work_completed',
  'customer_review_pending',
  'admin_review_pending',
  'payout_pending',
  'paid_out',
  'closed',
  'completed',
]);

const RATING_KEYS = ['quality', 'communication', 'punctuality', 'cleanliness', 'value'];

function clampRating(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 5) return null;
  return v;
}

export function parseCategoryRatings(body = {}) {
  const cats = body.categories || body.categoryRatings || {};
  const out = {};
  for (const key of RATING_KEYS) {
    const raw = cats[key] ?? body[`rating${key.charAt(0).toUpperCase()}${key.slice(1)}`] ?? body[`rating_${key}`];
    if (raw == null) continue;
    const v = clampRating(raw);
    if (v != null) out[key] = v;
  }
  return out;
}

/**
 * Server-side: job qualifies for Verified FixBridge Job badge on review.
 */
export function deriveVerifiedFixBridgeJob(job, contractorUserId) {
  if (!job || !job.id) return false;
  if (!REVIEWABLE_JOB_STATUSES.has(String(job.status || ''))) return false;
  if (!job.assigned_contractor_user_id) return false;
  if (contractorUserId && Number(job.assigned_contractor_user_id) !== Number(contractorUserId)) return false;
  return true;
}

/**
 * Compliance badges — only when admin-approved and documents on file with valid expiry.
 */
export function contractorVerificationBadges(contractor) {
  if (!contractor) return { licenseVerified: false, insuranceVerified: false, platformApproved: false };
  const compliance = String(contractor.compliance_status || '').toLowerCase();
  const platformApproved = compliance === 'approved' && contractor.is_blocked !== true;
  const now = new Date();
  const licenseOk =
    platformApproved &&
    Boolean(contractor.license_document_data || contractor.license_number) &&
    (!contractor.license_expires_at || new Date(contractor.license_expires_at) >= now);
  const insuranceOk =
    platformApproved &&
    Boolean(contractor.insurance_document_data) &&
    (!contractor.insurance_expires_at || new Date(contractor.insurance_expires_at) >= now);
  return {
    licenseVerified: licenseOk,
    insuranceVerified: insuranceOk,
    platformApproved,
  };
}

export async function loadJobForReview(pool, jobId, homeownerUserId) {
  const { rows } = await pool.query(
    `SELECT j.*, u.id AS contractor_id, u.name AS contractor_name, u.company_name,
            u.compliance_status, u.is_blocked, u.license_number, u.license_document_data,
            u.insurance_document_data, u.license_expires_at, u.insurance_expires_at
     FROM managed_jobs j
     LEFT JOIN users u ON u.id = j.assigned_contractor_user_id
     WHERE j.id = $1`,
    [jobId]
  );
  const job = rows[0];
  if (!job) return { ok: false, status: 404, message: 'Job not found.' };
  if (Number(job.homeowner_user_id) !== Number(homeownerUserId)) {
    return { ok: false, status: 403, code: 'NOT_JOB_OWNER', message: 'You can only review your own jobs.' };
  }
  if (!REVIEWABLE_JOB_STATUSES.has(String(job.status || ''))) {
    return { ok: false, status: 400, code: 'JOB_NOT_COMPLETE', message: 'Reviews are available after service is completed.' };
  }
  return { ok: true, job };
}

export async function insertJobReview(pool, {
  job,
  homeownerUser,
  rating,
  body,
  location,
  serviceType,
  imagesJson,
  categories = {},
}) {
  const verified = deriveVerifiedFixBridgeJob(job, job.assigned_contractor_user_id);
  const contractorUserId = job.assigned_contractor_user_id || null;

  const { rows } = await pool.query(
    `INSERT INTO site_reviews
       (author_name, location, service_type, rating, body, verified, published, user_id, job_id, images,
        contractor_user_id, rating_quality, rating_communication, rating_punctuality, rating_cleanliness, rating_value)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      String(homeownerUser.name || 'Homeowner').slice(0, 80),
      location || 'Local area',
      serviceType || String(job.category || 'Home repair').slice(0, 60),
      rating,
      body,
      verified,
      homeownerUser.id,
      Number(job.id),
      imagesJson,
      contractorUserId,
      categories.quality ?? null,
      categories.communication ?? null,
      categories.punctuality ?? null,
      categories.cleanliness ?? null,
      categories.value ?? null,
    ]
  );
  return rows[0];
}

export function serializeSiteReview(row) {
  const categories = {};
  if (row.rating_quality != null) categories.quality = Number(row.rating_quality);
  if (row.rating_communication != null) categories.communication = Number(row.rating_communication);
  if (row.rating_punctuality != null) categories.punctuality = Number(row.rating_punctuality);
  if (row.rating_cleanliness != null) categories.cleanliness = Number(row.rating_cleanliness);
  if (row.rating_value != null) categories.value = Number(row.rating_value);
  return {
    id: Number(row.id),
    name: row.author_name,
    location: row.location,
    serviceType: row.service_type || 'Home repair',
    rating: Number(row.rating),
    text: row.body,
    verified: row.verified === true,
    verifiedFixBridgeJob: row.verified === true && row.job_id != null,
    categories: Object.keys(categories).length ? categories : null,
    images: row.images ? (typeof row.images === 'string' ? JSON.parse(row.images) : row.images) : [],
    createdAt: row.created_at,
    jobId: row.job_id != null ? Number(row.job_id) : null,
    contractorUserId: row.contractor_user_id != null ? Number(row.contractor_user_id) : null,
  };
}

export async function aggregateContractorRatings(pool, contractorUserId) {
  const { rows } = await pool.query(
    `SELECT rating, rating_quality, rating_communication, rating_punctuality, rating_cleanliness, rating_value
     FROM site_reviews sr
     INNER JOIN managed_jobs mj ON mj.id = sr.job_id
     WHERE mj.assigned_contractor_user_id = $1 AND sr.published = TRUE`,
    [contractorUserId]
  );
  if (!rows.length) {
    return { reviewCount: 0, averageRating: null, categoryAverages: null };
  }
  const avg = (arr) => {
    const vals = arr.filter((n) => n != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };
  return {
    reviewCount: rows.length,
    averageRating: avg(rows.map((r) => Number(r.rating))),
    categoryAverages: {
      quality: avg(rows.map((r) => (r.rating_quality != null ? Number(r.rating_quality) : null))),
      communication: avg(rows.map((r) => (r.rating_communication != null ? Number(r.rating_communication) : null))),
      punctuality: avg(rows.map((r) => (r.rating_punctuality != null ? Number(r.rating_punctuality) : null))),
      cleanliness: avg(rows.map((r) => (r.rating_cleanliness != null ? Number(r.rating_cleanliness) : null))),
      value: avg(rows.map((r) => (r.rating_value != null ? Number(r.rating_value) : null))),
    },
  };
}
