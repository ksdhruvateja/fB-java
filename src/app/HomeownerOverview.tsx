import { motion } from "motion/react";
import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  Home,
  Plus,
  Sparkles,
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
  activeServiceJob,
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
import ServiceTrackingCard from "./ServiceTrackingCard";

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
  const active = activeServiceJob(propertyJobs);
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

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      {/* Mobile-first header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {greetingForNow()}, {firstName}
          </h1>
          <button
            type="button"
            onClick={onOpenPropertyPicker || onOpenProperty}
            className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:pointer-events-none lg:cursor-default"
          >
            <span className="truncate">{formatPropertyLine(property)}</span>
            {onOpenPropertyPicker ? (
              <span className="text-xs text-primary lg:hidden">▼</span>
            ) : null}
          </button>
        </div>
        <button
          type="button"
          onClick={onRequestService}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,77,28,0.25)] transition hover:bg-primary/90 lg:w-auto lg:py-3"
        >
          <Plus size={16} /> Request Service
        </button>
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
              {homeUpdates.summary.needsAttention} may need attention · {homeUpdates.summary.upToDate} up to date ·{" "}
              {homeUpdates.summary.needsInfo} need more information
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-primary">Open Property Passport →</span>
        </button>
      ) : null}

      {/* Mobile order: active → quotes → upcoming → health → stats */}
      <div className="order-1 lg:order-none">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Active Service
        </p>
        {active ? (
          <ServiceTrackingCard
            job={active}
            compact
            onOpenDetails={() => onOpenJob(active.id)}
            onMessage={() => onOpenJob(active.id)}
            onChangeSchedule={() => onOpenJob(active.id)}
          />
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-4 py-8 text-center shadow-sm">
            <Sparkles className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-sm font-medium">No active service right now</p>
            <p className="mt-1 text-xs text-muted-foreground">Request help when something needs attention.</p>
          </div>
        )}
      </div>

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
          <span className="text-sm font-semibold text-primary">Review →</span>
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

      <motion.button
        type="button"
        onClick={onOpenHealth}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        whileHover={{ y: -2 }}
        className="group relative w-full overflow-hidden rounded-[1.75rem] border border-border/60 bg-card text-left shadow-[0_18px_50px_rgba(10,10,10,0.06)] lg:block"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `radial-gradient(ellipse at top right, ${ring.soft}, transparent 55%), radial-gradient(ellipse at bottom left, rgba(255,77,28,0.08), transparent 50%)`,
          }}
          aria-hidden
        />
        <div className="relative grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6 lg:gap-8 lg:p-7">
          <div className="mx-auto flex flex-col items-center sm:mx-0">
            <div className="relative h-[132px] w-[132px]">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  className="text-muted/60"
                />
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
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15, duration: 0.35 }}
                  className="[font-family:'Barlow_Condensed',sans-serif] text-4xl font-black leading-none"
                  style={{ color: ring.stroke }}
                >
                  {score}
                </motion.p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  / 100
                </p>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Home Health
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xl font-semibold tracking-tight sm:text-2xl">{healthHeadline(score)}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {attention.length === 0
                    ? "All major systems are in good shape."
                    : attention.length === 1
                      ? `${attention[0].system} needs a look soon.`
                      : `${attention.length} systems need attention.`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition group-hover:bg-primary">
                View systems <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>

            <ul className="mt-5 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/60 bg-background/70 backdrop-blur-sm">
              {sortedSystems.map((s, i) => {
                const Icon = SYSTEM_ICONS[s.system] || Home;
                return (
                  <motion.li
                    key={s.system}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + i * 0.04 }}
                    className="flex items-center gap-3 px-3.5 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{s.system}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusChip(s.status)}`}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.nextAction}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </motion.button>

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

      <div className="hidden lg:block">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Active Service
        </p>
        {active ? (
          <ServiceTrackingCard
            job={active}
            compact
            onOpenDetails={() => onOpenJob(active.id)}
            onMessage={() => onOpenJob(active.id)}
            onChangeSchedule={() => onOpenJob(active.id)}
          />
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-4 py-8 text-center shadow-sm">
            <Sparkles className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-sm font-medium">No active service right now</p>
            <p className="mt-1 text-xs text-muted-foreground">Request help when something needs attention.</p>
            <button
              type="button"
              onClick={onRequestService}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus size={14} /> Request Service
            </button>
          </div>
        )}
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
