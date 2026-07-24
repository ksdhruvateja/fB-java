import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Search, CheckSquare, DollarSign, User, Bell, LogOut,
  MapPin, Clock, Star, ChevronRight, TrendingUp,
  FileCheck, AlertCircle, Wrench, Zap, Flame, Sun, Moon,
  BarChart2, Shield, Phone, Mail, MessageSquare, Send, Menu, X,
  Truck, Navigation, HardHat, CheckCircle, Receipt, Upload,
  Brain, FileText, Video, ImagePlus, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { contractorCanDoJob, getJobBoardJobs, NEW_JOB_EVENT, formatJobNumber, type JobBoardItem } from "./jobBoard";
import type { AuthUser } from "./auth";
import { updateUserProfile } from "./auth";
import { addJobMessage } from "./jobChat";
import JobChatPanel from "./JobChatPanel";
import {
  getJobLifecycle,
  getAllLifecycles,
  updateJobStatus,
  updateJobInvoice,
  STATUS_NEXT,
  STATUS_NEXT_LABEL,
  STATUS_LABELS,
  type JobStatus,
  type JobLifecycle,
} from "./jobLifecycle";

type DashTab = "find" | "work" | "earnings" | "profile";

const NAV_ITEMS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "find", label: "Find Jobs", icon: Search },
  { id: "work", label: "My Work", icon: CheckSquare },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "profile", label: "My Profile", icon: User },
];

const AREA_NEIGHBORHOODS = [
  { name: "Astoria, Queens", jobs: 8, dist: "0.8 mi", hot: true },
  { name: "Park Slope, Brooklyn", jobs: 6, dist: "2.1 mi", hot: true },
  { name: "Flushing, Queens", jobs: 4, dist: "3.4 mi", hot: false },
  { name: "Jamaica, Queens", jobs: 5, dist: "4.1 mi", hot: false },
  { name: "Mineola, Long Island", jobs: 3, dist: "5.2 mi", hot: false },
  { name: "Huntington, Long Island", jobs: 2, dist: "7.8 mi", hot: false },
];

const STATUS_ICON: Record<JobStatus, React.ElementType> = {
  open: AlertCircle,
  accepted: CheckCircle,
  "on-the-way": Truck,
  arrived: Navigation,
  "work-started": HardHat,
  completed: CheckCircle,
};

const STATUS_COLOR: Record<JobStatus, string> = {
  open: "text-green-600",
  accepted: "text-blue-600",
  "on-the-way": "text-sky-600",
  arrived: "text-violet-600",
  "work-started": "text-orange-600",
  completed: "text-muted-foreground",
};

// ─── Invoice Upload ──────────────────────────────────────────────────────────

