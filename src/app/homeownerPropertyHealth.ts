import type { ManagedJob, Property } from "./managedJobs";
import type { HomeownerArea, HomeownerService } from "./homeownerCategories";

export const PROPERTY_SYSTEMS = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roof",
  "Appliances",
  "Pest",
  "Safety",
] as const;

export type PropertySystem = (typeof PROPERTY_SYSTEMS)[number];

export type SystemHealthStatus = "good" | "attention" | "due_soon" | "critical";

export type SystemHealthEntry = {
  system: PropertySystem;
  status: SystemHealthStatus;
  nextAction: string;
  notes?: string;
  updatedAt?: string;
  updatedBy?: "contractor" | "homeowner" | "system";
  relatedJobId?: number | null;
};

export type PreviousServiceRecord = {
  id: string;
  title: string;
  system: PropertySystem | "Other";
  company?: string;
  date?: string;
  cost?: string;
  notes?: string;
};

export type AiServiceSuggestion = {
  id: string;
  title: string;
  reason: string;
  system?: PropertySystem | "Other";
  urgency?: "soon" | "this_year" | "later";
  accepted?: boolean;
};

export type PropertyHealthProfile = {
  systems: SystemHealthEntry[];
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  maintenance: { label: string; dueDate: string; system?: PropertySystem }[];
  previousServices?: PreviousServiceRecord[];
  aiSuggestions?: AiServiceSuggestion[];
  onboardingComplete?: boolean;
};

export const REQUEST_SYSTEM_OPTIONS: {
  id: string;
  label: string;
  service: HomeownerService;
  area: HomeownerArea;
  iconHint: string;
}[] = [
  { id: "plumbing", label: "Plumbing", service: "Plumbing", area: "Kitchen", iconHint: "droplet" },
  { id: "electrical", label: "Electrical", service: "Electrical", area: "Kitchen", iconHint: "zap" },
  { id: "hvac", label: "HVAC", service: "HVAC & Heating/Cooling", area: "Garage", iconHint: "wind" },
  { id: "appliance", label: "Appliance", service: "Appliances", area: "Kitchen", iconHint: "refrigerator" },
  { id: "handyman", label: "Handyman", service: "Handyman", area: "Garage", iconHint: "hammer" },
  { id: "pest", label: "Pest", service: "Pest Control", area: "Garage", iconHint: "bug" },
  { id: "roofing", label: "Roofing", service: "Roofing & Gutters", area: "Gutters", iconHint: "home" },
  { id: "other", label: "Something Else", service: "Other", area: "Kitchen", iconHint: "more" },
];

export function serviceToSystem(category?: string | null, title?: string | null): PropertySystem | null {
  const hay = `${category || ""} ${title || ""}`.toLowerCase();
  if (/plumb|sink|leak|pipe|drain|toilet|faucet|water heater/.test(hay)) return "Plumbing";
  if (/electric|outlet|breaker|wiring|light/.test(hay)) return "Electrical";
  if (/hvac|heat|cool|ac |air condition|furnace|thermostat|filter/.test(hay)) return "HVAC";
  if (/roof|gutter|shingle/.test(hay)) return "Roof";
  if (/appliance|fridge|washer|dryer|dishwasher|oven|stove/.test(hay)) return "Appliances";
  if (/pest|termite|rodent|insect/.test(hay)) return "Pest";
  if (/smoke|detector|safety|lock|security|alarm/.test(hay)) return "Safety";
  return null;
}

export function defaultHealthProfile(): PropertyHealthProfile {
  return {
    beds: null,
    baths: null,
    sqft: null,
    maintenance: [],
    previousServices: [],
    aiSuggestions: [],
    onboardingComplete: false,
    systems: [
      { system: "HVAC", status: "good", nextAction: "Add service history or request inspection", updatedBy: "system" },
      { system: "Plumbing", status: "good", nextAction: "No issues logged yet", updatedBy: "system" },
      { system: "Electrical", status: "good", nextAction: "No issues logged yet", updatedBy: "system" },
      { system: "Roof", status: "good", nextAction: "No issues logged yet", updatedBy: "system" },
      { system: "Appliances", status: "good", nextAction: "No issues logged yet", updatedBy: "system" },
      { system: "Pest", status: "good", nextAction: "No issues logged yet", updatedBy: "system" },
      { system: "Safety", status: "good", nextAction: "Test smoke & CO detectors", updatedBy: "system" },
    ],
  };
}

