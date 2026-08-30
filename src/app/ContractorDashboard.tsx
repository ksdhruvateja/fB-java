import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  LayoutDashboard, Bell, Briefcase, CalendarDays, MessageSquare, Wrench, MapPin,
  Users, DollarSign, CreditCard, BarChart3, Shield, FileText, Settings,
  HelpCircle, LogOut, Menu, Moon, Sun, X, Loader2, User, Gift,
} from "lucide-react";
import type { AuthUser } from "./auth";
import AppLogo from "./AppLogo";
import AppBackButton from "./AppBackButton";
import { type ContractorNavFrame } from "./navigation";
import { useDashboardNavigation } from "./useDashboardNavigation";
import {
  formatMoney,
  formatCents,
  listContractorPayouts,
  getContractorPayoutSummary,
  getContractorPayoutAccount,
  listInvitations,
  listMyManagedJobs,
  submitBid,
  updateCompliance,
  type ManagedJob,
  type ContractorPayout,
  type PayoutSummary,
  type PayoutAccount,
} from "./managedJobs";
import ContractorApplicationForm, { type ContractorApplicationDocs, emptyContractorApplicationDocs } from "./ContractorApplicationForm";
import ContractorCompliancePanel from "./ContractorCompliancePanel";
import {
  applicationFromUser,
  applicationToProfileFields,
  validateContractorApplication,
  type ContractorApplication,
} from "./contractorApplication";
import {
  loadWorkspace,
  saveWorkspace,
  type ContractorWorkspace,
} from "./contractorWorkspaceStore";
import ContractorOverviewPanel from "./ContractorOverviewPanel";
import ContractorInvitesPanel, { type ContractorInvite } from "./ContractorInvitesPanel";
import ContractorJobsPanel from "./ContractorJobsPanel";
import ContractorSchedulePanel from "./ContractorSchedulePanel";
import ContractorServicesPanel from "./ContractorServicesPanel";
import ContractorServiceAreasPanel from "./ContractorServiceAreasPanel";
import ContractorTeamPanel from "./ContractorTeamPanel";
import ContractorPricingPanel from "./ContractorPricingPanel";
import ContractorPayoutsPanel from "./ContractorPayoutsPanel";
import ContractorReferEarn from "./ContractorReferEarn";
import ContractorPerformancePanel from "./ContractorPerformancePanel";
import ContractorSupportPanel from "./ContractorSupportPanel";
import ContractorStripeConnectCard from "./ContractorStripeConnectCard";
import ContractorExpiryAlert from "./ContractorExpiryAlert";
import {
  evaluateCredentialExpiry,
  expiryBadgeClass,
  expiryLabel,
  formatExpiryDate,
  getContractorExpiryAlerts,
  hasShownExpiryModalThisSession,
  markExpiryModalShownThisSession,
} from "./contractorExpiry";

import { DashboardTabFallback } from "./AppErrorBoundary";
import {
  type ContractorDashTab as DashTab,
  isContractorTabRendered,
  sanitizeContractorTab,
} from "./contractorNav";

const NAV_GROUPS: { label: string; items: { id: DashTab; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "invites", label: "Invitations", icon: Bell },
      { id: "jobs", label: "Jobs", icon: Briefcase },
      { id: "schedule", label: "Schedule", icon: CalendarDays },
      { id: "messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "services", label: "Services", icon: Wrench },
      { id: "areas", label: "Service Areas", icon: MapPin },
      { id: "team", label: "Team", icon: Users },
      { id: "pricing", label: "Pricing & Rates", icon: DollarSign },
      { id: "payouts", label: "Payouts", icon: CreditCard },
      { id: "refer-earn", label: "Refer & Earn", icon: Gift },
    ],
  },
  {
    label: "Performance",
    items: [{ id: "performance", label: "Performance & Reviews", icon: BarChart3 }],
  },
  {
    label: "Compliance",
    items: [
      { id: "compliance", label: "Compliance", icon: Shield },
      { id: "documents", label: "Documents", icon: FileText },
    ],
  },
];

