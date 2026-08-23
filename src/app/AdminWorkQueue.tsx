import { useMemo } from "react";
import { Search } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";
import {
  computeAttention,
  filterWorkQueue,
  jobBookingLabel,
  jobDotTone,
  jobQueueHeadline,
  relativeTime,
  type AttentionKind,
  type QueueFilter,
} from "./adminOpsHelpers";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "urgent", label: "Urgent" },
  { id: "waiting", label: "Waiting" },
  { id: "today", label: "Today" },
];

export default function AdminWorkQueue({
  jobs,
  filter,
  search,
  selectedJobId,
  onFilterChange,
  onSearchChange,
  onSelectJob,
}: {
  jobs: ManagedJob[];
  filter: QueueFilter;
  search: string;
  selectedJobId: number | null;
  onFilterChange: (f: QueueFilter) => void;
  onSearchChange: (q: string) => void;
  onSelectJob: (id: number) => void;
}) {
  const attention = useMemo(() => computeAttention(jobs), [jobs]);
  const rows = useMemo(
    () => filterWorkQueue(jobs, filter, search, attention),
    [jobs, filter, search, attention],
  );

  const attentionFilterLabel = (f: QueueFilter) => {
    const map: Partial<Record<AttentionKind, string>> = {
      emergency: "Emergencies",
      quotes_waiting: "Waiting on quotes",
      quotes_ready: "Ready to price",
      accepted: "Accepted",
      payments: "Payments",
      payouts: "Payouts",
    };
    return map[f as AttentionKind] || null;
  };

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Work queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live ops feed — click a row to open the job drawer without leaving this screen.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              filter === f.id
                ? "bg-[#FF4D1C] text-white shadow-sm"
                : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {attentionFilterLabel(filter) && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            Filtered: {attentionFilterLabel(filter)}
            <button type="button" className="ml-2 underline" onClick={() => onFilterChange("all")}>
              clear
            </button>
          </span>
        )}
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#FF4D1C]/50 focus:ring-2 focus:ring-[#FF4D1C]/15"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search jobs, homeowners, booking IDs, ZIP…"
        />
      </label>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">Nothing in this queue</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another filter or clear search.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((job) => {
              const selected = selectedJobId === job.id;
              return (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => onSelectJob(job.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/50 ${
                      selected ? "bg-[#FF4D1C]/5" : ""
                    }`}
                  >
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${jobDotTone(job)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-mono text-xs font-semibold text-[#FF4D1C]">{jobBookingLabel(job)}</p>
                        <p className="text-xs text-muted-foreground">{relativeTime(job.updatedAt || job.createdAt)}</p>
                      </div>
                      <p className="mt-0.5 truncate font-semibold">{job.title || job.category || "Service request"}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{jobQueueHeadline(job)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {job.cityStateZip || job.fullAddress || "—"} · {STATUS_LABELS[job.status] || job.status}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
