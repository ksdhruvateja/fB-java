import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  FileText,
  Gift,
  Headphones,
  HelpCircle,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { ManagedJob } from "./managedJobs";

export type DashTab =
  | "overview"
  | "property"
  | "report"
  | "jobs"
  | "maintenance"
  | "timeline"
  | "protection"
  | "health"
  | "home-updates"
  | "property-care"
  | "refer-earn"
  | "documents"
  | "payments"
  | "history"
  | "messages"
  | "assistant"
  | "settings"
  | "help"
  | "properties"
  | "profile"
  | "inbox"
  | "more"
  | "go-pro";

export type PropertyCareSection =
  | "passport"
  | "hub"
  | "maintenance"
  | "reminders"
  /** @deprecated legacy aliases — mapped in propertyCareSectionForTab */
  | "overview"
  | "systems"
  | "timeline"
  | "recommendations"
  | "upcoming";

export type BottomNavId = "home" | "jobs" | "request" | "inbox" | "more";
export type JobsSegment = "active" | "quotes" | "upcoming" | "history";
export type InboxSegment = "messages" | "notifications";

export const NAV_SECTIONS: {
  label?: string;
  items: { id: DashTab; label: string; icon: LucideIcon }[];
}[] = [
  {
    items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Home",
    items: [
      { id: "property", label: "My Property", icon: Home },
      { id: "jobs", label: "Service Requests", icon: Wrench },
      { id: "property-care", label: "Property Passport", icon: Sparkles },
      { id: "protection", label: "Home Protection", icon: Shield },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "refer-earn", label: "Refer & Earn", icon: Gift },
      { id: "documents", label: "Documents", icon: FileText },
      { id: "payments", label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "messages", label: "Messages", icon: MessageSquare },
      { id: "assistant", label: "FixBridge Assistant", icon: Headphones },
    ],
  },
];

export const FOOTER_NAV: { id: DashTab; label: string; icon: LucideIcon }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help & Support", icon: HelpCircle },
];

const QUOTE_STATUSES = new Set([
  "proposal_sent",
  "awaiting_customer_approval",
  "awaiting_bid",
  "bid_received",
  "diagnosing",
  "approved",
]);

const UPCOMING_STATUSES = new Set(["scheduled", "proposal_accepted", "contractor_accepted"]);

const ACTIVE_STATUSES = new Set([
  "draft",
  "ai_review_complete",
  "awaiting_service_payment",
  "paid_for_dispatch",
  "awaiting_contractor",
  "contractor_invited",
  "matching",
  "bids_open",
  "contractor_en_route",
  "work_started",
  "change_order_pending",
]);

const HISTORY_STATUSES = new Set([
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
  "canceled",
  "refunded",
  "disputed",
]);

export function jobsForSegment(jobs: ManagedJob[], segment: JobsSegment): ManagedJob[] {
  return jobs.filter((job) => jobSegment(job) === segment);
}

export function jobSegment(job: ManagedJob): JobsSegment {
  if (HISTORY_STATUSES.has(job.status)) return "history";
  if (QUOTE_STATUSES.has(job.status)) return "quotes";
  if (UPCOMING_STATUSES.has(job.status)) return "upcoming";
  if (ACTIVE_STATUSES.has(job.status)) return "active";
  return "active";
}

export function countQuotesWaiting(jobs: ManagedJob[]): number {
  return jobs.filter((j) =>
    ["proposal_sent", "awaiting_customer_approval"].includes(j.status)
  ).length;
}

export function jobsForProperty(jobs: ManagedJob[], propertyId?: number | null): ManagedJob[] {
  if (propertyId == null) return jobs;
  return jobs.filter((j) => !j.propertyId || Number(j.propertyId) === Number(propertyId));
}

/** Legacy tabs that now live inside Property Care. */
const PROPERTY_CARE_LEGACY = new Set<DashTab>([
  "maintenance",
  "timeline",
  "health",
  "history",
  "home-updates",
]);

export function propertyCareSectionForTab(id: DashTab): PropertyCareSection {
  if (id === "timeline" || id === "history") return "timeline";
  if (id === "home-updates") return "recommendations";
  if (id === "maintenance") return "maintenance";
  if (id === "health") return "passport";
  return "passport";
}

export const MORE_MENU_SECTIONS: {
  title: string;
  items: { tab: DashTab; label: string; description?: string }[];
}[] = [
  {
    title: "My Home",
    items: [
      { tab: "properties", label: "My Property", description: "Addresses & systems" },
      { tab: "property-care", label: "Property Passport", description: "Home details, systems & maintenance" },
      { tab: "protection", label: "Home Protection" },
    ],
  },
  {
    title: "Manage",
    items: [
      { tab: "refer-earn", label: "Refer & Earn", description: "Share & earn credit" },
      { tab: "documents", label: "Documents" },
      { tab: "payments", label: "Payments" },
    ],
  },
  {
    title: "Support",
    items: [
      { tab: "assistant", label: "FixBridge Assistant" },
      { tab: "help", label: "Help & Support" },
      { tab: "inbox", label: "Messages", description: "Messages & alerts" },
    ],
  },
  {
    title: "Account",
    items: [
      { tab: "profile", label: "Settings" },
      { tab: "go-pro", label: "HomeCare", description: "Free & Pro plans" },
    ],
  },
];

const PRIMARY_BOTTOM_TABS = new Set<DashTab>(["overview", "jobs", "report", "inbox", "more"]);

export function isMoreAreaTab(tab: DashTab): boolean {
  return !PRIMARY_BOTTOM_TABS.has(tab);
}

export function resolveNavTab(id: DashTab): DashTab {
  if (id === "property") return "properties";
  if (id === "settings") return "profile";
  if (PROPERTY_CARE_LEGACY.has(id)) return "property-care";
  return id;
}

export function bottomNavHighlight(tab: DashTab): BottomNavId {
  if (tab === "overview") return "home";
  if (tab === "jobs" || tab === "history") return "jobs";
  if (tab === "report") return "request";
  if (tab === "inbox" || tab === "messages") return "inbox";
  if (tab === "more" || isMoreAreaTab(tab)) return "more";
  return "home";
}

export function mobileHeaderTitle(tab: DashTab): string {
  switch (tab) {
    case "overview":
      return "Home";
    case "jobs":
      return "Requests";
    case "report":
      return "Request Service";
    case "inbox":
      return "Messages";
    case "more":
      return "More";
    case "history":
    case "maintenance":
    case "timeline":
    case "health":
    case "home-updates":
    case "property-care":
      return "Property Passport";
    case "properties":
    case "property":
      return "My Property";
    case "refer-earn":
      return "Refer & Earn";
    case "payments":
      return "Payments";
    case "documents":
      return "Documents";
    case "profile":
    case "settings":
      return "Settings";
    case "assistant":
      return "Assistant";
    case "help":
      return "Help & Support";
    case "protection":
      return "Home Protection";
    case "go-pro":
      return "HomeCare";
    default:
      return "FixBridge";
  }
}
