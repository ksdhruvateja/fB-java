/**
 * AI Property Advisor — rule-based Home Updates from actual stored property data.
 * Never invents facts; only recommends from passport systems, health history, docs, and jobs.
 */
import type { HomeSystemRecord, ManagedJob, Property, PropertyDocument } from "./managedJobs";
import {
  normalizeHealthProfile,
  serviceToSystem,
  type PropertyHealthProfile,
  type PropertySystem,
  type PreviousServiceRecord,
} from "./homeownerPropertyHealth";
import type { HomeownerArea, HomeownerService } from "./homeownerCategories";

export type HomeUpdateLevel = "informational" | "upcoming" | "due" | "attention" | "high_priority";

export type HomeUpdateAction =
  | "add_details"
  | "view_details"
  | "schedule_service"
  | "request_inspection"
  | "view_warranty"
  | "view_inspection"
  | "view_previous_service";

export type HomeUpdateItem = {
  id: string;
  systemKey: string;
  systemLabel: string;
  level: HomeUpdateLevel;
  title: string;
  summary: string;
  why: string;
  relevantDateLabel?: string | null;
  relevantDate?: string | null;
  primaryAction: HomeUpdateAction;
  primaryLabel: string;
  secondaryLabel?: string;
  requestPrefill?: {
    systemId?: string;
    service?: HomeownerService;
    area?: HomeownerArea;
    description?: string;
  };
  feedAt: string;
};

export type HomeUpdatePreference = {
  dismissed?: Record<string, string>;
  snoozedUntil?: Record<string, string>;
  history?: Array<{
    id: string;
    systemLabel: string;
    title: string;
    level: HomeUpdateLevel;
    status: "generated" | "scheduled" | "dismissed" | "snoozed" | "resolved";
    generatedAt: string;
    basedOn?: string;
    relatedJobId?: number | null;
  }>;
};

export type HomeUpdateFeedEvent = {
  id: string;
  at: string;
  kind: "recommendation" | "document" | "service" | "system";
  title: string;
  subtitle?: string;
  systemLabel?: string;
};

export type HomeUpdatesSnapshot = {
  items: HomeUpdateItem[];
  summary: {
    trackedSystems: number;
    needsAttention: number;
    upToDate: number;
    needsInfo: number;
  };
  feed: HomeUpdateFeedEvent[];
};

const MS_DAY = 24 * 60 * 60 * 1000;

const SYSTEM_META: Record<
  string,
  {
    label: string;
    propertySystem: PropertySystem;
    requestSystemId: string;
    service: HomeownerService;
    area: HomeownerArea;
    maintMonths: number;
    inspectYears: number;
  }
> = {
  hvac: {
    label: "HVAC",
    propertySystem: "HVAC",
    requestSystemId: "hvac",
    service: "HVAC & Heating/Cooling",
    area: "Garage",
    maintMonths: 12,
    inspectYears: 2,
  },
  water_heater: {
    label: "Water Heater",
    propertySystem: "Plumbing",
    requestSystemId: "plumbing",
    service: "Plumbing",
    area: "Kitchen",
    maintMonths: 24,
    inspectYears: 3,
  },
  roof: {
    label: "Roof",
    propertySystem: "Roof",
    requestSystemId: "roofing",
    service: "Roofing & Gutters",
    area: "Gutters",
    maintMonths: 36,
    inspectYears: 3,
  },
  refrigerator: {
    label: "Refrigerator",
    propertySystem: "Appliances",
    requestSystemId: "appliance",
    service: "Appliances",
    area: "Kitchen",
    maintMonths: 24,
    inspectYears: 5,
  },
  dishwasher: {
    label: "Dishwasher",
    propertySystem: "Appliances",
    requestSystemId: "appliance",
    service: "Appliances",
    area: "Kitchen",
    maintMonths: 24,
    inspectYears: 5,
  },
  plumbing: {
    label: "Plumbing",
    propertySystem: "Plumbing",
    requestSystemId: "plumbing",
    service: "Plumbing",
    area: "Kitchen",
    maintMonths: 24,
    inspectYears: 3,
  },
  electrical: {
    label: "Electrical",
    propertySystem: "Electrical",
    requestSystemId: "electrical",
    service: "Electrical",
    area: "Kitchen",
    maintMonths: 36,
    inspectYears: 3,
  },
  pest: {
    label: "Pest Control",
    propertySystem: "Pest",
    requestSystemId: "pest",
    service: "Pest Control",
    area: "Garage",
    maintMonths: 6,
    inspectYears: 1,
  },
  safety: {
    label: "Safety",
    propertySystem: "Safety",
    requestSystemId: "handyman",
    service: "Handyman",
    area: "Garage",
    maintMonths: 12,
    inspectYears: 1,
  },
};

function monthsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (MS_DAY * 30.44);
}

function yearsBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (MS_DAY * 365.25);
}

function parseLooseDate(raw?: string | number | null): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw >= 1900 && raw <= 2100) return new Date(Date.UTC(raw, 0, 1));
    return null;
  }
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  }
  const named = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const d2 = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function fmtApproxAge(months: number) {
  if (months < 1.5) return "less than a month";
  if (months < 18) return `${Math.round(months)} months`;
  const y = months / 12;
  return `${y.toFixed(y >= 10 ? 0 : 1)} years`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function systemMetaForKey(key: string, name?: string) {
  const k = String(key || "").toLowerCase();
  if (SYSTEM_META[k]) return SYSTEM_META[k];
  const mapped = serviceToSystem(name || key, name || key);
  if (mapped === "HVAC") return SYSTEM_META.hvac;
  if (mapped === "Roof") return SYSTEM_META.roof;
  if (mapped === "Plumbing") return SYSTEM_META.plumbing;
  if (mapped === "Electrical") return SYSTEM_META.electrical;
  if (mapped === "Pest") return SYSTEM_META.pest;
  if (mapped === "Safety") return SYSTEM_META.safety;
  if (mapped === "Appliances") return SYSTEM_META.refrigerator;
  return {
    label: name || key || "Home system",
    propertySystem: (mapped || "Appliances") as PropertySystem,
    requestSystemId: "other",
    service: "Other" as HomeownerService,
    area: "Kitchen" as HomeownerArea,
    maintMonths: 24,
    inspectYears: 3,
  };
}

function levelRank(level: HomeUpdateLevel) {
  return { high_priority: 0, attention: 1, due: 2, upcoming: 3, informational: 4 }[level];
}

function isSuppressed(id: string, prefs?: HomeUpdatePreference | null, now = new Date()) {
  if (!prefs) return false;
  if (prefs.dismissed?.[id]) return true;
  const until = prefs.snoozedUntil?.[id];
  if (until) {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) return true;
  }
  return false;
}