export function normalizeHealthProfile(raw?: Partial<PropertyHealthProfile> | null): PropertyHealthProfile {
  const base = defaultHealthProfile();
  if (!raw || typeof raw !== "object") return { ...base };
  const bySystem = new Map(
    (Array.isArray(raw.systems) ? raw.systems : [])
      .filter((s) => s && typeof s === "object" && s.system)
      .map((s) => [s.system, s])
  );
  const previousServices = Array.isArray(raw.previousServices)
    ? raw.previousServices
        .filter((s) => s && typeof s === "object" && String(s.title || "").trim())
        .map((s) => ({
          id: String(s.id || `svc_${Math.random().toString(36).slice(2, 9)}`),
          title: String(s.title || "").trim(),
          system: (PROPERTY_SYSTEMS.includes(s.system as PropertySystem) ? s.system : "Other") as
            | PropertySystem
            | "Other",
          company: s.company ? String(s.company) : "",
          date: s.date ? String(s.date) : "",
          cost: s.cost != null ? String(s.cost) : "",
          notes: s.notes ? String(s.notes) : "",
        }))
    : [];
  const aiSuggestions = Array.isArray(raw.aiSuggestions)
    ? raw.aiSuggestions
        .filter((s) => s && typeof s === "object" && String(s.title || "").trim())
        .map((s) => ({
          id: String(s.id || `sug_${Math.random().toString(36).slice(2, 9)}`),
          title: String(s.title || "").trim(),
          reason: String(s.reason || ""),
          system: s.system as AiServiceSuggestion["system"],
          urgency: s.urgency as AiServiceSuggestion["urgency"],
          accepted: s.accepted === true,
        }))
    : [];
  return {
    beds: raw.beds != null && Number.isFinite(Number(raw.beds)) ? Number(raw.beds) : null,
    baths: raw.baths != null && Number.isFinite(Number(raw.baths)) ? Number(raw.baths) : null,
    sqft: raw.sqft != null && Number.isFinite(Number(raw.sqft)) ? Number(raw.sqft) : null,
    // Preserve empty arrays — do not resurrect placeholder maintenance
    maintenance: Array.isArray(raw.maintenance)
      ? raw.maintenance
          .filter((m) => m && String(m.label || "").trim())
          .map((m) => ({
            label: String(m.label).trim(),
            dueDate: String(m.dueDate || ""),
            system: m.system as PropertySystem | undefined,
          }))
      : [],
    systems: PROPERTY_SYSTEMS.map((system) => {
      const existing = bySystem.get(system);
      const fallback = base.systems.find((s) => s.system === system)!;
      return existing ? { ...fallback, ...existing, system } : fallback;
    }),
    previousServices,
    aiSuggestions,
    onboardingComplete: raw.onboardingComplete === true,
  };
}

