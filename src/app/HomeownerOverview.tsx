import HomeownerHomeIllustration from "./HomeownerHomeIllustration";
﻿import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  Home,
  Plus,
  Wind,
  Droplets,
  Zap,
  Refrigerator,
  Bug,
  ShieldCheck,
} from "lucide-react";
import type { ManagedJob, Property } from "./managedJobs";
import { formatMoney } from "./managedJobs";
import {
  formatPropertyLine,
  healthHeadline,
  healthScore,
  jobStats,
  mergeHealthWithJobs,
  normalizeHealthProfile,
  statusLabel,
  type PropertyHealthProfile,
  type PropertySystem,
  type SystemHealthStatus,
} from "./homeownerPropertyHealth";
import { buildHomeUpdatesSnapshot } from "./homeUpdates";
import ActiveServiceCards, { activeJobsForHome } from "./ActiveServiceCards";
import { defaultServiceOfferings, frequencyLabel, visibleOfferings } from "./serviceOfferings";
import { ServiceThumb } from "./serviceVisuals";
import BookedServiceNotice from "./BookedServiceNotice";

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtMaintDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SYSTEM_ICONS: Record<PropertySystem, React.ElementType> = {
  HVAC: Wind,
  Plumbing: Droplets,
  Electrical: Zap,
  Roof: Home,
  Appliances: Refrigerator,
  Pest: Bug,
  Safety: ShieldCheck,
};

function scoreRingColor(score: number) {
  if (score >= 90) return { stroke: "#10B981", soft: "rgba(16,185,129,0.12)" };
  if (score >= 75) return { stroke: "#F59E0B", soft: "rgba(245,158,11,0.12)" };
  return { stroke: "#EF4444", soft: "rgba(239,68,68,0.12)" };
}

function statusChip(status: SystemHealthStatus) {
  switch (status) {
    case "good":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "due_soon":
      return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "attention":
      return "bg-orange-500/10 text-orange-800 dark:text-orange-300";
    case "critical":
      return "bg-red-500/10 text-red-700 dark:text-red-300";
  }
}

