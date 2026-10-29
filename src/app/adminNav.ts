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
  | "fixera"
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
  "fixera",
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
  const raw = String(value || "overview");
  const tab = (raw === "fixa" ? "fixera" : raw) as AdminTab;
  return ADMIN_TABS.has(tab) ? tab : "overview";
}
