/**
 * Contractor employee / field team profile helpers.
 */

const ALLOWED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function normalizeEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function normalizeContactList(raw, kind) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    if (!item) continue;
    const value = kind === 'email' ? normalizeEmail(item.value || item.email) : normalizePhone(item.value || item.phone);
    if (!value) continue;
    out.push({
      value,
      label: String(item.label || '').trim() || null,
      customerVisible: item.customerVisible !== false && item.customer_visible !== false,
      isPrimary: item.isPrimary === true || item.is_primary === true,
    });
  }
  return out;
}

export function validateEmployeePhoto(photoData, photoMime) {
  if (!photoData) return { ok: true, photoData: null, photoMime: null };
  const mime = String(photoMime || '').trim().toLowerCase();
  if (!ALLOWED_PHOTO_MIMES.has(mime)) {
    return { ok: false, message: 'Photo must be JPEG, PNG, WebP, or GIF.' };
  }
  let data = String(photoData);
  const match = data.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    data = match[2];
  }
  const bytes = Buffer.byteLength(data, 'base64');
  if (bytes > MAX_PHOTO_BYTES) {
    return { ok: false, message: 'Photo must be 2 MB or smaller.' };
  }
  return { ok: true, photoData: data, photoMime: mime };
}

export function serializeEmployee(row, { includeInternal = false, customerView = false } = {}) {
  if (!row) return null;
  const phones = normalizeContactList(parseJson(row.phones, []), 'phone');
  const emails = normalizeContactList(parseJson(row.emails, []), 'email');
  const visiblePhones = customerView ? phones.filter((p) => p.customerVisible) : phones;
  const visibleEmails = customerView ? emails.filter((e) => e.customerVisible) : emails;
  const primaryPhone = visiblePhones.find((p) => p.isPrimary) || visiblePhones[0] || null;
  const primaryEmail = visibleEmails.find((e) => e.isPrimary) || visibleEmails[0] || null;
  const base = {
    id: Number(row.id),
    contractorUserId: Number(row.contractor_user_id),
    fullName: row.full_name,
    jobTitle: row.job_title || null,
    bio: customerView ? row.customer_description || row.bio || null : row.bio || null,
    trade: row.trade || null,
    yearsExperience: row.years_experience != null ? Number(row.years_experience) : null,
    employeeRef: includeInternal ? row.employee_ref || null : undefined,
    customerDescription: row.customer_description || null,
    active: row.active !== false,
    phones: visiblePhones,
    emails: visibleEmails,
    primaryPhone: primaryPhone?.value || null,
    primaryEmail: primaryEmail?.value || null,
    hasPhoto: Boolean(row.photo_data),
    photoUrl: row.photo_data
      ? `/api/contractor/employees/${row.id}/photo`
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeInternal) {
    base.internalNotes = row.internal_notes || null;
    base.phones = phones;
    base.emails = emails;
  }
  return base;
}

export async function getEmployeeForContractor(pool, employeeId, contractorUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM contractor_employees WHERE id=$1 AND contractor_user_id=$2`,
    [employeeId, contractorUserId]
  );
  return rows[0] || null;
}

export async function assertEmployeeAssignable(pool, employeeId, contractorUserId) {
  if (!employeeId) return { ok: true, employee: null };
  const employee = await getEmployeeForContractor(pool, employeeId, contractorUserId);
  if (!employee) {
    return { ok: false, status: 404, message: 'Technician not found for this contractor.' };
  }
  if (employee.active === false) {
    return { ok: false, status: 409, message: 'Technician is inactive.' };
  }
  return { ok: true, employee };
}
