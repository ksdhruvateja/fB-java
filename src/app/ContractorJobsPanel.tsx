import { useMemo, useRef, useState } from "react";
import AppBackButton from "./AppBackButton";
import { useIsMobile } from "./components/ui/use-mobile";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  HardHat,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  Truck,
  User,
} from "lucide-react";
import {
  STATUS_LABELS,
  completeJob,
  updateJobStatus,
  type ManagedJob,
  type ContractorPayout,
  type PayoutAccount,
} from "./managedJobs";
import ChangeOrderPanel from "./ChangeOrderPanel";
import { JobEarningsCard } from "./ContractorPayoutsPanel";

type JobFilter = "all" | "active" | "scheduled" | "awaiting" | "completed" | "cancelled";

function matchesFilter(job: ManagedJob, filter: JobFilter) {
  const s = job.status;
  if (filter === "all") return true;
  if (filter === "active") {
    return ["contractor_en_route", "work_started", "approved", "awaiting_bid", "bid_received"].includes(s);
  }
  if (filter === "scheduled") return s === "scheduled" || s === "proposal_sent";
  if (filter === "awaiting") {
    return ["awaiting_customer_approval", "customer_review_pending", "admin_review_pending"].includes(s);
  }
  if (filter === "completed") {
    return ["work_completed", "paid_out", "payout_pending", "closed"].includes(s);
  }
  if (filter === "cancelled") return s === "canceled" || s === "refunded" || s === "disputed";
  return true;
}

function statusDot(status: string) {
  if (["work_started", "contractor_en_route"].includes(status)) return "bg-amber-500";
  if (["scheduled", "approved"].includes(status)) return "bg-sky-500";
  if (["work_completed", "paid_out", "closed"].includes(status)) return "bg-emerald-500";
  if (status === "canceled") return "bg-muted-foreground";
  return "bg-primary";
}

