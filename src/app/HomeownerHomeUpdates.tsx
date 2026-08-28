import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CalendarClock, HelpCircle, X } from "lucide-react";
import type { ManagedJob, Property } from "./managedJobs";
import type { PropertyHealthProfile } from "./homeownerPropertyHealth";
import {
  applyHomeUpdatePreference,
  buildHomeUpdatesSnapshot,
  levelBadgeClass,
  levelLabel,
  type HomeUpdateItem,
  type HomeUpdatePreference,
} from "./homeUpdates";

function feedDayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HomeownerHomeUpdates({
  property,
  health,
  jobs,
  busy,
  onSaveHealth,
  onRequestService,
  onOpenProperty,
  compact,
}: {
  property?: Property | null;
  health: PropertyHealthProfile;
  jobs: ManagedJob[];
  busy?: boolean;
  onSaveHealth: (next: PropertyHealthProfile) => Promise<void> | void;
  onRequestService: (prefill?: HomeUpdateItem["requestPrefill"]) => void;
  onOpenProperty: () => void;
  compact?: boolean;
}) {
  const prefs = (health as { homeUpdateState?: HomeUpdatePreference }).homeUpdateState || null;
  const snapshot = useMemo(
    () => buildHomeUpdatesSnapshot({ property, health, jobs, prefs }),
    [property, health, jobs, prefs]
  );
  const [whyId, setWhyId] = useState<string | null>(null);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);

  async function dismiss(item: HomeUpdateItem) {
    const next = applyHomeUpdatePreference(health, {
      dismissId: item.id,
      historyEntry: {
        id: item.id,
        systemLabel: item.systemLabel,
        title: item.title,
        level: item.level,
        status: "dismissed",
        generatedAt: new Date().toISOString(),
        basedOn: item.why,
      },
    });
    await onSaveHealth(next);
  }

  async function snooze(item: HomeUpdateItem, option: "1w" | "1m" | "3m" | string) {
    const next = applyHomeUpdatePreference(health, {
      snoozeId: item.id,
      snoozeOption: option,
      historyEntry: {
        id: item.id,
        systemLabel: item.systemLabel,
        title: item.title,
        level: item.level,
        status: "snoozed",
        generatedAt: new Date().toISOString(),
        basedOn: item.why,
      },
    });
    setSnoozeId(null);
    await onSaveHealth(next);
  }

  function primaryClick(item: HomeUpdateItem) {
    if (item.primaryAction === "add_details" || item.primaryAction === "view_warranty") {
      onOpenProperty();
      return;
    }
    if (item.primaryAction === "view_inspection" || item.primaryAction === "view_previous_service") {
      onOpenProperty();
      return;
    }
    onRequestService(item.requestPrefill);
  }

  function secondaryRequest(item: HomeUpdateItem) {
    if (item.requestPrefill) onRequestService(item.requestPrefill);
  }

  const { summary, items, feed } = snapshot;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact ? (
        <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your Home</p>
          <p className="mt-2 text-lg font-semibold tracking-tight">
            We&apos;re tracking {summary.trackedSystems} home system{summary.trackedSystems === 1 ? "" : "s"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-900 dark:text-amber-300">
              {summary.needsAttention} may need attention
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-800 dark:text-emerald-300">
              {summary.upToDate} up to date
            </span>
            <span className="rounded-full bg-slate-500/10 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300">
              {summary.needsInfo} need more information
            </span>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black uppercase tracking-tight">
              Home Updates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length
                ? `${items.length} item${items.length === 1 ? "" : "s"} may need your attention`
                : "No open recommendations based on your saved property data."}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Add installation dates, service history, or inspection docs in My Property to unlock smarter reminders.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{item.systemLabel}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelBadgeClass(item.level)}`}
                    >
                      {levelLabel(item.level)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Dismiss"
                    disabled={busy}
                    onClick={() => void dismiss(item)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-base font-semibold tracking-tight">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
                {item.relevantDate ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{item.relevantDateLabel || "Date"}:</span>{" "}
                    {item.relevantDate}
                  </p>
                ) : null}

                {whyId === item.id ? (
                  <div className="mt-3 rounded-xl border border-border/70 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">Why am I seeing this?</p>
                    <p className="mt-1">
                      FixBridge uses the property details and service history you&apos;ve added to identify possible
                      maintenance and inspection reminders.
                    </p>
                    <p className="mt-2">{item.why}</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    onClick={() => setWhyId(item.id)}
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> Why am I seeing this?
                  </button>
                )}

                {snoozeId === item.id ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["1w", "1 week"],
                          ["1m", "1 month"],
                          ["3m", "3 months"],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          disabled={busy}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                          onClick={() => void snooze(item, k)}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={() => setSnoozeId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Custom date
                      <input
                        type="date"
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.value) void snooze(item, e.target.value);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => primaryClick(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                    >
                      {item.primaryLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    {item.primaryAction === "view_inspection" || item.primaryAction === "view_previous_service" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => secondaryRequest(item)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
                      >
                        Request Service
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSnoozeId(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
                    >
                      <CalendarClock className="h-3.5 w-3.5" /> Remind Me Later
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void dismiss(item)}
                      className="rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!compact ? (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Update feed</h3>
          <ul className="mt-3 divide-y divide-border rounded-[1.5rem] border border-border/70 bg-card">
            {feed.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">No activity yet.</li>
            ) : (
              feed.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">
                    {feedDayLabel(e.at)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.systemLabel ? `${e.systemLabel} · ` : ""}
                      {e.title}
                    </p>
                    {e.subtitle ? <p className="text-xs text-muted-foreground">{e.subtitle}</p> : null}
                  </div>
                  {e.kind === "recommendation" ? (
                    <AlertCircle className="ml-auto h-4 w-4 shrink-0 text-amber-600" />
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
