import { useEffect, useState } from "react";
import { Calendar, Loader2, Repeat, Wrench } from "lucide-react";
import { fetchPropertyTimeline, type PropertyTimelineEvent } from "./propertyTimelineApi";
import { formatMoney } from "./managedJobs";

function formatEventDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function eventIcon(type: string) {
  if (type.startsWith("recurring") || type === "scheduled_service") return Repeat;
  if (type === "document" || type === "maintenance_due" || type === "maintenance_overdue") return Calendar;
  return Wrench;
}

function eventLabel(ev: PropertyTimelineEvent) {
  if (ev.type === "recurring_skipped") return "Skipped visit";
  if (ev.type === "recurring_plan") return "Recurring plan";
  if (ev.type === "recurring_visit_requested") return "Visit requested";
  if (ev.type === "scheduled_service") return "Scheduled service";
  if (ev.type === "service_requested") return "Service requested";
  if (ev.type === "maintenance_due") return "Maintenance due";
  if (ev.type === "maintenance_overdue") return "Maintenance overdue";
  if (ev.type === "service_completed") return "Service completed";
  if (ev.type === "service_request") return "Service request";
  if (ev.type === "document") return "Document";
  if (ev.type === "home_health_report") return "Home health report";
  return ev.title;
}

function TimelineList({
  events,
  onOpenJob,
}: {
  events: PropertyTimelineEvent[];
  onOpenJob?: (jobId: number) => void;
}) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const Icon = eventIcon(ev.type);
        return (
          <article key={ev.id} className="flex gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatEventDate(ev.occurredAt)}
                  </p>
                  <p className="font-semibold">{eventLabel(ev)}</p>
                  <p className="text-sm text-muted-foreground">{ev.title}</p>
                  {ev.subtitle ? <p className="text-xs text-muted-foreground">{ev.subtitle}</p> : null}
                </div>
                <div className="text-right text-xs">
                  {ev.amount != null ? <p className="font-semibold tabular-nums">{formatMoney(ev.amount)}</p> : null}
                  {ev.status ? <p className="capitalize text-muted-foreground">{ev.status}</p> : null}
                </div>
              </div>
              {ev.summary ? <p className="mt-2 text-xs text-muted-foreground">{ev.summary}</p> : null}
              {(ev.beforePhotoUrl || ev.afterPhotoUrl) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ev.beforePhotoUrl ? (
                    <img src={ev.beforePhotoUrl} alt="Before" className="h-20 rounded-lg border object-cover" />
                  ) : null}
                  {ev.afterPhotoUrl ? (
                    <img src={ev.afterPhotoUrl} alt="After" className="h-20 rounded-lg border object-cover" />
                  ) : null}
                </div>
              )}
              {ev.relatedJobId && onOpenJob ? (
                <button type="button" onClick={() => onOpenJob(ev.relatedJobId!)} className="mt-2 text-xs font-semibold text-primary">
                  View job
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function PropertyTimelinePanel({
  propertyId,
  onOpenJob,
}: {
  propertyId: number;
  onOpenJob?: (jobId: number) => void;
}) {
  const [upcoming, setUpcoming] = useState<PropertyTimelineEvent[]>([]);
  const [recent, setRecent] = useState<PropertyTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchPropertyTimeline(propertyId).then((r) => {
      setLoading(false);
      if (!r.ok) {
        setError(r.message || "Could not load timeline.");
        return;
      }
      setUpcoming(r.upcoming || r.events?.filter((e) => e.section === "upcoming") || []);
      setRecent(r.recent || r.events?.filter((e) => e.section === "recent") || r.events || []);
    });
  }, [propertyId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Upcoming</h4>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No upcoming visits or maintenance items scheduled.
          </p>
        ) : (
          <TimelineList events={upcoming} onOpenJob={onOpenJob} />
        )}
      </section>
      <section>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Recent history</h4>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Completed services and documents will appear here.
          </p>
        ) : (
          <TimelineList events={recent} onOpenJob={onOpenJob} />
        )}
      </section>
    </div>
  );
}
