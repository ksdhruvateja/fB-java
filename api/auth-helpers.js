/**
 * Authorization helpers — admin role vs ownership. Never treat is_admin boolean alone as admin.
 */

/** Dedicated admin staff role only (not is_admin flag on homeowner/contractor rows). */
export function isAdminRole(authUser) {
  return authUser?.role === 'admin';
}

/** Cross-account access requires admin role, not is_admin boolean. */
export function canBypassResourceOwnership(authUser) {
  return isAdminRole(authUser);
}

export function isHomeownerOwner(authUser, homeownerUserId) {
  return authUser?.role === 'homeowner' && Number(authUser.id) === Number(homeownerUserId);
}

export function isAssignedContractor(authUser, contractorUserId) {
  return authUser?.role === 'contractor' && Number(authUser.id) === Number(contractorUserId);
}

/** Read access: homeowner owner, assigned contractor, invited contractor, or admin. */
export function canReadManagedJob(job, authUser, { invitedContractorIds = [] } = {}) {
  if (!job || !authUser) return false;
  if (isAdminRole(authUser)) return true;
  if (isHomeownerOwner(authUser, job.homeowner_user_id)) return true;
  if (isAssignedContractor(authUser, job.assigned_contractor_user_id)) return true;
  if (
    authUser.role === 'contractor' &&
    invitedContractorIds.some((id) => Number(id) === Number(authUser.id))
  ) {
    return true;
  }
  return false;
}

/** Mutate access: owner, assigned contractor (when allowed), or admin. */
export function canMutateManagedJob(job, authUser, { contractorMayMutate = false } = {}) {
  if (!job || !authUser) return false;
  if (isAdminRole(authUser)) return true;
  if (isHomeownerOwner(authUser, job.homeowner_user_id)) return true;
  if (contractorMayMutate && isAssignedContractor(authUser, job.assigned_contractor_user_id)) {
    return true;
  }
  return false;
}

/**
 * Load managed job and enforce ownership (403/404).
 * @returns {{ ok: true, job }} | {{ ok: false, status: number, message: string }}
 */
export async function requireManagedJobAccess(pool, jobId, authUser, { mutate = false } = {}) {
  const id = Number(jobId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 400, message: 'Invalid job id.' };
  }
  const { rows } = await pool.query(`SELECT * FROM managed_jobs WHERE id=$1`, [id]);
  const job = rows[0];
  if (!job) return { ok: false, status: 404, message: 'Job not found.' };

  const allowed = mutate
    ? canMutateManagedJob(job, authUser, { contractorMayMutate: true })
    : canReadManagedJob(job, authUser);

  if (!allowed) {
    return { ok: false, status: 403, message: 'Not allowed to access this job.' };
  }
  return { ok: true, job };
}
