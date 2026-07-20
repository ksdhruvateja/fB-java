import { useEffect, useState } from "react";
import {
  ArrowLeft, FileText, LogOut, ShieldCheck, Users, Briefcase,
  Receipt, TrendingUp, CheckCircle, Clock, DollarSign, Star,
  AlertCircle, BarChart2, MessageSquare, ImagePlus,
} from "lucide-react";
import { getStoredUsers, getStoredToken } from "./auth";
import { getJobBoardJobs } from "./jobBoard";
import { getAllLifecycles, STATUS_LABELS, type JobStatus } from "./jobLifecycle";
import { getAllJobChats } from "./jobChat";
import JobChatPanel from "./JobChatPanel";

type AdminTab = "overview" | "contractors" | "jobs" | "invoices" | "conversations";

const STATUS_BADGE: Record<JobStatus, string> = {
  open:           "bg-green-100 text-green-700 border-green-200",
  accepted:       "bg-blue-100 text-blue-700 border-blue-200",
  "on-the-way":   "bg-sky-100 text-sky-700 border-sky-200",
  arrived:        "bg-violet-100 text-violet-700 border-violet-200",
  "work-started": "bg-orange-100 text-orange-700 border-orange-200",
  completed:      "bg-muted text-muted-foreground border-border",
};

