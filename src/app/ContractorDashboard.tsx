import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bell, Briefcase, CheckSquare, DollarSign, LogOut, Menu, Moon, Sun, User, X,
  Loader2, Shield, Truck, HardHat, Navigation, MapPin, CalendarDays, Clock,
  CheckCircle, XCircle, Inbox, Sparkles, EyeOff, ImagePlus,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { AuthUser } from "./auth";
import { brand } from "../config/brand";
import {
  STATUS_LABELS,
  completeJob,
  formatMoney,
  listContractorPayouts,
  listInvitations,
  listMyManagedJobs,
  respondInvitation,
  startStripeOnboarding,
  submitBid,
  updateCompliance,
  updateJobStatus,
  type ManagedJob,
} from "./managedJobs";

type DashTab = "invites" | "work" | "payouts" | "compliance";
type InviteFilter = "all" | "invited" | "accepted" | "declined";

const NAV: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "invites", label: "Invitations", icon: Bell },
  { id: "work", label: "Active Jobs", icon: CheckSquare },
  { id: "payouts", label: "Payouts", icon: DollarSign },
  { id: "compliance", label: "Compliance", icon: Shield },
];

type Invitation = {
  id: number;
  jobId: number;
  status: string;
  bookingId?: string;
  category?: string;
  title?: string;
  description?: string;
  mediaDataUrl?: string | null;
  mediaType?: string | null;
  cityStateZip?: string;
  preferredDate?: string;
  preferredTimeSlot?: string;
  serviceTiming?: string;
  expectedNetLow?: number;
  expectedNetHigh?: number;
  jobStatus?: string;
  aiAssessment?: {
    summary?: string;
    urgency?: string;
    recommended_trade?: string;
    confidence?: number;
  };
};

const TIME_SLOT_LABELS: Record<string, string> = {
  "9-11": "9–11 AM",
  "11-2": "11 AM–2 PM",
  "2-5": "2–5 PM",
  "5-7": "5–7 PM",
};

const TIMING_LABELS: Record<string, string> = {
  weekday: "Scheduled weekday",
  "same-day": "Same-day priority",
  "evening-weekend": "Evening / weekend",
};

function formatInviteDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function urgencyTone(urgency?: string) {
  const u = String(urgency || "").toLowerCase();
  if (u === "emergency" || u === "critical") {
    return { label: "Emergency", className: "bg-red-600 text-white" };
  }
  if (u === "high") {
    return { label: "High urgency", className: "bg-[#FF4D1C] text-white" };
  }
  if (u === "medium") {
    return { label: "Medium", className: "bg-amber-500/15 text-amber-800 dark:text-amber-200" };
  }
  if (u === "low") {
    return { label: "Low", className: "bg-teal-500/15 text-teal-800 dark:text-teal-200" };
  }
  return { label: "Review", className: "bg-muted text-muted-foreground" };
}

function inviteStatusMeta(status: string) {
  const s = status.toLowerCase();
  if (s === "invited") {
    return { label: "Awaiting response", className: "bg-[#FF4D1C]/12 text-[#FF4D1C]", icon: Bell };
  }
  if (s === "accepted") {
    return { label: "Accepted", className: "bg-teal-500/15 text-teal-800 dark:text-teal-200", icon: CheckCircle };
  }
  if (s === "declined") {
    return { label: "Declined", className: "bg-muted text-muted-foreground", icon: XCircle };
  }
  return { label: status, className: "bg-muted text-muted-foreground", icon: Inbox };
}