function lastServiceForSystem(
  sys: HomeSystemRecord,
  previous: PreviousServiceRecord[],
  jobs: ManagedJob[],
  meta: ReturnType<typeof systemMetaForKey>,
  propertyId?: number
): Date | null {
  const fromSys = parseLooseDate(sys.lastService);
  let best = fromSys;
  for (const s of previous) {
    if (s.system !== meta.propertySystem && s.system !== "Other") continue;
    const d = parseLooseDate(s.date);
    if (d && (!best || d > best)) best = d;
  }
  for (const j of jobs) {
    if (propertyId != null && j.propertyId != null && Number(j.propertyId) !== propertyId) continue;
    const done = /complete|paid|closed|review/i.test(String(j.status || ""));
    if (!done) continue;
    const mapped = serviceToSystem(j.category, j.title);
    if (mapped !== meta.propertySystem) continue;
    const d = parseLooseDate(j.completedAt || j.updatedAt || j.createdAt);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

function buildSystemRecommendation(
  sys: HomeSystemRecord,
  ctx: {
    previous: PreviousServiceRecord[];
    jobs: ManagedJob[];
    docs: PropertyDocument[];
    propertyId?: number;
    now: Date;
  }
): HomeUpdateItem | null {
  const meta = systemMetaForKey(sys.key, sys.name);
  const installed = parseLooseDate(sys.installedYear);
  const warrantyUntil = parseLooseDate(sys.warrantyUntil);
  const lastService = lastServiceForSystem(sys, ctx.previous, ctx.jobs, meta, ctx.propertyId);
  const ageYears = installed ? yearsBetween(installed, ctx.now) : null;
  const monthsSinceService = lastService ? monthsBetween(lastService, ctx.now) : null;

  const hasAnyHistory =
    Boolean(sys.lastService?.trim()) ||
    Boolean(sys.installedYear) ||
    Boolean(sys.warrantyUntil?.trim()) ||
    Boolean(sys.notes?.trim()) ||
    Boolean(sys.brand?.trim());

  // Structured follow-up (from confirmed inspection extract or homeowner entry)
  const followDue = parseLooseDate(sys.followUpDueDate);
  if (followDue && ctx.now.getTime() >= followDue.getTime()) {
    const id = `${sys.key}|followup|${followDue.toISOString().slice(0, 10)}`;
    const recText = String(sys.followUpRecommendation || "").trim();
    return {
      id,
      systemKey: sys.key,
      systemLabel: meta.label,
      level: "high_priority",
      title: "Follow-up recommended",
      summary: recText
        ? `Your previous inspection recommended: ${recText} That recommendation period has now passed. Consider having the system inspected.`
        : "Your previous inspection recommended follow-up around this time. Consider having the system inspected.",
      why: `Based on your recorded follow-up date of ${fmtDate(followDue)}${recText ? ` (“${recText.slice(0, 120)}”)` : ""}.`,
      relevantDateLabel: "Follow-up due",
      relevantDate: fmtDate(followDue),
      primaryAction: "request_inspection",
      primaryLabel: "Request Service",
      secondaryLabel: "View Details",
      requestPrefill: {
        systemId: meta.requestSystemId,
        service: meta.service,
        area: meta.area,
        description: `Follow-up for ${meta.label}${recText ? `: ${recText.slice(0, 200)}` : "."}`,
      },
      feedAt: ctx.now.toISOString(),
    };
  }

  // Follow-up from notes (inspection recommendations)
  const notes = String(sys.notes || "");
  const followUpMatch = notes.match(
    /recommend(?:ed|s)?[^.]*?(?:within|in|by)\s+(\d+)\s*(month|months|year|years)/i
  );
  const followAnchor = lastService || parseLooseDate(sys.lastInspection);
  if (followUpMatch && followAnchor) {
    const n = Number(followUpMatch[1]);
    const unit = followUpMatch[2].toLowerCase();
    const dueMs = followAnchor.getTime() + (unit.startsWith("year") ? n * 365.25 : n * 30.44) * MS_DAY;
    if (ctx.now.getTime() >= dueMs) {
      const id = `${sys.key}|followup|${followAnchor.toISOString().slice(0, 10)}`;
      return {
        id,
        systemKey: sys.key,
        systemLabel: meta.label,
        level: "high_priority",
        title: "Follow-up recommended",
        summary:
          "Your previous notes recommended checking this system around this time. Consider having it inspected.",
        why: `Based on your notes and last recorded service/inspection on ${fmtDate(followAnchor)}.`,
        relevantDateLabel: "Last recorded service",
        relevantDate: fmtDate(followAnchor),
        primaryAction: "request_inspection",
        primaryLabel: "Request Inspection",
        secondaryLabel: "Not now",
        requestPrefill: {
          systemId: meta.requestSystemId,
          service: meta.service,
          area: meta.area,
          description: `Follow-up inspection for ${meta.label}. Notes: ${notes.slice(0, 240)}`,
        },
        feedAt: ctx.now.toISOString(),
      };
    }
  }

  // Warranty ending soon
  if (warrantyUntil) {
    const daysLeft = (warrantyUntil.getTime() - ctx.now.getTime()) / MS_DAY;
    if (daysLeft >= 0 && daysLeft <= 90) {
      const id = `${sys.key}|warranty|${warrantyUntil.toISOString().slice(0, 10)}`;
      return {
        id,
        systemKey: sys.key,
        systemLabel: meta.label,
        level: daysLeft <= 30 ? "due" : "upcoming",
        title: "Warranty ending soon",
        summary: `Your recorded manufacturer's warranty expires in approximately ${Math.max(1, Math.round(daysLeft))} days. Review your warranty information before it expires.`,
        why: `Based on your recorded warranty end date of ${fmtDate(warrantyUntil)}.`,
        relevantDateLabel: "Warranty expires",
        relevantDate: fmtDate(warrantyUntil),
        primaryAction: "view_warranty",
        primaryLabel: "View Warranty",
        secondaryLabel: "Remind me later",
        requestPrefill: {
          systemId: meta.requestSystemId,
          service: meta.service,
          area: meta.area,
          description: `${meta.label} warranty review / inspection before expiration.`,
        },
        feedAt: ctx.now.toISOString(),
      };
    }
  }

  // Missing information
  if (!hasAnyHistory) {
    const id = `${sys.key}|info_needed`;
    return {
      id,
      systemKey: sys.key,
      systemLabel: meta.label,
      level: "informational",
      title: "Information needed",
      summary: `We don't have an installation date or previous service history for your ${meta.label.toLowerCase()}. Adding this information can help FixBridge provide better maintenance reminders.`,
      why: "FixBridge only recommends based on details you've saved for this system.",
      primaryAction: "add_details",
      primaryLabel: "Add Details",
      secondaryLabel: "Not now",
      feedAt: ctx.now.toISOString(),
    };
  }

  // Maintenance / inspection cadence from last service
  if (monthsSinceService != null) {
    const dueSoon = meta.maintMonths * 0.85;
    const overdue = meta.maintMonths;
    const veryOverdue = meta.maintMonths * 1.5;

    if (monthsSinceService >= veryOverdue) {
      const id = `${sys.key}|maint|${lastService!.toISOString().slice(0, 10)}|attention`;
      return {
        id,
        systemKey: sys.key,
        systemLabel: meta.label,
        level: "attention",
        title: "Inspection recommended",
        summary: `Your records show the ${meta.label.toLowerCase()} was last serviced ${fmtApproxAge(monthsSinceService)} ago. Consider having it checked before minor issues become larger repairs.`,
        why: `No newer ${meta.label} maintenance record is on file after ${fmtDate(lastService!)}.`,
        relevantDateLabel: "Last recorded service",
        relevantDate: fmtDate(lastService!),
        primaryAction: "request_inspection",
        primaryLabel: `Review ${meta.label}`,
        secondaryLabel: "Remind me later",
        requestPrefill: {
          systemId: meta.requestSystemId,
          service: meta.service,
          area: meta.area,
          description: `${meta.label} inspection — last recorded service ${fmtDate(lastService!)}.`,
        },
        feedAt: ctx.now.toISOString(),
      };
    }

    if (monthsSinceService >= overdue) {
      const id = `${sys.key}|maint|${lastService!.toISOString().slice(0, 10)}|due`;
      return {
        id,
        systemKey: sys.key,
        systemLabel: meta.label,
        level: "due",
        title: "Maintenance may be due",
        summary: `Your records show the ${meta.label.toLowerCase()} was last serviced ${fmtApproxAge(monthsSinceService)} ago. Consider scheduling an inspection or maintenance visit.`,
        why: `Based on your recorded service date of ${fmtDate(lastService!)}.`,
        relevantDateLabel: "Last recorded service",
        relevantDate: fmtDate(lastService!),
        primaryAction: "schedule_service",
        primaryLabel: "Schedule Service",
        secondaryLabel: "Not now",
        requestPrefill: {
          systemId: meta.requestSystemId,
          service: meta.service,
          area: meta.area,
          description: `${meta.label} maintenance visit.`,
        },
        feedAt: ctx.now.toISOString(),
      };
    }

    if (monthsSinceService >= dueSoon) {
      const id = `${sys.key}|maint|${lastService!.toISOString().slice(0, 10)}|upcoming`;
      return {
        id,
        systemKey: sys.key,
        systemLabel: meta.label,
        level: "upcoming",
        title: "Maintenance coming up",
        summary: `Based on your previous service date, you may want to plan another ${meta.label} maintenance visit soon.`,
        why: `Last recorded service was ${fmtDate(lastService!)} (${fmtApproxAge(monthsSinceService)} ago).`,
        relevantDateLabel: "Last recorded service",
        relevantDate: fmtDate(lastService!),
        primaryAction: "view_details",
        primaryLabel: "View Details",
        secondaryLabel: "Remind me later",
        requestPrefill: {
          systemId: meta.requestSystemId,
          service: meta.service,
          area: meta.area,
          description: `${meta.label} maintenance planning.`,
        },
        feedAt: ctx.now.toISOString(),
      };
    }
  }

  // Age-based inspection without claiming replacement
  if (ageYears != null && ageYears >= meta.inspectYears * 3 && monthsSinceService == null) {
    const id = `${sys.key}|age|${installed!.getUTCFullYear()}|inspect`;
    return {
      id,
      systemKey: sys.key,
      systemLabel: meta.label,
      level: "attention",
      title: "Consider an inspection",
      summary: `Your recorded ${meta.label.toLowerCase()} is approximately ${Math.round(ageYears)} years old, and FixBridge doesn't have any recent service history. A professional inspection can help determine its current condition.`,
      why: `Based on your recorded installation year (${installed!.getUTCFullYear()}) and missing recent service history.`,
      relevantDateLabel: "Installed",
      relevantDate: String(installed!.getUTCFullYear()),
      primaryAction: "request_inspection",
      primaryLabel: "Request Inspection",
      secondaryLabel: "Not now",
      requestPrefill: {
        systemId: meta.requestSystemId,
        service: meta.service,
        area: meta.area,
        description: `${meta.label} condition inspection.`,
      },
      feedAt: ctx.now.toISOString(),
    };
  }

  // Roof / HVAC without recent inspection when we have install year but old last service gap handled above
  if (ageYears != null && ageYears >= 10 && monthsSinceService != null && monthsSinceService >= meta.inspectYears * 12) {
    const id = `${sys.key}|age_service|${installed!.getUTCFullYear()}|${lastService!.toISOString().slice(0, 10)}`;
    return {
      id,
      systemKey: sys.key,
      systemLabel: meta.label,
      level: "attention",
      title: "Inspection recommended",
      summary: `Your ${meta.label.toLowerCase()} is approximately ${Math.round(ageYears)} years old and we don't have a recent inspection on file. Consider scheduling an inspection to check its current condition.`,
      why: `Installation year ${installed!.getUTCFullYear()}; last recorded service ${fmtDate(lastService!)}.`,
      relevantDateLabel: "Last recorded service",
      relevantDate: fmtDate(lastService!),
      primaryAction: "request_inspection",
      primaryLabel: `Request ${meta.label} Inspection`,
      secondaryLabel: "Remind me later",
      requestPrefill: {
        systemId: meta.requestSystemId,
        service: meta.service,
        area: meta.area,
        description: `${meta.label} inspection.`,
      },
      feedAt: ctx.now.toISOString(),
    };
  }

  return null;
}

function previousServiceWarrantyReminders(
  previous: PreviousServiceRecord[],
  now: Date
): HomeUpdateItem[] {
  const out: HomeUpdateItem[] = [];
  for (const s of previous) {
    const notes = `${s.notes || ""} ${s.title || ""}`;
    const m = notes.match(/(\d+)\s*[- ]?month(?:s)?\s+(?:workmanship\s+)?warranty/i);
    const served = parseLooseDate(s.date);
    if (!m || !served) continue;
    const months = Number(m[1]);
    const expires = new Date(served.getTime() + months * 30.44 * MS_DAY);
    const daysLeft = (expires.getTime() - now.getTime()) / MS_DAY;
    if (daysLeft < 0 || daysLeft > 45) continue;
    const meta = systemMetaForKey(String(s.system || "other").toLowerCase(), String(s.system));
    const id = `prev|${s.id}|warranty`;
    out.push({
      id,
      systemKey: String(s.system || "other").toLowerCase(),
      systemLabel: meta.label,
      level: daysLeft <= 14 ? "due" : "upcoming",
      title: "Follow-up reminder",
      summary: `A previous repair was completed ${fmtApproxAge(monthsBetween(served, now))} ago and included a ${months}-month workmanship warranty. Your warranty expires soon.`,
      why: `Based on your logged service “${s.title}” on ${fmtDate(served)}.`,
      relevantDateLabel: "Previous service",
      relevantDate: fmtDate(served),
      primaryAction: "view_previous_service",
      primaryLabel: "View Previous Service",
      secondaryLabel: "Remind me later",
      requestPrefill: {
        systemId: meta.requestSystemId,
        service: meta.service,
        area: meta.area,
        description: `Follow-up related to previous ${meta.label} service.`,
      },
      feedAt: now.toISOString(),
    });
  }
  return out;
}

function inspectionDocReminders(docs: PropertyDocument[], now: Date): HomeUpdateItem[] {
  const out: HomeUpdateItem[] = [];
  for (const d of docs) {
    if (String(d.category) !== "inspection") continue;
    const created = parseLooseDate(d.createdAt);
    if (!created) continue;
    const years = yearsBetween(created, now);
    if (years < 3) continue;
    const meta = systemMetaForKey(String(d.systemKey || "roof"), d.title || "Inspection");
    const id = `doc|${d.id}|stale_inspection`;
    out.push({
      id,
      systemKey: meta.requestSystemId,
      systemLabel: meta.label,
      level: "attention",
      title: "Inspection recommended",
      summary: `Your last recorded ${meta.label.toLowerCase()} inspection report is more than ${Math.floor(years)} years old. It may be a good time to schedule another inspection.`,
      why: `Based on your uploaded inspection “${d.title || d.fileName || "report"}” from ${fmtDate(created)}.`,
      relevantDateLabel: "Last inspection on file",
      relevantDate: fmtDate(created),
      primaryAction: "view_inspection",
      primaryLabel: "View Inspection",
      secondaryLabel: "Request Inspection",
      requestPrefill: {
        systemId: meta.requestSystemId,
        service: meta.service,
        area: meta.area,
        description: `${meta.label} inspection follow-up.`,
      },
      feedAt: now.toISOString(),
    });
  }
  return out;
}

export function buildHomeUpdatesSnapshot(opts: {
  property?: Property | null;
  health?: PropertyHealthProfile | null;
  jobs?: ManagedJob[];
  prefs?: HomeUpdatePreference | null;
  now?: Date;
}): HomeUpdatesSnapshot {
  const now = opts.now || new Date();
  const property = opts.property || null;
  const health = normalizeHealthProfile(opts.health || (property?.healthProfile as PropertyHealthProfile | null));
  const jobs = opts.jobs || [];
  const prefs = opts.prefs || (health as PropertyHealthProfile & { homeUpdateState?: HomeUpdatePreference }).homeUpdateState;
  const docs = property?.documents || [];
  const systems = property?.homeSystems || [];

  const items: HomeUpdateItem[] = [];
  for (const sys of systems) {
    const rec = buildSystemRecommendation(sys, {
      previous: health.previousServices || [],
      jobs,
      docs,
      propertyId: property?.id,
      now,
    });
    if (rec) items.push(rec);
  }
  items.push(...previousServiceWarrantyReminders(health.previousServices || [], now));
  items.push(...inspectionDocReminders(docs, now));

  // Default passport systems that exist as keys but empty — still covered by loop.
  // Deduplicate by id
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const active = unique
    .filter((i) => !isSuppressed(i.id, prefs, now))
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.systemLabel.localeCompare(b.systemLabel));

  const trackedSystems = Math.max(systems.length, health.systems?.length || 0);
  const needsInfo = active.filter((i) => i.level === "informational").length;
  const needsAttention = active.filter((i) =>
    ["due", "attention", "high_priority", "upcoming"].includes(i.level)
  ).length;
  const upToDate = Math.max(0, trackedSystems - needsAttention - needsInfo);

  const feed: HomeUpdateFeedEvent[] = [];
  for (const i of active.slice(0, 8)) {
    feed.push({
      id: `rec-${i.id}`,
      at: i.feedAt,
      kind: "recommendation",
      title: i.systemLabel,
      subtitle: i.title,
      systemLabel: i.systemLabel,
    });
  }
  for (const d of docs.slice(0, 10)) {
    feed.push({
      id: `doc-${d.id}`,
      at: d.createdAt || now.toISOString(),
      kind: "document",
      title: d.title || d.fileName || "Document added",
      subtitle: String(d.category || "document"),
      systemLabel: d.systemKey || undefined,
    });
  }
  for (const j of jobs.filter((x) => /complete|paid|closed/i.test(String(x.status || ""))).slice(0, 8)) {
    feed.push({
      id: `job-${j.id}`,
      at: j.completedAt || j.updatedAt || j.createdAt || now.toISOString(),
      kind: "service",
      title: j.title || j.category || "Service completed",
      subtitle: "Service completed",
    });
  }
  feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    items: active,
    summary: {
      trackedSystems,
      needsAttention,
      upToDate,
      needsInfo,
    },
    feed: feed.slice(0, 20),
  };
}

