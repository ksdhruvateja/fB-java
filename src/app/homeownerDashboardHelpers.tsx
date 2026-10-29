/** Helpers, constants and small types used by HomeownerDashboard (moved out of the main file). */
import type React from "react";
import { Home, PlusCircle, Sun, Moon, CalendarDays, Zap, Building2, KeyRound, Hammer, Store, BadgeCheck, Droplets, Wind, Bug, History, Trees, Snowflake, Brush } from "lucide-react";
import { retailRangeLabel, type AssessmentResource, type ManagedJob, assessPendingServiceRequest } from "./managedJobs";
import { assessmentUnavailableMessage, isHtmlOrGatewayErrorBody } from "./apiErrors";
import { type JobsSegment } from "./homeownerNav";

export function formatChatMessage(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "");
}

export function assessmentStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object" && "name" in item) return String((item as { name?: unknown }).name || "").trim();
    return "";
  }).filter(Boolean);
}

export function assessmentResources(value: unknown): AssessmentResource[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string" && item.trim()) return { name: item.trim(), required: true, reason: "" };
    if (!item || typeof item !== "object" || !("name" in item)) return null;
    const resource = item as Partial<AssessmentResource>;
    const name = String(resource.name || "").trim();
    if (!name) return null;
    return {
      name,
      required: resource.required !== false,
      reason: typeof resource.reason === "string" ? resource.reason : "",
      ...(typeof resource.exact_part_confirmed === "boolean" ? { exact_part_confirmed: resource.exact_part_confirmed } : {}),
      ...(Array.isArray(resource.information_needed) ? { information_needed: resource.information_needed.map(String) } : {}),
    };
  }).filter((item): item is AssessmentResource => Boolean(item));
}

export function hasRenderableAssessment(job: ManagedJob | null | undefined): job is ManagedJob & { aiAssessment: NonNullable<ManagedJob["aiAssessment"]> } {
  const assessment = job?.aiAssessment;
  return Boolean(assessment && typeof assessment === "object" && !Array.isArray(assessment));
}

/** Tab the homeowner was on when they opened HomeCare plans; read by App after checkout returns. */

export function isAssessmentProcessing(job: ManagedJob | null | undefined) {
  const st = job?.assessmentStatus;
  return st === "processing" || st === "pending";
}

export function normalizeAssessmentMessage(msg?: string | null) {
  if (!msg || isHtmlOrGatewayErrorBody(msg)) return assessmentUnavailableMessage();
  return msg;
}

export function normalizeDiyRiskLevel(value: unknown): "red" | "yellow" | "green" {
  const text = String(value ?? "green").trim().toLowerCase();
  if (["red", "high", "danger", "critical"].includes(text)) return "red";
  if (["yellow", "amber", "moderate", "caution"].includes(text)) return "yellow";
  return "green";
}

/** A detected safety concern the homeowner has not yet confirmed (DIY steps are withheld). */
export function safetyConfirmationPending(job: ManagedJob | null | undefined): boolean {
  const sc = job?.aiAssessment?.safety_confirmation;
  return Boolean(sc?.required && !sc.confirmed);
}

export function getHomeownerDiyRisk(job: ManagedJob | null | undefined): "red" | "yellow" | "green" {
  return normalizeDiyRiskLevel(job?.diyRiskLevel || job?.aiAssessment?.diy_risk_level || "green");
}

export function markHirePerf(stage: string, startedAt?: number) {
  if (typeof performance === "undefined") return;
  const now = performance.now();
  console.info(JSON.stringify({
    scope: "hire_perf",
    stage,
    ms: startedAt == null ? Math.round(now) : Math.round(now - startedAt),
  }));
}

/** Every shape runAssessWithProgress can return; all share the same keys so callers can read them. */
export type AssessRunResult =
  | {
      ok: true;
      job?: ManagedJob;
      pendingServiceRequest?: any;
      pendingServiceRequestId?: number;
      assessment?: any;
      pricing?: any;
      warning?: any;
      code?: undefined;
      message?: undefined;
    }
  | {
      ok: false;
      code: string;
      message: string;
      job?: undefined;
      pendingServiceRequest?: undefined;
      pendingServiceRequestId?: undefined;
      assessment?: undefined;
      pricing?: undefined;
      warning?: undefined;
    };

