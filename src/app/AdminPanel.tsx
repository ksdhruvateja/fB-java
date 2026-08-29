import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, LogOut, Loader2, Shield, DollarSign, Users, Briefcase,
  Settings2, Link2, BarChart3, Sparkles, Menu, X, LayoutDashboard,
  Search, Check, Copy, MapPin, ChevronRight, Ban, BadgeCheck,
  Sun, Moon, ChevronDown, Bell, ListTodo, ScrollText, Mail, Receipt, Gift,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { loadAllUsers, type AuthUser } from "./auth";
import { brand } from "../config/brand";
import AppBackButton from "./AppBackButton";
import { type AdminNavFrame } from "./navigation";
import { sanitizeAdminTab } from "./adminNav";
import {
  contractorSearchBlob,
  fetchAdminUser,
} from "./ContractorAdminDetail";
import AdminOverview, { type DashboardReport } from "./AdminOverview";
import AdminAttentionOverview from "./AdminAttentionOverview";
import AdminWorkQueue from "./AdminWorkQueue";
import AdminJobDrawer from "./AdminJobDrawer";
import AdminCommandPalette, { type CommandAction } from "./AdminCommandPalette";
import AdminPricingPanel, { type PricingRules } from "./AdminPricingPanel";
import AdminContractorPayoutsPanel from "./AdminContractorPayoutsPanel";
import AdminPayoutSettingsPanel from "./AdminPayoutSettingsPanel";
import AdminOrderLedgerPanel from "./AdminOrderLedgerPanel";
import AdminAuditLogsPanel from "./AdminAuditLogsPanel";
import AdminFinancePanel from "./AdminFinancePanel";
import AdminSupportTicketsPanel from "./AdminSupportTicketsPanel";
import AdminSubscriptionPlansPanel from "./AdminSubscriptionPlansPanel";
import AdminHomeCareProPanel from "./AdminHomeCareProPanel";
import AdminVisitFeePanel from "./AdminVisitFeePanel";
import AdminReferralsPanel from "./AdminReferralsPanel";
import AdminHomeownerInvoicePanel from "./AdminHomeownerInvoicePanel";
import AdminHomeownerProfile from "./AdminHomeownerProfile";
import AdminHomeownerRecordFocus, {
  type HomeownerRecordFocus,
} from "./AdminHomeownerRecordFocus";
import AdminContractorEditPanel from "./AdminContractorEditPanel";
import Contractor360Profile from "./Contractor360Profile";
import {
  expiryBadgeClass,
  expiryLabel,
  formatExpiryDate,
  listAdminCredentialAlerts,
} from "./contractorExpiry";
import { listContractorMissingInfo } from "./contractorApplication";
import { ROLE_PRESETS, permissionsForAccessLevel } from "./adminPermissions";
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
  getSubscriptionStats,
  updateSubscriptionOverride,
  loadStaffAdmins,
  updateStaffAccess,
  createStaffAdmin,
  adminSendPasswordReset,
} from "./platformApi";
import {
  listAdminSubscriptionPlans,
  updateAdminSubscriptionPlan,
} from "./subscriptionPlansApi";
import {
  PAID_HOME_CARE_PLAN_CODE,
  displayPlanLabel,
  isPaidHomeCarePlan,
} from "./subscriptionCatalog";
import {
  STATUS_LABELS,
  adminAiOverride,
  adminApplyJobDiscount,
  adminAssign,
  adminCreatePartner,
  adminCreateDiscount,
  adminDiscounts,
  adminUpdateDiscount,
  adminHomeownerJobs,
  adminInvite,
  adminListJobs,
  adminPartnerReferrals,
  adminPartners,
  adminPayments,
  adminPayoutV2,
  adminPricingRules,
  adminReporting,
  adminSavePricingRules,
  adminSetCompliance,
  formatMoney,
  listBids,
  retailRangeLabel,
  requestAdminDispatch,
  type AdminDiscount,
  type Bid,
  type ManagedJob,
} from "./managedJobs";
import {
  computeAttention,
  jobBookingLabel,
  jobQueueHeadline,
  relativeTime,
  type AttentionKind,
  type QueueFilter,
} from "./adminOpsHelpers";

type Tab =
  | "overview"
  | "work-queue"
  | "dispatch"
  | "pricing"
  | "finance"
  | "payout-settings"
  | "contractors"
  | "partners"
  | "referrals"
  | "platform"
  | "subscriptions"
  | "access"
  | "audit-logs"
  | "support-tickets"
  | "pro-plans"
  | "homecare-pro"
  | "visit-fee";

const NAV_GROUPS: { label?: string; items: { id: Tab; label: string; icon: React.ElementType }[] }[] = [
  {
    items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Work",
    items: [
      { id: "work-queue", label: "Work Queue", icon: ListTodo },
      { id: "dispatch", label: "Dispatch", icon: Briefcase },
    ],
  },
  {
    label: "People",
    items: [
      { id: "subscriptions", label: "Homeowners", icon: Users },
      { id: "contractors", label: "Contractors", icon: Briefcase },
      { id: "partners", label: "Partners", icon: Link2 },
      { id: "referrals", label: "Referrals", icon: Gift },
    ],
  },
  {
    label: "Finance",
    items: [{ id: "finance", label: "Finance", icon: DollarSign }],
  },
  {
    label: "Support",
    items: [{ id: "support-tickets", label: "Tickets", icon: Mail }],
  },
  {
    label: "Administration",
    items: [
      { id: "pro-plans", label: "HomeCare Plans", icon: Sparkles },
      { id: "homecare-pro", label: "HomeCare Pro", icon: Shield },
      { id: "access", label: "Team & Roles", icon: Shield },
      { id: "audit-logs", label: "Audit Logs", icon: ScrollText },
      { id: "platform", label: "Settings", icon: Settings2 },
    ],
  },
];

const TRADE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  snow_removal: "Snow Removal",
  landscaping: "Landscaping",
  cleaning: "Cleaning",
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

const viewDocument = (name: string, dataUrl: string | undefined) => {
  if (!dataUrl) {
    alert("No document file was uploaded by this contractor yet.");
    return;
  }
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.title = name;
    if (dataUrl.startsWith("data:application/pdf")) {
      newWindow.document.body.style.margin = "0";
      newWindow.document.body.innerHTML = `<iframe width="100%" height="100%" src="${dataUrl}" style="border:none;"></iframe>`;
    } else {
      newWindow.document.body.style.margin = "0";
      newWindow.document.body.style.background = "#0f172a";
      newWindow.document.body.style.display = "flex";
      newWindow.document.body.style.justifyContent = "center";
      newWindow.document.body.style.alignItems = "center";
      newWindow.document.body.innerHTML = `<img src="${dataUrl}" style="max-width:100%; max-height:100%; object-fit:contain; box-shadow:0 8px 30px rgba(0,0,0,0.5);" />`;
    }
  }
};

