/**
 * Server-side admin RBAC — mirrors src/app/adminPermissions.ts presets.
 * Authorization must use these helpers; UI hiding is not security.
 */

export const ALL_PERMISSIONS = [
  'jobs.view',
  'jobs.edit',
  'jobs.assign',
  'quotes.view',
  'quotes.approve',
  'contractors.view',
  'contractors.edit',
  'contractors.verify',
  'contractors.suspend',
  'homeowners.view',
  'homeowners.edit',
  'partners.view',
  'partners.edit',
  'payments.view',
  'payments.refund',
  'payouts.view',
  'payouts.approve',
  'pricing.view',
  'pricing.edit',
  'settings.view',
  'settings.edit',
  'staff.view',
  'staff.create',
  'staff.edit',
  'staff.disable',
  'audit.view',
  'ai.view',
  'ai.override',
  'profitability.view',
];

const WORK_OPS = [
  'jobs.view',
  'jobs.edit',
  'jobs.assign',
  'quotes.view',
  'quotes.approve',
  'ai.view',
  'contractors.view',
  'homeowners.view',
];

export const ROLE_PRESETS = {
  super_admin: {
    label: 'Super Admin',
    permissions: [...ALL_PERMISSIONS],
  },
  operations_admin: {
    label: 'Operations Admin',
    permissions: [
      ...WORK_OPS,
      'contractors.edit',
      'contractors.verify',
      'contractors.suspend',
      'homeowners.edit',
      'partners.view',
      'payments.view',
      'payouts.view',
      'ai.override',
      'audit.view',
    ],
  },
  dispatcher: {
    label: 'Dispatcher',
    permissions: ['jobs.view', 'jobs.edit', 'jobs.assign', 'quotes.view', 'contractors.view', 'ai.view'],
  },
  finance_admin: {
    label: 'Finance Admin',
    permissions: [
      'jobs.view',
      'payments.view',
      'payments.refund',
      'payouts.view',
      'payouts.approve',
      'pricing.view',
      'profitability.view',
      'audit.view',
      'homeowners.view',
      'contractors.view',
    ],
  },
  contractor_manager: {
    label: 'Contractor Manager',
    permissions: [
      'contractors.view',
      'contractors.edit',
      'contractors.verify',
      'contractors.suspend',
      'jobs.view',
      'quotes.view',
      'audit.view',
    ],
  },
  customer_support: {
    label: 'Customer Support',
    permissions: [
      'homeowners.view',
      'homeowners.edit',
      'jobs.view',
      'jobs.edit',
      'quotes.view',
      'payments.view',
      'payments.refund',
      'partners.view',
    ],
  },
  read_only: {
    label: 'Read Only',
    permissions: [
      'jobs.view',
      'quotes.view',
      'contractors.view',
      'homeowners.view',
      'partners.view',
      'payments.view',
      'payouts.view',
      'pricing.view',
      'ai.view',
      'audit.view',
      'staff.view',
      'settings.view',
      'profitability.view',
    ],
  },
};

export const VALID_ROLE_PRESETS = Object.keys(ROLE_PRESETS);

/** Map legacy admin_access_level → preset when admin_role_preset is unset. */
export function legacyAccessToPreset(level) {
  const l = String(level || 'read-write').toLowerCase();
  if (l === 'read') return 'read_only';
  if (l === 'write') return 'operations_admin';
  if (VALID_ROLE_PRESETS.includes(l)) return l;
  // P0-9: never escalate unset/legacy presets to super_admin
  return 'operations_admin';
}

export function resolveAdminPreset(authUser) {
  if (!authUser || authUser.role !== 'admin') return null;
  const stored = String(authUser.adminRolePreset || authUser.admin_role_preset || '').toLowerCase();
  if (VALID_ROLE_PRESETS.includes(stored)) return stored;
  return legacyAccessToPreset(authUser.adminAccessLevel || authUser.admin_access_level);
}

export function permissionsForUser(authUser) {
  const preset = resolveAdminPreset(authUser);
  if (!preset) return new Set();
  return new Set(ROLE_PRESETS[preset].permissions);
}

export function userHasPermission(authUser, permission) {
  return permissionsForUser(authUser).has(permission);
}

export function userHasAnyPermission(authUser, permissions) {
  const have = permissionsForUser(authUser);
  return permissions.some((p) => have.has(p));
}

/** Express middleware factory: requireAuth must run first. */
export function requirePermission(...needed) {
  return (req, res, next) => {
    if (req.authUser?.role !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Admin access required.' });
    }
    if (!userHasAnyPermission(req.authUser, needed)) {
      return res.status(403).json({
        ok: false,
        code: 'FORBIDDEN_PERMISSION',
        message: 'You do not have permission for this action.',
      });
    }
    next();
  };
}

/** True if actor may assign targetPreset (cannot elevate above self). */
export function canAssignPreset(actorUser, targetPreset) {
  const actor = resolveAdminPreset(actorUser);
  if (actor !== 'super_admin') {
    // Non–super-admins cannot manage staff at all (staff.* gated separately),
    // and cannot assign super_admin.
    if (targetPreset === 'super_admin') return false;
    return VALID_ROLE_PRESETS.includes(targetPreset) && targetPreset !== 'super_admin';
  }
  return VALID_ROLE_PRESETS.includes(targetPreset);
}

/** Map preset → coarse access level for backward-compatible column. */
export function presetToAccessLevel(preset) {
  if (preset === 'read_only') return 'read';
  if (preset === 'dispatcher' || preset === 'customer_support') return 'write';
  return 'read-write';
}