/** Rule-based suggestions (always available); AI can refine later. */
export function suggestServicesFromHistory(
  previous: PreviousServiceRecord[],
  profile: PropertyHealthProfile
): AiServiceSuggestion[] {
  const suggestions: AiServiceSuggestion[] = [];
  const push = (s: Omit<AiServiceSuggestion, "id">) => {
    if (suggestions.some((x) => x.title === s.title)) return;
    suggestions.push({ ...s, id: `sug_${suggestions.length + 1}_${Date.now()}` });
  };

  const systemsDone = new Set(previous.map((p) => p.system));
  const titles = previous.map((p) => `${p.title} ${p.notes || ""}`.toLowerCase()).join(" ");

  if (systemsDone.has("HVAC") || /hvac|ac |furnace|filter/.test(titles)) {
    push({
      title: "HVAC filter replacement",
      reason: "Filters are typically due every 1–3 months after service.",
      system: "HVAC",
      urgency: "soon",
    });
    push({
      title: "Annual HVAC tune-up",
      reason: "Keeps efficiency high and catches issues before peak season.",
      system: "HVAC",
      urgency: "this_year",
    });
  } else {
    push({
      title: "First HVAC inspection",
      reason: "No HVAC history on file — an inspection helps baseline your home health.",
      system: "HVAC",
      urgency: "this_year",
    });
  }

  if (systemsDone.has("Plumbing") || /plumb|leak|drain|water heater/.test(titles)) {
    push({
      title: "Water heater flush",
      reason: "Annual flushing extends tank life after plumbing work nearby.",
      system: "Plumbing",
      urgency: "this_year",
    });
  }

  if (systemsDone.has("Pest") || /pest|termite/.test(titles)) {
    push({
      title: "Follow-up pest treatment",
      reason: "Most pest plans need a seasonal revisit to stay effective.",
      system: "Pest",
      urgency: "soon",
    });
  } else {
    push({
      title: "Seasonal pest prevention",
      reason: "Preventative treatment is cheaper than waiting for an infestation.",
      system: "Pest",
      urgency: "this_year",
    });
  }

  if (systemsDone.has("Roof") || /roof|gutter/.test(titles)) {
    push({
      title: "Gutter cleaning & roof check",
      reason: "After roof work, gutters and flashings should be checked each season.",
      system: "Roof",
      urgency: "this_year",
    });
  }

  if (systemsDone.has("Electrical") || /electric|panel|outlet/.test(titles)) {
    push({
      title: "Electrical safety check",
      reason: "Panels and GFCI outlets benefit from a periodic pro inspection.",
      system: "Electrical",
      urgency: "later",
    });
  }

  if (systemsDone.has("Appliances") || /dishwasher|fridge|washer|appliance/.test(titles)) {
    push({
      title: "Appliance maintenance visit",
      reason: "Cleaning coils/filters after a repair prevents repeat callbacks.",
      system: "Appliances",
      urgency: "this_year",
    });
  }

  if (!systemsDone.has("Safety")) {
    push({
      title: "Smoke & CO detector check",
      reason: "Safety devices should be tested at least twice a year.",
      system: "Safety",
      urgency: "soon",
    });
  }

  // Nudge systems marked due_soon / attention
  for (const s of profile.systems) {
    if (s.status === "due_soon" || s.status === "attention") {
      push({
        title: `${s.system} follow-up`,
        reason: s.nextAction || `${s.system} is flagged in your home health.`,
        system: s.system,
        urgency: s.status === "attention" ? "soon" : "this_year",
      });
    }
  }

  return suggestions.slice(0, 6);
}