export default function ContractorJobsPanel({
  jobs,
  busy,
  onRefresh,
  onError,
  onBid,
  payoutByJobId,
  payoutAccount,
  onViewPayouts,
}: {
  jobs: ManagedJob[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
  onBid: (jobId: number) => void;
  payoutByJobId?: Map<number, ContractorPayout>;
  payoutAccount?: PayoutAccount | null;
  onViewPayouts?: () => void;
}) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeSummary, setCompleteSummary] = useState("");
  const [healthSystem, setHealthSystem] = useState("HVAC");
  const [healthStatus, setHealthStatus] = useState("good");
  const [healthNextAction, setHealthNextAction] = useState("");
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [afterPhotoUrl, setAfterPhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const beforePhotoRef = useRef<HTMLInputElement>(null);
  const afterPhotoRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const filtered = useMemo(() => jobs.filter((j) => matchesFilter(j, filter)), [jobs, filter]);
  const selected = useMemo(
    () => filtered.find((j) => j.id === selectedId) || filtered[0] || jobs.find((j) => j.id === selectedId) || null,
    [filtered, selectedId, jobs]
  );

  const filters: { id: JobFilter; label: string }[] = [
    { id: "all", label: "All Jobs" },
    { id: "active", label: "Active" },
    { id: "scheduled", label: "Scheduled" },
    { id: "awaiting", label: "Awaiting Approval" },
    { id: "completed", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Filter, open a workspace, and run the job from start to complete.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              filter === f.id ? "bg-primary text-white" : "border border-border bg-card hover:border-primary/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No assigned jobs yet. Accept an invitation to start.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className={`space-y-2 ${isMobile && selectedId ? "hidden" : ""}`}>
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">No jobs in this filter.</p>
            )}
            {filtered.map((job) => {
              const active = selected?.id === job.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(job.id);
                    setCompleteOpen(false);
                  }}
                  className={`w-full rounded-2xl border p-3.5 text-left transition ${
                    active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {job.bookingId || `FB-${job.id}`}
                  </p>
                  <p className="mt-0.5 font-semibold truncate">{job.title || job.category}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot(job.status)}`} />
                    {STATUS_LABELS[job.status] || job.status}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className={`space-y-4 rounded-[1.5rem] border border-border bg-card p-5 sm:p-6 ${isMobile && !selectedId ? "hidden" : ""}`}>
              {isMobile && selectedId && (
                <AppBackButton
                  onBack={() => {
                    setSelectedId(null);
                    setCompleteOpen(false);
                  }}
                  label="Back to Jobs"
                  className="-ml-1"
                />
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Job workspace · {selected.bookingId || `FB-${selected.id}`}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">{selected.title || selected.category}</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                  <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2 w-2 rounded-full ${statusDot(selected.status)}`} />
                    {STATUS_LABELS[selected.status] || selected.status}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
                  <p className="mt-1 text-sm font-semibold flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {selected.contactName || "Homeowner"}
                  </p>
                  <p className="text-xs text-muted-foreground">{selected.cityStateZip || selected.fullAddress || "—"}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Property</p>
                  <p className="mt-1 text-sm font-semibold">Residential</p>
                  <p className="text-xs text-muted-foreground">Single Family Home</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Issue</p>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
                    {selected.description || selected.title || "See work order details."}
                  </p>
                </div>
              </div>

              {selected &&
                payoutByJobId?.get(selected.id) &&
                ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
                  selected.status
                ) && (
                  <JobEarningsCard
                    payout={payoutByJobId.get(selected.id)!}
                    account={payoutAccount || null}
                    onViewPayouts={() => onViewPayouts?.()}
                    onInstant={() => onViewPayouts?.()}
                  />
                )}

              {(selected.mediaDataUrl || selected.mediaType) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Attachments</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.mediaDataUrl && String(selected.mediaDataUrl).startsWith("data:image") ? (
                      <img src={selected.mediaDataUrl} alt="" className="h-20 w-28 rounded-lg object-cover border border-border" />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs">
                        <Camera className="h-3.5 w-3.5" /> Customer media
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Work order</p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Category · </span>
                    {selected.category || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Location · </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {selected.fullAddress || selected.cityStateZip || "Released after accept"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selected.status === "scheduled" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold"
                      onClick={async () => {
                        await updateJobStatus(selected.id, "contractor_en_route");
                        await onRefresh();
                      }}
                    >
                      <Truck className="h-4 w-4" /> Start Travel
                    </button>
                  )}
                  {selected.status === "contractor_en_route" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold"
                      onClick={async () => {
                        await updateJobStatus(selected.id, "work_started");
                        await onRefresh();
                      }}
                    >
                      <Navigation className="h-4 w-4" /> Start work
                    </button>
                  )}
                  {["awaiting_bid", "contractor_accepted"].includes(selected.status) && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                      onClick={() => onBid(selected.id)}
                    >
                      Create Estimate
                    </button>
                  )}
                </div>
              </div>

              {["work_started", "change_order_pending", "contractor_en_route"].includes(selected.status) ? (
                <ChangeOrderPanel jobId={selected.id} role="contractor" onChanged={onRefresh} />
              ) : null}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Job actions</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Upload Photos", icon: ImagePlus, action: () => beforePhotoRef.current?.click() },
                    { label: "Add Notes", icon: ClipboardList, action: () => setNotes((n) => n || " ") },
                    { label: "Add Materials", icon: FileText, action: () => onBid(selected.id) },
                    { label: "Request Approval", icon: CheckCircle2, action: () => onBid(selected.id) },
                    { label: "Create Estimate", icon: FileText, action: () => onBid(selected.id) },
                    { label: "Create Invoice", icon: FileText, action: () => onBid(selected.id) },
                    {
                      label: "Mark Complete",
                      icon: HardHat,
                      action: () => setCompleteOpen(true),
                      primary: true,
                    },
                  ].map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.action}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                        a.primary ? "bg-primary text-white" : "border border-border hover:border-primary/40"
                      }`}
                    >
                      <a.icon className="h-3.5 w-3.5" />
                      {a.label}
                    </button>
                  ))}
                </div>
                {notes !== "" && (
                  <textarea
                    className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    rows={3}
                    placeholder="Job notes…"
                    value={notes.trim() ? notes : ""}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </div>

              {completeOpen && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold">Mark complete + proof</p>
                  <textarea
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Work summary, materials used, warranty notes"
                    value={completeSummary}
                    onChange={(e) => setCompleteSummary(e.target.value)}
                  />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={healthSystem} onChange={(e) => setHealthSystem(e.target.value)}>
                      {["HVAC", "Plumbing", "Electrical", "Roof", "Appliances", "Pest", "Safety"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={healthStatus} onChange={(e) => setHealthStatus(e.target.value)}>
                      <option value="good">Good</option>
                      <option value="due_soon">Due Soon</option>
                      <option value="attention">Attention</option>
                      <option value="critical">Critical</option>
                    </select>
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      value={healthNextAction}
                      onChange={(e) => setHealthNextAction(e.target.value)}
                      placeholder="Next action for homeowner"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <input ref={beforePhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setBeforePhotoUrl(String(reader.result));
                        reader.readAsDataURL(file);
                      }} />
                      <button type="button" className="w-full rounded-xl border border-dashed border-border px-3 py-6 text-sm" onClick={() => beforePhotoRef.current?.click()}>
                        {beforePhotoUrl ? "Replace before photo" : "Upload before photo"}
                      </button>
                      {beforePhotoUrl && <img src={beforePhotoUrl} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />}
                    </div>
                    <div>
                      <input ref={afterPhotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setAfterPhotoUrl(String(reader.result));
                        reader.readAsDataURL(file);
                      }} />
                      <button type="button" className="w-full rounded-xl border border-dashed border-border px-3 py-6 text-sm" onClick={() => afterPhotoRef.current?.click()}>
                        {afterPhotoUrl ? "Replace after photo" : "Upload after photo"}
                      </button>
                      {afterPhotoUrl && <img src={afterPhotoUrl} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !completeSummary.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={async () => {
                      onError(null);
                      const r = await completeJob(selected.id, {
                        summary: completeSummary.trim(),
                        beforePhotoUrl,
                        afterPhotoUrl,
                        notes: notes.trim() || undefined,
                        healthUpdate: {
                          system: healthSystem,
                          status: healthStatus,
                          nextAction: healthNextAction || "Service completed",
                          notes: completeSummary.trim(),
                        },
                      });
                      if (!r.ok) {
                        onError("Could not complete job.");
                        return;
                      }
                      setCompleteOpen(false);
                      setCompleteSummary("");
                      setBeforePhotoUrl(null);
                      setAfterPhotoUrl(null);
                      await onRefresh();
                    }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardHat className="h-4 w-4" />}
                    Submit completion proof
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
