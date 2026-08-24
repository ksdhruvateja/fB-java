import { useState } from "react";
import { Bell, MessageSquare, PlusCircle } from "lucide-react";
import type { InboxSegment, JobsSegment } from "./homeownerNav";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";

const SEGMENTS: { id: InboxSegment; label: string }[] = [
  { id: "messages", label: "Messages" },
  { id: "notifications", label: "Notifications" },
];

export default function HomeownerInboxPanel({
  jobs,
  onOpenJob,
  onRequestService,
}: {
  jobs: ManagedJob[];
  onOpenJob: (jobId: number, segment?: JobsSegment) => void;
  onRequestService: () => void;
}) {
  const [segment, setSegment] = useState<InboxSegment>("messages");

  const notifications = jobs.flatMap((job) => {
    const items: { id: string; type: string; title: string; body: string; jobId: number; action: string }[] = [];
    if (["proposal_sent", "awaiting_customer_approval"].includes(job.status)) {
      items.push({
        id: `quote-${job.id}`,
        type: "QUOTE",
        title: "Your quote is ready",
        body: job.title || job.category || "Service request",
        jobId: job.id,
        action: "Review Quote",
      });
    }
    if (["contractor_en_route", "work_started"].includes(job.status)) {
      items.push({
        id: `service-${job.id}`,
        type: "SERVICE",
        title: job.status === "contractor_en_route" ? "Contractor is on the way" : "Work in progress",
        body: job.title || job.category || "Active job",
        jobId: job.id,
        action: "Track",
      });
    }
    if (["customer_review_pending", "work_completed"].includes(job.status)) {
      items.push({
        id: `pay-${job.id}`,
        type: "PAYMENT",
        title: "Review & complete payment",
        body: job.title || job.category || "Completed service",
        jobId: job.id,
        action: "View Job",
      });
    }
    return items;
  });

  function segmentForType(type: string): JobsSegment {
    if (type === "QUOTE") return "quotes";
    if (type === "PAYMENT") return "history";
    return "active";
  }

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Inbox
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Messages and updates about your home.</p>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSegment(s.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              segment === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {segment === "messages" && (
        <div className="space-y-2">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Message your contractor from an active job.
              </p>
              <button
                type="button"
                onClick={onRequestService}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                <PlusCircle size={16} /> Request Service
              </button>
            </div>
          ) : (
            jobs.slice(0, 12).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onOpenJob(job.id)}
                className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/30"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MessageSquare size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{job.title || job.category}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {job.bookingId || `FB-${job.id}`}
                    </span>
                  </span>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {STATUS_LABELS[job.status] || job.status}
                  </p>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {segment === "notifications" && (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">You&apos;re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">Quote, service, and payment alerts appear here.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Today</p>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{n.type}</p>
                    <p className="mt-1 text-sm font-semibold">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    <button
                      type="button"
                      onClick={() => onOpenJob(n.jobId, segmentForType(n.type))}
                      className="mt-3 text-sm font-semibold text-primary hover:underline"
                    >
                      {n.action} →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