export function snoozeUntilIso(option: "1w" | "1m" | "3m" | string, now = new Date()) {
  const d = new Date(now);
  if (option === "1w") d.setDate(d.getDate() + 7);
  else if (option === "1m") d.setMonth(d.getMonth() + 1);
  else if (option === "3m") d.setMonth(d.getMonth() + 3);
  else {
    const custom = new Date(option);
    if (!Number.isNaN(custom.getTime())) return custom.toISOString();
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

export function applyHomeUpdatePreference(
  health: PropertyHealthProfile,
  patch: {
    dismissId?: string;
    snoozeId?: string;
    snoozeOption?: "1w" | "1m" | "3m" | string;
    historyEntry?: HomeUpdatePreference["history"] extends (infer H)[] | undefined ? H : never;
  }
): PropertyHealthProfile & { homeUpdateState: HomeUpdatePreference } {
  const current = ((health as { homeUpdateState?: HomeUpdatePreference }).homeUpdateState ||
    {}) as HomeUpdatePreference;
  const next: HomeUpdatePreference = {
    dismissed: { ...(current.dismissed || {}) },
    snoozedUntil: { ...(current.snoozedUntil || {}) },
    history: [...(current.history || [])].slice(0, 80),
  };
  if (patch.dismissId) {
    next.dismissed![patch.dismissId] = new Date().toISOString();
    delete next.snoozedUntil![patch.dismissId];
  }
  if (patch.snoozeId) {
    next.snoozedUntil![patch.snoozeId] = snoozeUntilIso(patch.snoozeOption || "1m");
  }
  if (patch.historyEntry) {
    next.history!.unshift(patch.historyEntry);
  }
  return { ...health, homeUpdateState: next };
}

export function levelBadgeClass(level: HomeUpdateLevel) {
  switch (level) {
    case "informational":
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "upcoming":
      return "bg-sky-500/10 text-sky-800 dark:text-sky-300";
    case "due":
      return "bg-amber-500/10 text-amber-900 dark:text-amber-300";
    case "attention":
      return "bg-orange-500/10 text-orange-900 dark:text-orange-300";
    case "high_priority":
      return "bg-red-500/10 text-red-800 dark:text-red-300";
  }
}

export function levelLabel(level: HomeUpdateLevel) {
  switch (level) {
    case "informational":
      return "Information needed";
    case "upcoming":
      return "Coming up";
    case "due":
      return "May be due";
    case "attention":
      return "Recommended";
    case "high_priority":
      return "High priority";
  }
}