export default function HomeownerOverview({
  userName,
  property,
  health,
  jobs,
  onRequestService,
  onOpenJob,
  onOpenHealth,
  onOpenProperty,
  onOpenPropertyPicker,
  onOpenQuotes,
  onOpenHomeUpdates,
  onOpenServices,
  quotesWaiting = 0,
}: {
  userName: string;
  property?: Property | null;
  health: PropertyHealthProfile;
  jobs: ManagedJob[];
  onRequestService: () => void;
  onOpenJob: (jobId: number) => void;
  onOpenHealth: () => void;
  onOpenProperty: () => void;
  onOpenPropertyPicker?: () => void;
  onOpenQuotes?: () => void;
  onOpenHomeUpdates?: () => void;
  onOpenServices?: (offeringId?: string) => void;
  quotesWaiting?: number;
}) {
  const propertyJobs = useMemo(
    () =>
      property?.id != null
        ? jobs.filter((j) => Number(j.propertyId) === property.id)
        : jobs,
    [jobs, property?.id]
  );

  const reduceMotion = useReducedMotion();
  const recordedSystems = new Set((property?.healthProfile?.systems || []).map((system) => system.system));
  const merged = mergeHealthWithJobs(health, propertyJobs, property?.id);
  const hasCompleteHealthProfile = merged.systems.every((system) => recordedSystems.has(system.system));
  const score = healthScore(merged);
  const stats = jobStats(propertyJobs);
  const activeJobs = activeJobsForHome(propertyJobs);
  const booked = activeJobs.find((job) =>
    ["paid_for_dispatch", "awaiting_contractor", "contractor_invited"].includes(job.status)
  );
  const popular = visibleOfferings(defaultServiceOfferings()).filter((item) => item.popular).slice(0, 6);
  const recurring = visibleOfferings(defaultServiceOfferings()).filter((item) => item.subscriptionEligible).slice(0, 4);
  const firstName = String(userName || "there").split(" ")[0];
  const ring = scoreRingColor(score);
  const attention = merged.systems.filter((s) => s.status !== "good");
  const sortedSystems = [...merged.systems].sort((a, b) => {
    const rank = { critical: 0, attention: 1, due_soon: 2, good: 3 } as const;
    return rank[a.status] - rank[b.status];
  });

  const upcomingMaint = (merged.maintenance || []).slice(0, 3);
  const homeUpdates = useMemo(
    () =>
      buildHomeUpdatesSnapshot({
        property,
        health,
        jobs: propertyJobs,
        prefs: health.homeUpdateState || null,
      }),
    [property, health, propertyJobs]
  );

  const homeTiles = sortedSystems.slice(0, 4);
  const tileTones = ["bg-[#FF4D1C] text-white", "bg-[#FFF1EB] text-[#2C2926]", "bg-white text-[#2C2926]", "bg-[#F7F2EB] text-[#2C2926]"];

  return (
    <section className="homeowner-overview mx-auto max-w-6xl space-y-8">
      <header className="homeowner-workspace-toolbar flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your home, connected</p>
          <h1 className="text-2xl tracking-tight sm:text-3xl">{greetingForNow()}, {firstName}!</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpenPropertyPicker || onOpenProperty} className="inline-flex max-w-full items-center gap-2 rounded-full bg-card px-4 py-2.5 text-xs font-medium">
            <Home size={14} className="text-primary" /><span className="max-w-64 truncate">{formatPropertyLine(property)}</span>
          </button>
          {onOpenServices ? <button type="button" onClick={() => onOpenServices()} className="rounded-full bg-card px-4 py-2.5 text-xs font-medium">Search services</button> : null}
          <button type="button" onClick={onRequestService} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-white"><Plus size={15} /> Request Service</button>
        </div>
      </header>

      {booked ? <BookedServiceNotice job={booked} onOpenJob={onOpenJob} /> : null}

      <div className="homeowner-workspace-grid grid items-start gap-8 xl:grid-cols-[minmax(170px,.7fr)_minmax(280px,1.65fr)_minmax(220px,.9fr)]">
        <div className="homeowner-scene-stage relative flex min-h-72 flex-col items-center justify-center xl:col-start-2 xl:row-start-1 xl:min-h-[420px]">
          <div className="absolute left-0 top-0">
            <p className="text-xs font-medium text-muted-foreground">{property?.label || "Your home workspace"}</p>
          </div>
          <HomeownerHomeIllustration />
          <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground">Diagnose an issue, arrange a professional, or keep your home records together.</p>
        </div>

        <div className="homeowner-systems-panel space-y-5 xl:col-start-1 xl:row-start-1">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">{firstName}&apos;s home</h2><button type="button" onClick={onOpenHealth} className="text-[11px] font-medium text-primary">All systems</button></div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-1">{homeTiles.map((system) => {
            const Icon = SYSTEM_ICONS[system.system] || Home;
            return <button key={system.system} type="button" onClick={onOpenHealth} className="flex min-h-14 items-center gap-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Icon size={17} /></span>
              <span><span className="block text-sm font-medium">{system.system}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{recordedSystems.has(system.system) || system.status !== "good" ? statusLabel(system.status) : "Not assessed"}</span></span>
            </button>;
          })}</div>
          <button type="button" onClick={onOpenHealth} className="homeowner-health-note w-full rounded-2xl bg-card p-4 text-left">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Home health</p>
            {hasCompleteHealthProfile ? <p className="mt-2 text-3xl font-medium" style={{color:ring.stroke}}>{score}<span className="ml-1 text-xs text-muted-foreground">/100</span></p> : null}
            <p className="mt-2 text-xs font-medium">{hasCompleteHealthProfile ? healthHeadline(score) : "Build your home's profile"}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hasCompleteHealthProfile ? (attention.length ? attention.length + " systems need attention." : "Recorded systems are marked good.") : "Add system details to see an informed health summary."}</p>
          </button>
        </div>

        <div className="space-y-7 xl:col-start-3 xl:row-start-1">
          <div>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">Popular services</h2>{onOpenServices ? <button type="button" onClick={() => onOpenServices()} className="text-[11px] text-primary">View all</button> : null}</div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">{popular.slice(0,4).map(item => <button key={item.id} type="button" onClick={() => onOpenServices?.(item.id)} className="homeowner-service-link flex min-h-14 items-center gap-3 text-left">
              <ServiceThumb name={item.name} className="h-10 w-10 rounded-xl" /><span className="min-w-0 text-xs font-medium">{item.name}</span><ArrowRight size={13} className="ml-auto shrink-0 text-muted-foreground" />
            </button>)}</div>
          </div>
          <div>
            <h2 className="text-sm font-medium">Recurring care</h2><p className="mt-1 text-[11px] text-muted-foreground">A little upkeep, on your schedule.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-1">{recurring.map(item => <button key={item.id} type="button" onClick={() => onOpenServices?.(item.id)} className="homeowner-service-link flex items-center gap-3 text-left">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/5 text-primary"><CalendarDays size={14} /></span><span><span className="block text-xs font-medium">{item.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{item.recommendedFrequency ? frequencyLabel(item.recommendedFrequency) : "Recurring"}</span></span>
            </button>)}</div>
          </div>
        </div>
      </div>

      <div className="homeowner-service-activity"><ActiveServiceCards jobs={activeJobs} onOpenJob={onOpenJob} onRequestService={onRequestService} /></div>

      {onOpenHomeUpdates ? (
        <button
          type="button"
          onClick={onOpenHomeUpdates}
          className="flex w-full items-center justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-card p-4 text-left shadow-sm transition hover:border-primary/30"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your Home</p>
            <p className="mt-1.5 text-sm font-semibold tracking-tight">
              We&apos;re tracking {homeUpdates.summary.trackedSystems} home system
              {homeUpdates.summary.trackedSystems === 1 ? "" : "s"}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {homeUpdates.summary.needsAttention} may need attention · {homeUpdates.summary.upToDate} up to date ·{" "}
              {homeUpdates.summary.needsInfo} need more information
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-primary">Open Property Passport</span>
        </button>
      ) : null}


      {quotesWaiting > 0 && onOpenQuotes && (
        <button
          type="button"
          onClick={onOpenQuotes}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-4 text-left lg:hidden"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Quotes</p>
            <p className="mt-1 text-sm font-semibold">
              {quotesWaiting} quote{quotesWaiting === 1 ? "" : "s"} waiting for approval
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">Review</span>
        </button>
      )}

      {upcomingMaint.length > 0 && (
        <div className="rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-sm lg:hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Upcoming</p>
          <ul className="mt-3 space-y-2">
            {upcomingMaint.map((m) => (
              <li key={`${m.label}-${m.dueDate}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{fmtMaintDate(m.dueDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="hidden grid-cols-2 gap-3 lg:grid lg:grid-cols-4">
        {[
          { label: "Open Requests", value: String(stats.open) },
          { label: "In Progress", value: String(stats.inProgress) },
          { label: "Completed", value: String(stats.completed) },
          { label: "Home Spend", value: formatMoney(stats.spend) || "$0" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
            <p className="mt-2 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black leading-none">
              {item.value}
            </p>
          </div>
        ))}
      </div>


      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Upcoming Maintenance
            </p>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="mt-4 space-y-3">
            {(merged.maintenance || []).slice(0, 4).map((m) => (
              <li key={`${m.label}-${m.dueDate}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{m.label}</span>
                <span className="text-muted-foreground">{fmtMaintDate(m.dueDate)}</span>
              </li>
            ))}
            {(merged.maintenance || []).length === 0 && (
              <li className="text-sm text-muted-foreground">No upcoming maintenance scheduled.</li>
            )}
          </ul>
        </div>

        <button
          type="button"
          onClick={onOpenProperty}
          className="rounded-[1.5rem] border border-border/70 bg-card p-5 text-left shadow-sm transition hover:border-primary/30"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Property</p>
            <Home className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-4 text-base font-semibold">{formatPropertyLine(property)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {[
              merged.beds != null ? `${merged.beds} Bed` : null,
              merged.baths != null ? `${merged.baths} Bath` : null,
              merged.sqft != null ? `${merged.sqft.toLocaleString()} sq ft` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Add details in Property Health"}
          </p>
        </button>
      </div>
    </section>
  );
}

export function emptyHealth(): PropertyHealthProfile {
  return normalizeHealthProfile(null);
}
