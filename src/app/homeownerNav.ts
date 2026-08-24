import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  Headphones,
  HelpCircle,
  History,
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
  | "more";

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
      { id: "maintenance", label: "Maintenance", icon: CalendarDays },
      { id: "timeline", label: "Maintenance Timeline", icon: History },
      { id: "protection", label: "Home Protection", icon: Shield },
      { id: "health", label: "Property Health", icon: Sparkles },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "documents", label: "Documents", icon: FileText },
      { id: "payments", label: "Payments", icon: CreditCard },
      { id: "history", label: "Service History", icon: History },
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

export const MORE_MENU_SECTIONS: {
  title: string;
  items: { tab: DashTab; label: string; description?: string }[];
}[] = [
  {
    title: "My Home",
    items: [
      { tab: "properties", label: "Properties", description: "Addresses & details" },
      { tab: "health", label: "Home Health", description: "Systems & score" },
      { tab: "maintenance", label: "Maintenance", description: "Upcoming care" },
      { tab: "timeline", label: "Maintenance Timeline" },
      { tab: "protection", label: "Home Protection" },
    ],
  },
  {
    title: "Account",
    items: [
      { tab: "payments", label: "Payments" },
      { tab: "documents", label: "Documents" },
      { tab: "assistant", label: "FixBridge Pro", description: "Plan & AI usage" },
    ],
  },
  {
    title: "Support",
    items: [
      { tab: "help", label: "Help & Support" },
      { tab: "inbox", label: "Inbox", description: "Messages & alerts" },
    ],
  },
  {
    title: "Settings",
    items: [
      { tab: "profile", label: "Profile" },
      { tab: "profile", label: "Notifications", description: "Coming soon" },
      { tab: "profile", label: "Security", description: "Password & sign-in" },
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
      return "Jobs";
    case "report":
      return "Request Service";
    case "inbox":
      return "Inbox";
    case "more":
      return "More";
    case "history":
      return "Service History";
    case "health":
      return "Home Health";
    case "properties":
    case "property":
      return "Properties";
    case "maintenance":
      return "Maintenance";
    case "timeline":
      return "Timeline";
    case "payments":
      return "Payments";
    case "documents":
      return "Documents";
    case "profile":
    case "settings":
      return "Profile";
    case "assistant":
      return "FixBridge Pro";
    case "help":
      return "Help & Support";
    case "protection":
      return "Home Protection";
    default:
      return "FixBridge";
  }
}