function InvoiceUpload({ jobId, lifecycle, onUpdated }: { jobId: number; lifecycle: JobLifecycle; onUpdated: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(lifecycle.invoiceAmount?.toString() ?? "");
  const [fileName, setFileName] = useState(lifecycle.invoiceFileName ?? "");
  const [fileData, setFileData] = useState<string | undefined>(lifecycle.invoiceFileData);
  const [saved, setSaved] = useState(Boolean(lifecycle.invoiceFileName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setSaved(false);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setFileData(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !fileName) return;
    if (!fileData && !lifecycle.invoiceFileData) {
      setError("Please select an invoice file to upload.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateJobInvoice(jobId, amt, fileName, fileData || lifecycle.invoiceFileData);
      setSaved(true);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border border-primary/20 bg-primary/5 p-4 space-y-3">
      <p className="font-mono text-[10px] tracking-wider uppercase text-primary">Upload Invoice</p>
      {saved && lifecycle.invoiceAmount !== undefined ? (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle size={14} />
          Invoice submitted: <strong>${lifecycle.invoiceAmount.toLocaleString()}</strong>
          {lifecycle.invoiceFileName && <span className="font-mono text-[10px] text-muted-foreground">· {lifecycle.invoiceFileName}</span>}
          <button type="button" onClick={() => setSaved(false)} className="ml-auto font-mono text-[10px] underline text-muted-foreground">Edit</button>
        </div>
      ) : (
        <>
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex-1">
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1">Total Amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 350"
                className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex-1">
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1">Invoice File</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border border-border bg-background px-3 py-2 text-sm text-left inline-flex items-center gap-2 hover:border-primary/40 transition-colors"
              >
                <Upload size={13} className="text-primary shrink-0" />
                <span className="truncate text-muted-foreground">{fileName || "Select file…"}</span>
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button
            type="button"
            disabled={!amount || !fileName || saving}
            onClick={() => void handleSubmit()}
            className={`px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 ${amount && fileName && !saving ? "bg-primary text-white hover:bg-primary/90" : "bg-primary/40 text-white/80 cursor-not-allowed"}`}
          >
            <Receipt size={12} />
            {saving ? "Saving…" : "Submit Invoice"}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Find Job Card ───────────────────────────────────────────────────────────

function FindJobCard({
  job,
  index,
  user,
  onStatusChange,
}: {
  job: JobBoardItem;
  index: number;
  user: AuthUser | null;
  onStatusChange: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [lifecycle, setLifecycle] = useState<JobLifecycle>({ jobId: job.id, status: "open" });
  const contractorName = user?.name || "Contractor";
  const contractorEmail = user?.email || "";

  const refreshAll = async () => {
    const lc = await getJobLifecycle(job.id);
    setLifecycle(lc);
  };

  useEffect(() => {
    refreshAll();
    window.addEventListener("fixbridge-lifecycle-update", refreshAll);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", refreshAll);
    };
  }, [job.id]);

  const handleAccept = async () => {
    await updateJobStatus(job.id, "accepted", contractorName, contractorEmail);
    const lc = await getJobLifecycle(job.id);
    setLifecycle(lc);
    onStatusChange();
    await addJobMessage(job.id, {
      senderRole: "system",
      senderName: "FixBridge",
      text: `${contractorName} accepted this job and will be in touch shortly.`,
    });
  };

  const handleAdvanceStatus = async () => {
    const next = STATUS_NEXT[lifecycle.status];
    if (!next) return;
    await updateJobStatus(job.id, next, contractorName, contractorEmail);
    const lc = await getJobLifecycle(job.id);
    setLifecycle(lc);
    onStatusChange();
    const statusMsg: Record<string, string> = {
      "on-the-way": `${contractorName} is on the way to your location.`,
      arrived: `${contractorName} has arrived at your address.`,
      "work-started": `${contractorName} has started work.`,
      completed: `${contractorName} has completed the work and will upload an invoice shortly.`,
    };
    await addJobMessage(job.id, {
      senderRole: "system",
      senderName: "FixBridge",
      text: statusMsg[next] ?? `Status updated to: ${STATUS_LABELS[next]}`,
    });
  };

  const handleCancel = async (reason: string) => {
    await updateJobStatus(job.id, "open");
    const lc = await getJobLifecycle(job.id);
    setLifecycle(lc);
    onStatusChange();
    await addJobMessage(job.id, {
      senderRole: "system",
      senderName: "FixBridge",
      text: `Job cancelled by contractor. Reason: ${reason}`,
    });
  };

  const status = lifecycle.status;
  const isAccepted = status !== "open";
  const isCompleted = status === "completed";
  const isCancelledByThisContractor = false; // cancellation reopens the job
  const nextStatus = STATUS_NEXT[status];
  const nextLabel = STATUS_NEXT_LABEL[status];
  const StatusIcon = isAccepted ? STATUS_ICON[status] : null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.07 }}
      className={`bg-card border p-5 group transition-colors ${
        isCompleted
          ? "border-green-500/40 bg-green-50/20"
          : isAccepted
            ? "border-blue-400/40 bg-blue-50/10"
            : "border-border hover:border-primary/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-[11px] tracking-wider text-primary font-semibold border border-primary/30 bg-primary/5 px-2 py-0.5">
              {formatJobNumber(job)}
            </span>
            <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">{job.tag}</span>
            {job.urgent && (
              <span className="font-mono text-[9px] border px-1.5 py-0.5 uppercase tracking-wider bg-red-100 text-red-600 border-red-200">Urgent</span>
            )}
            {job.ai && (
              <span className="font-mono text-[9px] border px-1.5 py-0.5 uppercase tracking-wider bg-primary/10 text-primary border-primary/20">AI Assessed</span>
            )}
            {isAccepted && (
              <span className={`font-mono text-[9px] border px-1.5 py-0.5 uppercase tracking-wider inline-flex items-center gap-1 ${STATUS_COLOR[status]} border-current/20 bg-current/5`}>
                {StatusIcon && <StatusIcon size={9} />}
                {STATUS_LABELS[status]}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mb-2">{job.title}</p>
          <div className="mb-2 text-xs text-muted-foreground">
            <span className="font-mono tracking-wider uppercase">Requirements:</span>{" "}
            {job.requirements.join(" · ")}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <MapPin size={10} className="text-muted-foreground" />
              <span className="font-mono text-[11px] text-muted-foreground">{job.cityStateZip}</span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              <Clock size={10} className="inline mr-1" />{job.posted}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">{job.dist} away</span>
          </div>

          {/* Homeowner photo + description + AI diagnosis panel */}
          {(job.description || job.mediaDataUrl || job.mediaType === "video" || job.aiAssessment) && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAiPanel((v) => !v)}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary mb-2 hover:opacity-70 transition-opacity"
              >
                <Brain size={11} />
                AI Diagnosis & Photos
                {showAiPanel ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>

              {showAiPanel && (
                <div className="border border-primary/20 bg-primary/5 p-3 space-y-3">
                  {/* Homeowner-uploaded image */}
                  {job.mediaDataUrl && job.mediaType === "image" && (
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                        <ImagePlus size={9} /> Homeowner Photo
                      </p>
                      <img
                        src={job.mediaDataUrl}
                        alt="Issue photo"
                        className="max-h-40 w-full object-cover border border-border/50 cursor-pointer"
                        onClick={() => window.open(job.mediaDataUrl, "_blank")}
                        title="Click to open full size"
                      />
                    </div>
                  )}
                  {job.mediaType === "video" && !job.mediaDataUrl && (
                    <p className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Video size={11} className="text-primary" />
                      Homeowner uploaded a video — view after accepting.
                    </p>
                  )}

                  {/* Description */}
                  {job.description && (
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                        <FileText size={9} /> Homeowner's Description
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">{job.description}</p>
                    </div>
                  )}

                  {/* AI assessment */}
                  {job.aiAssessment && (
                    <div className="space-y-2 border-t border-primary/10 pt-2">
                      {job.aiAssessment.overview && (
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Overview</p>
                          <p className="text-xs text-foreground leading-relaxed">{job.aiAssessment.overview}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {job.aiAssessment.diagnosis && (
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Diagnosis</p>
                            <p className="text-xs text-foreground">{job.aiAssessment.diagnosis}</p>
                          </div>
                        )}
                        {job.aiAssessment.likelyRootCause && (
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Root Cause</p>
                            <p className="text-xs text-foreground">{job.aiAssessment.likelyRootCause}</p>
                          </div>
                        )}
                      </div>
                      {job.aiAssessment.toolsRequired?.length > 0 && (
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Tools Required</p>
                          <p className="text-xs text-muted-foreground">{job.aiAssessment.toolsRequired.join(" · ")}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 border-t border-primary/10 pt-2">
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Est. Cost</p>
                          <p className="text-xs font-medium text-foreground">{job.aiAssessment.estimatedCost || "—"}</p>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Duration</p>
                          <p className="text-xs font-medium text-foreground">{job.aiAssessment.estimatedDuration || "—"}</p>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Urgency</p>
                          <p className="text-xs font-medium text-foreground">{job.aiAssessment.urgency || "—"}</p>
                        </div>
                      </div>
                      {job.aiAssessment.safetyNotes && (
                        <p className="text-[11px] text-orange-700 border border-orange-200 bg-orange-50/80 px-2 py-1.5">
                          ⚠ {job.aiAssessment.safetyNotes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isAccepted ? (
            <div className="mt-3 border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs space-y-1">
              <p className="font-mono tracking-wider uppercase text-blue-700">Job Details — Accepted</p>
              <p className="text-foreground"><strong>Address:</strong> {job.fullAddress}</p>
              <p className="text-foreground"><strong>Contact:</strong> {job.contactName} · {job.contactPhone}</p>
            </div>
          ) : (
            <div className="mt-3 border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Full address and contact number unlock after you accept this job.
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{job.est}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{job.bids} bids so far</p>
          </div>
          {!isAccepted ? (
            <button
              onClick={handleAccept}
              className="font-mono text-[11px] bg-primary text-white px-3 py-1.5 hover:bg-primary/90 transition-colors"
            >
              I Can Do This →
            </button>
          ) : isCompleted ? (
            <span className="font-mono text-[10px] text-green-600 border border-green-500/30 bg-green-50 px-3 py-1.5 inline-flex items-center gap-1">
              <CheckCircle size={10} />
              Completed
            </span>
          ) : (
            <span className={`font-mono text-[10px] border px-3 py-1.5 inline-flex items-center gap-1 ${STATUS_COLOR[status]}`}>
              {StatusIcon && <StatusIcon size={10} />}
              {STATUS_LABELS[status]}
            </span>
          )}
        </div>
      </div>

      {/* Status progression */}
      {isAccepted && !isCompleted && nextStatus && nextLabel && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAdvanceStatus}
            className="font-mono text-[11px] bg-primary text-white px-4 py-2 hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            {(() => {
              const Icon = STATUS_ICON[nextStatus];
              return <Icon size={12} />;
            })()}
            {nextLabel}
          </button>
          {!showCancelForm && status === "accepted" && (
            <button
              type="button"
              onClick={() => setShowCancelForm(true)}
              className="font-mono text-[11px] text-red-600 border border-red-300 px-4 py-2 hover:bg-red-50 transition-colors"
            >
              Cancel Job
            </button>
          )}
        </div>
      )}

      {/* Cancel form */}
      {showCancelForm && (
        <div className="mt-3 border border-red-200 bg-red-50/50 p-3 space-y-2">
          <p className="font-mono text-[10px] tracking-wider uppercase text-red-700">Why can&apos;t you do this job?</p>
          <textarea
            value={cancelReasonInput}
            onChange={(e) => setCancelReasonInput(e.target.value)}
            rows={2}
            placeholder="Please provide your reason for cancellation..."
            className="w-full border border-red-200 bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-red-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const reason = cancelReasonInput.trim();
                if (!reason) return;
                handleCancel(reason);
                setShowCancelForm(false);
                setCancelReasonInput("");
              }}
              className="text-xs bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 transition-colors"
            >
              Confirm Cancel
            </button>
            <button
              type="button"
              onClick={() => { setShowCancelForm(false); setCancelReasonInput(""); }}
              className="text-xs border border-border text-foreground px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              Keep Job
            </button>
          </div>
        </div>
      )}

      {/* Invoice upload after completion */}
      {isCompleted && (
        <InvoiceUpload jobId={job.id} lifecycle={lifecycle} onUpdated={() => { getJobLifecycle(job.id).then(setLifecycle); }} />
      )}

      <JobChatPanel
        jobId={job.id}
        jobTitle={job.title}
        myRole="contractor"
        myName={contractorName}
        placeholder={isAccepted ? "Message homeowner…" : "Ask about scope, timing, or materials…"}
      />
    </motion.div>
  );
}

// ─── Find Tab ────────────────────────────────────────────────────────────────

function FindTab({ user }: { user: AuthUser | null }) {
  const [filter, setFilter] = useState("all");
  const filters = ["all", "plumbing", "urgent", "nearby"];
  const [jobs, setJobs] = useState<JobBoardItem[]>([]);
  const [lifecycleMap, setLifecycleMap] = useState<Record<number, string>>({});

  const refreshJobs = async () => {
    const [allJobs, lcs] = await Promise.all([getJobBoardJobs(), getAllLifecycles()]);
    setJobs(allJobs);
    const map: Record<number, string> = {};
    lcs.forEach((lc) => { map[lc.jobId] = lc.status; });
    setLifecycleMap(map);
  };

  useEffect(() => {
    refreshJobs();
    window.addEventListener("fixbridge-lifecycle-update", refreshJobs);
    window.addEventListener(NEW_JOB_EVENT, refreshJobs);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", refreshJobs);
      window.removeEventListener(NEW_JOB_EVENT, refreshJobs);
    };
  }, []);

  const eligibleJobs = jobs.filter((job) => contractorCanDoJob(user?.trade, job.category));

  const filtered =
    filter === "urgent" ? eligibleJobs.filter((j) => j.urgent)
    : filter === "nearby" ? eligibleJobs.filter((j) => parseFloat(j.dist) < 3)
    : filter === "plumbing" ? eligibleJobs.filter((j) => j.category === "Plumbing")
    : eligibleJobs;

  const newJobCount = filtered.filter((j) => (lifecycleMap[j.id] ?? "open") === "open").length;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
            Find Jobs
          </h2>
          <p className="text-sm text-muted-foreground">
            Active repair requests matching your trade in NYC & Long Island.{" "}
            {newJobCount > 0 && (
              <span className="font-mono text-[11px] text-primary font-medium">
                {newJobCount} open {newJobCount === 1 ? "job" : "jobs"} available.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-card border border-border p-1 overflow-x-auto max-w-full">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors ${
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 && (
            <div className="border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
              No jobs currently match your selected filter and trade.
            </div>
          )}
          {filtered.map((job, i) => (
            <FindJobCard
              key={`${job.id}-${tick}`}
              job={job}
              index={i}
              user={user}
              onStatusChange={refreshJobs}
            />
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">Jobs Near You</p>
            <div className="space-y-3">
              {AREA_NEIGHBORHOODS.map(({ name, jobs, dist, hot }) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${hot ? "bg-primary" : "bg-border"} shrink-0`} />
                    <div>
                      <p className="text-xs font-medium text-foreground">{name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{dist}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground">{jobs}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">open</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 p-5">
            <p className="font-mono text-[11px] tracking-wider text-primary uppercase mb-2">Your Stats</p>
            <div className="space-y-2">
              {[
                { label: "Bid close rate", val: "62%" },
                { label: "Avg. response", val: "18 min" },
                { label: "Jobs this month", val: "6" },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg text-primary">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Work Tab — live accepted/in-progress/completed jobs ─────────────────────

function WorkTab({ user }: { user: AuthUser | null }) {
  const contractorName = user?.name || "";
  const contractorEmail = (user?.email || "").toLowerCase();
  const [allJobs, setAllJobs] = useState<JobBoardItem[]>([]);
  const [allLifecycles, setAllLifecycles] = useState<JobLifecycle[]>([]);

  const refresh = async () => {
    const [jobs, lcs] = await Promise.all([getJobBoardJobs(), getAllLifecycles()]);
    setAllJobs(jobs);
    setAllLifecycles(lcs);
  };

  useEffect(() => {
    refresh();
    window.addEventListener("fixbridge-lifecycle-update", refresh);
    window.addEventListener(NEW_JOB_EVENT, refresh);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", refresh);
      window.removeEventListener(NEW_JOB_EVENT, refresh);
    };
  }, []);

  const getLc = (jobId: number): JobLifecycle =>
    allLifecycles.find((lc) => lc.jobId === jobId) ?? { jobId, status: "open" };

  // Jobs this contractor has touched (accepted or beyond)
  const myLiveJobs = allJobs.filter((job) => {
    const lc = getLc(job.id);
    if (lc.status === "open") return false;
    const emailMatch = contractorEmail && (lc.contractorEmail || "").toLowerCase() === contractorEmail;
    const nameMatch = contractorName && lc.contractorName === contractorName;
    return Boolean(emailMatch || nameMatch);
  });

  const activeJobs = myLiveJobs.filter((j) => getLc(j.id).status !== "completed");
  const completedLiveJobs = myLiveJobs.filter((j) => getLc(j.id).status === "completed");

  // Stats from database lifecycles only
  const liveCompletedCount = completedLiveJobs.length;
  const liveEarned = completedLiveJobs.reduce((s, j) => s + (getLc(j.id).invoiceAmount ?? 0), 0);
  const totalEarned = liveEarned;
  const totalCompleted = liveCompletedCount;
  const allRatings = completedLiveJobs
    .map((j) => getLc(j.id).rating)
    .filter((r): r is number => r !== undefined);
  const avgRating = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : 0;

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Work
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Active jobs, completed history, and homeowner reviews.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Jobs Completed", val: totalCompleted.toString(), icon: CheckSquare },
          { label: "Total Earned", val: `${totalEarned.toLocaleString()}`, icon: DollarSign },
          { label: "Avg. Rating", val: avgRating > 0 ? `${avgRating.toFixed(1)}★` : "—", icon: Star },
          { label: "Active Now", val: activeJobs.length.toString(), icon: TrendingUp },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="bg-card border border-border p-4">
            <Icon size={14} className="text-primary mb-2" />
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-foreground leading-none mb-1">{val}</p>
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* Active / in-progress live jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-wider text-primary uppercase mb-3">
            Active Jobs ({activeJobs.length})
          </p>
          <div className="space-y-3">
            {activeJobs.map((job, i) => (
              <FindJobCard key={`active-${job.id}`} job={job} index={i} user={user} onStatusChange={refresh} />
            ))}
          </div>
        </div>
      )}

      {/* Completed live jobs */}
      {completedLiveJobs.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">
            Recently Completed
          </p>
          <div className="space-y-3">
            {completedLiveJobs.map((job, i) => (
              <FindJobCard key={`done-${job.id}`} job={job} index={i} user={user} onStatusChange={refresh} />
            ))}
          </div>
        </div>
      )}

      {/* No live jobs yet — helpful message */}
      {myLiveJobs.length === 0 && (
        <div className="border border-border bg-card px-5 py-8 text-center mb-8">
          <CheckSquare size={28} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No active jobs yet</p>
          <p className="font-mono text-[11px] text-muted-foreground">Accept a job from the Find Jobs tab to see it here.</p>
        </div>
      )}
    </div>
  );
}

function EarningsTab({ user }: { user: AuthUser | null }) {
  const contractorName = user?.name || "";
  const [allJobs, setAllJobs] = useState<JobBoardItem[]>([]);
  const [allLifecycles, setAllLifecycles] = useState<JobLifecycle[]>([]);

  useEffect(() => {
    const refresh = async () => {
      const [jobs, lcs] = await Promise.all([getJobBoardJobs(), getAllLifecycles()]);
      setAllJobs(jobs);
      setAllLifecycles(lcs);
    };
    void refresh();
    window.addEventListener("fixbridge-lifecycle-update", refresh);
    return () => window.removeEventListener("fixbridge-lifecycle-update", refresh);
  }, []);

  const getLc = (jobId: number): JobLifecycle =>
    allLifecycles.find((lc) => lc.jobId === jobId) ?? { jobId, status: "open" };

  const myCompleted = allJobs.filter((job) => {
    const lc = getLc(job.id);
    return lc.status === "completed" && (!contractorName || lc.contractorName === contractorName);
  });

  const payouts = myCompleted
    .map((job) => {
      const lc = getLc(job.id);
      return {
        id: job.id,
        title: job.title,
        amount: lc.invoiceAmount ?? 0,
        date: lc.completedAt ? new Date(lc.completedAt).toLocaleDateString() : "—",
      };
    })
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.id - a.id);

  const allTime = payouts.reduce((s, p) => s + p.amount, 0);
  const now = new Date();
  const thisMonth = payouts
    .filter((p) => {
      const job = myCompleted.find((j) => j.id === p.id);
      const completedAt = job ? getLc(job.id).completedAt : undefined;
      if (!completedAt) return false;
      const d = new Date(completedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, p) => s + p.amount, 0);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = payouts
    .filter((p) => {
      const job = myCompleted.find((j) => j.id === p.id);
      const completedAt = job ? getLc(job.id).completedAt : undefined;
      if (!completedAt) return false;
      const d = new Date(completedAt);
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
    })
    .reduce((s, p) => s + p.amount, 0);

  const monthKeys: { key: string; label: string; earned: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString(undefined, { month: "short" });
    const earned = payouts
      .filter((p) => {
        const job = myCompleted.find((j) => j.id === p.id);
        const completedAt = job ? getLc(job.id).completedAt : undefined;
        if (!completedAt) return false;
        const cd = new Date(completedAt);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      })
      .reduce((s, p) => s + p.amount, 0);
    monthKeys.push({ key, label, earned });
  }

  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Earnings
      </h2>
      <p className="text-sm text-muted-foreground mb-8">From completed jobs saved in your FixBridge account.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { label: "This Month", val: `$${thisMonth.toLocaleString()}`, sub: "Invoiced this month" },
          { label: "Last Month", val: `$${lastMonth.toLocaleString()}`, sub: "Previous month" },
          { label: "All Time", val: `$${allTime.toLocaleString()}`, sub: `${payouts.length} paid jobs` },
        ].map(({ label, val, sub }) => (
          <div key={label} className="bg-card border border-border p-5">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-2">{label}</p>
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none mb-1">{val}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border p-5 mb-6">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-6">Monthly Earnings</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthKeys} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: "DM Mono", fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontFamily: "DM Mono", fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0, fontFamily: "DM Mono", fontSize: 11 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Earned"]} />
            <Bar dataKey="earned" fill="#FF4D1C" radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card border border-border">
        <div className="border-b border-border px-5 py-3">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Recent Payouts</p>
        </div>
        <div className="divide-y divide-border">
          {payouts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No invoiced jobs yet. Completed job invoices appear here.</p>
          ) : (
            payouts.slice(0, 8).map((job) => (
              <div key={job.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{job.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{job.date}</p>
                </div>
                <span className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-xl text-foreground">
                  ${job.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({
  user,
  onUserUpdated,
}: {
  user: AuthUser | null;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const nameParts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts[0] ?? "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [trade, setTrade] = useState(user?.trade || "");
  const [license, setLicense] = useState(user?.licenseNumber || "");
  const [companyName, setCompanyName] = useState(user?.companyName || "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState(user?.photoDataUrl ?? "");
  const [licenseDocName, setLicenseDocName] = useState(user?.licenseDocumentName ?? "");
  const [insuranceDocName, setInsuranceDocName] = useState(user?.insuranceDocumentName ?? "");
  const [idDocName, setIdDocName] = useState(user?.idDocumentName ?? "");
  const [licenseDocData, setLicenseDocData] = useState<string | undefined>();
  const [insuranceDocData, setInsuranceDocData] = useState<string | undefined>();
  const [idDocData, setIdDocData] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const parts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length) {
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" ") || "");
    }
    setTrade(user?.trade || "");
    setLicense(user?.licenseNumber || "");
    setCompanyName(user?.companyName || "");
    setPhone(user?.phone ?? "");
    setPhotoDataUrl(user?.photoDataUrl ?? "");
    setLicenseDocName(user?.licenseDocumentName ?? "");
    setInsuranceDocName(user?.insuranceDocumentName ?? "");
    setIdDocName(user?.idDocumentName ?? "");
  }, [user]);

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || user?.name || "Contractor";
  const initials = fullName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "CO";

  const fieldClass =
    "w-full rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none";

  const readFile = (file: File | undefined, onName: (n: string) => void, onData: (d: string) => void) => {
    if (!file) return;
    onName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handlePhoto = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await updateUserProfile({
      name: fullName,
      trade: trade.trim(),
      licenseNumber: license.trim(),
      companyName: companyName.trim(),
      phone: phone.trim(),
      phones: phone.trim() ? [phone.trim()] : [],
      ...(photoDataUrl ? { photoDataUrl } : {}),
      ...(licenseDocName ? { licenseDocumentName: licenseDocName, licenseDocumentData: licenseDocData } : {}),
      ...(insuranceDocName ? { insuranceDocumentName: insuranceDocName, insuranceDocumentData: insuranceDocData } : {}),
      ...(idDocName ? { idDocumentName: idDocName, idDocumentData: idDocData } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUserUpdated?.(result.user);
    setMessage("Profile saved.");
  };

  const verifications = [
    { icon: FileCheck, label: "License", status: Boolean(licenseDocName || user?.licenseDocumentName), detail: "Trade license on file", pct: Boolean(licenseDocName || user?.licenseDocumentName) ? 100 : 35 },
    { icon: Shield, label: "Insurance", status: Boolean(insuranceDocName || user?.insuranceDocumentName), detail: "Liability coverage", pct: Boolean(insuranceDocName || user?.insuranceDocumentName) ? 100 : 40 },
    { icon: CheckSquare, label: "Background", status: true, detail: "Cleared", pct: 100 },
    { icon: AlertCircle, label: "Government ID", status: Boolean(idDocName || user?.idDocumentName), detail: "Photo ID upload", pct: Boolean(idDocName || user?.idDocumentName) ? 100 : 25 },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="text-center sm:text-left">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-bold uppercase text-foreground md:text-4xl">
          My Profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your verified contractor profile visible to homeowners.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Profile summary */}
        <div className="flex flex-col items-center rounded-[1.75rem] border border-border/60 bg-card p-6 text-center shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-4">
          {photoDataUrl ? (
            <img src={photoDataUrl} alt={fullName} className="mb-4 h-28 w-28 rounded-full object-cover shadow-md ring-4 ring-secondary" />
          ) : (
            <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-full bg-primary text-3xl font-black text-white shadow-md ring-4 ring-secondary [font-family:'Barlow_Condensed',sans-serif]">
              {initials}
            </div>
          )}
          <h3 className="text-xl font-bold text-foreground">{fullName}</h3>
          <div className="mt-2 flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-primary" />
              Queens · Brooklyn · Nassau
            </span>
            <span className="font-medium text-foreground/80">{companyName}</span>
            <div className="flex items-center gap-1.5 pt-1">
              <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={11} fill="#FF4D1C" className="text-primary" />)}</div>
              <span className="text-[10px]">4.9 · 5 reviews</span>
            </div>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <ImagePlus size={14} />
            Upload Photo
          </button>
        </div>

        {/* Personal details */}
        <div className="rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-8">
          <h3 className="mb-5 text-base font-bold text-foreground">Personal Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Trade</label>
              <input value={trade} onChange={(e) => setTrade(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">License #</label>
              <input value={license} onChange={(e) => setLicense(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(917) 555-0100" className={fieldClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account Email</label>
              <input value={user?.email ?? ""} disabled className={`${fieldClass} opacity-70`} />
            </div>
          </div>
        </div>

        {/* Verification / skills style */}
        <div className="rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-5">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Verification</h3>
            <span className="text-[11px] font-semibold text-primary">
              {verifications.filter((v) => v.status).length}/{verifications.length} ready
            </span>
          </div>
          <div className="space-y-5">
            {verifications.map(({ icon: Icon, label, status, detail, pct }) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon size={14} className={status ? "text-emerald-600" : "text-amber-500"} />
                    {label}
                  </p>
                  <span className={`text-[10px] font-semibold ${status ? "text-emerald-600" : "text-amber-600"}`}>
                    {status ? "Verified" : "Needed"}
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-secondary">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  <span
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
                    style={{ left: `calc(${pct}% - 8px)` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Documents + performance cards */}
        <div className="rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-7">
          <h3 className="mb-5 text-base font-bold text-foreground">Credentials & Docs</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "License Document", name: licenseDocName, setName: setLicenseDocName, setData: setLicenseDocData },
              { label: "Insurance Document", name: insuranceDocName, setName: setInsuranceDocName, setData: setInsuranceDocData },
              { label: "Government ID", name: idDocName, setName: setIdDocName, setData: setIdDocData },
              { label: "Performance", name: null as string | null, setName: null as ((n: string) => void) | null, setData: null as ((d: string) => void) | null },
            ].map((item) =>
              item.label === "Performance" ? (
                <div key="perf" className="flex flex-col rounded-[1.25rem] border border-border/60 bg-secondary/30 p-4">
                  <p className="text-sm font-semibold text-foreground">Performance</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { label: "Close rate", val: "62%" },
                      { label: "Completed", val: "5" },
                      { label: "On-time", val: "100%" },
                      { label: "Repeats", val: "3" },
                    ].map(({ label, val }) => (
                      <div key={label} className="rounded-xl bg-card px-2.5 py-2 text-center">
                        <p className="[font-family:'Barlow_Condensed',sans-serif] text-lg font-black text-primary">{val}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={item.label} className="flex flex-col rounded-[1.25rem] border border-border/60 bg-secondary/30 p-4">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                    {item.name ? `Attached: ${item.name}` : "PDF or image · not uploaded yet"}
                  </p>
                  <label className="mt-auto inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15">
                    <Upload size={12} />
                    {item.name ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => readFile(e.target.files?.[0], item.setName!, item.setData!)}
                    />
                  </label>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</p>}

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-full bg-primary px-10 py-3.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(255,77,28,0.28)] transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {saving && <Upload size={14} className="animate-pulse" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function ContractorDashboard({
  onLogout,
  onOpenAdmin,
  user,
  isDark,
  onToggleDark,
  onUserUpdated,
}: {
  onLogout: () => void;
  onOpenAdmin: () => void;
  user: AuthUser | null;
  isDark: boolean;
  onToggleDark: () => void;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("find");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const displayName = user?.name || "James Park";
  const trade = user?.trade || "Master Plumber";
  const initials = displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  // Count new open jobs for notification badge
  const [newJobCount, setNewJobCount] = useState(0);
  useEffect(() => {
    const update = async () => {
      const [jobs, lcs] = await Promise.all([getJobBoardJobs(), getAllLifecycles()]);
      const lcMap: Record<number, string> = {};
      lcs.forEach((lc) => { lcMap[lc.jobId] = lc.status; });
      setNewJobCount(jobs.filter((j) => (lcMap[j.id] ?? "open") === "open").length);
    };
    update();
    window.addEventListener("fixbridge-lifecycle-update", update);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", update);
    };
  }, []);

  // Pop-up toast when a new job is posted by a homeowner
  const [newJobToast, setNewJobToast] = useState<{ title: string; category: string; urgent: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const job = (e as CustomEvent).detail as JobBoardItem;
      setNewJobToast({ title: job.title, category: job.category, urgent: job.urgent });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setNewJobToast(null), 6000);
    };
    window.addEventListener(NEW_JOB_EVENT, handler);
    return () => window.removeEventListener(NEW_JOB_EVENT, handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F0EA]">
      {/* New-job pop-up toast */}
      {newJobToast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="fixed bottom-16 left-3 right-3 z-50 overflow-hidden rounded-[1.5rem] border border-primary/30 bg-card shadow-xl md:bottom-6 md:left-auto md:right-6 md:w-80"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-white" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">New Job Posted</span>
              {newJobToast.urgent && (
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold text-primary">URGENT</span>
              )}
            </div>
            <button type="button" onClick={() => setNewJobToast(null)} className="p-1 text-white/80 hover:text-white">
              <X size={13} />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="mb-1 text-sm font-medium leading-snug text-foreground">{newJobToast.title}</p>
            <p className="mb-3 text-[10px] uppercase text-muted-foreground">{newJobToast.category}</p>
            <button
              type="button"
              onClick={() => { setNewJobToast(null); setActiveTab("find"); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary py-2.5 text-xs font-semibold text-white hover:bg-primary/90"
            >
              View Job <ChevronRight size={12} />
            </button>
          </div>
        </motion.div>
      )}

      {mobileMenuOpen && (
        <button type="button" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu overlay" />
      )}

      <aside className={`fixed md:static inset-y-0 left-0 z-40 m-0 flex flex-col transition-all duration-300 md:m-3 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${sidebarOpen ? "md:w-56" : "md:w-[4.5rem]"} w-72 shrink-0`}>
        <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-[#1A1614] text-white shadow-[0_20px_50px_rgba(10,10,10,0.18)]">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
            <button type="button" onClick={() => setSidebarOpen((s) => !s)} className="flex items-center gap-1.5">
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-lg font-black tracking-wider">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-lg font-black tracking-wider text-primary">BRIDGE</span>
              {sidebarOpen && <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold">PRO</span>}
            </button>
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-white/60 hover:text-white md:hidden">
              <X size={18} />
            </button>
          </div>

          <div className="border-b border-white/10 bg-white/5 px-4 py-3 md:hidden">
            <p className="text-sm font-semibold">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary">{trade}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-green-400">Active</span>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }}
                className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors md:py-2.5 ${
                  activeTab === id ? "bg-primary text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className={`truncate text-sm font-medium ${!sidebarOpen ? "md:hidden" : ""}`}>{label}</span>
                {id === "find" && newJobCount > 0 && (
                  <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary">
                    {newJobCount}
                  </span>
                )}
              </button>
            ))}
            {user?.isAdmin && (
              <button
                type="button"
                onClick={() => { onOpenAdmin(); setMobileMenuOpen(false); }}
                className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-primary px-3 py-3 text-white hover:bg-primary/90 md:py-2.5"
              >
                <Shield size={18} className="shrink-0" />
                <span className={`truncate text-sm font-semibold ${!sidebarOpen ? "md:hidden" : ""}`}>Admin Panel</span>
              </button>
            )}
          </nav>

          <div className="space-y-1 border-t border-white/10 p-3">
            <button type="button" onClick={onToggleDark} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-white/65 transition-colors hover:bg-white/8 hover:text-white">
              {isDark ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
              <span className={`text-sm ${!sidebarOpen ? "md:hidden" : ""}`}>{isDark ? "Light mode" : "Dark mode"}</span>
            </button>
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-white/65 transition-colors hover:bg-white/8 hover:text-white">
              <LogOut size={16} className="shrink-0" />
              <span className={`text-sm ${!sidebarOpen ? "md:hidden" : ""}`}>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:pr-3 md:pt-3 md:pb-3">
        <header className="mb-0 flex h-14 shrink-0 items-center justify-between rounded-none border-b border-border/60 bg-card/90 px-4 backdrop-blur md:mb-3 md:h-16 md:rounded-[1.5rem] md:border md:px-6 md:shadow-[0_12px_30px_rgba(10,10,10,0.05)]">
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1 md:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-base font-black tracking-wider text-foreground">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-base font-black tracking-wider text-primary">BRIDGE</span>
            </button>
            <div className="hidden md:block">
              <p className="text-sm font-semibold leading-tight text-foreground">{displayName}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-primary">{trade}</span>
                <span className="h-1 w-1 rounded-full bg-green-500" />
                <span className="text-[10px] text-green-600">Active</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground hover:text-foreground">
              <Bell size={15} />
              {newJobCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-white">
                  {newJobCount > 9 ? "9+" : newJobCount}
                </span>
              )}
            </button>
            <div className="relative">
              <button type="button" onClick={() => setProfileMenuOpen((o) => !o)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white" aria-label="Open profile menu">
                {initials}
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                  {user?.isAdmin && (
                    <button type="button" onClick={() => { setProfileMenuOpen(false); onOpenAdmin(); }} className="w-full px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-muted/50">Admin Panel</button>
                  )}
                  <button type="button" onClick={() => { setProfileMenuOpen(false); setActiveTab("profile"); }} className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50">My Profile</button>
                  <button type="button" onClick={() => { setProfileMenuOpen(false); onLogout(); }} className="w-full px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50">Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto rounded-none p-4 pb-20 md:rounded-[1.75rem] md:border md:border-border/60 md:bg-card/40 md:p-6 md:pb-8 lg:p-8">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto w-full max-w-5xl">
            {activeTab === "find" && <FindTab user={user} />}
            {activeTab === "work" && <WorkTab user={user} />}
            {activeTab === "earnings" && <EarningsTab user={user} />}
            {activeTab === "profile" && <ProfileTab user={user} onUserUpdated={onUserUpdated} />}
          </motion.div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border/70 bg-card/95 backdrop-blur md:hidden">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              activeTab === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 1.8} />
            <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{label}</span>
            {id === "find" && newJobCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-18px)] flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold leading-none text-white">
                {newJobCount > 9 ? "9+" : newJobCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
