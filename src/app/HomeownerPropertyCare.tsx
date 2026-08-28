import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import type { HomeSystemRecord, ManagedJob, Property } from "./managedJobs";
import {
  formatPropertyLine,
  normalizeHealthProfile,
  serviceToSystem,
  type PreviousServiceRecord,
  type PropertyHealthProfile,
  type PropertySystem,
} from "./homeownerPropertyHealth";
import {
  buildHomeUpdatesSnapshot,
  levelBadgeClass,
  levelLabel,
  type HomeUpdateItem,
} from "./homeUpdates";
import type { PropertyCareSection } from "./homeownerNav";
import HomeownerHomeUpdates from "./HomeownerHomeUpdates";
import HomeownerMaintenanceTimeline from "./HomeownerMaintenanceTimeline";
import HomeownerServiceHistory from "./HomeownerServiceHistory";
import HomeownerHealthPanel from "./HomeownerHealthPanel";
import { DEFAULT_HOME_SYSTEMS } from "./HomeownerPropertyPage";

const CARE_TABS: { id: PropertyCareSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "systems", label: "Systems" },
  { id: "timeline", label: "Timeline" },
  { id: "recommendations", label: "Recommendations" },
  { id: "upcoming", label: "Upcoming" },
];

const HISTORY_TYPES = [
  "Previous Repair",
  "Previous Service",
  "Previous Inspection",
  "Maintenance",
  "Installation",
  "Replacement",
  "Warranty",
  "Other",
] as const;

type SystemFilter = "all" | "attention" | "due" | "up_to_date" | "needs_info";

function systemStatusFromUpdates(
  sys: HomeSystemRecord,
  items: HomeUpdateItem[]
): { label: string; level: HomeUpdateItem["level"] | "good" } {
  const hit = items.find((i) => i.systemKey === sys.key);
  if (hit) return { label: hit.title, level: hit.level };
  const hasHistory =
    Boolean(sys.lastService?.trim()) ||
    Boolean(sys.installedYear) ||
    Boolean(sys.warrantyUntil?.trim()) ||
    Boolean(sys.notes?.trim());
  if (!hasHistory) return { label: "No history yet", level: "informational" };
  return { label: "Up to date", level: "good" };
}

function statusChipClass(level: string) {
  if (level === "good") return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  return levelBadgeClass(level as HomeUpdateItem["level"]);
}

function emptyHistoryDraft(): PreviousServiceRecord {
  return {
    id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    system: "HVAC",
    company: "",
    date: "",
    cost: "",
    notes: "",
  };
}

