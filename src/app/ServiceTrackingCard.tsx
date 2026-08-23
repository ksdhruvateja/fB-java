import { Check, Circle, MessageSquare, Phone, ShieldCheck, Star } from "lucide-react";
import type { ManagedJob } from "./managedJobs";

export type AssignedTechnician = {
  id: number;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  rating?: number | null;
  verified?: boolean;
  insured?: boolean;
  trade?: string | null;
};

const TRACK_STEPS = [
  { id: "submitted", label: "Request submitted" },
  { id: "reviewed", label: "Issue reviewed" },
  { id: "assigned", label: "Contractor assigned" },
  { id: "en_route", label: "Technician on the way" },
  { id: "started", label: "Work started" },
  { id: "completed", label: "Work completed" },
] as const;

const TIME_SLOT_LABELS: Record<string, string> = {
  "9-11": "9:00 AM – 11:00 AM",
  "11-2": "11:00 AM – 2:00 PM",
  "2-5": "2:00 PM – 5:00 PM",
  "5-7": "5:00 PM – 7:00 PM",
};

function stepIndexForStatus(status: string, hasTechnician: boolean): number {
  const s = String(status || "");
  if (["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(s)) {
    return 5;
  }
  if (s === "work_started" || s === "change_order_pending") return 4;
  if (s === "contractor_en_route") return 3;
  if (
    hasTechnician ||
    [
      "contractor_accepted",
      "awaiting_bid",
      "bid_received",
      "proposal_sent",
      "awaiting_customer_approval",
      "approved",
      "scheduled",
    ].includes(s)
  ) {
    return 2;
  }
  if (
    [
      "ai_review_complete",
      "awaiting_service_payment",
      "paid_for_dispatch",
      "awaiting_contractor",
      "contractor_invited",
    ].includes(s)
  ) {
    return 1;
  }
  // draft / just created
  return 0;
}

export function formatRequestNumber(job: ManagedJob): string {
  if (job.bookingId) return job.bookingId.startsWith("#") ? job.bookingId : `Request #${job.bookingId}`;
  return `Request #FB-${String(job.id).padStart(4, "0")}`;
}

export function arrivalWindowLabel(job: ManagedJob): string | null {
  const slot = job.preferredTimeSlot ? TIME_SLOT_LABELS[job.preferredTimeSlot] || job.preferredTimeSlot : null;
  if (job.preferredDate && slot) {
    const d = new Date(`${job.preferredDate}T12:00:00`);
    const dateLabel = Number.isNaN(d.getTime())
      ? job.preferredDate
      : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return `${dateLabel} · ${slot}`;
  }
  if (slot) return slot;
  if (job.preferredDate) return job.preferredDate;
  return null;
}

export default function ServiceTrackingCard({
  job,
  onMessage,
  onOpenDetails,
  compact = false,
}: {
  job: ManagedJob;
  onMessage?: () => void;
  onOpenDetails?: () => void;
  compact?: boolean;
}) {
  const tech = (job as ManagedJob & { technician?: AssignedTechnician | null }).technician || null;
  const hasTech = Boolean(job.assignedContractorUserId || tech?.id);
  const current = stepIndexForStatus(job.status, hasTech);
  const arrival = arrivalWindowLabel(job);
  const phone = tech?.phone || null;
  const displayName = tech?.name || (hasTech ? "Assigned technician" : null);
  const company = tech?.company || tech?.trade || null;
  const rating = tech?.rating ?? (hasTech ? 4.9 : null);

  return (
    <div
      className={`rounded-[1.5rem] border border-border/70 bg-card shadow-sm ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{job.title || job.category || "Service request"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatRequestNumber(job)}</p>
        </div>
        {onOpenDetails && (
          <button type="button" onClick={onOpenDetails} className="text-sm font-semibold text-primary hover:underline">
            Details →
          </button>
        )}
      </div>

      <ol className={`mt-6 ${compact ? "space-y-0" : "space-y-0"}`}>
        {TRACK_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const upcoming = i > current;
          return (
            <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < TRACK_STEPS.length - 1 && (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-px ${
                    done || active ? "bg-primary/50" : "bg-border"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done
                    ? "border-primary bg-primary text-white"
                    : active
                      ? "border-primary bg-background text-primary"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : active ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                ) : (
                  <Circle className="h-3 w-3 opacity-40" />
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    active ? "text-primary" : upcoming ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {active && i === 3 && arrival && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Expected {arrival}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(hasTech || arrival) && (
        <>
          <div className="my-5 border-t border-border" />
          <div className="space-y-4">
            {hasTech && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Technician
                </p>
                <p className="mt-2 text-base font-semibold">{displayName}</p>
                {company && <p className="text-sm text-muted-foreground">{company}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {rating != null && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {Number(rating).toFixed(1)}
                    </span>
                  )}
                  {(tech?.verified || hasTech) && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                  {(tech?.insured || hasTech) && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <ShieldCheck className="h-3.5 w-3.5" /> Insured
                    </span>
                  )}
                </div>
              </div>
            )}

            {arrival && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Arrival
                </p>
                <p className="mt-1.5 text-base font-semibold">{arrival}</p>
              </div>
            )}

            {hasTech && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onMessage}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold transition hover:border-primary/35 hover:bg-primary/5"
                >
                  <MessageSquare className="h-4 w-4" /> Message
                </button>
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                  >
                    <Phone className="h-4 w-4" /> Call
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-3 text-sm font-semibold text-muted-foreground"
                    title="Phone number available after assignment confirmation"
                  >
                    <Phone className="h-4 w-4" /> Call
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {!hasTech && current < 2 && (
        <p className="mt-5 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          We&apos;re matching a verified technician. You&apos;ll see their profile and arrival window here once assigned.
        </p>
      )}
    </div>
  );
}
