export type AdminTab =
  | "overview"
  | "work-queue"
  | "dispatch"
  | "pricing"
  | "finance"
  | "payout-settings"
  | "contractors"
  | "partners"
  | "referrals"
  | "platform"
  | "subscriptions"
  | "access"
  | "audit-logs"
  | "support-tickets"
  | "pro-plans"
  | "homecare-pro"
  | "visit-fee";

export const ADMIN_TABS = new Set<AdminTab>([
  "overview",
  "work-queue",
  "dispatch",
  "pricing",
  "finance",
  "payout-settings",
  "contractors",
  "partners",
  "referrals",
  "platform",
  "subscriptions",
  "access",
  "audit-logs",
  "support-tickets",
  "pro-plans",
  "homecare-pro",
  "visit-fee",
]);

export function sanitizeAdminTab(value: unknown): AdminTab {
  const tab = String(value || "overview") as AdminTab;
  return ADMIN_TABS.has(tab) ? tab : "overview";
}