export default function ContractorDashboard({
  onLogout,
  user,
  isDark,
  onToggleDark,
}: {
  onLogout: () => void;
  user: AuthUser;
  isDark: boolean;
  onToggleDark: () => void;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const [tab, setTab] = useState<DashTab>("invites");
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("all");
  const [mobileNav, setMobileNav] = useState(false);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [payouts, setPayouts] = useState<Array<{ id: number; jobId: number; amount: number; status: string; simulated?: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidJobId, setBidJobId] = useState<number | null>(null);
  const [labor, setLabor] = useState("200");
  const [materials, setMaterials] = useState("75");
  const [travel, setTravel] = useState("50");
  const [warranty, setWarranty] = useState("90-day workmanship");
  const [exclusions, setExclusions] = useState("Hidden damage, permits not included");
  const [completeSummary, setCompleteSummary] = useState("");
  const [completeJobId, setCompleteJobId] = useState<number | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [afterPhotoUrl, setAfterPhotoUrl] = useState<string | null>(null);
  const beforePhotoRef = useRef<HTMLInputElement>(null);
  const afterPhotoRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [i, j, p] = await Promise.all([listInvitations(), listMyManagedJobs(), listContractorPayouts()]);
    if (i.ok) setInvites((i.invitations || []) as Invitation[]);
    if (j.ok) setJobs(j.jobs || []);
    if (p.ok) setPayouts(p.payouts || []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const inviteCounts = useMemo(() => {
    const counts = { all: invites.length, invited: 0, accepted: 0, declined: 0 };
    for (const inv of invites) {
      const s = String(inv.status || "").toLowerCase();
      if (s === "invited") counts.invited += 1;
      else if (s === "accepted") counts.accepted += 1;
      else if (s === "declined") counts.declined += 1;
    }
    return counts;
  }, [invites]);

  const filteredInvites = useMemo(() => {
    if (inviteFilter === "all") return invites;
    return invites.filter((inv) => String(inv.status).toLowerCase() === inviteFilter);
  }, [invites, inviteFilter]);

  const bidInvite = useMemo(
    () => (bidJobId == null ? null : invites.find((inv) => inv.jobId === bidJobId) || null),
    [bidJobId, invites]
  );

  const netTotal =
    Number(labor || 0) + Number(materials || 0) + Number(travel || 0);

  async function onBid(e: FormEvent) {
    e.preventDefault();
    if (!bidJobId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitBid({
        jobId: bidJobId,
        labor: Number(labor),
        materials: Number(materials),
        travelDiagnostic: Number(travel),
        netTotal,
        warranty,
        exclusions,
      });
      if (!r.ok) {
        setError(r.message || "Bid failed.");
        return;
      }
      setBidJobId(null);
      await refresh();
      setTab("work");
    } finally {
      setBusy(false);
    }
  }

  const sidebarNav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setTab(item.id);
            setMobileNav(false);
          }}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
            tab === item.id
              ? "bg-[#FF4D1C] text-white"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
            {brand.productName}
          </p>
          <p className="text-xs text-muted-foreground">Contractor · {user.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleDark} className="rounded-md p-2 hover:bg-muted" aria-label="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setMobileNav((v) => !v)} aria-label="Menu">
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-background shadow-xl">
            <div className="border-b border-border px-4 py-4">
              <p className="font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
                {brand.productName}
              </p>
              <p className="text-xs text-muted-foreground">Contractor · {user.name}</p>
            </div>
            {sidebarNav}
            <div className="mt-auto space-y-1 border-t border-border p-3">
              <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:flex lg:min-h-screen">
        {/* Desktop left sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="border-b border-border px-4 py-5">
            <p className="font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
              {brand.productName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Contractor · {user.name}</p>
          </div>
          <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
          <div className="space-y-1 border-t border-border p-3">
            <button type="button" onClick={onToggleDark} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 px-4 py-6 lg:px-8">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}

        {tab === "invites" && (
          <section className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl border border-[#FF4D1C]/20 bg-gradient-to-br from-[#FFF7F3] via-card to-[#F3FAF8] p-5 sm:p-6 dark:from-[#2a1812] dark:via-card dark:to-[#142a28]">
              <div
                className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#FF4D1C]/15 blur-3xl"
                aria-hidden
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF4D1C]">
                    Managed network
                  </p>
                  <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl tracking-wide sm:text-3xl">
                    Job invitations
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Review scoped work, respond quickly, then submit a confidential net bid.
                    Customer address and retail pricing stay hidden until you are authorized.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-[#FF4D1C]/25 bg-white/70 px-3 py-2 text-xs font-medium text-[#FF4D1C] backdrop-blur dark:bg-black/20">
                    <EyeOff className="h-3.5 w-3.5" />
                    Retail price hidden
                  </div>
                  {inviteCounts.invited > 0 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      <span className="tabular-nums text-[#FF4D1C]">{inviteCounts.invited}</span> waiting for your response
                    </p>
                  )}
                </div>
              </div>

              <div className="relative mt-5 flex flex-wrap gap-2">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "invited", label: "New" },
                    { id: "accepted", label: "Accepted" },
                    { id: "declined", label: "Declined" },
                  ] as const
                ).map((f) => {
                  const active = inviteFilter === f.id;
                  const count = inviteCounts[f.id];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setInviteFilter(f.id)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                        active
                          ? "bg-[#FF4D1C] text-white"
                          : "border border-border bg-white/70 text-foreground hover:border-[#FF4D1C]/40 dark:bg-background/50"
                      }`}
                    >
                      {f.label}
                      <span className={`ml-1.5 tabular-nums ${active ? "text-white/80" : "text-muted-foreground"}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredInvites.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FF4D1C]/10 text-[#FF4D1C]">
                  <Inbox className="h-6 w-6" />
                </div>
                <p className="font-semibold">No invitations here</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {inviteFilter === "invited"
                    ? "You’re caught up — new Managed invitations will appear here."
                    : "When dispatch invites you to a job, it will show up with expected net range and scope."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {filteredInvites.map((inv, index) => {
                    const urgency = urgencyTone(inv.aiAssessment?.urgency);
                    const statusMeta = inviteStatusMeta(inv.status);
                    const StatusIcon = statusMeta.icon;
                    const pending = String(inv.status).toLowerCase() === "invited";
                    const slotLabel =
                      TIME_SLOT_LABELS[String(inv.preferredTimeSlot || "")] ||
                      inv.preferredTimeSlot ||
                      "Window TBD";
                    const timingLabel =
                      TIMING_LABELS[String(inv.serviceTiming || "")] || inv.serviceTiming;
                    const dateLabel = formatInviteDate(inv.preferredDate);
                    const responding = busyInviteId === inv.id;
                    const mediaUrl = typeof inv.mediaDataUrl === "string" ? inv.mediaDataUrl.trim() : "";
                    const hasCustomerMedia =
                      mediaUrl.length > 32 &&
                      (mediaUrl.startsWith("data:image") ||
                        mediaUrl.startsWith("data:video") ||
                        mediaUrl.startsWith("http://") ||
                        mediaUrl.startsWith("https://") ||
                        String(inv.mediaType || "").startsWith("image") ||
                        String(inv.mediaType || "").startsWith("video"));
                    const isVideo =
                      String(inv.mediaType || "").startsWith("video") ||
                      mediaUrl.startsWith("data:video") ||
                      /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);

                    return (
                      <motion.article
                        key={inv.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.3 }}
                        className={`overflow-hidden rounded-2xl border bg-card shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] transition hover:border-[#FF4D1C]/35 ${
                          pending ? "border-[#FF4D1C]/30" : "border-border"
                        }`}
                      >
                        <div className={`grid ${hasCustomerMedia ? "lg:grid-cols-[minmax(0,1fr)_220px]" : ""}`}>
                          <div className="space-y-4 p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${statusMeta.className}`}>
                                    <StatusIcon className="h-3.5 w-3.5" />
                                    {statusMeta.label}
                                  </span>
                                  <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${urgency.className}`}>
                                    {urgency.label}
                                  </span>
                                  {inv.category && (
                                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                                      {inv.category}
                                    </span>
                                  )}
                                </div>
                                <h2 className="text-lg font-semibold leading-snug">
                                  {inv.title || inv.category || "Service invitation"}
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                  {inv.bookingId || `Job #${inv.jobId}`}
                                  {inv.aiAssessment?.recommended_trade
                                    ? ` · ${String(inv.aiAssessment.recommended_trade).replace(/_/g, " ")}`
                                    : ""}
                                </p>
                              </div>
                              <div className="rounded-xl bg-gradient-to-br from-[#FF4D1C]/12 to-transparent px-3 py-2 text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Expected net
                                </p>
                                <p className="mt-0.5 text-base font-semibold tabular-nums text-[#FF4D1C]">
                                  {formatMoney(inv.expectedNetLow)}–{formatMoney(inv.expectedNetHigh)}
                                </p>
                              </div>
                            </div>

                            {inv.description && (
                              <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
                                {inv.description}
                              </p>
                            )}

                            {inv.aiAssessment?.summary && (
                              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  <Sparkles className="h-3.5 w-3.5 text-[#FF4D1C]" />
                                  AI scope note
                                </p>
                                <p className="mt-1.5 text-sm leading-relaxed">{inv.aiAssessment.summary}</p>
                              </div>
                            )}

                            <div className="grid gap-2 sm:grid-cols-3">
                              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" />
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Area</p>
                                  <p className="text-sm font-medium">{inv.cityStateZip || "General service area"}</p>
                                </div>
                              </div>
                              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
                                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" />
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preferred date</p>
                                  <p className="text-sm font-medium">{dateLabel || "Flexible"}</p>
                                  {timingLabel && (
                                    <p className="text-xs text-muted-foreground">{timingLabel}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
                                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" />
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time window</p>
                                  <p className="text-sm font-medium">{slotLabel}</p>
                                  <p className="text-xs text-muted-foreground">Preferred · not confirmed</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                              {pending && (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy || responding}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                                    onClick={async () => {
                                      setBusy(true);
                                      setBusyInviteId(inv.id);
                                      setError(null);
                                      try {
                                        const r = await respondInvitation(inv.id, "accept");
                                        if (!r.ok) {
                                          setError("Could not accept invitation.");
                                          return;
                                        }
                                        setBidJobId(inv.jobId);
                                        await refresh();
                                      } finally {
                                        setBusy(false);
                                        setBusyInviteId(null);
                                      }
                                    }}
                                  >
                                    {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                    Accept invitation
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy || responding}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
                                    onClick={async () => {
                                      setBusy(true);
                                      setBusyInviteId(inv.id);
                                      setError(null);
                                      try {
                                        const r = await respondInvitation(inv.id, "decline");
                                        if (!r.ok) {
                                          setError("Could not decline invitation.");
                                          return;
                                        }
                                        await refresh();
                                      } finally {
                                        setBusy(false);
                                        setBusyInviteId(null);
                                      }
                                    }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Decline
                                  </button>
                                </>
                              )}
                              {String(inv.status).toLowerCase() !== "declined" && (
                                <button
                                  type="button"
                                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                                    bidJobId === inv.jobId
                                      ? "border border-[#FF4D1C] bg-[#FF4D1C]/10 text-[#FF4D1C]"
                                      : "border border-border hover:border-[#FF4D1C]/40 hover:bg-[#FF4D1C]/5"
                                  }`}
                                  onClick={() => setBidJobId(inv.jobId)}
                                >
                                  <DollarSign className="h-4 w-4" />
                                  {bidJobId === inv.jobId ? "Bidding this job" : "Submit net bid"}
                                </button>
                              )}
                            </div>
                          </div>

                          {hasCustomerMedia && (
                            <div className="relative min-h-[160px] border-t border-border bg-muted/20 lg:border-l lg:border-t-0">
                              {isVideo ? (
                                <video
                                  src={mediaUrl}
                                  className="h-full max-h-72 w-full object-cover lg:max-h-none lg:absolute lg:inset-0"
                                  controls
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={mediaUrl}
                                  alt="Customer upload"
                                  className="h-full max-h-72 w-full object-cover lg:max-h-none lg:absolute lg:inset-0"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            <AnimatePresence>
              {bidJobId && (
                <motion.form
                  key={bidJobId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onSubmit={onBid}
                  className="relative overflow-hidden rounded-2xl border border-[#FF4D1C]/35 bg-gradient-to-br from-card to-[#FFF7F3] p-4 shadow-[0_18px_50px_-28px_rgba(255,77,28,0.45)] sm:p-6 dark:to-[#2a1812]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FF4D1C]">
                        Confidential
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">
                        Net bid · {bidInvite?.title || `Job #${bidJobId}`}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Customer never sees these numbers. Enter your contractor net only.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      onClick={() => setBidJobId(null)}
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Labor</span>
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 tabular-nums outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
                        value={labor}
                        onChange={(e) => setLabor(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Materials</span>
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 tabular-nums outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
                        value={materials}
                        onChange={(e) => setMaterials(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Travel / diagnostic</span>
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 tabular-nums outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
                        value={travel}
                        onChange={(e) => setTravel(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[#FF4D1C]/20 bg-[#FF4D1C]/5 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Your net total
                      </p>
                      <p className="text-2xl font-semibold tabular-nums text-[#FF4D1C]">{formatMoney(netTotal)}</p>
                    </div>
                    {bidInvite?.expectedNetLow != null && (
                      <p className="text-xs text-muted-foreground">
                        Guide range {formatMoney(bidInvite.expectedNetLow)}–{formatMoney(bidInvite.expectedNetHigh)}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Warranty</span>
                      <input
                        className="rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
                        value={warranty}
                        onChange={(e) => setWarranty(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">Exclusions</span>
                      <textarea
                        className="rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
                        rows={2}
                        value={exclusions}
                        onChange={(e) => setExclusions(e.target.value)}
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-3.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60 sm:w-auto"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    Submit confidential bid
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </section>
        )}

        {tab === "work" && (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold">Active jobs</h1>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assigned jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{job.title}</p>
                    <span className="text-xs">{STATUS_LABELS[job.status] || job.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{job.bookingId}</p>
                  {job.fullAddress && <p className="mt-2 text-sm">Address: {job.fullAddress}</p>}
                  {job.contactPhone && <p className="text-sm">Contact: {job.contactName} · {job.contactPhone}</p>}
                  <p className="mt-2 text-sm tabular-nums">
                    Expected net: {formatMoney(job.estimatedContractorNetLow)}–{formatMoney(job.estimatedContractorNetHigh)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.status === "scheduled" && (
                      <button type="button" className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm" onClick={async () => { await updateJobStatus(job.id, "contractor_en_route"); await refresh(); }}>
                        <Truck className="h-4 w-4" /> En route
                      </button>
                    )}
                    {job.status === "contractor_en_route" && (
                      <button type="button" className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm" onClick={async () => { await updateJobStatus(job.id, "work_started"); await refresh(); }}>
                        <Navigation className="h-4 w-4" /> Start work
                      </button>
                    )}
                    {["work_started", "scheduled", "contractor_en_route"].includes(job.status) && (
                      <button type="button" className="inline-flex items-center gap-1 rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white" onClick={() => setCompleteJobId(job.id)}>
                        <HardHat className="h-4 w-4" /> Complete + proof
                      </button>
                    )}
                  </div>
                  {completeJobId === job.id && (
                    <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
                      <textarea
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        rows={3}
                        placeholder="Work summary, materials used, warranty notes"
                        value={completeSummary}
                        onChange={(e) => setCompleteSummary(e.target.value)}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Before photo</p>
                          <input
                            ref={beforePhotoRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setBeforePhotoUrl(String(reader.result));
                              reader.readAsDataURL(file);
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-6 text-sm hover:border-[#FF4D1C]/40"
                            onClick={() => beforePhotoRef.current?.click()}
                          >
                            <ImagePlus className="h-4 w-4" />
                            {beforePhotoUrl ? "Replace before photo" : "Upload before photo"}
                          </button>
                          {beforePhotoUrl && (
                            <img src={beforePhotoUrl} alt="Before" className="h-28 w-full rounded-lg object-cover" />
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">After photo</p>
                          <input
                            ref={afterPhotoRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setAfterPhotoUrl(String(reader.result));
                              reader.readAsDataURL(file);
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-6 text-sm hover:border-[#FF4D1C]/40"
                            onClick={() => afterPhotoRef.current?.click()}
                          >
                            <ImagePlus className="h-4 w-4" />
                            {afterPhotoUrl ? "Replace after photo" : "Upload after photo"}
                          </button>
                          {afterPhotoUrl && (
                            <img src={afterPhotoUrl} alt="After" className="h-28 w-full rounded-lg object-cover" />
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy || !completeSummary.trim()}
                        className="rounded-xl bg-[#FF4D1C] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                        onClick={async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            const r = await completeJob(job.id, {
                              summary: completeSummary,
                              warranty,
                              beforePhotoUrl: beforePhotoUrl || undefined,
                              afterPhotoUrl: afterPhotoUrl || undefined,
                            });
                            if (!r.ok) {
                              setError((r as { message?: string }).message || "Could not submit completion.");
                              return;
                            }
                            setCompleteJobId(null);
                            setCompleteSummary("");
                            setBeforePhotoUrl(null);
                            setAfterPhotoUrl(null);
                            await refresh();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Submit completion proof
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {tab === "payouts" && (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold">Payouts</h1>
            {payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payouts yet. Payouts release after admin approval.</p>
            ) : (
              payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">Job #{p.jobId}</p>
                    <p className="text-muted-foreground">{p.status}{p.simulated ? " · simulated" : ""}</p>
                  </div>
                  <p className="tabular-nums font-semibold">{formatMoney(p.amount)}</p>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "compliance" && (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold">Compliance & Connect</h1>
            <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-3">
              <p><User className="mr-1 inline h-4 w-4" /> {user.name} · {user.trade || "Trade TBD"}</p>
              <p className="text-muted-foreground">Upload license/insurance from your profile settings. Accept the master subcontractor agreement to receive Managed invitations.</p>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await updateCompliance({ acceptAgreement: true, submitForReview: true, complianceStatus: "under_review" });
                  setBusy(false);
                }}
              >
                Accept agreement & submit for review
              </button>
              <button
                type="button"
                className="ml-2 rounded-md bg-[#FF4D1C] px-3 py-2 text-white"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await startStripeOnboarding();
                  if (r.url) window.location.href = r.url;
                  setBusy(false);
                }}
              >
                Stripe Connect onboarding
              </button>
              <p className="text-xs text-muted-foreground">
                Without Stripe keys, onboarding is simulated so local pilots can still test payouts.
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 text-sm">
              <Briefcase className="mb-2 h-4 w-4" />
              Managed jobs only show your confidential net amounts — never customer retail or platform margin.
            </div>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