export default function HomeownerPropertyCare({
  properties,
  jobs,
  busy,
  initialSection = "overview",
  initialPropertyId,
  onSaveHealth,
  onAddProperty,
  onRequestService,
  onOpenJob,
  onOpenProperty,
}: {
  properties: Property[];
  jobs: ManagedJob[];
  busy?: boolean;
  initialSection?: PropertyCareSection;
  initialPropertyId?: number | null;
  onSaveHealth: (propertyId: number, next: PropertyHealthProfile) => Promise<void> | void;
  onAddProperty: (input: {
    addressLine1: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
  }) => Promise<Property | null>;
  onRequestService: (prefill?: HomeUpdateItem["requestPrefill"]) => void;
  onOpenJob: (jobId: number) => void;
  onOpenProperty: () => void;
}) {
  const [section, setSection] = useState<PropertyCareSection>(initialSection);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialPropertyId ?? properties[0]?.id ?? null
  );
  const [systemFilter, setSystemFilter] = useState<SystemFilter>("all");
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [historyType, setHistoryType] = useState<(typeof HISTORY_TYPES)[number]>("Previous Service");
  const [draft, setDraft] = useState<PreviousServiceRecord>(emptyHistoryDraft);
  const [showHealthTools, setShowHealthTools] = useState(false);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (initialPropertyId != null) setSelectedId(initialPropertyId);
  }, [initialPropertyId]);

  useEffect(() => {
    if (!selectedId && properties[0]) setSelectedId(properties[0].id);
    if (selectedId && properties.length && !properties.some((p) => p.id === selectedId)) {
      setSelectedId(properties[0]?.id ?? null);
    }
  }, [properties, selectedId]);

  const property = useMemo(
    () => properties.find((p) => p.id === selectedId) || properties[0] || null,
    [properties, selectedId]
  );

  const health = useMemo(
    () =>
      normalizeHealthProfile(
        property
          ? {
              ...(property.healthProfile as PropertyHealthProfile | null),
              beds: property.beds ?? undefined,
              baths: property.baths ?? undefined,
              sqft: property.sqft ?? undefined,
            }
          : null
      ),
    [property]
  );

  const propertyJobs = useMemo(
    () =>
      property?.id != null
        ? jobs.filter((j) => !j.propertyId || Number(j.propertyId) === property.id)
        : jobs,
    [jobs, property?.id]
  );

  const snapshot = useMemo(
    () =>
      buildHomeUpdatesSnapshot({
        property,
        health,
        jobs: propertyJobs,
        prefs: health.homeUpdateState || null,
      }),
    [property, health, propertyJobs]
  );

  const systems = useMemo(() => {
    const existing = property?.homeSystems?.length ? property.homeSystems : DEFAULT_HOME_SYSTEMS;
    const byKey = new Map(existing.map((s) => [s.key || s.name, s]));
    return DEFAULT_HOME_SYSTEMS.map((d) => {
      const hit = byKey.get(d.key) || existing.find((s) => s.name === d.name);
      return hit ? { ...d, ...hit, key: d.key, name: d.name } : { ...d };
    }).concat(
      existing.filter((s) => !DEFAULT_HOME_SYSTEMS.some((d) => d.key === s.key || d.name === s.name))
    );
  }, [property?.homeSystems]);

  const filteredSystems = useMemo(() => {
    return systems.filter((sys) => {
      const st = systemStatusFromUpdates(sys, snapshot.items);
      if (systemFilter === "all") return true;
      if (systemFilter === "attention")
        return st.level === "attention" || st.level === "high_priority";
      if (systemFilter === "due") return st.level === "due" || st.level === "upcoming";
      if (systemFilter === "needs_info") return st.level === "informational";
      if (systemFilter === "up_to_date") return st.level === "good";
      return true;
    });
  }, [systems, snapshot.items, systemFilter]);

  const detail = systems.find((s) => s.key === detailKey) || null;
  const detailRec = detail ? snapshot.items.find((i) => i.systemKey === detail.key) : null;
  const detailDocs = (property?.documents || []).filter((d) => d.systemKey === detail?.key);
  const detailPrevious = (health.previousServices || []).filter((s) => {
    if (!detail) return false;
    const mapped = serviceToSystem(s.system, s.title);
    const meta = serviceToSystem(detail.name, detail.key);
    return mapped === meta || String(s.system).toLowerCase() === detail.key;
  });

  const upcomingRows = useMemo(() => {
    const rows: Array<{ id: string; dateLabel: string; title: string; subtitle?: string; sort: string }> =
      [];
    for (const m of health.maintenance || []) {
      rows.push({
        id: `maint-${m.label}-${m.dueDate}`,
        dateLabel: m.dueDate
          ? new Date(`${m.dueDate}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "Soon",
        title: m.label,
        subtitle: m.system || "Maintenance",
        sort: m.dueDate || "9999",
      });
    }
    for (const item of snapshot.items.filter((i) => i.level === "upcoming" || i.level === "due")) {
      rows.push({
        id: `ai-${item.id}`,
        dateLabel: item.relevantDate || "Suggested",
        title: `${item.systemLabel} · ${item.title}`,
        subtitle: "AI reminder",
        sort: item.relevantDate || "9998",
      });
    }
    for (const j of propertyJobs.filter((x) =>
      ["scheduled", "proposal_accepted", "contractor_accepted"].includes(String(x.status))
    )) {
      rows.push({
        id: `job-${j.id}`,
        dateLabel: j.preferredDate || "Scheduled",
        title: j.title || j.category || "FixBridge job",
        subtitle: "Scheduled service",
        sort: j.preferredDate || j.createdAt || "9997",
      });
    }
    for (const sys of systems) {
      if (!sys.warrantyUntil?.trim()) continue;
      const d = new Date(sys.warrantyUntil);
      if (Number.isNaN(d.getTime())) continue;
      const days = (d.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      if (days < 0 || days > 120) continue;
      rows.push({
        id: `warr-${sys.key}`,
        dateLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        title: `${sys.name} warranty expiration`,
        subtitle: "Warranty",
        sort: sys.warrantyUntil,
      });
    }
    return rows.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
  }, [health.maintenance, snapshot.items, propertyJobs, systems]);

  const lastUpdated = useMemo(() => {
    const dates: number[] = [];
    for (const j of propertyJobs) {
      const t = new Date(j.updatedAt || j.createdAt || "").getTime();
      if (!Number.isNaN(t)) dates.push(t);
    }
    for (const d of property?.documents || []) {
      const t = new Date(d.createdAt || "").getTime();
      if (!Number.isNaN(t)) dates.push(t);
    }
    if (!dates.length) return new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return new Date(Math.max(...dates)).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [propertyJobs, property?.documents]);

  async function saveHistory() {
    if (!property?.id || !draft.title.trim()) return;
    const entry: PreviousServiceRecord = {
      ...draft,
      title: draft.title.trim(),
      notes: [historyType, draft.notes].filter(Boolean).join(" · "),
      id: draft.id || `svc_${Date.now()}`,
    };
    const next: PropertyHealthProfile = {
      ...health,
      previousServices: [entry, ...(health.previousServices || [])],
      onboardingComplete: true,
    };
    await onSaveHealth(property.id, next);
    setShowAddHistory(false);
    setDraft(emptyHistoryDraft());
    setSection("timeline");
  }

  const summary = snapshot.summary;

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
            Property Care
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {property ? formatPropertyLine(property) : "Add a property to track systems and history."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Last updated · {lastUpdated}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddHistory(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Add Previous History
        </button>
      </div>

      {properties.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                property?.id === p.id
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {p.label || p.addressLine1 || `Home #${p.id}`}
            </button>
          ))}
        </div>
      ) : null}

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {CARE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSection(t.id);
              setSystemFilter("all");
            }}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              section === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="space-y-5">
          <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Property Summary
            </p>
            <p className="mt-2 text-lg font-semibold">
              {summary.trackedSystems} system{summary.trackedSystems === 1 ? "" : "s"} tracked
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["attention", `${summary.needsAttention} Need Attention`, "attention"],
                  ["due", `${snapshot.items.filter((i) => i.level === "due" || i.level === "upcoming").length} Due Soon`, "due"],
                  ["up_to_date", `${summary.upToDate} Up to Date`, "up_to_date"],
                  ["needs_info", `${summary.needsInfo} Needs Information`, "needs_info"],
                ] as const
              ).map(([filter, label]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setSystemFilter(filter);
                    setSection("systems");
                  }}
                  className="rounded-2xl border border-border/70 bg-background/70 px-3.5 py-3 text-left text-sm font-semibold hover:border-primary/40"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              FixBridge Home Advisor
            </p>
            <HomeownerHomeUpdates
              property={property}
              health={health}
              jobs={propertyJobs}
              busy={busy}
              compact
              onSaveHealth={async (next) => {
                if (!property?.id) return;
                await onSaveHealth(property.id, next);
              }}
              onRequestService={onRequestService}
              onOpenProperty={onOpenProperty}
            />
            {snapshot.items.length > 0 ? (
              <button
                type="button"
                onClick={() => setSection("recommendations")}
                className="mt-2 text-sm font-semibold text-primary hover:underline"
              >
                View all recommendations →
              </button>
            ) : null}
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-border bg-card/60 p-4">
            <button
              type="button"
              onClick={() => setShowHealthTools((v) => !v)}
              className="text-sm font-semibold text-foreground"
            >
              {showHealthTools ? "Hide" : "Show"} full property health tools
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              Onboarding, AI suggestions, and detailed health scoring from Property Health.
            </p>
            {showHealthTools ? (
              <div className="mt-4">
                <HomeownerHealthPanel
                  properties={property ? [property] : properties}
                  jobs={propertyJobs}
                  busy={busy}
                  onSave={onSaveHealth}
                  onAddProperty={onAddProperty}
                  onRequestService={() => onRequestService()}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {section === "systems" && (
        <div className="space-y-3">
          {systemFilter !== "all" ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Filtered systems</p>
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => setSystemFilter("all")}
              >
                Clear filter
              </button>
            </div>
          ) : null}
          {filteredSystems.map((sys) => {
            const st = systemStatusFromUpdates(sys, snapshot.items);
            const rec = snapshot.items.find((i) => i.systemKey === sys.key);
            return (
              <div
                key={sys.key}
                className="rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{sys.name}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(st.level)}`}
                    >
                      {st.level === "good" ? "Up to date" : levelLabel(st.level as HomeUpdateItem["level"])}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium">{st.label}</p>
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {sys.installedYear ? (
                    <div>
                      <span className="font-medium text-foreground/80">Installed</span> {sys.installedYear}
                    </div>
                  ) : null}
                  {sys.lastService ? (
                    <div>
                      <span className="font-medium text-foreground/80">Last service</span> {sys.lastService}
                    </div>
                  ) : null}
                  {sys.brand ? (
                    <div>
                      <span className="font-medium text-foreground/80">Brand</span> {sys.brand}
                    </div>
                  ) : null}
                </dl>
                {!sys.lastService && !sys.installedYear && !sys.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    We don&apos;t have previous service or inspection records.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailKey(sys.key)}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    View Details
                  </button>
                  {rec?.requestPrefill ? (
                    <button
                      type="button"
                      onClick={() => onRequestService(rec.requestPrefill)}
                      className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                    >
                      Schedule Service <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddHistory(true)}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                    >
                      Add Previous Work
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {section === "timeline" && (
        <div className="space-y-8">
          <HomeownerMaintenanceTimeline
            properties={properties}
            jobs={jobs}
            embedded
            hidePropertyPicker
            selectedPropertyId={property?.id ?? null}
            onSelectedPropertyIdChange={setSelectedId}
            onOpenJob={onOpenJob}
          />
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              FixBridge service records
            </p>
            <HomeownerServiceHistory
              jobs={propertyJobs}
              properties={property ? [property] : properties}
              onOpenTracking={onOpenJob}
              embedded
            />
          </div>
        </div>
      )}

      {section === "recommendations" && (
        <HomeownerHomeUpdates
          property={property}
          health={health}
          jobs={propertyJobs}
          busy={busy}
          onSaveHealth={async (next) => {
            if (!property?.id) return;
            await onSaveHealth(property.id, next);
          }}
          onRequestService={onRequestService}
          onOpenProperty={onOpenProperty}
        />
      )}

      {section === "upcoming" && (
        <div className="rounded-[1.5rem] border border-border/70 bg-card divide-y divide-border shadow-sm">
          {upcomingRows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No upcoming maintenance, warranties, or scheduled jobs yet. Add history or request service to populate this
              list.
            </p>
          ) : (
            upcomingRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.dateLabel}
                  </p>
                  <p className="mt-0.5 font-semibold">{row.title}</p>
                  {row.subtitle ? <p className="text-xs text-muted-foreground">{row.subtitle}</p> : null}
                </div>
                {row.id.startsWith("job-") ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => onOpenJob(Number(row.id.replace("job-", "")))}
                  >
                    View
                  </button>
                ) : row.id.startsWith("ai-") ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => setSection("recommendations")}
                  >
                    Review
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => onRequestService()}
                  >
                    Schedule
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.5rem] border border-border bg-card p-5 shadow-2xl sm:rounded-[1.5rem]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{detail.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {systemStatusFromUpdates(detail, snapshot.items).label}
                </p>
              </div>
              <button type="button" className="rounded-lg p-2 hover:bg-muted" onClick={() => setDetailKey(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  System info
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>Manufacturer · {detail.brand || "—"}</li>
                  <li>Installed · {detail.installedYear || "—"}</li>
                  <li>Last service · {detail.lastService || "—"}</li>
                  <li>Warranty until · {detail.warrantyUntil || "—"}</li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Previous services
                </p>
                {detailPrevious.length === 0 ? (
                  <p className="mt-2 text-muted-foreground">No previous work logged yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {detailPrevious.map((s) => (
                      <li key={s.id} className="rounded-xl border border-border/70 px-3 py-2">
                        <p className="font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {[s.date, s.company, s.cost ? `$${s.cost}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Documents
                </p>
                <p className="mt-2 text-muted-foreground">
                  {detailDocs.length} file{detailDocs.length === 1 ? "" : "s"} linked to this system
                </p>
              </div>
              {detailRec ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    AI recommendation
                  </p>
                  <p className="mt-1 font-medium">{detailRec.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{detailRec.why}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onRequestService(detailRec?.requestPrefill);
                  setDetailKey(null);
                }}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white"
              >
                Schedule Service
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailKey(null);
                  onOpenProperty();
                }}
                className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold"
              >
                Edit in My Property
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddHistory ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[1.5rem] border border-border bg-card p-5 shadow-2xl sm:rounded-[1.5rem]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Previous History</h2>
              <button type="button" className="rounded-lg p-2 hover:bg-muted" onClick={() => setShowAddHistory(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs">
                Type
                <select
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={historyType}
                  onChange={(e) => setHistoryType(e.target.value as (typeof HISTORY_TYPES)[number])}
                >
                  {HISTORY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Title
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. HVAC tune-up"
                />
              </label>
              <label className="grid gap-1 text-xs">
                System
                <select
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={draft.system}
                  onChange={(e) => setDraft({ ...draft, system: e.target.value as PropertySystem })}
                >
                  {["HVAC", "Plumbing", "Electrical", "Roof", "Appliances", "Pest", "Safety", "Other"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    )
                  )}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs">
                  Date
                  <input
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                    placeholder="YYYY-MM-DD"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  Cost
                  <input
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={draft.cost || ""}
                    onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-xs">
                Provider
                <input
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  value={draft.company || ""}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs">
                Notes
                <textarea
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={draft.notes || ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy || !draft.title.trim()}
                onClick={() => void saveHistory()}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Save to timeline
              </button>
              <button
                type="button"
                onClick={() => setShowAddHistory(false)}
                className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
