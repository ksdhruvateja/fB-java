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
  | "fixa"
  | "subscriptions"
  | "access"
  | "audit-logs"
  | "support-tickets"
  | "pro-plans"
  | "homecare-pro"
  | "visit-fee"
  | "legal-system"
  | "communications"
  | "disputes";

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
  "fixa",
  "subscriptions",
  "access",
  "audit-logs",
  "support-tickets",
  "pro-plans",
  "homecare-pro",
  "visit-fee",
  "legal-system",
  "communications",
  "disputes",
]);

export function sanitizeAdminTab(value: unknown): AdminTab {
  const tab = String(value || "overview") as AdminTab;
  return ADMIN_TABS.has(tab) ? tab : "overview";
}
