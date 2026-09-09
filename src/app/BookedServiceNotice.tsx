import { BOOKING_CONFIRMED_IMAGE, ServiceThumb } from "./serviceVisuals";
import type { ManagedJob } from "./managedJobs";
import { STATUS_LABELS } from "./managedJobs";

export default function BookedServiceNotice({
  job,
  onOpenJob,
}: {
  job: ManagedJob;
  onOpenJob?: (jobId: number) => void;
}) {
  const title = job.title || job.category || "Professional service";
  const status = job.homeownerStatusLabel || STATUS_LABELS[job.status] || "Booked";
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-emerald-500/30 bg-card shadow-sm">
      <div className="flex items-center gap-3 bg-emerald-500/10 px-4 py-3">
        <img src={BOOKING_CONFIRMED_IMAGE} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-[#111] object-contain" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Service booked</p>
          <p className="text-sm font-semibold">A professional has been requested. You do not need to check Services.</p>
        </div>
      </div>
      <div className="flex gap-3 px-4 py-3">
        <ServiceThumb name={job.category || job.title} className="h-16 w-20" />
        <dl className="min-w-0 flex-1 space-y-1 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Service</dt>
            <dd className="font-semibold">{title}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Property</dt>
            <dd className="truncate">{job.fullAddress || job.cityStateZip || "Your property"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Next step</dt>
            <dd>FixBridge is matching a local professional.</dd>
          </div>
        </dl>
      </div>
      {onOpenJob ? (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => onOpenJob(job.id)} className="min-h-11 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white">
            Track this booking
          </button>
        </div>
      ) : null}
    </section>
  );
}
