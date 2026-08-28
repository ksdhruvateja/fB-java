/**
 * Permission-based RBAC primitives for FixBridge Admin.
 * Roles are collections of permissions — never hardcode page access alone.
 */

export type AdminPermission =
  | "jobs.view"
  | "jobs.edit"
  | "jobs.assign"
  | "quotes.view"
  | "quotes.approve"
  | "contractors.view"
  | "contractors.edit"
  | "contractors.verify"
  | "contractors.suspend"
  | "homeowners.view"
  | "homeowners.edit"
  | "partners.view"
  | "partners.edit"
  | "payments.view"
  | "payments.refund"
  | "payouts.view"
  | "payouts.approve"
  | "pricing.view"
  | "pricing.edit"
  | "settings.view"
  | "settings.edit"
  | "staff.view"
  | "staff.create"
  | "staff.edit"
  | "staff.disable"
  | "audit.view"
  | "ai.view"
  | "ai.override"
  | "profitability.view";

export type AdminRolePreset =
  | "super_admin"
  | "operations_admin"
  | "dispatcher"
  | "finance_admin"
  | "contractor_manager"
  | "customer_support"
  | "read_only";

export const ALL_PERMISSIONS: AdminPermission[] = [
  "jobs.view",
  "jobs.edit",
  "jobs.assign",
  "quotes.view",
  "quotes.approve",
  "contractors.view",
  "contractors.edit",
  "contractors.verify",
  "contractors.suspend",
  "homeowners.view",
  "homeowners.edit",
  "partners.view",
  "partners.edit",
  "payments.view",
  "payments.refund",
  "payouts.view",
  "payouts.approve",
  "pricing.view",
  "pricing.edit",
  "settings.view",
  "settings.edit",
  "staff.view",
  "staff.create",
  "staff.edit",
  "staff.disable",
  "audit.view",
  "ai.view",
  "ai.override",
  "profitability.view",
];

const WORK_OPS: AdminPermission[] = [
  "jobs.view",
  "jobs.edit",
  "jobs.assign",
  "quotes.view",
  "quotes.approve",
  "ai.view",
  "contractors.view",
  "homeowners.view",
];

export const ROLE_PRESETS: Record<
  AdminRolePreset,
  { label: string; description: string; permissions: AdminPermission[] }
> = {
  super_admin: {
    label: "Super Admin",
    description: "Full platform access including staff, pricing, and payout settings.",
    permissions: [...ALL_PERMISSIONS],
  },
  operations_admin: {
    label: "Operations Admin",
    description: "Jobs, dispatch, quotes, contractors, and homeowners. No pricing/payout settings.",
    permissions: [
      ...WORK_OPS,
      "contractors.edit",
      "contractors.verify",
      "contractors.suspend",
      "homeowners.edit",
      "partners.view",
      "payments.view",
      "payouts.view",
      "ai.override",
      "audit.view",
    ],
  },
  dispatcher: {
    label: "Dispatcher",
    description: "Work queue, dispatch, contractor availability, job communication.",
    permissions: ["jobs.view", "jobs.edit", "jobs.assign", "quotes.view", "contractors.view", "ai.view"],
  },
  finance_admin: {
    label: "Finance Admin",
    description: "Payments, payouts, refunds, and profitability.",
    permissions: [
      "jobs.view",
      "payments.view",
      "payments.refund",
      "payouts.view",
      "payouts.approve",
      "pricing.view",
      "profitability.view",
      "audit.view",
      "homeowners.view",
      "contractors.view",
    ],
  },
  contractor_manager: {
    label: "Contractor Manager",
    description: "Applications, documents, verification, and performance.",
    permissions: [
      "contractors.view",
      "contractors.edit",
      "contractors.verify",
      "contractors.suspend",
      "jobs.view",
      "quotes.view",
      "audit.view",
    ],
  },
  customer_support: {
    label: "Customer Support",
    description: "Homeowners, jobs, issues, notes, and refund request initiation.",
    permissions: [
      "homeowners.view",
      "homeowners.edit",
      "jobs.view",
      "jobs.edit",
      "quotes.view",
      "payments.view",
      "payments.refund",
      "partners.view",
    ],
  },
  read_only: {
    label: "Read Only",
    description: "Inspect information only — no mutations.",
    permissions: [
      "jobs.view",
      "quotes.view",
      "contractors.view",
      "homeowners.view",
      "partners.view",
      "payments.view",
      "payouts.view",
      "pricing.view",
      "ai.view",
      "audit.view",
      "staff.view",
      "settings.view",
      "profitability.view",
    ],
  },
};

/** Map legacy access levels / stored presets until all staff have admin_role_preset. */
export function permissionsForAccessLevel(level?: string | null, rolePreset?: string | null): Set<AdminPermission> {
  const preset = String(rolePreset || "").toLowerCase();
  if (preset && preset in ROLE_PRESETS) {
    return new Set(ROLE_PRESETS[preset as AdminRolePreset].permissions);
  }
  const l = String(level || "read-write").toLowerCase();
  if (l === "read") return new Set(ROLE_PRESETS.read_only.permissions);
  if (l in ROLE_PRESETS) return new Set(ROLE_PRESETS[l as AdminRolePreset].permissions);
  // P0-9: conservative default — never imply super_admin
  return new Set(ROLE_PRESETS.operations_admin.permissions);
}

export function can(perms: Set<AdminPermission>, permission: AdminPermission) {
  return perms.has(permission);
}