function Stub({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-3xl space-y-3">
      <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">{title}</h1>
      <p className="rounded-[1.5rem] border border-border bg-card p-6 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </section>
  );
}

export default function ContractorDashboard({
  onLogout,
  user,
  isDark,
  onToggleDark,
  onUserUpdated,
}: {
  onLogout: () => void;
  user: AuthUser;
  isDark: boolean;
  onToggleDark: () => void;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const [tab, setTab] = useState<DashTab>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [invites, setInvites] = useState<ContractorInvite[]>([]);
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [payouts, setPayouts] = useState<ContractorPayout[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary | null>(null);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
  const [payoutSubTab, setPayoutSubTab] = useState<"earnings" | "account">("earnings");
  const [stripeReturnMessage, setStripeReturnMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusInviteId, setFocusInviteId] = useState<number | null>(null);

  const [application, setApplication] = useState<ContractorApplication>(() => applicationFromUser(user));
  const [appDocs, setAppDocs] = useState<ContractorApplicationDocs>(emptyContractorApplicationDocs);
  const [editGender, setEditGender] = useState(user.gender || "");
  const [editDob, setEditDob] = useState(user.dob || "");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const skipAutoSaveRef = useRef(true);
  const [editPhotoDataUrl, setEditPhotoDataUrl] = useState<string | null>(user.photoDataUrl || null);
  const [afterHoursFee, setAfterHoursFee] = useState(user.afterHoursFee != null ? String(user.afterHoursFee) : "50");
  const [weekendFee, setWeekendFee] = useState(user.weekendFee != null ? String(user.weekendFee) : "75");
  const [cancellationFee, setCancellationFee] = useState(user.cancellationFee != null ? String(user.cancellationFee) : "50");
  const [freeEstimate, setFreeEstimate] = useState(user.freeEstimate === true);
  const [visitAppliesToRepair, setVisitAppliesToRepair] = useState(user.visitAppliesToRepair === true);

  const companyName =
    application.dbaTradeName || application.legalBusinessName || user.companyName || user.name || "Your company";

  const [workspace, setWorkspace] = useState<ContractorWorkspace>(() =>
    loadWorkspace(user.id, {
      companyName,
      primaryServices: application.primaryServices,
      availableDays: application.availableDays,
      companySize: application.companySize || "2–5",
    })
  );

  const [bidJobId, setBidJobId] = useState<number | null>(null);
  const [labor, setLabor] = useState("200");
  const [materials, setMaterials] = useState("75");
  const [travel, setTravel] = useState("50");
  const [warranty, setWarranty] = useState("90-day workmanship");
  const [exclusions, setExclusions] = useState("Hidden damage, permits not included");
  const [expiryAlertOpen, setExpiryAlertOpen] = useState(false);

  const applyNavFrame = useCallback((f: ContractorNavFrame) => {
    setTab(sanitizeContractorTab(f.tab));
    setMobileNav(false);
  }, []);

  const navFrame = useMemo(
    (): ContractorNavFrame => ({
      role: "contractor",
      tab,
    }),
    [tab]
  );

  const { goHome, goBack, canBack, navigateTo } = useDashboardNavigation(
    "contractor",
    "contractor-dashboard",
    navFrame,
    applyNavFrame
  );

  const handleMobileBack = () => {
    if (mobileNav) {
      setMobileNav(false);
      return;
    }
    goBack();
  };

  const expiryAlerts = useMemo(() => getContractorExpiryAlerts(user), [user]);
  const licenseStatus = useMemo(
    () =>
      evaluateCredentialExpiry(
        "Contractor license",
        "license",
        application.licenseExpiration || user.licenseExpiresAt,
        { required: Boolean(application.licenseNumber || user.licenseNumber) }
      ),
    [application.licenseExpiration, application.licenseNumber, user.licenseExpiresAt, user.licenseNumber]
  );
  const insuranceStatus = useMemo(
    () =>
      evaluateCredentialExpiry(
        "Liability insurance",
        "insurance",
        application.insuranceExpiration || user.insuranceExpiresAt,
        {
          required:
            application.generalLiability === "yes" ||
            Boolean(user.insuranceDocumentName) ||
            Boolean(user.insuranceExpiresAt),
        }
      ),
    [
      application.insuranceExpiration,
      application.generalLiability,
      user.insuranceExpiresAt,
      user.insuranceDocumentName,
    ]
  );

  useEffect(() => {
    if (!expiryAlerts.length) {
      setExpiryAlertOpen(false);
      return;
    }
    if (hasShownExpiryModalThisSession(user.id)) {
      setExpiryAlertOpen(false);
      return;
    }
    markExpiryModalShownThisSession(user.id);
    setExpiryAlertOpen(true);
  }, [expiryAlerts, user.id]);

  useEffect(() => {
    setApplication(applicationFromUser(user));
    setEditGender(user.gender || "");
    setEditDob(user.dob || "");
    setEditPhotoDataUrl(user.photoDataUrl || null);
    setAfterHoursFee(user.afterHoursFee != null ? String(user.afterHoursFee) : "50");
    setWeekendFee(user.weekendFee != null ? String(user.weekendFee) : "75");
    setCancellationFee(user.cancellationFee != null ? String(user.cancellationFee) : "50");
    setFreeEstimate(user.freeEstimate === true);
    setVisitAppliesToRepair(user.visitAppliesToRepair === true);
    skipAutoSaveRef.current = true;
  }, [user]);

  const updateWorkspace = (next: ContractorWorkspace) => {
    setWorkspace(next);
    saveWorkspace(user.id, next);
  };

  const persistProfile = async (opts?: {
    silent?: boolean;
    applicationOverride?: ContractorApplication;
    afterHoursOverride?: string;
  }) => {
    const silent = Boolean(opts?.silent);
    const app = opts?.applicationOverride || application;
    const afterFee = opts?.afterHoursOverride ?? afterHoursFee;
    if (!silent) {
      setBusy(true);
      setSaveError(null);
      setSaveSuccess(false);
    } else setAutoSaveStatus("saving");

    const validationError = validateContractorApplication(app, {
      w9: appDocs.w9,
      license: appDocs.license,
      insurance: appDocs.insurance,
      existingW9: Boolean(user.w9DocumentName),
      existingLicense: Boolean(user.licenseDocumentName),
      existingInsurance: Boolean(user.insuranceDocumentName),
    });
    if (validationError) {
      if (!silent) {
        setSaveError(validationError);
        setBusy(false);
      } else setAutoSaveStatus("idle");
      return false;
    }

    try {
      const profile = applicationToProfileFields(app);
      const payload: Record<string, unknown> = {
        name: profile.name || user.name,
        phone: profile.phone,
        address: profile.address,
        contactEmail: profile.contactEmail,
        companyName: profile.companyName,
        companyDetails: profile.companyDetails,
        insuranceDetails: profile.insuranceDetails,
        trade: profile.trade,
        licenseNumber: profile.licenseNumber,
        visitFee: profile.visitFee,
        emergencyVisitFee: profile.emergencyVisitFee,
        afterHoursFee: afterFee ? Number(afterFee) : null,
        weekendFee: weekendFee ? Number(weekendFee) : null,
        cancellationFee: cancellationFee ? Number(cancellationFee) : null,
        minimumLaborFee: profile.minimumLaborFee,
        freeEstimate,
        visitAppliesToRepair,
        serviceZips: profile.serviceZips,
        travelRadiusMiles: profile.travelRadiusMiles,
        gender: editGender.trim() || undefined,
        dob: editDob.trim() || undefined,
        contractorApplication: app,
        addressVerified: app.addressVerified === true,
        postalCodePlus4: app.postalCodePlus4 || null,
      };
      if (editPhotoDataUrl) payload.photoDataUrl = editPhotoDataUrl;
      else if (user.photoDataUrl && editPhotoDataUrl === null) payload.photoDataUrl = null;

      if (appDocs.license) {
        payload.licenseDocumentName = appDocs.license.name;
        payload.licenseDocumentData = appDocs.license.data;
      }
      if (appDocs.insurance) {
        payload.insuranceDocumentName = appDocs.insurance.name;
        payload.insuranceDocumentData = appDocs.insurance.data;
      }
      if (appDocs.idDoc) {
        payload.idDocumentName = appDocs.idDoc.name;
        payload.idDocumentData = appDocs.idDoc.data;
      }
      if (appDocs.w9) {
        payload.w9DocumentName = appDocs.w9.name;
        payload.w9DocumentData = appDocs.w9.data;
      }
      if (appDocs.businessRegistration) {
        payload.businessRegistrationName = appDocs.businessRegistration.name;
        payload.businessRegistrationData = appDocs.businessRegistration.data;
      }
      if (appDocs.businessLicense) {
        payload.businessLicenseName = appDocs.businessLicense.name;
        payload.businessLicenseData = appDocs.businessLicense.data;
      }
      if (appDocs.diversityCert) {
        payload.diversityDocumentName = appDocs.diversityCert.name;
        payload.diversityDocumentData = appDocs.diversityCert.data;
      }

      const { updateUserProfile } = await import("./auth");
      const r = await updateUserProfile(payload);
      if (r.ok) {
        onUserUpdated?.(r.user);
        setAppDocs({ w9: null, license: null, insurance: null, businessRegistration: null, businessLicense: null, idDoc: null, diversityCert: null });
        if (silent) {
          setAutoSaveStatus("saved");
          skipAutoSaveRef.current = true;
        } else setSaveSuccess(true);
        return true;
      }
      if (!silent) setSaveError(r.message || "Failed to save profile.");
      else setAutoSaveStatus("error");
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error.";
      if (!silent) setSaveError(msg);
      else setAutoSaveStatus("error");
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  };

  useEffect(() => {
    if (tab !== "compliance") return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => void persistProfile({ silent: true }), 1600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application, afterHoursFee, weekendFee, cancellationFee, freeEstimate, visitAppliesToRepair, editGender, editDob, editPhotoDataUrl, appDocs, tab]);

  async function refresh() {
    const [i, j, p, s, a] = await Promise.all([
      listInvitations(),
      listMyManagedJobs(),
      listContractorPayouts(),
      getContractorPayoutSummary(),
      getContractorPayoutAccount(),
    ]);
    if (i.ok) setInvites((i.invitations || []) as ContractorInvite[]);
    if (j.ok) setJobs(j.jobs || []);
    if (p.ok) setPayouts(p.payouts || []);
    if (s.ok) setPayoutSummary(s.summary);
    if (a.ok) setPayoutAccount(a.account);
  }

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    if (stripe === "return") {
      setTab("compliance");
      setStripeReturnMessage("Stripe payout setup saved. Refresh below if your status has not updated yet.");
      params.delete("stripe");
      const next = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
      void refresh();
    } else if (stripe === "refresh") {
      setTab("compliance");
      setStripeReturnMessage(null);
      params.delete("stripe");
      window.history.replaceState({}, "", window.location.pathname);
      void refresh();
    }
  }, []);

  const monthEarnings = useMemo(
    () => (payoutSummary?.paidThisMonthCents || 0) / 100,
    [payoutSummary]
  );

  const payoutByJobId = useMemo(() => {
    const map = new Map<number, ContractorPayout>();
    payouts.forEach((p) => map.set(p.jobId, p));
    return map;
  }, [payouts]);
  const netTotal = Number(labor || 0) + Number(materials || 0) + Number(travel || 0);

  const zipList = useMemo(() => {
    if (Array.isArray(user.serviceZips) && user.serviceZips.length) return user.serviceZips.map(String);
    return String(application.serviceZips || "")
      .split(/[\s,;]+/)
      .map((z) => z.trim())
      .filter((z) => /^\d{5}/.test(z));
  }, [user.serviceZips, application.serviceZips]);

  const radiusMiles = Number(application.maxServiceRadius || user.travelRadiusMiles || 35) || 35;

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
      setTab("jobs");
    } finally {
      setBusy(false);
    }
  }

  const go = (id: DashTab | "reviews") => {
    navigateTo({
      role: "contractor",
      tab: id === "reviews" ? "performance" : id,
    });
  };

  const goToPayoutAccount = () => {
    setPayoutSubTab("account");
    go("payouts");
  };

  const sidebarNav = (
    <nav className="flex flex-col gap-5 p-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  tab === item.id ? "bg-primary text-white" : "text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="border-t border-border pt-3 space-y-0.5">
        <button type="button" onClick={() => go("settings")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${tab === "settings" ? "bg-primary text-white" : "hover:bg-muted"}`}>
          <Settings className="h-4 w-4" /> Settings
        </button>
        <button type="button" onClick={() => go("help")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${tab === "help" ? "bg-primary text-white" : "hover:bg-muted"}`}>
          <HelpCircle className="h-4 w-4" /> Help & Support
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-1">
          {(canBack || mobileNav) && (
            <AppBackButton onBack={handleMobileBack} className="-ml-1 shrink-0" />
          )}
          <div className="min-w-0">
            <AppLogo onHome={goHome} variant="auth" />
            <p className="text-[10px] text-muted-foreground">Contractor</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToggleDark} className="rounded-md p-2 hover:bg-muted" aria-label="Theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setMobileNav((v) => !v)} aria-label="Menu">
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-background shadow-xl">
            <div className="border-b border-border px-4 py-4">
              <AppLogo onHome={goHome} variant="auth" className="mb-1" />
              <p className="text-xs text-muted-foreground">{companyName}</p>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
            <div className="border-t border-border p-3">
              <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:flex lg:min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="border-b border-border px-4 py-4">
            <AppLogo onHome={goHome} variant="auth" className="mb-1" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Contractor</p>
            <p className="mt-0.5 text-sm font-semibold truncate">{companyName}</p>
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

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {error && (
            <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}

          {tab === "dashboard" && (
            <ContractorOverviewPanel
              companyName={companyName}
              invites={invites}
              jobs={jobs}
              monthEarnings={monthEarnings}
              expiryAlerts={expiryAlerts}
              onOpenInvites={() => go("invites")}
              onOpenJobs={() => go("jobs")}
              onOpenCompliance={() => go("compliance")}
              onOpenPayoutAccount={goToPayoutAccount}
              payoutAccountReady={payoutAccount?.readyToReceivePayouts === true}
              onViewInvite={(id) => {
                setFocusInviteId(id);
                go("invites");
              }}
            />
          )}

          {tab === "invites" && (
            <ContractorInvitesPanel
              invites={invites}
              hourlyRate={application.standardHourlyRate}
              tripFee={application.tripFee}
              focusId={focusInviteId}
              onRefresh={refresh}
              onAccepted={() => go("jobs")}
              onBid={(jobId) => setBidJobId(jobId)}
            />
          )}

          {tab === "jobs" && (
            <ContractorJobsPanel
              jobs={jobs}
              busy={busy}
              onRefresh={refresh}
              onError={setError}
              onBid={(jobId) => setBidJobId(jobId)}
              payoutByJobId={payoutByJobId}
              payoutAccount={payoutAccount}
              onViewPayouts={() => go("payouts")}
            />
          )}

          {tab === "schedule" && (
            <ContractorSchedulePanel jobs={jobs} workspace={workspace} onChange={updateWorkspace} />
          )}

          {tab === "services" && (
            <ContractorServicesPanel workspace={workspace} onChange={updateWorkspace} />
          )}

          {tab === "areas" && (
            <ContractorServiceAreasPanel
              primaryCity={application.businessCity}
              primaryState={application.businessState}
              primaryZip={application.businessZip}
              radiusMiles={radiusMiles}
              zips={zipList}
              emergencySameAsNormal={workspace.emergencySameAsNormal}
              onSaveRadius={(miles) => {
                const next = { ...application, maxServiceRadius: String(miles) };
                setApplication(next);
                void (async () => {
                  const profile = applicationToProfileFields(next);
                  const { updateUserProfile } = await import("./auth");
                  const r = await updateUserProfile({
                    contractorApplication: next,
                    travelRadiusMiles: profile.travelRadiusMiles,
                    serviceZips: profile.serviceZips,
                  });
                  if (r.ok) onUserUpdated?.(r.user);
                })();
              }}
              onSaveZips={(zips) => {
                const next = { ...application, serviceZips: zips.join(", ") };
                setApplication(next);
                void (async () => {
                  const profile = applicationToProfileFields(next);
                  const { updateUserProfile } = await import("./auth");
                  const r = await updateUserProfile({
                    contractorApplication: next,
                    travelRadiusMiles: profile.travelRadiusMiles,
                    serviceZips: profile.serviceZips,
                  });
                  if (r.ok) onUserUpdated?.(r.user);
                })();
              }}
              onToggleEmergencySame={(v) => updateWorkspace({ ...workspace, emergencySameAsNormal: v })}
            />
          )}

          {tab === "team" && (
            <ContractorTeamPanel companyName={companyName} workspace={workspace} onChange={(next) => {
              updateWorkspace(next);
              setApplication((a) => ({ ...a, companySize: next.companySize }));
            }} />
          )}

          {tab === "pricing" && (
            <ContractorPricingPanel
              application={application}
              afterHoursFee={afterHoursFee}
              busy={busy}
              onChangeApplication={setApplication}
              onChangeAfterHours={setAfterHoursFee}
              onSave={async (next, after) => {
                setApplication(next);
                setAfterHoursFee(after);
                setBusy(true);
                setError(null);
                try {
                  const profile = applicationToProfileFields(next);
                  const { updateUserProfile } = await import("./auth");
                  const r = await updateUserProfile({
                    contractorApplication: next,
                    visitFee: profile.visitFee,
                    emergencyVisitFee: profile.emergencyVisitFee,
                    minimumLaborFee: profile.minimumLaborFee,
                    afterHoursFee: after ? Number(after) : null,
                  });
                  if (r.ok) {
                    onUserUpdated?.(r.user);
                    try {
                      localStorage.setItem(`fixbridge_rates_updated_${user.id}`, new Date().toISOString());
                    } catch {
                      /* ignore */
                    }
                    return true;
                  }
                  setError(r.message || "Could not save rates.");
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
              lastUpdated={(() => {
                try {
                  return localStorage.getItem(`fixbridge_rates_updated_${user.id}`);
                } catch {
                  return null;
                }
              })()}
            />
          )}

          {tab === "payouts" && (
            <ContractorPayoutsPanel
              payouts={payouts}
              summary={payoutSummary}
              account={payoutAccount}
              onRefresh={refresh}
              initialSubTab={payoutSubTab}
              stripeReturnMessage={stripeReturnMessage}
            />
          )}

          {tab === "refer-earn" && <ContractorReferEarn />}

          {tab === "performance" && (
            <ContractorPerformancePanel jobs={jobs} invites={invites} />
          )}

          {tab === "documents" && (
            <section className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Documents</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    License and insurance expirations are monitored. Update anytime from Compliance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => go("compliance")}
                  className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-105"
                >
                  Update details
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Contractor license</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(licenseStatus.severity)}`}>
                      {expiryLabel(licenseStatus.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Number</p>
                  <p className="font-medium">{application.licenseNumber || user.licenseNumber || "—"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Expires</p>
                  <p className="font-medium">{formatExpiryDate(licenseStatus.expiresAt)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">File</p>
                  <p className="text-sm">{user.licenseDocumentName || "Not uploaded"}</p>
                </div>
                <div className="rounded-[1.25rem] border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Liability insurance</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${expiryBadgeClass(insuranceStatus.severity)}`}>
                      {expiryLabel(insuranceStatus.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Coverage</p>
                  <p className="font-medium">{application.coverageAmount || "—"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Expires</p>
                  <p className="font-medium">{formatExpiryDate(insuranceStatus.expiresAt)}</p>
                  <p className="mt-2 text-xs text-muted-foreground">File</p>
                  <p className="text-sm">{user.insuranceDocumentName || "Not uploaded"}</p>
                </div>
              </div>

              <ul className="rounded-[1.5rem] border border-border bg-card divide-y divide-border">
                {[
                  ["W-9", user.w9DocumentName],
                  ["Business registration", user.businessRegistrationName],
                  ["Business license", user.businessLicenseName],
                  ["ID", user.idDocumentName],
                ].map(([label, name]) => (
                  <li key={label} className="flex items-center justify-between px-5 py-3.5 text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">{name || "Not uploaded — add in Compliance"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "messages" && (
            <Stub title="Messages" body="Job threads with homeowners and FixBridge dispatch will appear here. Messaging goes live with assigned jobs." />
          )}
          {tab === "settings" && (
            <section className="mx-auto max-w-3xl space-y-4">
              <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Settings</h1>
              <div className="rounded-[1.5rem] border border-border bg-card p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Update your company profile, license, insurance, documents, and rates anytime — during signup and after approval.
                  Required fields are marked with *. Changes apply immediately for new job invitations.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => go("compliance")}
                    className="rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <p className="font-semibold text-sm">Update profile &amp; credentials</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Full application, W-9 / COI / license uploads, and expiration dates
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => go("documents")}
                    className="rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <p className="font-semibold text-sm">View document status</p>
                    <p className="mt-1 text-xs text-muted-foreground">See expiration dates and upload status</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => go("pricing")}
                    className="rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <p className="font-semibold text-sm">Pricing & fees</p>
                    <p className="mt-1 text-xs text-muted-foreground">Hourly rates, trip fees, after-hours</p>
                  </button>
                  <button
                    type="button"
                    onClick={goToPayoutAccount}
                    className="rounded-xl border border-border px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <p className="font-semibold text-sm">Payout account</p>
                    <p className="mt-1 text-xs text-muted-foreground">Stripe Connect banking details</p>
                  </button>
                </div>
              </div>
            </section>
          )}
          {tab === "help" && <ContractorSupportPanel user={user} />}

          {tab === "compliance" && (
            <section className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Compliance</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload compliance documents anytime — including after signup. Missing documents do not block your
                    application, but live dispatch stays blocked until required items are verified.
                  </p>
                </div>
              </div>

              <ContractorCompliancePanel />
              {(licenseStatus.severity !== "ok" || insuranceStatus.severity !== "ok") && (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">Credential reminders</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {licenseStatus.severity !== "ok" && <li>{licenseStatus.message}</li>}
                    {insuranceStatus.severity !== "ok" && <li>{insuranceStatus.message}</li>}
                  </ul>
                </div>
              )}

              <ContractorStripeConnectCard
                account={payoutAccount}
                onRefresh={refresh}
                stripeReturnMessage={stripeReturnMessage}
              />

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await persistProfile({ silent: false });
                }}
                className="rounded-[1.5rem] border border-border bg-card p-5 text-sm space-y-4"
              >
                {saveSuccess && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-700">Saved successfully.</div>}
                {autoSaveStatus === "saving" && <p className="text-[11px] text-muted-foreground">Auto-saving…</p>}
                {autoSaveStatus === "saved" && <p className="text-[11px] text-emerald-600">Changes saved.</p>}
                {saveError && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">{saveError}</div>}

                <div className="flex items-center gap-4 border-b border-border/60 pb-4">
                  {editPhotoDataUrl ? (
                    <img src={editPhotoDataUrl} alt="" className="h-16 w-16 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-lg font-semibold">{String(user.name || "U").slice(0, 1)}</div>
                  )}
                  <input type="file" accept="image/*" className="text-xs" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file || file.size > 2_000_000) return;
                    const reader = new FileReader();
                    reader.onload = () => setEditPhotoDataUrl(String(reader.result));
                    reader.readAsDataURL(file);
                  }} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">Gender</span>
                    <select className="rounded-lg border border-border bg-background px-3 py-2" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                      <option value="">Optional</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">Date of birth</span>
                    <input type="date" className="rounded-lg border border-border bg-background px-3 py-2" value={editDob} onChange={(e) => setEditDob(e.target.value)} />
                  </label>
                </div>

                <ContractorApplicationForm
                  mode="profile"
                  value={application}
                  onChange={setApplication}
                  docs={appDocs}
                  onDocsChange={setAppDocs}
                  existingDocs={{
                    w9: user.w9DocumentName,
                    license: user.licenseDocumentName,
                    insurance: user.insuranceDocumentName,
                    businessRegistration: user.businessRegistrationName,
                    businessLicense: user.businessLicenseName,
                    idDoc: user.idDocumentName,
                  }}
                  accountEmail={user.email}
                />

                <div className="grid gap-4 sm:grid-cols-3 rounded-xl border border-border/60 p-4">
                  <label className="grid gap-1.5 text-xs">
                    After hours ($)
                    <input className="rounded-lg border border-border px-3 py-2 text-sm" value={afterHoursFee} onChange={(e) => setAfterHoursFee(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-xs">
                    Weekend ($)
                    <input className="rounded-lg border border-border px-3 py-2 text-sm" value={weekendFee} onChange={(e) => setWeekendFee(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-xs">
                    Cancellation ($)
                    <input className="rounded-lg border border-border px-3 py-2 text-sm" value={cancellationFee} onChange={(e) => setCancellationFee(e.target.value)} />
                  </label>
                </div>

                <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Saving…" : "Save application & documents"}
                </button>
              </form>

              <div className="rounded-[1.5rem] border border-border bg-card p-5 text-sm space-y-3">
                <p className="flex items-center gap-2"><User className="h-4 w-4" /> {user.name} · {user.trade || "Trade TBD"}</p>
                <button type="button" disabled={busy} className="rounded-xl border border-border px-3 py-2" onClick={async () => {
                  setBusy(true);
                  await updateCompliance({ acceptAgreement: true, submitForReview: true, complianceStatus: "under_review" });
                  setBusy(false);
                }}>
                  Accept agreement & submit for review
                </button>
                <button type="button" disabled={busy} className="rounded-xl border border-border px-3 py-2" onClick={goToPayoutAccount}>
                  View full payout account details
                </button>
              </div>
            </section>
          )}

          {bidJobId != null && (
            <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setBidJobId(null)} />
              <form onSubmit={onBid} className="relative z-10 w-full max-w-lg space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xl">
                <p className="font-semibold">Submit confidential estimate</p>
                <p className="text-xs text-muted-foreground">Job #{bidJobId} — net amounts only.</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs">Labor<input className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm" value={labor} onChange={(e) => setLabor(e.target.value)} /></label>
                  <label className="text-xs">Materials<input className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm" value={materials} onChange={(e) => setMaterials(e.target.value)} /></label>
                  <label className="text-xs">Travel<input className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm" value={travel} onChange={(e) => setTravel(e.target.value)} /></label>
                </div>
                <input className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="Warranty" />
                <input className="w-full rounded-xl border border-border px-3 py-2 text-sm" value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="Exclusions" />
                <p className="text-sm font-semibold">Net total {formatMoney(netTotal)}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setBidJobId(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">Cancel</button>
                  <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit bid
                  </button>
                </div>
              </form>
            </div>
          )}
          {!isContractorTabRendered(tab) ? (
            <DashboardTabFallback tab={tab} onGoHome={() => go("dashboard")} />
          ) : null}
        </main>
      </div>

      <ContractorExpiryAlert
        items={expiryAlerts}
        open={expiryAlertOpen}
        onClose={() => setExpiryAlertOpen(false)}
        onUpdate={() => {
          setExpiryAlertOpen(false);
          go("compliance");
        }}
      />
    </div>
  );
}