export type ReportStep = "intake" | "experts" | "assessment";

export const JOBS_SEGMENTS: { id: JobsSegment; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "quotes", label: "Quotes" },
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
];

export const REQUEST_ICONS: Record<string, React.ElementType> = {
  droplet: Droplets,
  zap: Zap,
  wind: Wind,
  refrigerator: Home,
  hammer: Hammer,
  bug: Bug,
  home: Home,
  trees: Trees,
  snowflake: Snowflake,
  cleaning: Brush,
  more: PlusCircle,
};

export const SERVICE_TIMING_OPTIONS = [
  {
    value: "weekday",
    label: "Scheduled weekday",
    hint: "Standard dispatch | best availability",
    icon: CalendarDays,
  },
  {
    value: "same-day",
    label: "Same-day priority",
    hint: "Faster response when slots open",
    icon: Zap,
  },
  {
    value: "evening-weekend",
    label: "Evening / weekend",
    hint: "After-hours & Sat-Sun windows",
    icon: Moon,
  },
] as const;

export const TIME_WINDOW_OPTIONS = [
  { value: "9-11", label: "9-11 AM", period: "Morning" },
  { value: "11-2", label: "11 AM-2 PM", period: "Midday" },
  { value: "2-5", label: "2-5 PM", period: "Afternoon" },
  { value: "5-7", label: "5-7 PM", period: "Evening" },
] as const;

export const PROPERTY_PURPOSE_OPTIONS = [
  { value: "current_homeowner", label: "Current homeowner", icon: Home },
  { value: "rental_property", label: "Rental property", icon: KeyRound },
  { value: "selling_property", label: "Selling", icon: Store },
  { value: "buying_primary_residence", label: "Buying", icon: BadgeCheck },
  { value: "fix_and_flip", label: "Fix and flip", icon: Hammer },
  { value: "commercial_property", label: "Commercial", icon: Building2 },
] as const;

export const PROJECT_STAGE_OPTIONS = [
  { value: "ongoing_maintenance", label: "Ongoing maintenance" },
  { value: "pre_listing", label: "Pre-listing" },
  { value: "inspection_complete", label: "Inspection complete" },
  { value: "under_contract", label: "Under contract" },
  { value: "closed_post_purchase", label: "Post-purchase" },
  { value: "active_renovation", label: "Active renovation" },
] as const;

export function moneyRange(job: ManagedJob) {
  return retailRangeLabel(job);
}

export function formatPendingTimeLeft(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return "36 hrs left";
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "Expired";
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export type PendingAssessmentSuccess = Extract<
  Awaited<ReturnType<typeof assessPendingServiceRequest>>,
  { ok: true }
>;

export function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysFromToday(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

export function nextWeekendDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const add = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  d.setDate(d.getDate() + add);
  return toDateInputValue(d);
}

export function dateForServiceTiming(timing: string): string {
  if (timing === "same-day") return addDaysFromToday(0);
  if (timing === "evening-weekend") return nextWeekendDate();
  return "";
}

export function selectServiceTimingOption(
  timing: string,
  setServiceTiming: (v: string) => void,
  setPreferredDate: (v: string) => void,
  preferredDate: string
) {
  setServiceTiming(timing);
  const implied = dateForServiceTiming(timing);
  if (implied) setPreferredDate(implied);
  else if (timing === "weekday" && preferredDate === addDaysFromToday(0)) {
    setPreferredDate("");
  }
}

export function formatDisplayDate(iso: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function normalizePartnerCodeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const asUrl = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://local.invalid");
    const fromQuery =
      asUrl.searchParams.get("partner") ||
      asUrl.searchParams.get("ref") ||
      asUrl.searchParams.get("code");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  } catch {
    // not a URL
  }
  const partnerMatch = trimmed.match(/[?&](?:partner|ref|code)=([A-Za-z0-9_-]+)/i);
  if (partnerMatch?.[1]) return partnerMatch[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function normalizeDiscountCodeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const asUrl = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://local.invalid");
    const fromQuery = asUrl.searchParams.get("discount") || asUrl.searchParams.get("promo");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  } catch {
    // ignore
  }
  const match = trimmed.match(/[?&](?:discount|promo)=([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}
