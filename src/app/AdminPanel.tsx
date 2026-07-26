import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, LogOut, Loader2, Shield, DollarSign, Users, Briefcase,
  Settings2, Link2, BarChart3, Sparkles, Menu, X, LayoutDashboard,
  Search, Check, Copy, MapPin, ChevronRight, Ban, BadgeCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { loadAllUsers, type AuthUser } from "./auth";
import { brand } from "../config/brand";
import AdminOverview, { type DashboardReport } from "./AdminOverview";
import AdminPricingPanel, { type PricingRules } from "./AdminPricingPanel";
import {
  holdTransfer,
  listOverdueOps,
  matchContractors,
  platformStatus,
  refundPayment,
  releaseTransfer,
  reverseTransfer,
  setJobMode,
  startAdminMfa,
  verifyAdminMfa,
} from "./platformApi";
import {
  STATUS_LABELS,
  adminAiOverride,
  adminAssign,
  adminCreatePartner,
  adminCreateProposal,
  adminCreateDiscount,
  adminDiscounts,
  adminUpdateDiscount,
  adminInvite,
  adminListJobs,
  adminPartnerReferrals,
  adminPartners,
  adminPayments,
  adminPayout,
  adminPricingRules,
  adminReporting,
  adminSavePricingRules,
  adminSetCompliance,
  formatMoney,
  listBids,
  retailRangeLabel,
  type AdminDiscount,
  type Bid,
  type ManagedJob,
} from "./managedJobs";

type Tab =
  | "overview"
  | "dispatch"
  | "proposals"
  | "pricing"
  | "payments"
  | "contractors"
  | "partners"
  | "ai"
  | "reporting"
  | "platform";

const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "dispatch", label: "Dispatch", icon: Briefcase },
  { id: "proposals", label: "Bids & Proposals", icon: DollarSign },
  { id: "pricing", label: "Pricing", icon: Settings2 },
  { id: "payments", label: "Payments", icon: DollarSign },
  { id: "contractors", label: "Contractors", icon: Users },
  { id: "partners", label: "Codes", icon: Link2 },
  { id: "ai", label: "AI Review", icon: Sparkles },
  { id: "platform", label: "Platform", icon: Settings2 },
  { id: "reporting", label: "Reporting", icon: BarChart3 },
];

