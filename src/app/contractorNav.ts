export type ContractorDashTab =
  | "dashboard"
  | "invites"
  | "jobs"
  | "schedule"
  | "messages"
  | "services"
  | "areas"
  | "team"
  | "pricing"
  | "payouts"
  | "refer-earn"
  | "performance"
  | "compliance"
  | "documents"
  | "settings"
  | "help";

export const CONTRACTOR_DASH_TABS = new Set<ContractorDashTab>([
  "dashboard",
  "invites",
  "jobs",
  "schedule",
  "messages",
  "services",
  "areas",
  "team",
  "pricing",
  "payouts",
  "refer-earn",
  "performance",
  "compliance",
  "documents",
  "settings",
  "help",
]);

export function sanitizeContractorTab(value: unknown): ContractorDashTab {
  const tab = String(value || "dashboard") as ContractorDashTab;
  return CONTRACTOR_DASH_TABS.has(tab) ? tab : "dashboard";
}

export function isContractorTabRendered(tab: ContractorDashTab): boolean {
  return CONTRACTOR_DASH_TABS.has(tab);
}