export default function AdminPanel({
  onBack: _onBack,
  onSignOut,
  user,
  isDark,
  onToggleDark,
}: {
  onBack: () => void;
  onSignOut: () => void;
  user: AuthUser;
  isDark?: boolean;
  onToggleDark?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const isReadOnly = user?.adminAccessLevel === "read";
  const adminPermissions = useMemo(
    () => permissionsForAccessLevel(user?.adminAccessLevel, (user as { adminRolePreset?: string })?.adminRolePreset),
    [user?.adminAccessLevel, user]
  );
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [contractors, setContractors] = useState<AuthUser[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [queueSearch, setQueueSearch] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [bids, setBids] = useState<Bid[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRules | null>(null);
  const [subStats, setSubStats] = useState<{
    totalHomeowners: number;
    subscribedCount: number;
    nonSubscribedCount: number;
    customers: {
      id: number;
      name: string;
      email: string;
      phone?: string | null;
      planCode: string;
      accountStatus?: string;
      createdAt: string;
      isTrial?: boolean;
      trialDaysLeft?: number;
      currentPeriodEnd?: string | null;
    }[];
  } | null>(null);
  const [homeownerSearch, setHomeownerSearch] = useState("");
  const [selectedHomeownerProfileId, setSelectedHomeownerProfileId] = useState<number | null>(null);
  const [homeownerRecordFocus, setHomeownerRecordFocus] = useState<HomeownerRecordFocus | null>(null);
  const [selectedSupportTicket, setSelectedSupportTicket] = useState<string | null>(null);
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
  const [inviteRequestType, setInviteRequestType] = useState<"remote_quote" | "site_visit">("remote_quote");
  const [payoutAmount, setPayoutAmount] = useState<number | "">("");
  const [payoutBonus, setPayoutBonus] = useState<number | "">("");
  const [dispatchCouponCode, setDispatchCouponCode] = useState("");
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffAccess, setNewStaffAccess] = useState<"read" | "write" | "read-write">("read-write");
  const [staffCreateBusy, setStaffCreateBusy] = useState(false);
  const [invoiceModalHomeowner, setInvoiceModalHomeowner] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);
  const [invoiceModalJobs, setInvoiceModalJobs] = useState<ManagedJob[]>([]);
  const [invoiceModalJobId, setInvoiceModalJobId] = useState<number | "">("");
  const [invoiceModalLoading, setInvoiceModalLoading] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerCompany, setPartnerCompany] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [discounts, setDiscounts] = useState<AdminDiscount[]>([]);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [discountMaxUses, setDiscountMaxUses] = useState<number | "">("");
  // Subscription overrides
  const [overrideHomeownerId, setOverrideHomeownerId] = useState<number | null>(null);
  const [overrideHomeownerName, setOverrideHomeownerName] = useState("");
  const [staffNameInput, setStaffNameInput] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);

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
  const [expandedContractorId, setExpandedContractorId] = useState<number | null>(null);
  const [fetchingContractorId, setFetchingContractorId] = useState<number | null>(null);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [copiedPartnerId, setCopiedPartnerId] = useState<number | null>(null);
  const [complianceBusyId, setComplianceBusyId] = useState<number | null>(null);
  const [proPriceInput, setProPriceInput] = useState<string>("");
  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [busyStaffId, setBusyStaffId] = useState<number | null>(null);

  const applyNavFrame = useCallback((f: AdminNavFrame) => {
    setTab(sanitizeAdminTab(f.tab) as Tab);
    if (f.selectedJobId !== undefined) setSelectedJobId(f.selectedJobId);
    if (f.drawerOpen !== undefined) setDrawerOpen(f.drawerOpen);
    if (f.selectedHomeownerProfileId !== undefined) setSelectedHomeownerProfileId(f.selectedHomeownerProfileId);
    if (f.homeownerRecordFocus !== undefined) {
      setHomeownerRecordFocus((f.homeownerRecordFocus as HomeownerRecordFocus | null) ?? null);
    }
    if (f.expandedContractorId !== undefined) setExpandedContractorId(f.expandedContractorId);
    if (f.selectedSupportTicket !== undefined) setSelectedSupportTicket(f.selectedSupportTicket);
    if (f.mobileNav !== undefined) setMobileNav(f.mobileNav);
    if (f.cmdOpen !== undefined) setCmdOpen(f.cmdOpen);
    if (f.notifOpen !== undefined) setNotifOpen(f.notifOpen);
  }, []);

  const navFrame = useMemo(
    (): AdminNavFrame => ({
      role: "admin",
      tab,
      selectedJobId,
      drawerOpen,
      selectedHomeownerProfileId,
      homeownerRecordFocus,
      expandedContractorId,
      selectedSupportTicket,
      mobileNav,
      cmdOpen,
      notifOpen,
    }),
    [
      tab,
      selectedJobId,
      drawerOpen,
      selectedHomeownerProfileId,
      homeownerRecordFocus,
      expandedContractorId,
      selectedSupportTicket,
      mobileNav,
      cmdOpen,
      notifOpen,
    ]
  );

  const { goHome, goBack, canBack } = useDashboardNavigation("admin", "admin", navFrame, applyNavFrame);

  async function refreshStaff() {
    const r = await loadStaffAdmins();
    if (r.ok) setStaff(r.staff || []);
  }

  useEffect(() => {
    const rules = pricingRules as PricingRules | null;
    const price = rules?.homecare_subscription_price ?? rules?.pro_subscription_price;
    if (price !== undefined) {
      setProPriceInput(String(price));
    }
  }, [pricingRules]);

  async function handleOverrideSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) {
      alert("Read-Only Mode: You cannot modify subscriptions.");
      return;
    }
    if (!overrideHomeownerId || !staffNameInput.trim()) return;
    setOverrideBusy(true);
    try {
      const res = await updateSubscriptionOverride(overrideHomeownerId, staffNameInput.trim());
      if (res.ok) {
        setOverrideHomeownerId(null);
        setStaffNameInput("");
        setMessage("Subscription updated successfully.");
        // Refresh stats
        const r = await getSubscriptionStats(homeownerSearch);
        if (r.ok && r.stats) {
          setSubStats({
            ...r.stats,
            customers: r.customers || [],
          });
        }
      } else {
        alert(res.message || "Failed to update subscription.");
      }
    } catch {
      alert("Network error updating subscription.");
    } finally {
      setOverrideBusy(false);
    }
  }

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

  async function refreshContractors() {
    const users = await loadAllUsers();
    const list = users
      .filter((u) => u.role === "contractor" && u.id != null && !u.isBlocked)
      .map((u) => ({ ...u, id: Number(u.id) }));
    setContractors(list);
    return list;
  }

  useEffect(() => {
    void (async () => {
      const list = await refreshContractors();
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
    if (tab === "pricing" || tab === "subscriptions" || tab === "partners" || tab === "visit-fee") {
      void adminPricingRules().then((r) => {
        if (r.ok) setPricingRules(r.rules as PricingRules);
      });
    }
    if (tab === "subscriptions") {
      void getSubscriptionStats(homeownerSearch).then((r) => {
        if (r.ok && r.stats) {
          setSubStats({
            ...r.stats,
            customers: r.customers || [],
          });
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
    if (tab === "overview") {
      void adminReporting().then((r) => {
        if (r.ok) setReport(r);
      });
    }
    if (tab === "dispatch" || tab === "overview" || tab === "work-queue") {
      void refreshJobs();
    }
    if (tab === "platform") {
      void Promise.all([platformStatus(), listOverdueOps()]).then(([s, o]) => {
        if (s.ok) setPlatformInfo(s as Record<string, unknown>);
        if (o.ok) setOverdueJobs(o.overdue || []);
      });
    }
    if (tab === "access") {
      void refreshStaff();
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== "subscriptions") return;
    const handle = window.setTimeout(() => {
      void getSubscriptionStats(homeownerSearch).then((r) => {
        if (r.ok && r.stats) {
          setSubStats({
            ...r.stats,
            customers: r.customers || [],
          });
        }
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [homeownerSearch, tab]);

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
        ["paid_for_dispatch", "awaiting_contractor", "contractor_invited", "awaiting_bid", "bid_received", "approved"].includes(
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
    return contractors.filter((c) => contractorSearchBlob(c).includes(q));
  }, [contractors, contractorSearch]);

  async function openContractorDetail(c: AuthUser) {
    const id = Number(c.id);
    if (!id) return;
    if (expandedContractorId === id) {
      setExpandedContractorId(null);
      return;
    }
    setExpandedContractorId(id);
    setFetchingContractorId(id);
    const fresh = await fetchAdminUser(id);
    if (fresh) {
      setContractors((prev) => prev.map((row) => (Number(row.id) === id ? { ...row, ...fresh } : row)));
    }
    setFetchingContractorId(null);
  }

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
    <nav className="flex flex-col gap-4 p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label || "top"}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {group.items
              .filter((item) => item.id !== "access" || user?.email?.includes("admin"))
              .map((item) => (
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
                  {item.id === "work-queue" && dispatchQueueCount > 0 && tab !== item.id && (
                    <span className="ml-auto rounded-full bg-[#FF4D1C]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#FF4D1C]">
                      {dispatchQueueCount}
                    </span>
                  )}
                  {tab === item.id && item.id !== "work-queue" && (
                    <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-80" />
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const openJobDrawer = (jobId: number) => {
    setSelectedJobId(jobId);
    setDrawerOpen(true);
  };

  const openAttention = (kind: AttentionKind) => {
    setQueueFilter(kind);
    setTab("work-queue");
    setDrawerOpen(false);
  };

  const attention = useMemo(() => computeAttention(jobs), [jobs]);
  const credentialAlerts = useMemo(() => listAdminCredentialAlerts(contractors), [contractors]);
  const criticalCredentialAlerts = useMemo(
    () =>
      credentialAlerts.filter(
        (a) => a.worst === "expired" || a.worst === "missing" || a.worst === "critical"
      ),
    [credentialAlerts]
  );

  const notifications = useMemo(() => {
    const items: {
      id: string;
      title: string;
      body: string;
      jobId?: number;
      contractorId?: number;
      when?: string;
      tone?: "danger" | "warn" | "default";
    }[] = [];

    for (const j of attention.quotes_ready.slice(0, 4)) {
      items.push({
        id: `qr-${j.id}`,
        title: "Quote ready to build",
        body: `${jobBookingLabel(j)} · ${j.title || j.category || "Job"}`,
        jobId: j.id,
        when: relativeTime(j.updatedAt || j.createdAt),
      });
    }
    for (const j of attention.emergency.slice(0, 3)) {
      items.push({
        id: `em-${j.id}`,
        title: "Emergency request",
        body: `${jobBookingLabel(j)} · ${j.cityStateZip || ""}`,
        jobId: j.id,
        when: relativeTime(j.updatedAt || j.createdAt),
        tone: "danger",
      });
    }
    for (const j of attention.accepted.slice(0, 3)) {
      items.push({
        id: `ac-${j.id}`,
        title: "Homeowner accepted",
        body: `${jobBookingLabel(j)} · ready to dispatch`,
        jobId: j.id,
        when: relativeTime(j.updatedAt || j.createdAt),
      });
    }
    for (const j of attention.payouts.slice(0, 3)) {
      items.push({
        id: `po-${j.id}`,
        title: "Payout ready",
        body: `${jobBookingLabel(j)} · contractor payable`,
        jobId: j.id,
        when: relativeTime(j.updatedAt || j.createdAt),
      });
    }
    return items.slice(0, 12);
  }, [attention]);

  const openContractorCredential = (contractorId: number) => {
    setTab("contractors");
    const c = contractors.find((x) => Number(x.id) === contractorId);
    if (c) void openContractorDetail(c);
    else setExpandedContractorId(contractorId);
  };
  const commandActions: CommandAction[] = useMemo(
    () => [
      { id: "wq", label: "Open Work Queue", group: "Navigate", run: () => setTab("work-queue") },
      { id: "ov", label: "Open Overview", group: "Navigate", run: () => setTab("overview") },
      { id: "dispatch", label: "Open Dispatch", group: "Navigate", run: () => setTab("dispatch") },
      { id: "quotes", label: "Open Quotes (Work Queue)", group: "Navigate", run: () => {
        setTab("work-queue");
        setMessage("Open a job from Work Queue → Quotes to edit the professional quotation.");
      } },
      { id: "payouts", label: "Open Finance — Payouts", group: "Navigate", run: () => setTab("finance") },
      { id: "payments", label: "Open Finance", group: "Navigate", run: () => setTab("finance") },
      { id: "pricing", label: "Pricing Controls", group: "Navigate", run: () => setTab("pricing") },
      { id: "contractors", label: "Find Contractors", group: "Navigate", run: () => setTab("contractors") },
      {
        id: "creds",
        label: "Credential expirations",
        group: "Attention",
        hint: `${criticalCredentialAlerts.length || credentialAlerts.length} alerts`,
        run: () => setTab("contractors"),
      },
      {
        id: "ready",
        label: "Quotes ready to send",
        group: "Attention",
        hint: `${attention.quotes_ready.length} waiting`,
        run: () => openAttention("quotes_ready"),
      },
      {
        id: "emerg",
        label: "Emergency requests",
        group: "Attention",
        hint: `${attention.emergency.length} open`,
        run: () => openAttention("emergency"),
      },
      {
        id: "accept",
        label: "Accepted · ready to dispatch",
        group: "Attention",
        run: () => openAttention("accepted"),
      },
    ],
    [attention, credentialAlerts, criticalCredentialAlerts],
  );

  const globalSearchHits = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (q.length < 2) return [] as ManagedJob[];
    return jobs
      .filter((j) =>
        `${j.bookingId} ${j.id} ${j.title} ${j.contactName} ${j.contactPhone} ${j.cityStateZip} ${j.fullAddress} ${j.category}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [jobs, globalSearch]);

  async function handleInviteAndAssign() {
    if (!selectedJob || !inviteContractorId) return;
    setBusy(true);
    setMessage(null);
    try {
      const invite = await adminInvite(selectedJob.id, Number(inviteContractorId), {
        requestType: inviteRequestType,
      });
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
      const name = contractors.find((c) => Number(c.id) === Number(inviteContractorId))?.name || "Contractor";
      setMessage(
        `${name} invited (${inviteRequestType === "site_visit" ? "site visit" : "remote quote"}) and assigned.`,
      );
      await refreshJobs();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invite & assign failed.");
    } finally {
      setBusy(false);
    }
  }

  const handleBack = () => {
    if (mobileNav) {
      setMobileNav(false);
      return;
    }
    goBack();
  };

  const handleSignOutClick = () => {
    setMobileNav(false);
    onSignOut();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          {(canBack || mobileNav) && (
            <AppBackButton onBack={handleBack} className="-ml-1 shrink-0 p-2" />
          )}
          <button type="button" onClick={goHome} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md" aria-label="Go to dashboard">
            <p className="flex items-center gap-1.5 font-[family-name:var(--font-display)] text-lg tracking-wide text-[#FF4D1C]">
              <Shield className="h-4 w-4" /> {brand.productName} Control
            </p>
            <p className="text-xs text-muted-foreground">Admin · Managed network pilot</p>
          </button>
        </div>
        <div className="flex items-center gap-1">
          {onToggleDark && (
            <button type="button" onClick={onToggleDark} className="rounded-md p-2 hover:bg-muted" aria-label="Toggle theme">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
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
              <button type="button" onClick={goHome} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md" aria-label="Go to dashboard">
                <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
                  <Shield className="h-5 w-5" /> {brand.productName} Control
                </p>
              </button>
              <p className="text-xs text-muted-foreground">Admin · Managed network pilot</p>
            </div>
            {sidebarNav}
            <div className="mt-auto space-y-1 border-t border-border p-3">
              {onToggleDark && (
                <button type="button" onClick={onToggleDark} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {isDark ? "Light mode" : "Dark mode"}
                </button>
              )}
              {canBack && (
                <button type="button" onClick={handleBack} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button type="button" onClick={handleSignOutClick} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
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
            <button type="button" onClick={goHome} className="text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md" aria-label="Go to dashboard">
              <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl tracking-wide text-[#FF4D1C]">
                <Shield className="h-5 w-5" /> {brand.productName} Control
              </p>
            </button>
            <p className="mt-1 text-xs text-muted-foreground">Admin · Managed network pilot</p>
          </div>
          <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
          <div className="space-y-1 border-t border-border p-3">
            {onToggleDark && (
              <button type="button" onClick={onToggleDark} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-muted hover:translate-x-0.5">
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDark ? "Light mode" : "Dark mode"}
              </button>
            )}
            {canBack && (
              <button type="button" onClick={handleBack} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-muted hover:translate-x-0.5">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button type="button" onClick={handleSignOutClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-muted hover:translate-x-0.5">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 bg-muted px-4 py-6 lg:px-8">
          {/* Desktop ops top bar */}
          <div className="hidden items-center gap-3 lg:flex">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#FF4D1C]/50 focus:ring-2 focus:ring-[#FF4D1C]/15"
                placeholder="Search FixBridge… jobs, homeowners, ZIP, booking ID"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && globalSearchHits[0]) {
                    openJobDrawer(globalSearchHits[0].id);
                    setGlobalSearch("");
                  }
                }}
              />
              {globalSearchHits.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {globalSearchHits.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        openJobDrawer(j.id);
                        setGlobalSearch("");
                        setTab("work-queue");
                      }}
                    >
                      <span className="font-mono text-xs text-[#FF4D1C]">{jobBookingLabel(j)}</span>
                      <span className="font-medium">{j.title || j.category}</span>
                      <span className="text-xs text-muted-foreground">{jobQueueHeadline(j)}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">K</kbd>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative rounded-xl border border-border bg-card p-2.5 hover:bg-muted"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF4D1C] px-1 text-[10px] font-bold text-white">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <p className="text-sm font-semibold">Notifications</p>
                    <button type="button" className="text-xs text-muted-foreground" onClick={() => setNotifOpen(false)}>
                      Close
                    </button>
                  </div>
                  <ul className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <li className="px-3 py-8 text-center text-sm text-muted-foreground">You're caught up</li>
                    ) : (
                      notifications.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted"
                            onClick={() => {
                              if (n.contractorId) {
                                setTab("contractors");
                                const c = contractors.find((x) => Number(x.id) === n.contractorId);
                                if (c) void openContractorDetail(c);
                                else setExpandedContractorId(n.contractorId);
                              } else if (n.jobId) {
                                setTab("work-queue");
                                openJobDrawer(n.jobId);
                              }
                              setNotifOpen(false);
                            }}
                          >
                            <span
                              className={`text-sm font-medium ${
                                n.tone === "danger"
                                  ? "text-red-700 dark:text-red-300"
                                  : n.tone === "warn"
                                    ? "text-amber-800 dark:text-amber-300"
                                    : ""
                              }`}
                            >
                              {n.title}
                            </span>
                            <span className="text-xs text-muted-foreground">{n.body}</span>
                            {n.when && <span className="text-[10px] text-muted-foreground">{n.when}</span>}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {isReadOnly && (
            <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-300 shadow-sm">
              <Shield className="h-4 w-4 text-red-500 shrink-0" />
              <span>
                <strong>Read-Only Mode:</strong> Your account is configured with view-only permissions. Mutation actions, overrides, and configurations are disabled.
              </span>
            </div>
          )}
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
          jobs.length === 0 && !report ? (
            <div className={`${cardClass} flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading operations…
            </div>
          ) : (
            <>
              <AdminAttentionOverview
                jobs={jobs}
                reportPayments={report?.revenueCollected}
                onOpenAttention={openAttention}
                onOpenWorkQueue={() => setTab("work-queue")}
              />
              {report && (
                <div className="mt-8">
                  <details className="group rounded-2xl border border-border/70 bg-card shadow-sm">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show analytics charts</span>
                      <span className="hidden group-open:inline">Hide analytics charts</span>
                    </summary>
                    <div className="border-t border-border px-2 pb-4 pt-2">
                      <AdminOverview report={report} onOpenDispatch={() => setTab("work-queue")} />
                    </div>
                  </details>
                </div>
              )}
            </>
          )
        )}

        {tab === "work-queue" && (
          <AdminWorkQueue
            jobs={jobs}
            filter={queueFilter}
            search={queueSearch}
            selectedJobId={selectedJobId}
            onFilterChange={setQueueFilter}
            onSearchChange={setQueueSearch}
            onSelectJob={openJobDrawer}
          />
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
                      <p className="mt-1 text-xs text-muted-foreground">{job.bookingId}
                      {job.workQueueStatus === "PAID_NEEDS_REVIEW" || job.status === "paid_for_dispatch" || job.status === "awaiting_contractor" ? (
                        <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          PAID — NEEDS REVIEW
                        </span>
                      ) : null}</p>
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
                    {(selectedJob.fullAddress || selectedJob.cityStateZip) && (
                      <p className="mt-2 flex items-start gap-1.5 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D1C]" />
                        {selectedJob.fullAddress || selectedJob.cityStateZip}
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
                  {/* Completion proof report */}
                  {selectedJob.completionReport && (
                    <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                      <p className="text-sm font-semibold text-teal-800">Completion proof</p>
                      {(selectedJob.completionReport as Record<string, unknown>).summary && (
                        <p className="text-sm text-muted-foreground">
                          {String((selectedJob.completionReport as Record<string, unknown>).summary)}
                        </p>
                      )}
                      {(selectedJob.completionReport as Record<string, unknown>).warranty && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Warranty: </span>
                          {String((selectedJob.completionReport as Record<string, unknown>).warranty)}
                        </p>
                      )}
                      {(selectedJob.completionReport as Record<string, unknown>).completedAt && (
                        <p className="text-xs text-muted-foreground">
                          Completed {new Date(String((selectedJob.completionReport as Record<string, unknown>).completedAt)).toLocaleString()}
                        </p>
                      )}
                      {((selectedJob.completionReport as Record<string, unknown>).beforePhotoUrl ||
                        (selectedJob.completionReport as Record<string, unknown>).afterPhotoUrl) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(selectedJob.completionReport as Record<string, unknown>).beforePhotoUrl && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Before</p>
                              <img
                                src={String((selectedJob.completionReport as Record<string, unknown>).beforePhotoUrl)}
                                alt="Before"
                                className="h-40 w-full rounded-xl object-cover border border-border"
                              />
                            </div>
                          )}
                          {(selectedJob.completionReport as Record<string, unknown>).afterPhotoUrl && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">After</p>
                              <img
                                src={String((selectedJob.completionReport as Record<string, unknown>).afterPhotoUrl)}
                                alt="After"
                                className="h-40 w-full rounded-xl object-cover border border-border"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-sm font-medium">Get estimate</p>
                    <p className="text-xs text-muted-foreground">How should contractors evaluate this request?</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setInviteRequestType("remote_quote")}
                        className={`rounded-xl border p-3 text-left text-sm transition ${
                          inviteRequestType === "remote_quote"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <p className="font-semibold">Remote quote</p>
                        <p className="mt-1 text-xs text-muted-foreground">Send photos, videos, and job details for an off-site estimate.</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviteRequestType("site_visit")}
                        className={`rounded-xl border p-3 text-left text-sm transition ${
                          inviteRequestType === "site_visit"
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <p className="font-semibold">Site visit</p>
                        <p className="mt-1 text-xs text-muted-foreground">Schedule an on-site inspection before quoting.</p>
                      </button>
                    </div>
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
                      <p className="text-sm font-medium">Coupon / discount</p>
                      {selectedJob.discountCode ? (
                        <p className="text-sm text-teal-700 dark:text-teal-400">
                          Active: <span className="font-semibold">{selectedJob.discountCode}</span>
                          {selectedJob.discountLabel ? ` · ${selectedJob.discountLabel}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No coupon on this job yet.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          className={`${fieldClass} max-w-xs uppercase`}
                          placeholder="PROMO2026"
                          value={dispatchCouponCode}
                          onChange={(e) => setDispatchCouponCode(e.target.value.toUpperCase())}
                          disabled={isReadOnly}
                        />
                        <button
                          type="button"
                          disabled={busy || isReadOnly || !dispatchCouponCode.trim()}
                          className={btnSecondary}
                          onClick={async () => {
                            if (!dispatchCouponCode.trim()) return;
                            setBusy(true);
                            setMessage(null);
                            try {
                              const r = await adminApplyJobDiscount(selectedJob.id, dispatchCouponCode.trim());
                              if (!r.ok) {
                                setMessage(r.message || "Could not apply coupon.");
                              } else {
                                setMessage(`Coupon ${dispatchCouponCode.trim()} applied to job.`);
                                setDispatchCouponCode("");
                                await refreshJobs();
                              }
                            } catch (err) {
                              setMessage(err instanceof Error ? err.message : "Could not apply coupon.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Apply coupon
                        </button>
                      </div>
                    </div>
                    {selectedJob.preferredContractorUserId ? (
                      <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                        <span className="font-semibold">Preferred by homeowner</span>
                        {contractors.find((c) => Number(c.id) === Number(selectedJob.preferredContractorUserId))
                          ? ` · ${contractors.find((c) => Number(c.id) === Number(selectedJob.preferredContractorUserId))?.name}`
                          : ` · contractor #${selectedJob.preferredContractorUserId}`}
                        . We&apos;ll prioritize them when available — assignment is not guaranteed.
                      </p>
                    ) : null}
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
                        {contractors
                          .slice()
                          .sort((a, b) => {
                            const pref = Number(selectedJob.preferredContractorUserId || 0);
                            if (Number(a.id) === pref) return -1;
                            if (Number(b.id) === pref) return 1;
                            return (a.name || "").localeCompare(b.name || "");
                          })
                          .map((c) => {
                          const compliance = String(c.complianceStatus || "approved").toLowerCase();
                          const blocked = ["draft", "under_review", "suspended", "rejected", "blocked"].includes(
                            compliance
                          );
                          const isPreferred = Number(c.id) === Number(selectedJob.preferredContractorUserId);
                          return (
                            <option key={String(c.id)} value={Number(c.id)} disabled={blocked}>
                              {isPreferred ? "★ Preferred · " : ""}
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
                            const invite = await adminInvite(selectedJob.id, Number(inviteContractorId), {
                              requestType: inviteRequestType,
                            });
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
                            setMessage(`${name} invited (${inviteRequestType === "site_visit" ? "site visit" : "remote quote"}) and assigned.`);
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
                        disabled={busy || selectedJob.status !== "approved" || !selectedJob.assignedContractorUserId}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const r = await requestAdminDispatch(selectedJob.id);
                            setMessage(r.ok ? "Dispatch requested — contractor notified." : r.message || "Dispatch failed.");
                            if (r.ok) await refreshJobs();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Request contractor dispatch
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
                        <span className="text-xs font-medium text-muted-foreground">Payout amount ($)</span>
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
                          disabled={isReadOnly}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="text-xs font-medium text-muted-foreground">Bonus / adj. (¢)</span>
                        <input
                          type="number"
                          step={100}
                          className={`${fieldClass} w-32`}
                          placeholder="0"
                          value={payoutBonus}
                          onChange={(e) => setPayoutBonus(e.target.value ? Number(e.target.value) : "")}
                          disabled={isReadOnly}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          isReadOnly ||
                          !selectedJob.assignedContractorUserId ||
                          ["paid_out", "closed", "canceled", "refunded"].includes(String(selectedJob.status))
                        }
                        className={btnSecondary}
                        title={
                          selectedJob.assignedContractorUserId
                            ? "Create payout record and wire transfer"
                            : "Assign a contractor first"
                        }
                        onClick={async () => {
                          setBusy(true);
                          setMessage(null);
                          try {
                            const r = await adminPayoutV2(
                              selectedJob.id,
                              payoutAmount === "" ? undefined : Number(payoutAmount),
                              payoutBonus === "" ? undefined : { adjustmentsCents: Number(payoutBonus) }
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
                              setPayoutBonus("");
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
                    <div className="border-t border-border pt-4">
                      <p className="mb-3 text-sm font-medium">Homeowner invoice</p>
                      <AdminHomeownerInvoicePanel
                        jobId={selectedJob.id}
                        readOnly={isReadOnly}
                        compact
                        onMessage={setMessage}
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <EmptyState title="Select a job" hint="Pick something from the queue to manage dispatch." />
              )}
            </div>
          </section>
        )}

        {tab === "visit-fee" && (
          <AdminVisitFeePanel
            pricingRules={pricingRules}
            busy={busy}
            readOnly={isReadOnly}
            onSave={async (patch) => {
              if (isReadOnly) {
                alert("Read-Only Mode: Write access is required.");
                return false;
              }
              if (!pricingRules) return false;
              setBusy(true);
              const nextRules = { ...pricingRules, ...patch };
              const r = await adminSavePricingRules(nextRules as unknown as Record<string, unknown>);
              setBusy(false);
              if (r.ok) {
                setPricingRules(r.rules as PricingRules);
                setMessage("Visit fee updated.");
                return true;
              }
              setMessage("Could not save visit fee.");
              return false;
            }}
          />
        )}

        {tab === "pricing" && (
          <AdminPricingPanel
            pricingRules={pricingRules}
            setPricingRules={setPricingRules}
            busy={busy}
            disabled={isReadOnly}
            onSave={async () => {
              if (isReadOnly) {
                alert("Read-Only Mode: Write access is required.");
                return null;
              }
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

        {tab === "finance" && <AdminFinancePanel onMessage={setMessage} />}

        {false && tab === "payments_legacy" && (
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
                      {p.stripe_payment_intent && !p.simulated && (
                        <div className="mt-2 text-xs">
                          <a
                            href={`https://dashboard.stripe.com/payments/${p.stripe_payment_intent}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#FF4D1C] hover:underline"
                          >
                            View in Stripe Dashboard →
                          </a>
                        </div>
                      )}
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
                      {t.stripe_transfer_id && !t.simulated && (
                        <div className="mt-2 text-xs">
                          <a
                            href={`https://dashboard.stripe.com/transfers/${t.stripe_transfer_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#FF4D1C] hover:underline"
                          >
                            View in Stripe Dashboard →
                          </a>
                        </div>
                      )}
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

        {false && tab === "contractor-payouts_legacy" && <AdminContractorPayoutsPanel />}

        {tab === "payout-settings" && <AdminPayoutSettingsPanel />}

        {tab === "contractors" && (
          <section className="space-y-4">
            {criticalCredentialAlerts.length > 0 && (
              <div className="sticky top-0 z-30 space-y-2 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm dark:border-red-900/50 dark:bg-red-950/30">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-red-900 dark:text-red-100">
                      Critical credential alert
                      {criticalCredentialAlerts.length === 1 ? "" : "s"} · {criticalCredentialAlerts.length}
                    </p>
                    <p className="mt-0.5 text-xs text-red-800/80 dark:text-red-200/80">
                      Expired, missing, or due within 14 days. Click a contractor to open their profile.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-red-200/70 overflow-hidden rounded-xl border border-red-200/80 bg-white/70 dark:divide-red-900/40 dark:border-red-900/40 dark:bg-background/40">
                  {criticalCredentialAlerts.map((alert) => (
                    <li key={alert.contractorId}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-red-100/60 dark:hover:bg-red-950/40"
                        onClick={() => openContractorCredential(alert.contractorId)}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">{alert.contractorName}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {alert.items.map((i) => i.message).join(" · ")}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(alert.worst)}`}
                        >
                          {expiryLabel(alert.worst)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <SectionHeader
              title="Contractors"
              subtitle="360° contractor profiles — verification, Stripe Connect status, jobs, performance, and financials. Banking details stay with Stripe."
              action={
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
                  <span className="tabular-nums font-semibold">{contractors.length}</span>
                  <span className="text-muted-foreground"> on network</span>
                </div>
              }
            />
            <SearchField
              value={contractorSearch}
              onChange={setContractorSearch}
              placeholder="Search name, email, company, EIN, trade, ZIP, phone…"
            />
            {filteredContractors.length === 0 ? (
              <EmptyState title="No contractors match" hint="Try a different search." />
            ) : (
              <div className="grid gap-3">
                {filteredContractors.map((c, i) => {
                  const id = Number(c.id);
                  const expanded = expandedContractorId === id;
                  const app = c.contractorApplication as Record<string, unknown> | null | undefined;
                  const company =
                    (typeof app?.legalBusinessName === "string" && app.legalBusinessName) ||
                    c.companyName ||
                    "";
                  const credAlert = credentialAlerts.find((a) => a.contractorId === id);
                  const missingInfo = listContractorMissingInfo(c);
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.24) }}
                      className={`${cardClass} p-4 ${
                        credAlert && (credAlert.worst === "expired" || credAlert.worst === "missing")
                          ? "border-red-300/80 ring-1 ring-red-200/60 dark:border-red-800/60"
                          : credAlert
                            ? "border-amber-300/70 ring-1 ring-amber-200/50 dark:border-amber-800/50"
                            : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF4D1C]/12 text-sm font-semibold text-[#FF4D1C]">
                            {(c.name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{c.name}</p>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  c.complianceStatus === "approved"
                                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                    : c.complianceStatus === "suspended"
                                      ? "bg-red-500/10 text-red-700 dark:text-red-400"
                                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {c.complianceStatus === "approved"
                                  ? "Approved"
                                  : c.complianceStatus === "suspended"
                                    ? "Suspended"
                                    : "Pending Review"}
                              </span>
                              {credAlert && (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(credAlert.worst)}`}
                                >
                                  {expiryLabel(credAlert.worst)}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">
                              {c.email}
                              {company ? ` · ${company}` : ""}
                              {c.trade ? ` · ${c.trade}` : ""}
                            </p>
                            {(c.licenseNumber || c.licenseExpiresAt || c.insuranceExpiresAt) && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {c.licenseNumber ? (
                                  <>
                                    License <span className="font-mono">{c.licenseNumber}</span>
                                    {c.licenseExpiresAt ? ` · exp ${formatExpiryDate(c.licenseExpiresAt)}` : ""}
                                  </>
                                ) : null}
                                {c.insuranceExpiresAt
                                  ? `${c.licenseNumber ? " · " : ""}Insurance exp ${formatExpiryDate(c.insuranceExpiresAt)}`
                                  : ""}
                              </p>
                            )}
                            {credAlert && (
                              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                                {credAlert.items.map((item) => item.message).join(" · ")}
                              </p>
                            )}
                            {!credAlert && missingInfo.length > 0 && (
                              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                                {missingInfo.length} missing item{missingInfo.length === 1 ? "" : "s"} — expand to request or edit
                              </p>
                            )}
                            {c.serviceZips && Array.isArray(c.serviceZips) && c.serviceZips.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Coverage:{" "}
                                <span className="font-semibold text-foreground/80">{c.serviceZips.join(", ")}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={btnSecondary} onClick={() => openContractorDetail(c)}>
                            {fetchingContractorId === id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {expanded ? "Hide application" : "View full application"}
                          </button>
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={isReadOnly || !c.id}
                            onClick={async () => {
                              if (!c.id) return;
                              setComplianceBusyId(Number(c.id));
                              try {
                                const r = await adminSendPasswordReset(Number(c.id));
                                if (r.ok) {
                                  setMessage(`Password reset email sent to ${c.email || c.name}.`);
                                } else {
                                  alert(r.message || "Could not send password reset.");
                                }
                              } catch (err: any) {
                                alert(err.message || "Could not send password reset.");
                              } finally {
                                setComplianceBusyId(null);
                              }
                            }}
                          >
                            <Mail className="h-4 w-4" />
                            Send Password Reset Email
                          </button>
                          {missingInfo.length > 0 && (
                            <button
                              type="button"
                              className={btnSecondary}
                              disabled={isReadOnly}
                              onClick={() => {
                                if (!expanded) void openContractorDetail(c);
                              }}
                            >
                              <Mail className="h-4 w-4" />
                              Request / edit info
                            </button>
                          )}
                          {c.complianceStatus !== "approved" && (
                            <button
                              type="button"
                              disabled={complianceBusyId === Number(c.id)}
                              className={btnPrimary}
                              onClick={async () => {
                                if (!c.id) return;
                                setComplianceBusyId(Number(c.id));
                                await adminSetCompliance(Number(c.id), "approved");
                                setMessage(`${c.name} approved.`);
                                await refreshContractors();
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
                          )}
                          {c.complianceStatus !== "suspended" && (
                            <button
                              type="button"
                              disabled={complianceBusyId === Number(c.id)}
                              className={btnSecondary}
                              onClick={async () => {
                                if (!c.id) return;
                                setComplianceBusyId(Number(c.id));
                                await adminSetCompliance(Number(c.id), "suspended");
                                setMessage(`${c.name} suspended.`);
                                await refreshContractors();
                                setComplianceBusyId(null);
                              }}
                            >
                              <Ban className="h-4 w-4" />
                              Suspend
                            </button>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div className="mt-4 space-y-4 border-t border-border pt-4">
                          <AdminContractorEditPanel
                            contractor={c}
                            readOnly={isReadOnly}
                            onMessage={setMessage}
                            onUpdated={async () => {
                              await refreshContractors();
                              if (c.id) {
                                const fresh = await fetchAdminUser(c.id);
                                if (fresh) {
                                  setContractors((prev) =>
                                    prev.map((x) => (Number(x.id) === Number(c.id) ? { ...x, ...fresh } : x))
                                  );
                                }
                              }
                            }}
                          />
                          <Contractor360Profile
                            contractor={c}
                            jobs={jobs}
                            busy={complianceBusyId === id}
                            onViewDocument={viewDocument}
                            onOpenJob={(jobId) => {
                              setTab("work-queue");
                              openJobDrawer(jobId);
                            }}
                            onApprove={async () => {
                              if (!c.id) return;
                              setComplianceBusyId(Number(c.id));
                              await adminSetCompliance(Number(c.id), "approved");
                              setMessage(`${c.name} approved.`);
                              await refreshContractors();
                              setComplianceBusyId(null);
                            }}
                            onSuspend={async () => {
                              if (!c.id) return;
                              setComplianceBusyId(Number(c.id));
                              await adminSetCompliance(Number(c.id), "suspended");
                              setMessage(`${c.name} suspended.`);
                              await refreshContractors();
                              setComplianceBusyId(null);
                            }}
                          />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "referrals" && <AdminReferralsPanel />}

        {tab === "partners" && (
          <section className="space-y-5">
            <SectionHeader
              title="Referral & discount codes"
              subtitle="Create partner referral codes and promo discount codes. Customers enter them on Report an Issue — both apply automatically."
            />

            {/* Global Referral Reward Configuration */}
            {pricingRules && (
              <div className={`${cardClass} p-5 space-y-4`}>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-foreground">🎁 Referral Reward Settings</h3>
                <p className="text-xs text-muted-foreground">
                  Configure the global reward coupon value awarded to homeowners who refer new clients when their referral makes a dispatch booking.
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-muted-foreground">Reward Value ($)</span>
                    <input
                      type="number"
                      disabled={busy || isReadOnly}
                      className={fieldClass}
                      placeholder="25"
                      value={pricingRules.referral_coupon_value ?? 25}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : 25;
                        setPricingRules({
                          ...pricingRules,
                          referral_coupon_value: val,
                        });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || isReadOnly}
                    onClick={async () => {
                      setBusy(true);
                      const r = await adminSavePricingRules({
                        ...pricingRules,
                        referral_coupon_value: pricingRules.referral_coupon_value ?? 25,
                      } as unknown as Record<string, unknown>);
                      setBusy(false);
                      if (r.ok) {
                        setPricingRules(r.rules as PricingRules);
                        setMessage("Referral reward settings saved successfully!");
                      } else {
                        setMessage("Failed to save referral reward settings.");
                      }
                    }}
                    className={btnPrimary}
                  >
                    {busy ? "Saving..." : "Save Reward Value"}
                  </button>
                </div>
              </div>
            )}

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

        {false && tab === "ai_legacy" && (
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
                    Recalculate from the engine first (includes your saved overall markup from Pricing Rules), then
                    optionally add a one-off markup for this job only — or set an exact range / hide the price.
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
                      hint="Example: 10 adds 10% to the overall estimate range."
                    />
                  )}
                  {priceMode === "markup_amount" && (
                    <NumField
                      label="Markup dollars"
                      value={markupAmount}
                      onChange={setMarkupAmount}
                      suffix="$"
                      hint="Shifts the entire customer range up by this amount."
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
                    {["stripe", "gmail", "places", "slackOrN8n", "sentry", "posthog", "storage", "authMode"].map(
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

        {false && tab === "reporting_legacy" && (
          report ? (
            <section className="space-y-6">
              <SectionHeader
                title="Financial reporting"
                subtitle="Revenue, payouts, and status volume. Full order ledger below."
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
                </div>
              </div>
              <AdminOrderLedgerPanel onMessage={setMessage} />
            </section>
          ) : (
            <div className={`${cardClass} flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reporting…
            </div>
          )
        )}

        {tab === "subscriptions" && (
          <section className="space-y-6">
            {selectedHomeownerProfileId != null ? (
              homeownerRecordFocus ? (
                <AdminHomeownerRecordFocus
                  homeownerUserId={selectedHomeownerProfileId}
                  focus={homeownerRecordFocus}
                  onBack={() => setHomeownerRecordFocus(null)}
                  onMessage={setMessage}
                  onOpenJob={(jobId) => {
                    setHomeownerRecordFocus(null);
                    setSelectedJobId(jobId);
                    setTab("dispatch");
                  }}
                />
              ) : (
              <AdminHomeownerProfile
                userId={selectedHomeownerProfileId}
                onBack={() => {
                  setHomeownerRecordFocus(null);
                  setSelectedHomeownerProfileId(null);
                }}
                onOpenProperty={(propertyId) => {
                  if (!propertyId) return;
                  setHomeownerRecordFocus({ type: "property", propertyId: Number(propertyId) });
                }}
                onOpenJob={(jobId) => {
                  setSelectedJobId(jobId);
                  setTab("dispatch");
                }}
                onOpenQuote={(quoteId) => {
                  if (!quoteId) return;
                  setHomeownerRecordFocus({ type: "quote", quoteId: Number(quoteId) });
                }}
                onOpenInvoice={(invoiceId, proposalId) => {
                  if (!invoiceId) return;
                  setHomeownerRecordFocus({
                    type: "invoice",
                    invoiceId: Number(invoiceId),
                    proposalId: proposalId != null ? Number(proposalId) : null,
                  });
                }}
                onOpenPayment={(paymentId) => {
                  if (!paymentId) return;
                  setHomeownerRecordFocus({ type: "payment", paymentId: Number(paymentId) });
                }}
                onOpenTab={(t) => setTab(t as Tab)}
                onOpenTicket={(ticketNumber) => {
                  setSelectedSupportTicket(ticketNumber);
                  setTab("support-tickets");
                }}
              />
              )
            ) : (
              <>
            <SectionHeader
              title="Homeowners"
              subtitle="Search customers, open profiles, and manage memberships."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className={`${cardClass} p-5`}>
                <p className="text-sm text-muted-foreground">Total Homeowners</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{subStats?.totalHomeowners ?? 0}</p>
              </div>
              <div className={`${cardClass} p-5 border-l-4 border-amber-500`}>
                <p className="text-sm text-muted-foreground">Pro Subscribers</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-500">{subStats?.subscribedCount ?? 0}</p>
              </div>
              <div className={`${cardClass} p-5`}>
                <p className="text-sm text-muted-foreground">Non-Subscribers</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{subStats?.nonSubscribedCount ?? 0}</p>
              </div>
            </div>

            <div className={`${cardClass} p-6`}>
              <h2 className="text-lg font-semibold mb-2">Subscription Settings</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Manage plan names, prices, benefits, and DIY unlocks in{" "}
                <button type="button" className="font-semibold text-[#FF4D1C] hover:underline" onClick={() => setTab("pro-plans")}>
                  Administration → HomeCare Plans
                </button>
                . Changes appear on the homeowner HomeCare page. Set a quick HomeCare Pro monthly price here.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!pricingRules) return;
                  setBusy(true);
                  const amount = Number(proPriceInput);
                  const nextRules = {
                    ...pricingRules,
                    homecare_subscription_price: amount,
                    pro_subscription_price: amount,
                  };
                  const r = await adminSavePricingRules(nextRules as unknown as Record<string, unknown>);
                  try {
                    const plansRes = await listAdminSubscriptionPlans();
                    const paid =
                      (plansRes.plans || []).find((p) => p.code === PAID_HOME_CARE_PLAN_CODE) ||
                      (plansRes.plans || []).find((p) => p.code === "pro_membership");
                    if (paid?.id != null) {
                      await updateAdminSubscriptionPlan(paid.id, { amount });
                    }
                  } catch {
                    // ignore sync errors; pricing rules still saved
                  }
                  setBusy(false);
                  if (r.ok) {
                    setPricingRules(r.rules as PricingRules);
                    setMessage("HomeCare Pro price saved successfully.");
                  } else {
                    setMessage("Could not save pricing rules.");
                  }
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="w-48">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    HomeCare Pro monthly price ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`${fieldClass} pl-7`}
                      value={proPriceInput}
                      onChange={(e) => setProPriceInput(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save HomeCare Pro Price"}
                </button>
              </form>
            </div>

            <div className={`${cardClass} overflow-hidden`}>
              <div className="border-b border-border/60 bg-muted/30 px-6 py-4 space-y-3">
                <div>
                  <h3 className="font-semibold">Customer search</h3>
                  <p className="text-xs text-muted-foreground">
                    Search by name, phone, email, or customer ID.
                  </p>
                </div>
                <div className="relative max-w-lg">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="search"
                    value={homeownerSearch}
                    onChange={(e) => setHomeownerSearch(e.target.value)}
                    placeholder="Search customers..."
                    className={`${fieldClass} pl-9`}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-muted-foreground text-xs font-medium uppercase">
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Contact</th>
                      <th className="px-6 py-3">Membership Plan</th>
                      <th className="px-6 py-3">Joined Date</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {subStats?.customers && subStats.customers.length > 0 ? (
                      subStats.customers.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/10">
                          <td className="px-6 py-4">
                            <p className="font-medium">{c.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">#{c.id}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p>{c.email}</p>
                            <p className="text-xs text-muted-foreground">{c.phone || "—"}</p>
                          </td>
                          <td className="px-6 py-4">
                            {isPaidHomeCarePlan(c.planCode) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center self-start gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                  {displayPlanLabel(c.planCode)}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-semibold pl-1">Active</span>
                                {c.isTrial ? (
                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold pl-1">
                                    Trial: {c.trialDaysLeft} {c.trialDaysLeft === 1 ? "day" : "days"} left
                                  </span>
                                ) : (
                                  c.currentPeriodEnd && (
                                    <span className="text-[10px] text-muted-foreground pl-1">
                                      Renews: {new Date(c.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                    </span>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                                {displayPlanLabel(c.planCode)}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground text-xs">
                            {new Date(c.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setHomeownerRecordFocus(null);
                                  setSelectedHomeownerProfileId(c.id);
                                }}
                                className="inline-flex items-center gap-1 rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition"
                              >
                                Open Profile
                              </button>
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={async () => {
                                  try {
                                    const r = await adminSendPasswordReset(c.id);
                                    if (r.ok) {
                                      setMessage(`Password reset email sent to ${c.email}.`);
                                    } else {
                                      alert(r.message || "Could not send password reset.");
                                    }
                                  } catch (err: any) {
                                    alert(err.message || "Could not send password reset.");
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 transition disabled:opacity-50"
                              >
                                <Mail className="h-3.5 w-3.5" />
                                Send Password Reset Email
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  setInvoiceModalHomeowner({ id: c.id, name: c.name, email: c.email });
                                  setInvoiceModalJobId("");
                                  setInvoiceModalJobs([]);
                                  setInvoiceModalLoading(true);
                                  try {
                                    const r = await adminHomeownerJobs(c.id);
                                    if (r.ok) {
                                      setInvoiceModalJobs(r.jobs || []);
                                      if (r.jobs?.length === 1) setInvoiceModalJobId(r.jobs[0].id);
                                    }
                                  } finally {
                                    setInvoiceModalLoading(false);
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 transition"
                              >
                                Send invoice
                              </button>
                            {!isPaidHomeCarePlan(c.planCode) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideHomeownerId(c.id);
                                  setOverrideHomeownerName(c.name);
                                  setStaffNameInput("");
                                }}
                                className="inline-flex items-center gap-1 rounded bg-[#FF4D1C] hover:bg-[#FF4D1C]/90 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                              >
                                Upgrade to HomeCare Pro
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">HomeCare Pro active</span>
                            )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                          {homeownerSearch.trim()
                            ? "No customers match that search."
                            : "No customer homeowners registered yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            )}
          </section>
        )}

        {tab === "audit-logs" && <AdminAuditLogsPanel />}

        {tab === "support-tickets" && <AdminSupportTicketsPanel initialTicket={selectedSupportTicket} />}

        {tab === "pro-plans" && <AdminSubscriptionPlansPanel readOnly={isReadOnly} />}

        {tab === "homecare-pro" && (
          <AdminHomeCareProPanel permissions={adminPermissions} onMessage={setMessage} />
        )}

        {tab === "access" && (
          <section className="space-y-6">
            <SectionHeader
              title="Team & Roles"
              subtitle="Staff accounts with permission-based access. Roles are collections of permissions — not hardcoded pages."
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(ROLE_PRESETS).map(([id, preset]) => (
                <div key={id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                  <p className="font-semibold">{preset.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    {preset.permissions.length} permissions
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="p-5 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-foreground">Staff Accounts & Permissions</h3>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setStaffCreateOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF4D1C] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105"
                    >
                      Add staff user
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void refreshStaff()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 transition disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Refresh List
                  </button>
                </div>
              </div>

              {staffCreateOpen && !isReadOnly && (
                <form
                  className="border-b border-border/60 bg-muted/10 p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPassword) return;
                    setStaffCreateBusy(true);
                    try {
                      const r = await createStaffAdmin({
                        name: newStaffName.trim(),
                        email: newStaffEmail.trim(),
                        password: newStaffPassword,
                        accessLevel: newStaffAccess,
                      });
                      if (!r.ok) {
                        alert(r.message || "Could not create staff account.");
                      } else {
                        setNewStaffName("");
                        setNewStaffEmail("");
                        setNewStaffPassword("");
                        setNewStaffAccess("read-write");
                        setStaffCreateOpen(false);
                        await refreshStaff();
                        setMessage(`Staff account created for ${r.user?.email || newStaffEmail}.`);
                      }
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Could not create staff account.");
                    } finally {
                      setStaffCreateBusy(false);
                    }
                  }}
                >
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Name</span>
                    <input
                      required
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Email</span>
                    <input
                      required
                      type="email"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Password</span>
                    <input
                      required
                      type="password"
                      minLength={8}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Access level</span>
                    <select
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={newStaffAccess}
                      onChange={(e) => setNewStaffAccess(e.target.value as "read" | "write" | "read-write")}
                    >
                      <option value="read">Read only (view)</option>
                      <option value="write">Write only</option>
                      <option value="read-write">Read + Write (full)</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={staffCreateBusy}
                      className="w-full rounded-lg bg-[#FF4D1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {staffCreateBusy ? "Creating…" : "Create account"}
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase">
                      <th className="px-6 py-4">ID</th>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Current Access Level</th>
                      <th className="px-6 py-4">Assign Permissions</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {staff.length > 0 ? (
                      staff.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/10">
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground">#{s.id}</td>
                          <td className="px-6 py-4 font-medium">{s.name}</td>
                          <td className="px-6 py-4">{s.email}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${
                              s.adminAccessLevel === "read"
                                ? "bg-red-500/10 text-red-700 dark:text-red-400"
                                : s.adminAccessLevel === "write"
                                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                  : "bg-green-500/10 text-green-700 dark:text-green-400"
                            }`}>
                              {s.adminAccessLevel === "read"
                                ? "Read-Only"
                                : s.adminAccessLevel === "write"
                                  ? "Write-Only"
                                  : "Read-Write (Full)"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              disabled={busyStaffId === s.id || isReadOnly || s.email === "ksdt2702@gmail.com"}
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs outline-none focus:border-[#FF4D1C] disabled:opacity-60 text-foreground"
                              value={s.adminAccessLevel || "read-write"}
                              onChange={async (e) => {
                                const level = e.target.value;
                                setBusyStaffId(s.id);
                                try {
                                  const r = await updateStaffAccess(s.id, level);
                                  if (r.ok) {
                                    setMessage(`Permissions updated for ${s.name}.`);
                                    await refreshStaff();
                                  } else {
                                    alert(r.message || "Failed to update permissions.");
                                  }
                                } catch (err: any) {
                                  alert(err.message || "Failed to update permissions.");
                                } finally {
                                  setBusyStaffId(null);
                                }
                              }}
                            >
                              <option value="read">Read only (view)</option>
                              <option value="write">Write only</option>
                              <option value="read-write">Read + Write (full)</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              disabled={busyStaffId === s.id || isReadOnly || !s.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold transition hover:bg-muted disabled:opacity-50"
                              onClick={async () => {
                                if (!s.id) return;
                                setBusyStaffId(s.id);
                                try {
                                  const r = await adminSendPasswordReset(Number(s.id));
                                  if (r.ok) {
                                    setMessage(`Password reset email sent to ${s.email}.`);
                                  } else {
                                    alert(r.message || "Could not send password reset.");
                                  }
                                } catch (err: any) {
                                  alert(err.message || "Could not send password reset.");
                                } finally {
                                  setBusyStaffId(null);
                                }
                              }}
                            >
                              {busyStaffId === s.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mail className="h-3.5 w-3.5" />
                              )}
                              Send Password Reset Email
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                          No staff admin accounts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
        </TabFade>
        </main>
      <AnimatePresence>
        {overrideHomeownerId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-lg font-bold tracking-wide">Override Subscription Plan</h3>
                <button
                  type="button"
                  onClick={() => setOverrideHomeownerId(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleOverrideSubscription} className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  You are overriding the subscription plan for{" "}
                  <strong className="text-foreground">{overrideHomeownerName}</strong> to{" "}
                  <strong className="text-[#FF4D1C]">HomeCare Pro</strong>.
                </p>

                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Staff Name (Audited)</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={staffNameInput}
                    onChange={(e) => setStaffNameInput(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C]"
                  />
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOverrideHomeownerId(null)}
                    className="rounded-lg border border-border px-4 py-2 hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={overrideBusy || isReadOnly}
                    className="rounded-lg bg-[#FF4D1C] px-4 py-2 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                  >
                    {overrideBusy ? "Processing..." : isReadOnly ? "Read-Only" : "Confirm & Save Override"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {invoiceModalHomeowner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <div>
                  <h3 className="text-lg font-bold">Send invoice</h3>
                  <p className="text-sm text-muted-foreground">
                    {invoiceModalHomeowner.name} · {invoiceModalHomeowner.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInvoiceModalHomeowner(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {invoiceModalLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
                  </div>
                ) : invoiceModalJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No service jobs found for this homeowner.</p>
                ) : (
                  <>
                    <label className="grid gap-1 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Select job</span>
                      <select
                        className={fieldClass}
                        value={invoiceModalJobId}
                        onChange={(e) => setInvoiceModalJobId(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">Choose a job…</option>
                        {invoiceModalJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            #{j.id} {j.title} · {STATUS_LABELS[j.status] || j.status}
                          </option>
                        ))}
                      </select>
                    </label>
                    {invoiceModalJobId !== "" ? (
                      <AdminHomeownerInvoicePanel
                        jobId={Number(invoiceModalJobId)}
                        readOnly={isReadOnly}
                        compact
                        onMessage={setMessage}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AdminJobDrawer
        job={selectedJob}
        bids={bids}
        contractors={contractors}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        busy={busy}
        inviteContractorId={inviteContractorId}
        inviteRequestType={inviteRequestType}
        onInviteContractorId={setInviteContractorId}
        onInviteRequestType={setInviteRequestType}
        onInviteAndAssign={handleInviteAndAssign}
        onMatch={async () => {
          if (!selectedJob) return;
          setBusy(true);
          const r = await matchContractors(selectedJob.id);
          setBusy(false);
          setMessage(r.ok ? "Auto-match complete." : r.message || "Match failed.");
          await refreshJobs();
        }}
        onOpenContractor={(contractorId) => {
          setDrawerOpen(false);
          setTab("contractors");
          const c = contractors.find((x) => Number(x.id) === contractorId);
          if (c) {
            if (expandedContractorId !== contractorId) {
              void openContractorDetail(c);
            }
          } else {
            setExpandedContractorId(contractorId);
          }
        }}
        onOpenHomeowner={() => {
          setDrawerOpen(false);
          setTab("subscriptions");
          setMessage(
            selectedJob?.contactName
              ? `Homeowner for ${jobBookingLabel(selectedJob)}: ${selectedJob.contactName}${selectedJob.contactPhone ? ` · ${selectedJob.contactPhone}` : ""}`
              : "Open Homeowners to manage customer accounts.",
          );
        }}
        onOpenPayments={() => {
          setDrawerOpen(false);
          setTab("finance");
        }}
        onOpenPayouts={() => {
          setDrawerOpen(false);
          setTab("finance");
        }}
        onOpenAiEstimate={() => {
          setDrawerOpen(false);
          setTab("dispatch");
        }}
        dispatchCouponCode={dispatchCouponCode}
        onDispatchCouponCodeChange={setDispatchCouponCode}
        readOnly={isReadOnly}
        onApplyCoupon={async () => {
          if (!selectedJob || !dispatchCouponCode.trim()) return;
          setBusy(true);
          try {
            const r = await adminApplyJobDiscount(selectedJob.id, dispatchCouponCode.trim());
            if (!r.ok) setMessage(r.message || "Could not apply coupon.");
            else {
              setMessage(`Coupon applied to ${jobBookingLabel(selectedJob)}.`);
              setDispatchCouponCode("");
              await refreshJobs();
            }
          } finally {
            setBusy(false);
          }
        }}
        onMessage={setMessage}
        onRefresh={refreshJobs}
      />

      <AdminCommandPalette open={cmdOpen} onOpenChange={setCmdOpen} actions={commandActions} />
      </div>
    </div>
  );
}
