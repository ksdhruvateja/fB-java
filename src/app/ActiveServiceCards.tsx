import { useState } from "react";
import { ChevronDown, MessageSquare, Plus } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";
import { serviceImageFor } from "./serviceVisuals";

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
  const [openId, setOpenId] = useState<number | null>(null);
  if (!jobs.length) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
        <div>
          <p className="text-sm font-semibold">No active services</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Need something fixed?</p>
        </div>
        <button
          type="button"
          onClick={onRequestService}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
        >
          <Plus size={14} /> Request Service
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {jobs.length > 1 ? `${jobs.length} Active Services` : "Active Service"}
      </p>
      {jobs.map((job) => {
        const open = openId === job.id;
        const title = job.title || job.category || "Service request";
        const status = job.homeownerStatusLabel || STATUS_LABELS[job.status] || job.status;
        return (
          <article key={job.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : job.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <img src={serviceImageFor(job.category || title)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {status} · {contractorName(job)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Next step: {nextStep(job)}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                {open ? "Hide" : "View Details"}
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 border-t border-border/70 px-4 py-3 text-sm">
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</dt>
                      <dd>{job.category || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt>
                      <dd>{status}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Property</dt>
                      <dd className="truncate">{job.cityStateZip || job.fullAddress || "Selected property"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Scheduled</dt>
                      <dd>{job.preferredDate || "Not scheduled yet"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Contractor</dt>
                      <dd>{contractorName(job)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Technician</dt>
                      <dd>{job.technician?.name || "Not assigned"}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onOpenJob(job.id)} className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white">
                      Track Service
                    </button>
                    <button type="button" onClick={() => onOpenJob(job.id)} className="min-h-11 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
                      View Full Request
                    </button>
                    <button type="button" onClick={() => onOpenJob(job.id)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
                      <MessageSquare className="h-3.5 w-3.5" /> Messages
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