const TRADE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  others: "Others",
};

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition focus:border-[#FF4D1C] focus:outline-none focus:ring-2 focus:ring-[#FF4D1C]/20";
const cardClass =
  "rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200 hover:border-[#FF4D1C]/35 hover:shadow-md";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const tone = /cancel|refund|disput|suspend/i.test(status)
    ? "bg-red-500/10 text-red-700"
    : /paid|complete|closed|approved|succeed/i.test(status)
      ? "bg-teal-500/10 text-teal-800"
      : /await|pending|invit|bid|proposal|review/i.test(status)
        ? "bg-amber-500/10 text-amber-800"
        : "bg-slate-500/10 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={`${cardClass} flex flex-col items-center justify-center gap-1 px-6 py-12 text-center`}>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className={`${fieldClass} pl-9`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TabFade({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = "1",
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          className={`${fieldClass} pr-10 tabular-nums`}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export default function AdminPanel({
  onBack,
  onSignOut,
}: {
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [contractors, setContractors] = useState<AuthUser[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [payments, setPayments] = useState<unknown[]>([]);
  const [transfers, setTransfers] = useState<unknown[]>([]);
  const [partners, setPartners] = useState<
    Array<{ id: number; code: string; name: string; company?: string; email?: string; phone?: string; intakeUrl?: string }>
  >([]);
  const [referrals, setReferrals] = useState<
    Array<{
      id: number;
      partnerCode: string;
      partnerName?: string;
      status: string;
      statusLabel: string;
      bookingId?: string;
      consent: boolean;
      category?: string;
      area?: string;
    }>
  >([]);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [platformInfo, setPlatformInfo] = useState<Record<string, unknown> | null>(null);
  const [overdueJobs, setOverdueJobs] = useState<unknown[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteContractorId, setInviteContractorId] = useState<number | "">("");
  const [payoutAmount, setPayoutAmount] = useState<number | "">("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerCompany, setPartnerCompany] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([]);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [discountMaxUses, setDiscountMaxUses] = useState<number | "">("");
  const [aiCategory, setAiCategory] = useState("plumbing");
  const [aiUrgency, setAiUrgency] = useState("high");
  const [aiTrade, setAiTrade] = useState("Plumbing");
  const [aiSummary, setAiSummary] = useState("");
  const [aiSafeDiy, setAiSafeDiy] = useState(false);
  const [aiProRequired, setAiProRequired] = useState(true);
  const [aiConfidencePct, setAiConfidencePct] = useState(70);
  const [aiHoursMin, setAiHoursMin] = useState(1);
  const [aiHoursMax, setAiHoursMax] = useState(3);
  const [priceMode, setPriceMode] = useState<"recalc" | "markup_percent" | "markup_amount" | "set_range" | "hide">(
    "recalc"
  );
  const [markupPercent, setMarkupPercent] = useState(0);
  const [markupAmount, setMarkupAmount] = useState(0);
  const [manualLow, setManualLow] = useState(0);
  const [manualHigh, setManualHigh] = useState(0);
  const [jobSearch, setJobSearch] = useState("");
  const [contractorSearch, setContractorSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [copiedPartnerId, setCopiedPartnerId] = useState<number | null>(null);
  const [complianceBusyId, setComplianceBusyId] = useState<number | null>(null);

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;

  useEffect(() => {
    if (!selectedJob) return;
    const a = (selectedJob.aiAssessment || {}) as Record<string, unknown>;
    const cat = String(a.category || selectedJob.category || "plumbing").toLowerCase();
    setAiCategory(cat);
    setAiUrgency(String(a.urgency || "medium"));
    setAiTrade(String(a.recommended_trade || TRADE_LABELS[cat] || selectedJob.category || "Plumbing"));
    setAiSummary(String(a.summary || selectedJob.description || ""));
    setAiSafeDiy(a.safe_diy_allowed === true);
    setAiProRequired(a.professional_required !== false);
    const conf = Number(a.confidence);
    setAiConfidencePct(Number.isFinite(conf) ? Math.round((conf > 1 ? conf : conf * 100)) : 70);
    setAiHoursMin(Number(a.estimated_labor_hours_min) || 1);
    setAiHoursMax(Number(a.estimated_labor_hours_max) || 3);
    setManualLow(Number(selectedJob.customerRetailEstimateLow) || 0);
    setManualHigh(Number(selectedJob.customerRetailEstimateHigh) || 0);
    setPriceMode(selectedJob.showRetailPrice === false ? "hide" : "recalc");
    setMarkupPercent(0);
    setMarkupAmount(0);
  }, [selectedJobId, selectedJob?.aiAssessment, selectedJob?.customerRetailEstimateLow, selectedJob?.customerRetailEstimateHigh, selectedJob?.showRetailPrice]);

  async function refreshJobs() {
    const r = await adminListJobs();
    if (r.ok) setJobs(r.jobs || []);
  }

  useEffect(() => {
    void (async () => {
      const users = await loadAllUsers();
      const list = users
        .filter((u) => u.role === "contractor" && u.id != null && !u.isBlocked)
        .map((u) => ({ ...u, id: Number(u.id) }));
      setContractors(list);
      // Prefer demo plumber when nothing selected yet
      const james = list.find((c) => String(c.email).toLowerCase() === "james@yourcompany.com");
      if (james?.id != null) {
        setInviteContractorId((prev) => (prev === "" ? Number(james.id) : prev));
      }
      await refreshJobs();
    })();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setBids([]);
      return;
    }
    void listBids(selectedJobId).then((r) => {
      if (r.ok) setBids(r.bids || []);
    });
  }, [selectedJobId, jobs]);

  useEffect(() => {
    if (tab === "pricing") {
      void adminPricingRules().then((r) => {
        if (r.ok) setPricingRules(r.rules as PricingRules);
      });
    }
    if (tab === "payments") {
      void adminPayments().then((r) => {
        if (r.ok) {
          setPayments(r.payments || []);
          setTransfers(r.transfers || []);
        }
      });
    }
    if (tab === "partners") {
      void Promise.all([adminPartners(), adminPartnerReferrals(), adminDiscounts()]).then(([p, r, d]) => {
        if (p.ok) setPartners(p.partners || []);
        if (r.ok) setReferrals(r.referrals || []);
        if (d.ok) setDiscounts(d.discounts || []);
      });
    }
    if (tab === "overview" || tab === "reporting") {
      void adminReporting().then((r) => {
        if (r.ok) setReport(r);
      });
    }
    if (tab === "platform") {
      void Promise.all([platformStatus(), listOverdueOps()]).then(([s, o]) => {
        if (s.ok) setPlatformInfo(s as Record<string, unknown>);
        if (o.ok) setOverdueJobs(o.overdue || []);
      });
    }
  }, [tab]);

  const filteredDispatch = useMemo(() => {
    const queue = jobs.filter((j) =>
      [
        "paid_for_dispatch",
        "awaiting_contractor",
        "contractor_invited",
        "contractor_accepted",
        "awaiting_bid",
        "bid_received",
        "proposal_sent",
        "awaiting_customer_approval",
        "approved",
        "scheduled",
        "work_started",
        "work_completed",
        "payout_pending",
      ].includes(j.status)
    );
    const q = jobSearch.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((j) =>
      `${j.title} ${j.bookingId} ${j.status} ${j.category} ${j.fullAddress}`.toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  const dispatchQueueCount = useMemo(
    () =>
      jobs.filter((j) =>
        ["paid_for_dispatch", "awaiting_contractor", "contractor_invited", "awaiting_bid", "bid_received"].includes(
          j.status
        )
      ).length,
    [jobs]
  );

  const filteredAllJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      `${j.title} ${j.bookingId} ${j.status} ${j.category} ${j.id}`.toLowerCase().includes(q)
    );
  }, [jobs, jobSearch]);

  const filteredContractors = useMemo(() => {
    const q = contractorSearch.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter((c) => `${c.name} ${c.email} ${c.trade}`.toLowerCase().includes(q));
  }, [contractors, contractorSearch]);

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    const list = payments as Array<Record<string, unknown>>;
    if (!q) return list.slice(0, 40);
    return list
      .filter((p) =>
        `${p.amount} ${p.payment_type} ${p.status} ${p.job_id}`.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [payments, paymentSearch]);

  const filteredTransfers = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase();
    const list = transfers as Array<Record<string, unknown>>;
    if (!q) return list.slice(0, 40);
    return list
      .filter((t) => `${t.amount} ${t.status} ${t.job_id}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [transfers, paymentSearch]);

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
          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-200 ${
            tab === item.id
              ? "bg-[#FF4D1C] text-white shadow-sm shadow-[#FF4D1C]/30"
              : "text-foreground hover:bg-muted hover:translate-x-0.5"
          }`}
        >
          <item.icon className={`h-4 w-4 shrink-0 transition ${tab === item.id ? "" : "opacity-70 group-hover:opacity-100"}`} />
          <span className="font-medium">{item.label}</span>
          {tab === item.id && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-80" />}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-md p-2 hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-lg tracking-wide text-[#FF4D1C]">
              <Shield className="h-4 w-4" /> {brand.productName} Control
            </p>
            <p className="text-xs text-muted-foreground">Admin · Managed network pilot</p>
          </div>
        </div>
        <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setMobileNav((v) => !v)} aria-label="Menu">
          {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-background shadow-xl">
            <div className="border-b border-border px-4 py-4">
              <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
                <Shield className="h-5 w-5" /> {brand.productName} Control
              </p>
              <p className="text-xs text-muted-foreground">Admin · Managed network pilot</p>
            </div>
            {sidebarNav}
            <div className="mt-auto space-y-1 border-t border-border p-3">
              <button type="button" onClick={onBack} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                <ArrowLeft className="h-4 w-4" /> Staff sign in
              </button>
              <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
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
            <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
              <Shield className="h-5 w-5" /> {brand.productName} Control
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Admin · Managed network pilot</p>
          </div>
          <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
          <div className="space-y-1 border-t border-border p-3">
            <button type="button" onClick={onBack} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-muted hover:translate-x-0.5">
              <ArrowLeft className="h-4 w-4" /> Staff sign in
            </button>
            <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-muted hover:translate-x-0.5">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 bg-[#F7F8FA] px-4 py-6 lg:px-8 dark:bg-background">
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start justify-between gap-3 rounded-2xl border border-[#FF4D1C]/25 bg-[#FF4D1C]/08 px-4 py-3 text-sm shadow-sm"
            >
              <p className="text-foreground">{message}</p>
              <button
                type="button"
                className="rounded-lg p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
                onClick={() => setMessage(null)}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <TabFade tabKey={tab}>
        {tab === "overview" && (
          report ? (
            <AdminOverview report={report} onOpenDispatch={() => setTab("dispatch")} />
          ) : (
            <div className={`${cardClass} flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
            </div>
          )
        )}

        {tab === "dispatch" && (
          <section className="space-y-4">
            <SectionHeader
              title="Dispatch queue"
              subtitle="Select a job to invite a contractor, review pricing, or release payout."
              action={
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
                  <Briefcase className="h-4 w-4 text-[#FF4D1C]" />
                  <span className="tabular-nums font-semibold">{dispatchQueueCount}</span>
                  <span className="text-muted-foreground">awaiting action</span>
                </div>
              }
            />
            <SearchField value={jobSearch} onChange={setJobSearch} placeholder="Search jobs, booking ID, status…" />

            <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Queue</h2>
                {filteredDispatch.length === 0 ? (
                  <EmptyState title="No jobs in the dispatch queue" hint="New paid jobs will show up here." />
                ) : (
                  filteredDispatch.map((job, i) => (
                    <motion.button
                      key={job.id}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.24) }}
                      onClick={() => setSelectedJobId(job.id)}
                      className={`${cardClass} w-full p-4 text-left ${
                        selectedJobId === job.id
                          ? "border-[#FF4D1C] ring-2 ring-[#FF4D1C]/20"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{job.title}</p>
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{job.bookingId}</p>
                      <p className="mt-2 text-sm tabular-nums text-foreground/90">
                        Retail {formatMoney(job.customerRetailEstimateLow)}–{formatMoney(job.customerRetailEstimateHigh)}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        Net {formatMoney(job.estimatedContractorNetLow)}–{formatMoney(job.estimatedContractorNetHigh)}
                      </p>
                    </motion.button>
                  ))
                )}

                <h2 className="pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  All managed jobs
                </h2>
                <div className={`${cardClass} max-h-72 divide-y divide-border overflow-y-auto`}>
                  {filteredAllJobs.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No matching jobs.</p>
                  ) : (
                    filteredAllJobs.map((job) => (
                      <button
                        key={`all-${job.id}`}
                        type="button"
                        onClick={() => setSelectedJobId(job.id)}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition hover:bg-muted/60 ${
                          selectedJobId === job.id ? "bg-[#FF4D1C]/05" : ""
                        }`}
                      >
                        <span className="truncate font-medium">
                          #{job.id} {job.title}
                        </span>
                        <StatusBadge status={String(job.status)} />
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedJob ? (
                <motion.div
                  key={selectedJob.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`${cardClass} space-y-4 p-5`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{selectedJob.title}</h2>
                      <StatusBadge status={selectedJob.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedJob.description}</p>
                    {selectedJob.fullAddress && (
                      <p className="mt-2 flex items-start gap-1.5 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" />
                        {selectedJob.fullAddress}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-gradient-to-br from-[#FF4D1C]/10 to-transparent p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer retail</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {formatMoney(selectedJob.customerRetailEstimateLow)}–{formatMoney(selectedJob.customerRetailEstimateHigh)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-teal-500/10 to-transparent p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contractor net</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {formatMoney(selectedJob.estimatedContractorNetLow)}–{formatMoney(selectedJob.estimatedContractorNetHigh)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-sm font-medium">Invite contractor</p>
                    {selectedJob.assignedContractorUserId ? (
                      <p className="rounded-xl bg-teal-500/10 px-3 py-2 text-sm text-teal-800">
                        Assigned contractor ID #{selectedJob.assignedContractorUserId}
                        {contractors.find((c) => Number(c.id) === Number(selectedJob.assignedContractorUserId))
                          ? ` · ${contractors.find((c) => Number(c.id) === Number(selectedJob.assignedContractorUserId))?.name}`
                          : ""}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <select
                        className={`${fieldClass} max-w-full sm:max-w-xs`}
                        value={inviteContractorId}
                        onChange={(e) => setInviteContractorId(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">Select contractor</option>
                        {contractors.map((c) => {
                          const compliance = String(c.complianceStatus || "approved").toLowerCase();
                          const blocked = ["draft", "under_review", "suspended", "rejected", "blocked"].includes(
                            compliance
                          );
                          return (
                            <option key={String(c.id)} value={Number(c.id)} disabled={blocked}>
                              {c.name} · {c.trade || "trade?"} · {c.email}
                              {compliance !== "approved" ? ` (${compliance})` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !inviteContractorId}
                        className={btnPrimary}
                        onClick={async () => {
                          if (!inviteContractorId) return;
                          setBusy(true);
                          setMessage(null);
                          try {
                            const invite = await adminInvite(selectedJob.id, Number(inviteContractorId));
                            if (!invite.ok) {
                              setMessage(invite.message || "Invite failed.");
                              return;
                            }
                            const assign = await adminAssign(selectedJob.id, Number(inviteContractorId));
                            if (!assign.ok) {
                              setMessage(assign.message || "Invite saved, but assign failed.");
                              await refreshJobs();
                              return;
                            }
                            const name =
                              contractors.find((c) => Number(c.id) === Number(inviteContractorId))?.name ||
                              "Contractor";
                            setMessage(`${name} invited and assigned. Status is now awaiting bid.`);
                            await refreshJobs();
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : "Invite & assign failed.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Invite & assign
                      </button>
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await matchContractors(selectedJob.id);
                          setMessage(
                            r.ok
                              ? `Coverage: ${r.coverageState} · ${r.matches?.length || 0} approved match(es)`
                              : "Match failed."
                          );
                          setBusy(false);
                        }}
                      >
                        Auto-match coverage
                      </button>
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const next = selectedJob.jobMode === "direct" ? "managed" : "direct";
                          const r = await setJobMode(selectedJob.id, next);
                          setMessage(r.ok ? `Job mode set to ${next}` : "Could not set job mode.");
                          await refreshJobs();
                          setBusy(false);
                        }}
                      >
                        Toggle Direct/Managed
                      </button>
                    </div>
                    {contractors.length === 0 && (
                      <p className="text-xs text-amber-700">
                        No contractors loaded. Refresh the page while signed in as admin.
                      </p>
                    )}
                    <div className="flex flex-wrap items-end gap-2 pt-1">
                      <label className="grid gap-1 text-sm">
                        <span className="text-xs font-medium text-muted-foreground">Payout amount (optional)</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className={`${fieldClass} w-36`}
                          placeholder={
                            selectedJob.estimatedContractorNetHigh
                              ? String(Math.round(Number(selectedJob.estimatedContractorNetHigh)))
                              : "Auto"
                          }
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value ? Number(e.target.value) : "")}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !selectedJob.assignedContractorUserId ||
                          ["paid_out", "closed", "canceled", "refunded"].includes(String(selectedJob.status))
                        }
                        className={btnSecondary}
                        title={
                          selectedJob.assignedContractorUserId
                            ? "Release contractor payout"
                            : "Assign a contractor first"
                        }
                        onClick={async () => {
                          setBusy(true);
                          setMessage(null);
                          try {
                            const r = await adminPayout(
                              selectedJob.id,
                              payoutAmount === "" ? undefined : Number(payoutAmount)
                            );
                            if (!r.ok) {
                              setMessage(r.message || "Payout failed.");
                            } else {
                              setMessage(
                                r.message ||
                                  `Payout released${r.amount != null ? ` (${formatMoney(r.amount)})` : ""}${
                                    r.simulated ? " · simulated" : ""
                                  }.`
                              );
                              setPayoutAmount("");
                              await refreshJobs();
                            }
                          } catch (err) {
                            setMessage(err instanceof Error ? err.message : "Payout failed.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Release payout
                      </button>
                      {!selectedJob.assignedContractorUserId && (
                        <p className="w-full text-xs text-muted-foreground">Assign a contractor before releasing payout.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <EmptyState title="Select a job" hint="Pick something from the queue to manage dispatch." />
              )}
            </div>
          </section>
        )}

        {tab === "proposals" && (
          <section className="space-y-4">
            <SectionHeader
              title="Bids & retail proposals"
              subtitle="Pick a job, review confidential net bids, then publish a customer retail proposal."
            />
            <select
              className={fieldClass}
              value={selectedJobId || ""}
              onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  #{j.id} {j.title} · {STATUS_LABELS[j.status] || j.status}
                </option>
              ))}
            </select>
            {!selectedJobId ? (
              <EmptyState title="Choose a job" hint="Bids appear after a contractor submits a confidential net bid." />
            ) : bids.length === 0 ? (
              <EmptyState title="No bids yet" hint="Invite a contractor from Dispatch first." />
            ) : (
              <div className="grid gap-3">
                {bids.map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`${cardClass} p-5`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confidential net bid</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(b.netTotal)}</p>
                      </div>
                      <StatusBadge status={String(b.status || "received")} />
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Labor</p>
                        <p className="font-medium tabular-nums">{formatMoney(b.labor)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Materials</p>
                        <p className="font-medium tabular-nums">{formatMoney(b.materials)}</p>
                      </div>
                      <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Travel</p>
                        <p className="font-medium tabular-nums">{formatMoney(b.travelDiagnostic)}</p>
                      </div>
                    </div>
                    {b.warranty && <p className="mt-3 text-sm text-muted-foreground">{b.warranty}</p>}
                    <button
                      type="button"
                      disabled={busy}
                      className={`${btnPrimary} mt-4`}
                      onClick={async () => {
                        if (!selectedJobId) return;
                        setBusy(true);
                        const r = await adminCreateProposal(selectedJobId, b.id);
                        setMessage(r.ok ? `Proposal published at ${formatMoney(r.proposal?.retailAmount)}` : r.message || "Failed");
                        await refreshJobs();
                        setBusy(false);
                      }}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                      Create retail proposal from bid
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "pricing" && (
          <AdminPricingPanel
            pricingRules={pricingRules}
            setPricingRules={setPricingRules}
            busy={busy}
            onSave={async () => {
              if (!pricingRules) return null;
              setBusy(true);
              const r = await adminSavePricingRules(pricingRules as unknown as Record<string, unknown>);
              setBusy(false);
              if (r.ok) {
                const next = r.rules as PricingRules;
                setPricingRules(next);
                setMessage("Pricing rules saved. New AI assessments will use these values for retail ranges.");
                return next;
              }
              setMessage("Could not save pricing rules.");
              return null;
            }}
            onReload={async () => {
              setBusy(true);
              const r = await adminPricingRules();
              setBusy(false);
              if (r.ok) {
                const next = r.rules as PricingRules;
                setPricingRules(next);
                setMessage("Reloaded current rules from server.");
                return next;
              }
              setMessage("Could not reload pricing rules.");
              return null;
            }}
          />
        )}

        {tab === "payments" && (
          <section className="space-y-4">
            <SectionHeader
              title="Payments"
              subtitle="Customer charges and contractor transfers across the managed network."
            />
            <SearchField value={paymentSearch} onChange={setPaymentSearch} placeholder="Filter by amount, type, status, job…" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Charges</h2>
                {filteredPayments.length === 0 ? (
                  <EmptyState title="No charges yet" />
                ) : (
                  filteredPayments.map((p, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.2) }}
                      className={`${cardClass} p-4`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-lg font-semibold tabular-nums">{formatMoney(Number(p.amount))}</p>
                        <StatusBadge status={String(p.status || "unknown")} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {String(p.payment_type)}
                        {p.simulated ? " · simulated" : ""}
                        {p.job_id != null ? ` · job ${String(p.job_id)}` : ""}
                      </p>
                      {String(p.status) === "succeeded" && p.id != null && (
                        <button
                          type="button"
                          className={`${btnSecondary} mt-3`}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            const r = await refundPayment(Number(p.id), Number(p.amount), "admin_refund");
                            setMessage(r.ok ? "Refund recorded." : r.message || "Refund failed.");
                            const refreshed = await adminPayments();
                            if (refreshed.ok) {
                              setPayments(refreshed.payments || []);
                              setTransfers(refreshed.transfers || []);
                            }
                            setBusy(false);
                          }}
                        >
                          Refund
                        </button>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Transfers</h2>
                {filteredTransfers.length === 0 ? (
                  <EmptyState title="No transfers yet" />
                ) : (
                  filteredTransfers.map((t, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.2) }}
                      className={`${cardClass} p-4`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-lg font-semibold tabular-nums">{formatMoney(Number(t.amount))}</p>
                        <StatusBadge status={String(t.status || "unknown")} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">Job {String(t.job_id)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {t.id != null && String(t.status) !== "held" && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              await holdTransfer(Number(t.id), "Admin hold");
                              const refreshed = await adminPayments();
                              if (refreshed.ok) setTransfers(refreshed.transfers || []);
                              setBusy(false);
                            }}
                          >
                            Hold
                          </button>
                        )}
                        {t.id != null && String(t.status) === "held" && (
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              await releaseTransfer(Number(t.id));
                              const refreshed = await adminPayments();
                              if (refreshed.ok) setTransfers(refreshed.transfers || []);
                              setBusy(false);
                            }}
                          >
                            Release
                          </button>
                        )}
                        {t.id != null && String(t.status) === "paid" && (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              await reverseTransfer(Number(t.id));
                              const refreshed = await adminPayments();
                              if (refreshed.ok) setTransfers(refreshed.transfers || []);
                              setBusy(false);
                            }}
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "contractors" && (
          <section className="space-y-4">
            <SectionHeader
              title="Contractors"
              subtitle="Approve or suspend network professionals. Compliance gates invite eligibility."
              action={
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
                  <span className="tabular-nums font-semibold">{contractors.length}</span>
                  <span className="text-muted-foreground"> on network</span>
                </div>
              }
            />
            <SearchField value={contractorSearch} onChange={setContractorSearch} placeholder="Search name, email, trade…" />
            {filteredContractors.length === 0 ? (
              <EmptyState title="No contractors match" hint="Try a different search." />
            ) : (
              <div className="grid gap-3">
                {filteredContractors.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.24) }}
                    className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FF4D1C]/12 text-sm font-semibold text-[#FF4D1C]">
                        {(c.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {c.email}
                          {c.trade ? ` · ${c.trade}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={complianceBusyId === Number(c.id)}
                        className={btnPrimary}
                        onClick={async () => {
                          if (!c.id) return;
                          setComplianceBusyId(Number(c.id));
                          await adminSetCompliance(Number(c.id), "approved");
                          setMessage(`${c.name} approved.`);
                          setComplianceBusyId(null);
                        }}
                      >
                        {complianceBusyId === Number(c.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BadgeCheck className="h-4 w-4" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={complianceBusyId === Number(c.id)}
                        className={btnSecondary}
                        onClick={async () => {
                          if (!c.id) return;
                          setComplianceBusyId(Number(c.id));
                          await adminSetCompliance(Number(c.id), "suspended");
                          setMessage(`${c.name} suspended.`);
                          setComplianceBusyId(null);
                        }}
                      >
                        <Ban className="h-4 w-4" />
                        Suspend
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "partners" && (
          <section className="space-y-5">
            <SectionHeader
              title="Referral & discount codes"
              subtitle="Create partner referral codes and promo discount codes. Customers enter them on Report an Issue — both apply automatically."
            />

            <div className={`${cardClass} grid gap-3 p-5 sm:grid-cols-3`}>
              <input
                className={fieldClass}
                placeholder="Partner name"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
              />
              <input
                className={fieldClass}
                placeholder="Company (optional)"
                value={partnerCompany}
                onChange={(e) => setPartnerCompany(e.target.value)}
              />
              <input
                className={fieldClass}
                placeholder="Email for status updates"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                className={`${btnPrimary} sm:col-span-3`}
                onClick={async () => {
                  setBusy(true);
                  const r = await adminCreatePartner({
                    name: partnerName || "Partner",
                    company: partnerCompany || undefined,
                    email: partnerEmail || undefined,
                  });
                  if (r.ok) {
                    const code = r.partner?.code || "";
                    setMessage(code ? `Partner created. Share this code: ${code}` : "Partner created.");
                    setPartnerName("");
                    setPartnerCompany("");
                    setPartnerEmail("");
                    if (code) {
                      try {
                        await navigator.clipboard.writeText(code);
                        setMessage(`Partner created. Code ${code} copied — share the code only.`);
                      } catch {
                        // message already set
                      }
                    }
                  }
                  const [list, refs] = await Promise.all([adminPartners(), adminPartnerReferrals()]);
                  if (list.ok) setPartners(list.partners || []);
                  if (refs.ok) setReferrals(refs.referrals || []);
                  setBusy(false);
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Generate referral code
              </button>
            </div>

            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Partner codes</h2>
              {partners.length === 0 ? (
                <EmptyState title="No partners yet" hint="Create one above to generate a referral code." />
              ) : (
                partners.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.2) }}
                    className={`${cardClass} p-4`}
                  >
                    <p className="font-medium">
                      {p.name}
                      {p.company ? ` · ${p.company}` : ""}
                    </p>
                    {p.email && <p className="mt-1 text-sm text-muted-foreground">{p.email}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="rounded-xl bg-[#FF4D1C]/10 px-4 py-2 font-mono text-xl font-semibold tracking-[0.18em] text-[#FF4D1C]">
                        {p.code}
                      </span>
                      <button
                        type="button"
                        className={btnPrimary}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(p.code);
                            setCopiedPartnerId(p.id);
                            setMessage(`Referral code ${p.code} copied — share the code only.`);
                            window.setTimeout(() => setCopiedPartnerId(null), 1800);
                          } catch {
                            setMessage(p.code);
                          }
                        }}
                      >
                        {copiedPartnerId === p.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedPartnerId === p.id ? "Code copied" : "Copy code"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Customers type this code on Report an Issue — it applies automatically. No full link needed.
                    </p>
                  </motion.div>
                ))
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Referral status</h2>
              <p className="text-xs text-muted-foreground">
                Visible statuses only: referral received, customer contacted, assessment scheduled, proposal sent, work
                scheduled / completed.
              </p>
              {referrals.length === 0 ? (
                <EmptyState title="No referrals yet" />
              ) : (
                referrals.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.2) }}
                    className={`${cardClass} p-4 text-sm`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.statusLabel}</p>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {r.bookingId || `Job ${r.id}`}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {r.partnerName || r.partnerCode}
                      {r.category ? ` · ${r.category}` : ""}
                      {r.area ? ` · ${r.area}` : ""}
                    </p>
                    <p className="mt-2 text-xs">
                      {r.consent ? (
                        <span className="inline-flex items-center gap-1 text-teal-700">
                          <BadgeCheck className="h-3.5 w-3.5" /> Customer consented to status sharing
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No consent (no partner emails)</span>
                      )}
                    </p>
                  </motion.div>
                ))
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-5">
              <div>
                <h2 className="text-lg font-semibold">Discount codes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Percent or dollar-off promos. Applied automatically to the customer retail estimate (and final proposal)
                  when the homeowner enters the code.
                </p>
              </div>

              <div className={`${cardClass} grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3`}>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Code</span>
                  <input
                    className={`${fieldClass} font-mono uppercase`}
                    placeholder="e.g. SAVE10"
                    value={discountCodeInput}
                    onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Label (optional)</span>
                  <input
                    className={fieldClass}
                    placeholder="Spring promo"
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Type</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscountType("percent")}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        discountType === "percent" ? "bg-[#FF4D1C] text-white" : "border border-border hover:bg-muted"
                      }`}
                    >
                      Percent %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("amount")}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        discountType === "amount" ? "bg-[#FF4D1C] text-white" : "border border-border hover:bg-muted"
                      }`}
                    >
                      Amount $
                    </button>
                  </div>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">{discountType === "amount" ? "Dollar off" : "Percent off"}</span>
                  <input
                    type="number"
                    min={1}
                    max={discountType === "percent" ? 90 : 10000}
                    className={fieldClass}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Max uses (optional)</span>
                  <input
                    type="number"
                    min={1}
                    className={fieldClass}
                    placeholder="Unlimited"
                    value={discountMaxUses}
                    onChange={(e) => setDiscountMaxUses(e.target.value ? Number(e.target.value) : "")}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !discountCodeInput.trim()}
                  className={`${btnPrimary} self-end`}
                  onClick={async () => {
                    setBusy(true);
                    const r = await adminCreateDiscount({
                      code: discountCodeInput.trim(),
                      label: discountLabel.trim() || undefined,
                      discountType,
                      value: discountValue,
                      maxUses: discountMaxUses === "" ? null : Number(discountMaxUses),
                    });
                    if (r.ok && r.discount) {
                      setMessage(`Discount ${r.discount.code} created — share the code only.`);
                      setDiscountCodeInput("");
                      setDiscountLabel("");
                      setDiscountValue(10);
                      setDiscountMaxUses("");
                      try {
                        await navigator.clipboard.writeText(r.discount.code);
                      } catch {
                        // ignore
                      }
                      const list = await adminDiscounts();
                      if (list.ok) setDiscounts(list.discounts || []);
                    } else {
                      setMessage(r.message || "Could not create discount code.");
                    }
                    setBusy(false);
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  Create discount code
                </button>
              </div>

              <div className="space-y-3">
                {discounts.length === 0 ? (
                  <EmptyState title="No discount codes yet" hint="Create one above — e.g. SAVE10 for 10% off." />
                ) : (
                  discounts.map((d, i) => (
                    <motion.div
                      key={d.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.2) }}
                      className={`${cardClass} flex flex-wrap items-center justify-between gap-3 p-4`}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-xl bg-[#FF4D1C]/10 px-3 py-1.5 font-mono text-lg font-semibold tracking-widest text-[#FF4D1C]">
                            {d.code}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              d.active ? "bg-teal-500/15 text-teal-800" : "bg-slate-500/15 text-slate-600"
                            }`}
                          >
                            {d.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">
                          <span className="font-semibold">
                            {d.discountType === "amount" ? formatMoney(d.value) : `${d.value}%`} off
                          </span>
                          {d.label ? ` · ${d.label}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Used {d.usesCount}
                          {d.maxUses != null ? ` / ${d.maxUses}` : ""} times
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(d.code);
                              setMessage(`Discount code ${d.code} copied.`);
                            } catch {
                              setMessage(d.code);
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" /> Copy
                        </button>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={async () => {
                            await adminUpdateDiscount(d.id, { active: !d.active });
                            const list = await adminDiscounts();
                            if (list.ok) setDiscounts(list.discounts || []);
                            setMessage(d.active ? `${d.code} deactivated.` : `${d.code} activated.`);
                          }}
                        >
                          {d.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "ai" && (
          <section className="space-y-4">
            <SectionHeader
              title="AI Review"
              subtitle="Review what the AI found in plain English, correct it if needed, then adjust the customer price with a dollar or percent markup. The pricing engine recalculates retail — AI never invents prices."
            />

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Which job?</span>
              <select
                className={fieldClass}
                value={selectedJobId || ""}
                onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a job to review</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    #{j.id} · {j.title || j.category || "Job"} · {STATUS_LABELS[j.status] || j.status}
                  </option>
                ))}
              </select>
            </label>

            {!selectedJob ? (
              <EmptyState title="Pick a job above to start reviewing" />
            ) : (
              <motion.div
                key={selectedJob.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${cardClass} space-y-5 p-5`}
              >
                <div className="rounded-xl bg-gradient-to-r from-[#FF4D1C]/12 via-teal-500/10 to-transparent px-4 py-3 text-sm">
                  <p className="font-medium">Current customer estimate</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {selectedJob.showRetailPrice === false
                      ? "Hidden — on-site assessment required"
                      : retailRangeLabel(selectedJob)}
                  </p>
                  {selectedJob.estimatedContractorNetLow != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Internal contractor net range (not shown to customer):{" "}
                      {formatMoney(selectedJob.estimatedContractorNetLow)}–
                      {formatMoney(selectedJob.estimatedContractorNetHigh)}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">What kind of work is this?</span>
                    <select
                      className={fieldClass}
                      value={aiCategory}
                      onChange={(e) => {
                        setAiCategory(e.target.value);
                        setAiTrade(TRADE_LABELS[e.target.value] || e.target.value);
                      }}
                    >
                      {Object.entries(TRADE_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">How urgent is it?</span>
                    <select className={fieldClass} value={aiUrgency} onChange={(e) => setAiUrgency(e.target.value)}>
                      <option value="low">Low — can wait</option>
                      <option value="medium">Medium — soon</option>
                      <option value="high">High — prioritize</option>
                      <option value="emergency">Emergency — same day</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium">Which trade should handle it?</span>
                    <input
                      className={fieldClass}
                      value={aiTrade}
                      onChange={(e) => setAiTrade(e.target.value)}
                      placeholder="e.g. Licensed plumber"
                    />
                  </label>

                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="font-medium">Plain-English summary for the team</span>
                    <textarea
                      rows={3}
                      className={fieldClass}
                      value={aiSummary}
                      onChange={(e) => setAiSummary(e.target.value)}
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Can the homeowner safely DIY?</span>
                    <select
                      className={fieldClass}
                      value={aiSafeDiy ? "yes" : "no"}
                      onChange={(e) => setAiSafeDiy(e.target.value === "yes")}
                    >
                      <option value="no">No — send a pro</option>
                      <option value="yes">Yes — DIY is reasonable</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Is a professional required?</span>
                    <select
                      className={fieldClass}
                      value={aiProRequired ? "yes" : "no"}
                      onChange={(e) => setAiProRequired(e.target.value === "yes")}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">How sure is this assessment?</span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                        {aiConfidencePct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={aiConfidencePct}
                      onChange={(e) => setAiConfidencePct(Number(e.target.value))}
                      className="mt-2 w-full accent-[#FF4D1C]"
                    />
                    <span className="text-xs text-muted-foreground">
                      Lower confidence can hide the customer price until an on-site visit.
                    </span>
                  </label>

                  <NumField label="Labor hours (min)" value={aiHoursMin} onChange={setAiHoursMin} step="0.5" suffix="hrs" />
                  <NumField label="Labor hours (max)" value={aiHoursMax} onChange={setAiHoursMax} step="0.5" suffix="hrs" />
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <h2 className="font-medium">Customer price adjustment</h2>
                  <p className="text-xs text-muted-foreground">
                    Recalculate from the engine first, then optionally add markup in dollars or percent — or set an exact
                    range / hide the price.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["recalc", "Recalculate"],
                        ["markup_percent", "Markup %"],
                        ["markup_amount", "Markup $"],
                        ["set_range", "Exact range"],
                        ["hide", "Hide price"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPriceMode(mode)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          priceMode === mode
                            ? "bg-[#FF4D1C] text-white shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {priceMode === "markup_percent" && (
                    <NumField
                      label="Markup percent"
                      value={markupPercent}
                      onChange={setMarkupPercent}
                      suffix="%"
                      step="1"
                      hint="Example: 10 adds 10% on top of the calculated retail range."
                    />
                  )}
                  {priceMode === "markup_amount" && (
                    <NumField
                      label="Markup dollars"
                      value={markupAmount}
                      onChange={setMarkupAmount}
                      suffix="$"
                      hint="Added to both the low and high ends of the range."
                    />
                  )}
                  {priceMode === "set_range" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumField label="Customer low" value={manualLow} onChange={setManualLow} suffix="$" />
                      <NumField label="Customer high" value={manualHigh} onChange={setManualHigh} suffix="$" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  className={btnPrimary}
                  onClick={async () => {
                    if (!selectedJobId) return;
                    setBusy(true);
                    setMessage(null);
                    const body: Record<string, unknown> = {
                      category: aiCategory,
                      urgency: aiUrgency,
                      recommended_trade: aiTrade,
                      summary: aiSummary,
                      safe_diy_allowed: aiSafeDiy,
                      professional_required: aiProRequired,
                      confidence: aiConfidencePct,
                      estimated_labor_hours_min: aiHoursMin,
                      estimated_labor_hours_max: Math.max(aiHoursMin, aiHoursMax),
                      forceOnSite: priceMode === "hide",
                      hidePrice: priceMode === "hide",
                      allowBlocked: priceMode !== "hide" && priceMode !== "recalc",
                    };
                    if (priceMode === "markup_percent") {
                      body.priceAdjustment = { mode: "markup_percent", percent: markupPercent };
                    } else if (priceMode === "markup_amount") {
                      body.priceAdjustment = { mode: "markup_amount", amount: markupAmount };
                    } else if (priceMode === "set_range") {
                      body.priceAdjustment = { mode: "set_range", low: manualLow, high: manualHigh };
                    } else if (priceMode === "hide") {
                      body.priceAdjustment = { mode: "hide" };
                    }
                    const r = await adminAiOverride(selectedJobId, body);
                    if (r.ok) {
                      setMessage("AI review saved and customer retail updated.");
                      await refreshJobs();
                    } else {
                      setMessage(r.message || "Could not save AI review.");
                    }
                    setBusy(false);
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Save review & update customer price
                </button>
              </motion.div>
            )}
          </section>
        )}

        {tab === "platform" && (
          <section className="space-y-4">
            <SectionHeader
              title="Platform controls"
              subtitle="Integrations, overdue dispatch, and admin MFA. Neon + Express is the source of truth (RLS-equivalent auth in API handlers)."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className={`${cardClass} space-y-2 p-4`}>
                <h2 className="font-semibold">Integration status</h2>
                {platformInfo ? (
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {["stripe", "resend", "twilio", "places", "slackOrN8n", "sentry", "posthog", "storage", "authMode"].map(
                      (k) => (
                        <li key={k} className="flex justify-between gap-2">
                          <span className="capitalize">{k}</span>
                          <span className="font-mono text-foreground">{String(platformInfo[k])}</span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {platformInfo?.note ? <p className="pt-2 text-xs text-muted-foreground">{String(platformInfo.note)}</p> : null}
              </div>
              <div className={`${cardClass} space-y-3 p-4`}>
                <h2 className="font-semibold">Admin MFA</h2>
                <p className="text-sm text-muted-foreground">Email OTP verification for staff accounts.</p>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await startAdminMfa();
                    setMessage(r.ok ? `MFA code sent${r.demoCode ? ` · demo ${r.demoCode}` : ""}` : "MFA start failed.");
                    setBusy(false);
                  }}
                >
                  Send MFA code
                </button>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    placeholder="6-digit code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                  />
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy || !mfaCode}
                    onClick={async () => {
                      setBusy(true);
                      const r = await verifyAdminMfa(mfaCode);
                      setMessage(r.ok && r.verified ? "MFA verified." : "Invalid MFA code.");
                      setBusy(false);
                    }}
                  >
                    Verify
                  </button>
                </div>
              </div>
            </div>
            <div className={`${cardClass} p-4`}>
              <h2 className="mb-3 font-semibold">Overdue / missed response</h2>
              {overdueJobs.length === 0 ? (
                <EmptyState title="No overdue dispatch deadlines" hint="Use Auto-match coverage on a job to set response deadlines." />
              ) : (
                <div className="space-y-2">
                  {overdueJobs.map((j) => {
                    const row = j as { id?: number; title?: string; status?: string; invite_deadline_at?: string };
                    return (
                      <div key={String(row.id)} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                        <span>
                          #{row.id} {row.title}
                        </span>
                        <StatusBadge status={String(row.status || "overdue")} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "reporting" && (
          report ? (
            <section className="space-y-4">
              <SectionHeader
                title="Financial reporting"
                subtitle="Revenue, payouts, and status volume. Charts live on Overview."
                action={
                  <button type="button" className={btnSecondary} onClick={() => setTab("overview")}>
                    <LayoutDashboard className="h-4 w-4" />
                    Open overview
                  </button>
                }
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Revenue collected", value: report.revenueCollected },
                  { label: "Contractor paid out", value: report.contractorPaidOut },
                  { label: "Gross estimate", value: report.grossEstimate },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`${cardClass} p-5 transition hover:-translate-y-0.5`}
                  >
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(item.value)}</p>
                  </div>
                ))}
                <div className={`${cardClass} p-5 text-sm sm:col-span-3`}>
                  <p className="mb-3 font-medium">Jobs by status</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.jobsByStatus || {}).map(([k, v]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setJobSearch(k);
                          setTab("dispatch");
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 transition hover:bg-[#FF4D1C]/12 hover:text-[#FF4D1C]"
                      >
                        <StatusBadge status={k} />
                        <span className="tabular-nums font-semibold">{v}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Click a status to jump to Dispatch filtered by that label.</p>
                </div>
              </div>
            </section>
          ) : (
            <div className={`${cardClass} flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reporting…
            </div>
          )
        )}
        </TabFade>
        </main>
      </div>
    </div>
  );
}
