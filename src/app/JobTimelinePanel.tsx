import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchJobTimeline } from "./managedJobs";

type TimelineEvent = {
  kind: string;
  at: string;
  label: string;
  eventType?: string;
  toStatus?: string;
  actorName?: string | null;
  employeeName?: string | null;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function JobTimelinePanel({
  jobId,
  compact = false,
}: {
  jobId: number;
  compact?: boolean;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchJobTimeline(jobId).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setError(r.message || "Could not load timeline.");
        setEvents([]);
      } else {
        setEvents((r.timeline || []) as TimelineEvent[]);
        setError(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No timeline events yet.</p>;
  }

  const visible = compact ? events.slice(-6) : events;

  return (
    <ol className="space-y-0">
      {visible.map((ev, i) => (
        <li key={`${ev.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {i < visible.length - 1 ? (
            <span className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-border" aria-hidden />
          ) : null}
          <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">{fmtTime(ev.at)}</p>
            <p className="text-sm font-medium">{ev.label}</p>
            {ev.employeeName ? (
              <p className="text-xs text-muted-foreground">{ev.employeeName}</p>
            ) : null}
            {ev.actorName ? (
              <p className="text-xs text-muted-foreground">by {ev.actorName}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