export function applyPreviousServicesToSystems(
  profile: PropertyHealthProfile,
  previous: PreviousServiceRecord[]
): PropertyHealthProfile {
  let next = { ...profile, systems: profile.systems.map((s) => ({ ...s })) };
  for (const svc of previous) {
    if (svc.system === "Other") continue;
    const dateLabel = svc.date
      ? new Date(svc.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "recently";
    next = applyHealthUpdate(next, {
      system: svc.system,
      status: "good",
      nextAction: `Last service ${dateLabel}${svc.company ? ` · ${svc.company}` : ""}`,
      notes: svc.notes || svc.title,
      updatedBy: "homeowner",
    });
  }
  return next;
}

export function needsHealthOnboarding(profile: PropertyHealthProfile, jobCountForProperty: number): boolean {
  if (profile.onboardingComplete) return false;
  if (jobCountForProperty > 0) return false;
  return true;
}

const OPEN_STATUSES = new Set([
  "draft",
  "ai_review_complete",
  "awaiting_service_payment",
  "matching",
  "bids_open",
  "proposal_sent",
  "proposal_accepted",
  "scheduled",
  "contractor_en_route",
  "work_started",
]);

const IN_PROGRESS_STATUSES = new Set([
  "scheduled",
  "contractor_en_route",
  "work_started",
]);

const COMPLETED_STATUSES = new Set([
  "work_completed",
  "customer_review_pending",
  "admin_review_pending",
  "payout_pending",
  "paid_out",
  "closed",
]);

export function mergeHealthWithJobs(
  profile: PropertyHealthProfile,
  jobs: ManagedJob[],
  propertyId?: number | null
): PropertyHealthProfile {
  const scoped = propertyId
    ? jobs.filter((j) => !j.propertyId || Number(j.propertyId) === Number(propertyId))
    : jobs;

  const systems = profile.systems.map((entry) => {
    const open = scoped.find(
      (j) => OPEN_STATUSES.has(j.status) && serviceToSystem(j.category, j.title) === entry.system
    );
    if (open) {
      return {
        ...entry,
        status: IN_PROGRESS_STATUSES.has(open.status) ? ("attention" as const) : ("attention" as const),
        nextAction: open.title || `${entry.system} request open`,
        relatedJobId: open.id,
        updatedBy: entry.updatedBy || "system",
      };
    }
    return entry;
  });

  return { ...profile, systems };
}

export function healthScore(profile: PropertyHealthProfile): number {
  const weights: Record<SystemHealthStatus, number> = {
    good: 100,
    due_soon: 78,
    attention: 55,
    critical: 25,
  };
  const avg =
    profile.systems.reduce((sum, s) => sum + weights[s.status], 0) / Math.max(1, profile.systems.length);
  return Math.round(avg);
}

export function healthHeadline(score: number): string {
  if (score >= 90) return "Everything looks good";
  if (score >= 75) return "A few items need attention soon";
  if (score >= 55) return "Open issues need your attention";
  return "Priority repairs recommended";
}

export function statusLabel(status: SystemHealthStatus): string {
  switch (status) {
    case "good":
      return "Good";
    case "due_soon":
      return "Due Soon";
    case "attention":
      return "Attention";
    case "critical":
      return "Critical";
  }
}

export function statusTone(status: SystemHealthStatus): string {
  switch (status) {
    case "good":
      return "bg-emerald-500";
    case "due_soon":
      return "bg-amber-400";
    case "attention":
      return "bg-amber-500";
    case "critical":
      return "bg-red-500";
  }
}

export function jobStats(jobs: ManagedJob[]) {
  let open = 0;
  let inProgress = 0;
  let completed = 0;
  let spend = 0;
  for (const j of jobs) {
    if (IN_PROGRESS_STATUSES.has(j.status)) inProgress += 1;
    else if (OPEN_STATUSES.has(j.status)) open += 1;
    else if (COMPLETED_STATUSES.has(j.status)) completed += 1;
    const amt = Number(j.customerRetailEstimateHigh || j.customerRetailEstimateLow || 0);
    if (COMPLETED_STATUSES.has(j.status) && Number.isFinite(amt)) spend += amt;
  }
  return { open, inProgress, completed, spend };
}

export function activeServiceJob(jobs: ManagedJob[]): ManagedJob | null {
  const priority = ["work_started", "contractor_en_route", "scheduled", "proposal_accepted", "proposal_sent"];
  for (const status of priority) {
    const hit = jobs.find((j) => j.status === status);
    if (hit) return hit;
  }
  return jobs.find((j) => OPEN_STATUSES.has(j.status)) || null;
}

export function timelineStep(status: string): number {
  if (["draft", "ai_review_complete", "awaiting_service_payment", "matching", "bids_open"].includes(status)) return 0;
  if (["proposal_sent", "proposal_accepted", "scheduled"].includes(status)) return 1;
  if (["contractor_en_route", "work_started"].includes(status)) return 2;
  if (COMPLETED_STATUSES.has(status)) return 3;
  return 0;
}

export function formatPropertyLine(p?: Property | null): string {
  if (!p) return "Add your property address";
  return [p.addressLine1, p.city, p.state].filter(Boolean).join(", ") || p.addressLine1;
}

export function applyHealthUpdate(
  profile: PropertyHealthProfile,
  update: {
    system: PropertySystem;
    status?: SystemHealthStatus;
    nextAction?: string;
    notes?: string;
    relatedJobId?: number | null;
    updatedBy?: SystemHealthEntry["updatedBy"];
  }
): PropertyHealthProfile {
  return {
    ...profile,
    systems: profile.systems.map((s) =>
      s.system === update.system
        ? {
            ...s,
            status: update.status || s.status,
            nextAction: update.nextAction?.trim() || s.nextAction,
            notes: update.notes ?? s.notes,
            relatedJobId: update.relatedJobId ?? s.relatedJobId,
            updatedAt: new Date().toISOString(),
            updatedBy: update.updatedBy || "system",
          }
        : s
    ),
  };
}
