import { motion } from "motion/react";
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
        ? jobs.filter((j) => !j.propertyId || Number(j.propertyId) === property.id)
        : jobs,
    [jobs, property?.id]
  );

  const merged = mergeHealthWithJobs(health, propertyJobs, property?.id);
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
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
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
    <section className="mx-auto max-w-6xl space-y-4">
      {onOpenServices ? (
        <button
          type="button"
          onClick={() => onOpenServices()}
          className="w-full rounded-2xl border border-border/70 bg-card px-4 py-3 text-left text-sm text-muted-foreground shadow-sm"
        >
          Search services...
        </button>
      ) : null}

      <div className="overflow-hidden rounded-[1.75rem] bg-[#FFF4EE] shadow-sm">
        <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[#2C2926] sm:text-3xl">
              {greetingForNow()}, {firstName}!
            </h1>
            <p className="mt-1 max-w-md text-sm text-[#7A746C]">
              Welcome home. FixBridge can diagnose, guide, or connect you with a professional.
            </p>
            <button
              type="button"
              onClick={onOpenPropertyPicker || onOpenProperty}
              className="mt-3 inline-flex max-w-full items-center gap-1 text-sm font-medium text-[#2C2926]"
            >
              <Home className="h-4 w-4 text-[#FF4D1C]" />
              <span className="truncate">{formatPropertyLine(property)}</span>
            </button>
            <button
              type="button"
              onClick={onRequestService}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={16} /> Request Service
            </button>
          </div>
          <img
            src="/brand/homeowner-welcome.png"
            alt=""
            className="hidden h-28 w-28 shrink-0 rounded-3xl bg-[#111] object-contain sm:block sm:h-36 sm:w-36"
          />
        </div>
      </div>

      {booked ? <BookedServiceNotice job={booked} onOpenJob={onOpenJob} /> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold">{firstName}&apos;s Home</p>
              <button type="button" onClick={onOpenHealth} className="text-xs font-semibold text-[#FF4D1C]">
                View systems
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {homeTiles.map((system, index) => {
                const Icon = SYSTEM_ICONS[system.system] || Home;
                return (
                  <button
                    key={system.system}
                    type="button"
                    onClick={onOpenHealth}
                    className={`min-h-[92px] rounded-2xl p-3 text-left ${tileTones[index % tileTones.length]}`}
                  >
                    <Icon size={16} />
                    <p className="mt-3 text-sm font-semibold">{system.system}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{statusLabel(system.status)}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <button type="button" onClick={onOpenHealth} className="flex w-full items-center gap-4 rounded-[1.75rem] border border-border/60 bg-card p-4 text-left shadow-sm">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-[#F3EBE3]" />
                <motion.circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke={ring.stroke}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: circumference * (1 - progress) }}
                  transition={{ duration: 0.8 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-semibold" style={{ color: ring.stroke }}>{score}</p>
                <p className="text-[10px] text-muted-foreground">Health</p>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{healthHeadline(score)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {attention.length === 0 ? "All major systems look good." : `${attention.length} system${attention.length === 1 ? "" : "s"} need attention.`}
              </p>
            </div>
          </button>

          <ActiveServiceCards jobs={activeJobs} onOpenJob={onOpenJob} onRequestService={onRequestService} />
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold">Popular Services</p>
              {onOpenServices ? (
                <button type="button" onClick={() => onOpenServices()} className="text-xs font-semibold text-[#FF4D1C]">
                  View all
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {popular.slice(0, 4).map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenServices?.(item.id)}
                  className={`flex min-h-[72px] items-center gap-2 rounded-2xl p-2 text-left ${tileTones[index % tileTones.length]}`}
                >
                  <ServiceThumb name={item.name} className="h-12 w-14 bg-white/70" />
                  <p className="line-clamp-2 text-sm font-semibold">{item.name}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/60 bg-card p-4 shadow-sm">
            <p className="text-base font-semibold">Recurring care</p>
            <p className="mt-1 text-xs text-muted-foreground">Set it once. FixBridge helps keep your home maintained.</p>
            <div className="mt-3 space-y-2">
              {recurring.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenServices?.(item.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[#F7F2EB] p-3 text-left"
                >
                  <ServiceThumb name={item.name} className="h-11 w-14" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.recommendedFrequency ? frequencyLabel(item.recommendedFrequency) : "Recurring"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

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
              {homeUpdates.summary.needsAttention} may need attention Â· {homeUpdates.summary.upToDate} up to date Â·{" "}
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
              .join(" Â· ") || "Add details in Property Health"}
          </p>
        </button>
      </div>
    </section>
  );
}

export function emptyHealth(): PropertyHealthProfile {
  return normalizeHealthProfile(null);
}