export default function AdminPanel({
  onBack,
  onSignOut,
}: {
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  // "pending" while the server verifies admin access, "ok" if allowed, "denied" if rejected
  const [authState, setAuthState] = useState<"pending" | "ok" | "denied">("pending");

  // ── Server-side admin verification ──────────────────────────────────────────
  // Always verify with the server on mount — client state alone is not trusted.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthState("denied");
      return;
    }
    fetch("/api/admin/verify", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) {
          setAuthState("ok");
        } else {
          setAuthState("denied");
        }
      })
      .catch(() => {
        // Network error — deny access rather than silently allow
        setAuthState("denied");
      });
  }, []);

  // Redirect if the server denies access
  useEffect(() => {
    if (authState === "denied") {
      onBack();
    }
  }, [authState, onBack]);

  const [liveData, setLiveData] = useState({
    allJobs: [] as import("./jobBoard").JobBoardItem[],
    lifecycles: [] as import("./jobLifecycle").JobLifecycle[],
    allChats: {} as Record<string, import("./jobChat").JobChatMessage[]>,
    contractorUsers: [] as import("./auth").AuthUser[],
  });

  useEffect(() => {
    const refresh = async () => {
      const [allJobs, lifecycles, allChats, users] = await Promise.all([
        getJobBoardJobs(),
        getAllLifecycles(),
        getAllJobChats(),
        getStoredUsers(),
      ]);
      setLiveData({ allJobs, lifecycles, allChats, contractorUsers: users.filter((u) => u.role === "contractor") });
    };
    refresh();
    window.addEventListener("fixbridge-lifecycle-update", refresh);
    window.addEventListener("fixbridge-chat-update", refresh);
    window.addEventListener("fixbridge-new-job", refresh);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", refresh);
      window.removeEventListener("fixbridge-chat-update", refresh);
      window.removeEventListener("fixbridge-new-job", refresh);
    };
  }, []);

  const { allJobs, lifecycles, allChats, contractorUsers } = liveData;

  const enrichedJobs = allJobs.map((job) => {
    const lc = lifecycles.find((l) => l.jobId === job.id);
    return { ...job, lifecycle: lc };
  });

  const completedJobs = enrichedJobs.filter((j) => j.lifecycle?.status === "completed");
  const invoicedJobs = completedJobs.filter((j) => j.lifecycle?.invoiceAmount !== undefined);
  const totalRevenue = invoicedJobs.reduce((sum, j) => sum + (j.lifecycle?.invoiceAmount ?? 0), 0);
  const platformFee = totalRevenue * 0.1;
  const avgJobValue = invoicedJobs.length > 0 ? totalRevenue / invoicedJobs.length : 0;
  const totalRatings = lifecycles.filter((l) => l.rating !== undefined);
  const avgRating = totalRatings.length > 0
    ? totalRatings.reduce((s, l) => s + (l.rating ?? 0), 0) / totalRatings.length
    : 0;

  const jobsWithChats = allJobs
    .map((job) => {
      const msgs = allChats[String(job.id)] ?? [];
      const visibleMsgs = msgs.filter((m) => m.senderRole !== "system");
      const lastMsg = msgs[msgs.length - 1];
      return { job, msgs, visibleMsgs, lastMsg };
    })
    .filter(({ msgs }) => msgs.length > 0)
    .sort((a, b) => {
      const aTime = a.lastMsg?.createdAt ?? "";
      const bTime = b.lastMsg?.createdAt ?? "";
      return bTime.localeCompare(aTime);
    });

  const TABS: { id: AdminTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: BarChart2 },
    { id: "contractors", label: "Contractors", icon: Users },
    { id: "jobs", label: "All Jobs", icon: Briefcase },
    { id: "invoices", label: "Invoices & Revenue", icon: Receipt },
    { id: "conversations", label: "Conversations", icon: MessageSquare, badge: jobsWithChats.length },
  ];

  // Render nothing (or a loading indicator) until the server confirms admin access.
  // "denied" state is handled by the redirect useEffect above.
  if (authState !== "ok") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="font-mono text-sm text-muted-foreground animate-pulse">
          Verifying access…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="min-h-16 border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-0 bg-card">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/30 bg-primary/5 px-2 py-1">
            Admin
          </span>
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Title */}
        <div className="mb-8">
          <p className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase mb-2">Admin Panel</p>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase text-3xl sm:text-4xl lg:text-5xl leading-[0.9] mb-3">
            Transaction Portal
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage contractors, track all jobs, review invoices, and monitor company revenue.
          </p>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-card border border-border p-1 mb-8 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {label}
              {badge !== undefined && badge > 0 && (
                <span className={`ml-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  activeTab === id ? "bg-background/20 text-background" : "bg-primary text-white"
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Jobs Posted", val: allJobs.length, icon: Briefcase, color: "text-primary" },
                { label: "Jobs Completed", val: completedJobs.length, icon: CheckCircle, color: "text-green-600" },
                { label: "Active Contractors", val: contractorUsers.length, icon: Users, color: "text-blue-600" },
                { label: "Invoices Submitted", val: invoicedJobs.length, icon: Receipt, color: "text-violet-600" },
              ].map(({ label, val, icon: Icon, color }) => (
                <div key={label} className="bg-card border border-border p-5">
                  <Icon size={16} className={`${color} mb-3`} />
                  <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none mb-1">
                    {val}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-border p-5">
                <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-2">Total Transaction Volume</p>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none">
                  ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mt-1">From {invoicedJobs.length} invoiced jobs</p>
              </div>
              <div className="bg-card border border-border p-5">
                <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-2">Platform Revenue (10%)</p>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-green-600 leading-none">
                  ${platformFee.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mt-1">10% platform fee applied</p>
              </div>
              <div className="bg-card border border-border p-5">
                <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-2">Avg. Job Value</p>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none">
                  ${avgJobValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mt-1">
                  {avgRating > 0 ? `Avg rating: ${avgRating.toFixed(1)}★` : "No ratings yet"}
                </p>
              </div>
            </div>

            {/* Job status breakdown */}
            <div className="bg-card border border-border p-5">
              <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">Job Status Breakdown</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {(["open","accepted","on-the-way","arrived","work-started","completed"] as JobStatus[]).map((status) => {
                  const count = enrichedJobs.filter(
                    (j) => (j.lifecycle?.status ?? "open") === status,
                  ).length;
                  return (
                    <div key={status} className={`border px-3 py-3 text-center ${STATUS_BADGE[status]}`}>
                      <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl leading-none">{count}</p>
                      <p className="font-mono text-[9px] uppercase tracking-wider mt-1">{STATUS_LABELS[status]}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONTRACTORS */}
        {activeTab === "contractors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{contractorUsers.length} registered contractor{contractorUsers.length !== 1 ? "s" : ""}</p>
            </div>
            {contractorUsers.length === 0 && (
              <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No contractor applications found.
              </div>
            )}
            {contractorUsers.map((contractor) => (
              <div key={`${contractor.email}-${contractor.role}`} className="border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{contractor.name}</h2>
                    <p className="font-mono text-[11px] text-muted-foreground">{contractor.email}</p>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-primary border border-primary/30 bg-primary/5 px-2 py-1">
                    {contractor.trade || "Trade not set"}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="text-sm">
                    <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-1">License Number</p>
                    <p>{contractor.licenseNumber || "N/A"}</p>
                  </div>
                  <div className="text-sm">
                    <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-1">Verification</p>
                    <p className="inline-flex items-center gap-1 text-green-700">
                      <ShieldCheck size={14} />
                      Submitted
                    </p>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">Uploaded Documents</p>
                  <ul className="space-y-2 text-sm">
                    {[
                      { label: "License Document", value: contractor.licenseDocumentName },
                      { label: "Insurance Document", value: contractor.insuranceDocumentName },
                      { label: "Government ID", value: contractor.idDocumentName },
                    ].map((doc) => (
                      <li key={doc.label} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 border border-border bg-background px-3 py-2">
                        <span className="text-muted-foreground">{doc.label}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <FileText size={13} className="text-primary" />
                          {doc.value || "Not uploaded"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ALL JOBS */}
        {activeTab === "jobs" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">{allJobs.length} total jobs on the board</p>
            {allJobs.length === 0 && (
              <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No jobs posted yet.
              </div>
            )}
            {/* Desktop table */}
            <div className="hidden sm:block bg-card border border-border divide-y divide-border">
              <div className="px-4 py-2.5 grid grid-cols-12 gap-3 text-left">
                <span className="col-span-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Job</span>
                <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Category</span>
                <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contractor</span>
                <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Estimate</span>
              </div>
              {enrichedJobs.map((job) => {
                const status = (job.lifecycle?.status ?? "open") as JobStatus;
                return (
                  <div key={job.id} className="px-4 py-3 grid grid-cols-12 gap-3 items-center hover:bg-muted/30 transition-colors">
                    <div className="col-span-4 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{job.posted}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{job.category}</span>
                    </div>
                    <div className="col-span-2">
                      <span className={`font-mono text-[9px] uppercase tracking-wider border px-1.5 py-0.5 ${STATUS_BADGE[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{job.lifecycle?.contractorName || "—"}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-sm font-medium text-foreground">{job.est}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {enrichedJobs.map((job) => {
                const status = (job.lifecycle?.status ?? "open") as JobStatus;
                return (
                  <div key={job.id} className="bg-card border border-border p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-snug">{job.title}</p>
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{job.posted}</p>
                      </div>
                      <span className={`font-mono text-[9px] uppercase tracking-wider border px-1.5 py-0.5 shrink-0 ${STATUS_BADGE[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{job.category}</span>
                      {job.lifecycle?.contractorName && (
                        <span className="font-mono text-[10px] text-muted-foreground">· {job.lifecycle.contractorName}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Estimate</span>
                      <span className="text-sm font-semibold text-foreground">{job.est}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* INVOICES & REVENUE */}
        {activeTab === "invoices" && (
          <div className="space-y-6">
            {/* Revenue summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={16} className="text-primary" />
                  <p className="font-mono text-[11px] tracking-wider text-primary uppercase">Total Transaction Volume</p>
                </div>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none">
                  ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mt-1">{invoicedJobs.length} invoices submitted</p>
              </div>
              <div className="bg-card border border-green-200 bg-green-50/50 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-green-600" />
                  <p className="font-mono text-[11px] tracking-wider text-green-700 uppercase">Platform Revenue</p>
                </div>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-green-700 leading-none">
                  ${platformFee.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="font-mono text-[11px] text-green-600 mt-1">10% platform fee</p>
              </div>
              <div className="bg-card border border-border p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star size={16} className="text-primary" />
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Avg. Rating</p>
                </div>
                <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-4xl text-foreground leading-none">
                  {avgRating > 0 ? `${avgRating.toFixed(1)}★` : "—"}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground mt-1">
                  {totalRatings.length} review{totalRatings.length !== 1 ? "s" : ""} submitted
                </p>
              </div>
            </div>

            {/* Invoice list */}
            <div>
              <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">
                Invoice History — Secure Admin View
              </p>
              {invoicedJobs.length === 0 && (
                <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  No invoices submitted yet. Invoices appear here after contractors complete and bill for jobs.
                </div>
              )}
              {invoicedJobs.length > 0 && (
                <>
                  {/* Desktop invoice table */}
                  <div className="hidden sm:block bg-card border border-border divide-y divide-border">
                    <div className="px-4 py-2.5 grid grid-cols-12 gap-3">
                      <span className="col-span-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Job</span>
                      <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contractor</span>
                      <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Invoice File</span>
                      <span className="col-span-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Amount</span>
                      <span className="col-span-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Fee (10%)</span>
                      <span className="col-span-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Rating</span>
                    </div>
                    {invoicedJobs.map((job) => {
                      const lc = job.lifecycle!;
                      const fee = (lc.invoiceAmount ?? 0) * 0.1;
                      return (
                        <div key={job.id} className="px-4 py-3.5 grid grid-cols-12 gap-3 items-center hover:bg-muted/30 transition-colors">
                          <div className="col-span-4 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{job.category} · {lc.completedAt ? new Date(lc.completedAt).toLocaleDateString() : "—"}</p>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <p className="text-xs text-foreground truncate">{lc.contractorName || "—"}</p>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <p className="font-mono text-[10px] text-muted-foreground truncate inline-flex items-center gap-1">
                              <FileText size={11} className="text-primary shrink-0" />
                              {lc.invoiceFileName || "—"}
                            </p>
                          </div>
                          <div className="col-span-2 text-right">
                            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground">
                              ${(lc.invoiceAmount ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="col-span-1 text-right">
                            <p className="text-sm font-medium text-green-600">${fee.toFixed(0)}</p>
                          </div>
                          <div className="col-span-1 text-right">
                            {lc.rating ? (
                              <span className="font-mono text-[11px] text-primary">{lc.rating}★</span>
                            ) : (
                              <span className="font-mono text-[10px] text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="px-4 py-3 grid grid-cols-12 gap-3 bg-muted/30">
                      <div className="col-span-8">
                        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Totals</p>
                      </div>
                      <div className="col-span-2 text-right">
                        <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground">
                          ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="text-sm font-bold text-green-600">${platformFee.toFixed(0)}</p>
                      </div>
                      <div className="col-span-1" />
                    </div>
                  </div>

                  {/* Mobile invoice cards */}
                  <div className="sm:hidden space-y-2">
                    {invoicedJobs.map((job) => {
                      const lc = job.lifecycle!;
                      const fee = (lc.invoiceAmount ?? 0) * 0.1;
                      return (
                        <div key={job.id} className="bg-card border border-border p-4 space-y-2.5">
                          <div>
                            <p className="text-sm font-medium text-foreground leading-snug">{job.title}</p>
                            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{job.category} · {lc.completedAt ? new Date(lc.completedAt).toLocaleDateString() : "—"}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{lc.contractorName || "No contractor"}</span>
                            {lc.invoiceFileName && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                                  <FileText size={10} className="text-primary" />
                                  {lc.invoiceFileName}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between border-t border-border pt-2">
                            <div>
                              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Invoice</p>
                              <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground leading-tight">
                                ${(lc.invoiceAmount ?? 0).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Platform fee</p>
                              <p className="text-sm font-semibold text-green-600">${fee.toFixed(0)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Rating</p>
                              {lc.rating ? (
                                <span className="font-mono text-sm text-primary">{lc.rating}★</span>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Mobile totals row */}
                    <div className="bg-muted/30 border border-border p-4 flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Total Volume</span>
                      <div className="text-right">
                        <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-xl text-foreground">
                          ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="font-mono text-[10px] text-green-600">Fee: ${platformFee.toFixed(0)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Reviews */}
            {totalRatings.length > 0 && (
              <div>
                <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-3">Customer Reviews</p>
                <div className="space-y-3">
                  {lifecycles.filter((l) => l.rating !== undefined && l.review).map((lc) => {
                    const job = allJobs.find((j) => j.id === lc.jobId);
                    return (
                      <div key={lc.jobId} className="bg-card border border-border p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{job?.title ?? `Job #${lc.jobId}`}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{lc.contractorName || "Contractor"}</p>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            {[1,2,3,4,5].map((s) => (
                              <Star key={s} size={12} fill={s <= (lc.rating ?? 0) ? "#FF4D1C" : "none"} className={s <= (lc.rating ?? 0) ? "text-primary" : "text-muted-foreground"} />
                            ))}
                          </div>
                        </div>
                        {lc.review && (
                          <p className="text-xs text-muted-foreground italic">&ldquo;{lc.review}&rdquo;</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONVERSATIONS */}
        {activeTab === "conversations" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                {jobsWithChats.length} job conversation{jobsWithChats.length !== 1 ? "s" : ""}
                {allJobs.length - jobsWithChats.length > 0 && (
                  <span className="ml-1 text-muted-foreground/60">
                    · {allJobs.length - jobsWithChats.length} with no messages
                  </span>
                )}
              </p>
            </div>

            {jobsWithChats.length === 0 && (
              <div className="border border-border bg-card p-10 text-center">
                <MessageSquare size={28} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
                <p className="font-mono text-[11px] text-muted-foreground/60 mt-1">
                  Chats between homeowners and contractors will appear here.
                </p>
              </div>
            )}

            {jobsWithChats.map(({ job, msgs, visibleMsgs, lastMsg }) => {
              const lc = lifecycles.find((l) => l.jobId === job.id);
              const hasImages = msgs.some((m) => m.imageDataUrl);
              return (
                <div key={job.id} className="bg-card border border-border p-5">
                  {/* Conversation header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{job.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-primary">{job.category}</span>
                        {lc?.contractorName && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            Contractor: {lc.contractorName}
                          </span>
                        )}
                        {hasImages && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                            <ImagePlus size={10} />
                            Contains images
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground leading-none">
                        {msgs.length}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        message{msgs.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {/* Chat panel — read-only */}
                  <JobChatPanel
                    jobId={job.id}
                    jobTitle={job.title}
                    myRole="admin"
                    myName="Admin"
                    readOnly
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
