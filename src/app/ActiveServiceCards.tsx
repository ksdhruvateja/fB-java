import { useState } from "react";
import { ChevronDown, MessageSquare, Plus } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";
import { ServiceThumb } from "./serviceVisuals";

function nextStep(job: ManagedJob) {
  const label = job.homeownerStatusLabel || STATUS_LABELS[job.status] || job.status;
  if (job.status === "work_started") return "In Progress";
  if (job.status === "contractor_en_route") return "Contractor On The Way";
  if (job.status === "scheduled" || job.status === "proposal_accepted") return "Scheduled";
  if (job.assignedContractorUserId || job.technician) return "Contractor Assigned";
  return label;
}

function contractorName(job: ManagedJob) {
  const tech = job.technician;
  return tech?.company || tech?.name || (job.assignedContractorUserId ? "Assigned contractor" : "Not assigned yet");
}

export function activeJobsForHome(jobs: ManagedJob[]) {
  const terminal = new Set([
    "work_completed",
    "customer_review_pending",
    "admin_review_pending",
    "payout_pending",
    "paid_out",
    "closed",
    "canceled",
    "refunded",
    "disputed",
  ]);
  return jobs.filter((job) => !terminal.has(job.status));
}

export default function ActiveServiceCards({
  jobs,
  onOpenJob,
  onRequestService,
}: {
  jobs: ManagedJob[];
  onOpenJob: (jobId: number) => void;
  onRequestService: () => void;
}) {
  const [open, setOpen] = useState(false);
  const first = jobs[0];
  const label = jobs.length === 1 ? "Active Service" : `${jobs.length} Active Services`;

  if (!jobs.length) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active Service</p>
          <p className="mt-1 text-sm font-semibold">No active services</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Need something fixed?</p>
        </div>
        <button
          type="button"
          onClick={onRequestService}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
        >
          <Plus size={14} /> Request
        </button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => jobs.length && setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active Service</p>
          {first ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold">{first.title || first.category || "Service request"}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {label} · {STATUS_LABELS[first.status] || first.status}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold">No active services</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Need something fixed?</p>
            </>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-primary transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="space-y-2 border-t border-border/70 px-3 py-3">
            {jobs.map((job) => {
              const title = job.title || job.category || "Service request";
              const status = job.homeownerStatusLabel || STATUS_LABELS[job.status] || job.status;
              return (
                <article key={job.id} className="rounded-xl border border-border/70 bg-background p-3">
                  <div className="flex items-center gap-3">
                    <ServiceThumb name={job.category || title} className="h-12 w-14" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {status} · {contractorName(job)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Next: {nextStep(job)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onOpenJob(job.id)} className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">
                      Track Service
                    </button>
                    <button type="button" onClick={() => onOpenJob(job.id)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
                      <MessageSquare className="h-3.5 w-3.5" /> Messages
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
