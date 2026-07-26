import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Home, PlusCircle, Briefcase, LogOut, Sun, Moon, Menu, X, User,
  Loader2, ImagePlus, ShieldAlert, CheckCircle, DollarSign, Sparkles, HardHat, ArrowLeft,
  CalendarDays, Clock, Zap, Building2, KeyRound, Hammer, Store, BadgeCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { AuthUser } from "./auth";
import { brand } from "../config/brand";
import {
  STATUS_LABELS,
  assessManagedJob,
  approveProposal,
  confirmCompletion,
  createManagedJob,
  createProperty,
  formatMoney,
  getProposal,
  listMyManagedJobs,
  listProperties,
  lookupPartner,
  lookupDiscount,
  payDispatchFee,
  payRetail,
  retailRangeLabel,
  type ManagedJob,
  type Property,
  type Proposal,
} from "./managedJobs";
import iconPlumbing from "../assets/category-icons/cat-plumbing.png";
import iconElectrical from "../assets/category-icons/cat-electrical.png";
import iconHvac from "../assets/category-icons/cat-hvac.png";
import iconPainting from "../assets/category-icons/cat-painting.png";
import iconRoofing from "../assets/category-icons/cat-roofing.png";
import iconFlooring from "../assets/category-icons/cat-flooring.png";
import iconCarpentry from "../assets/category-icons/cat-carpentry.png";
import iconOthers from "../assets/category-icons/cat-others.png";

type DashTab = "properties" | "report" | "jobs" | "profile";
type ReportStep = "intake" | "experts" | "assessment";

const NAV: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "report", label: "Report an Issue", icon: PlusCircle },
  { id: "jobs", label: "My Jobs", icon: Briefcase },
  { id: "properties", label: "Properties", icon: Home },
  { id: "profile", label: "Profile", icon: User },
];

const CATEGORIES: { name: string; icon: string }[] = [
  { name: "Plumbing", icon: iconPlumbing },
  { name: "Electrical", icon: iconElectrical },
  { name: "HVAC", icon: iconHvac },
  { name: "Painting", icon: iconPainting },
  { name: "Roofing", icon: iconRoofing },
  { name: "Flooring", icon: iconFlooring },
  { name: "Carpentry", icon: iconCarpentry },
  { name: "Others", icon: iconOthers },
];

const SERVICE_TIMING_OPTIONS = [
  {
    value: "weekday",
    label: "Scheduled weekday",
    hint: "Standard dispatch · best availability",
    icon: CalendarDays,
  },
  {
    value: "same-day",
    label: "Same-day priority",
    hint: "Faster response when slots open",
    icon: Zap,
  },
  {
    value: "evening-weekend",
    label: "Evening / weekend",
    hint: "After-hours & Sat–Sun windows",
    icon: Moon,
  },
] as const;

const TIME_WINDOW_OPTIONS = [
  { value: "9-11", label: "9–11 AM", period: "Morning" },
  { value: "11-2", label: "11 AM–2 PM", period: "Midday" },
  { value: "2-5", label: "2–5 PM", period: "Afternoon" },
  { value: "5-7", label: "5–7 PM", period: "Evening" },
] as const;

const PROPERTY_PURPOSE_OPTIONS = [
  { value: "current_homeowner", label: "Current homeowner", icon: Home },
  { value: "rental_property", label: "Rental property", icon: KeyRound },
  { value: "selling_property", label: "Selling", icon: Store },
  { value: "buying_primary_residence", label: "Buying", icon: BadgeCheck },
  { value: "fix_and_flip", label: "Fix and flip", icon: Hammer },
  { value: "commercial_property", label: "Commercial", icon: Building2 },
] as const;

const PROJECT_STAGE_OPTIONS = [
  { value: "ongoing_maintenance", label: "Ongoing maintenance" },
  { value: "pre_listing", label: "Pre-listing" },
  { value: "inspection_complete", label: "Inspection complete" },
  { value: "under_contract", label: "Under contract" },
  { value: "closed_post_purchase", label: "Post-purchase" },
  { value: "active_renovation", label: "Active renovation" },
] as const;

function moneyRange(job: ManagedJob) {
  return retailRangeLabel(job);
}

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysFromToday(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

function nextWeekendDate() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const add = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  d.setDate(d.getDate() + add);
  return toDateInputValue(d);
}

function formatDisplayDate(iso: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Accept a raw code, or extract CODE from a pasted intake URL. */
function normalizePartnerCodeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const asUrl = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://local.invalid");
    const fromQuery =
      asUrl.searchParams.get("partner") ||
      asUrl.searchParams.get("ref") ||
      asUrl.searchParams.get("code");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  } catch {
    // not a URL — treat as code
  }
  const partnerMatch = trimmed.match(/[?&](?:partner|ref|code)=([A-Za-z0-9_-]+)/i);
  if (partnerMatch?.[1]) return partnerMatch[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function normalizeDiscountCodeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const asUrl = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://local.invalid");
    const fromQuery = asUrl.searchParams.get("discount") || asUrl.searchParams.get("promo");
    if (fromQuery) return fromQuery.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  } catch {
    // ignore
  }
  const match = trimmed.match(/[?&](?:discount|promo)=([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1].toUpperCase();
  return trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export default function HomeownerDashboard({
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
  const [tab, setTab] = useState<DashTab>("report");
  const [mobileNav, setMobileNav] = useState(false);
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);

  // Report flow
  const [step, setStep] = useState<ReportStep>("intake");
  const [category, setCategory] = useState("Plumbing");
  const [description, setDescription] = useState("");
  const [propertyId, setPropertyId] = useState<number | "">("");
  const [serviceTiming, setServiceTiming] = useState("weekday");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState("9-11");
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [propertyPurpose, setPropertyPurpose] = useState("current_homeowner");
  const [transactionStage, setTransactionStage] = useState("ongoing_maintenance");
  const [partnerCode, setPartnerCode] = useState(() => {
    try {
      return sessionStorage.getItem("fixbridge-partner-code") || "";
    } catch {
      return "";
    }
  });
  const [partnerConsent, setPartnerConsent] = useState(false);
  const [partnerInfo, setPartnerInfo] = useState<{ code: string; name: string; company?: string | null } | null>(null);
  const [partnerLookingUp, setPartnerLookingUp] = useState(false);
  const [discountCode, setDiscountCode] = useState(() => {
    try {
      return sessionStorage.getItem("fixbridge-discount-code") || "";
    } catch {
      return "";
    }
  });
  const [discountInfo, setDiscountInfo] = useState<{
    code: string;
    label?: string | null;
    summary: string;
  } | null>(null);
  const [discountLookingUp, setDiscountLookingUp] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ManagedJob | null>(null);
  const [assessmentMsg, setAssessmentMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // New property form
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("NY");
  const [newZip, setNewZip] = useState("");

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [j, p] = await Promise.all([listMyManagedJobs(), listProperties()]);
      if (j.ok) setJobs(j.jobs || []);
      if (p.ok) setProperties(p.properties || []);
    } catch {
      setError("Could not load your account data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const code = partnerCode.trim().toUpperCase();
    try {
      if (code) sessionStorage.setItem("fixbridge-partner-code", code);
      else sessionStorage.removeItem("fixbridge-partner-code");
    } catch {
      // ignore
    }
    if (!code) {
      setPartnerInfo(null);
      setPartnerLookingUp(false);
      return;
    }
    let cancelled = false;
    setPartnerLookingUp(true);
    void lookupPartner(code).then((r) => {
      if (cancelled) return;
      setPartnerLookingUp(false);
      if (r.ok && r.partner) {
        setPartnerInfo(r.partner);
      } else {
        setPartnerInfo(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [partnerCode]);

  useEffect(() => {
    const code = discountCode.trim().toUpperCase();
    try {
      if (code) sessionStorage.setItem("fixbridge-discount-code", code);
      else sessionStorage.removeItem("fixbridge-discount-code");
    } catch {
      // ignore
    }
    if (!code) {
      setDiscountInfo(null);
      setDiscountMessage(null);
      setDiscountLookingUp(false);
      return;
    }
    let cancelled = false;
    setDiscountLookingUp(true);
    void lookupDiscount(code).then((r) => {
      if (cancelled) return;
      setDiscountLookingUp(false);
      if (r.ok && r.discount) {
        setDiscountInfo(r.discount);
        setDiscountMessage(null);
      } else {
        setDiscountInfo(null);
        setDiscountMessage(r.message || "Discount code not found or not valid.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [discountCode]);

  useEffect(() => {
    if (!selectedJobId) {
      setProposal(null);
      return;
    }
    void getProposal(selectedJobId).then((r) => {
      if (r.ok) setProposal(r.proposal);
    });
  }, [selectedJobId, jobs]);

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMediaDataUrl(String(reader.result));
      setMediaType(file.type.startsWith("video") ? "video" : "image");
    };
    reader.readAsDataURL(file);
  }

  async function submitIssue(path: "ai" | "experts") {
    if (!description.trim()) {
      setError("Please describe the issue first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const code = partnerCode.trim().toUpperCase();
      const usePartner = Boolean(code);
      const created = await createManagedJob({
        category,
        title: `${category} issue`,
        description,
        propertyId: propertyId || undefined,
        serviceTiming: path === "experts" ? serviceTiming : "weekday",
        preferredDate: path === "experts" ? preferredDate || undefined : undefined,
        preferredTimeSlot: path === "experts" ? preferredTimeSlot : undefined,
        mediaDataUrl,
        mediaType,
        contactName: user.name,
        contactPhone: user.phone || "",
        propertyPurpose: path === "experts" ? propertyPurpose : undefined,
        transactionStage: path === "experts" ? transactionStage : undefined,
        partnerCode: usePartner ? code : undefined,
        referringName: usePartner && partnerInfo ? partnerInfo.name : undefined,
        referringCompany: usePartner && partnerInfo ? partnerInfo.company || undefined : undefined,
        referralSource: usePartner ? "partner_code" : undefined,
        customerPartnerStatusConsent: usePartner ? partnerConsent : false,
        discountCode:
          path === "experts" && discountCode.trim()
            ? discountCode.trim().toUpperCase()
            : undefined,
        cityStateZip: properties.find((p) => p.id === propertyId)
          ? [properties.find((p) => p.id === propertyId)?.city, properties.find((p) => p.id === propertyId)?.state, properties.find((p) => p.id === propertyId)?.zip].filter(Boolean).join(", ")
          : undefined,
      });
      if (!created.ok || !created.job) {
        setError(created.message || "Could not submit issue.");
        return;
      }
      try {
        sessionStorage.removeItem("fixbridge-partner-intake");
        // Keep code applied for this session in case they file another job;
        // clear intake flag only.
      } catch {
        // ignore
      }
      setActiveJob(created.job);
      setStep("assessment");
      const assessed = await assessManagedJob(created.job.id);
      if (!assessed.ok || !assessed.job) {
        setAssessmentMsg(assessed.message || "Assessment failed — you can still request a professional.");
        setActiveJob(created.job);
      } else {
        setActiveJob(assessed.job);
        setAssessmentMsg(assessed.pricing?.message || null);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function goToExperts() {
    if (!description.trim()) {
      setError("Please describe the issue first.");
      return;
    }
    setError(null);
    setStep("experts");
  }

  async function payFee() {
    if (!activeJob) return;
    setBusy(true);
    try {
      const r = await payDispatchFee(activeJob.id);
      if (!r.ok) {
        setError(r.message || "Payment failed.");
        return;
      }
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setActiveJob(r.job || activeJob);
      setStep("intake");
      setTab("jobs");
      setSelectedJobId(r.job?.id || activeJob.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addProperty(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createProperty({
        addressLine1: newAddress,
        city: newCity,
        state: newState,
        zip: newZip,
        label: newAddress,
      });
      if (r.ok) {
        setNewAddress("");
        setNewCity("");
        setNewZip("");
        await refresh();
      } else {
        setError(r.message || "Could not save property.");
      }
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
          <p className="text-xs text-muted-foreground">Homeowner · {user.name}</p>
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
              <p className="text-xs text-muted-foreground">Homeowner · {user.name}</p>
            </div>
            {sidebarNav}
            <div className="mt-auto border-t border-border p-3">
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
            <p className="mt-1 text-xs text-muted-foreground">Homeowner · {user.name}</p>
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
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {tab === "report" && (
          <section className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Report an Issue</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a category, describe the problem, then get an AI assessment or request expert handling.
              </p>
            </div>

            {step === "intake" && (
              <div className="space-y-5 rounded-lg border border-border bg-card p-4 sm:p-5">
                <div>
                  <p className="mb-3 text-sm font-medium">Category</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {CATEGORIES.map((c) => {
                      const selected = category === c.name;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setCategory(c.name)}
                          className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                            selected
                              ? "border-[#FF4D1C] bg-[#FF4D1C]/10 ring-2 ring-[#FF4D1C]/40"
                              : "border-border hover:border-[#FF4D1C]/50 hover:bg-muted/40"
                          }`}
                        >
                          <img
                            src={c.icon}
                            alt=""
                            className={`h-14 w-14 object-contain transition-transform ${selected ? "scale-110" : ""}`}
                          />
                          <span className={`text-sm font-medium ${selected ? "text-[#FF4D1C]" : ""}`}>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Describe the issue</span>
                  <textarea
                    required
                    rows={4}
                    className="rounded-md border border-border bg-background px-3 py-2"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's happening? When did it start?"
                  />
                </label>

                <div>
                  <p className="mb-1.5 text-sm font-medium">Upload photo / video</p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-8 text-sm hover:bg-muted"
                  >
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    {mediaDataUrl ? (
                      <span className="text-[#FF4D1C]">Media attached — tap to replace</span>
                    ) : (
                      <span className="text-muted-foreground">Tap to upload a photo or video</span>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
                  {mediaDataUrl && mediaType === "image" && (
                    <img src={mediaDataUrl} alt="Issue preview" className="mt-3 max-h-48 rounded-md border border-border object-contain" />
                  )}
                </div>

                {properties.length > 0 && (
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Property <span className="font-normal text-muted-foreground">(optional)</span></span>
                    <select
                      className="rounded-md border border-border bg-background px-3 py-2"
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Select property</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label || p.addressLine1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm font-semibold">Referral</p>
                  <div className="space-y-3">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Referral code</span>
                      <input
                        className="rounded-md border border-border bg-background px-3 py-2 font-mono uppercase tracking-wide"
                        value={partnerCode}
                        onChange={(e) => setPartnerCode(normalizePartnerCodeInput(e.target.value))}
                        placeholder="Partner referral code"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    {partnerLookingUp && partnerCode.trim() ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up…
                      </p>
                    ) : partnerInfo ? (
                      <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3 text-sm">
                        <p className="flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
                          <CheckCircle className="h-4 w-4" /> Referral applied
                        </p>
                        <p className="mt-1">
                          {partnerInfo.name}
                          {partnerInfo.company ? ` · ${partnerInfo.company}` : ""}
                        </p>
                        <label className="mt-3 flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={partnerConsent}
                            onChange={(e) => setPartnerConsent(e.target.checked)}
                          />
                          <span>Share approved status updates with this partner (no pricing or payment details).</span>
                        </label>
                      </div>
                    ) : partnerCode.trim() ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Code will be applied on submit.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Optional — from your referring partner.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void submitIssue("ai")}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#FF4D1C] px-4 py-3.5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    1. Get AI assessment
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={goToExperts}
                    className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#FF4D1C] bg-transparent px-4 py-3.5 text-sm font-medium text-[#FF4D1C] hover:bg-[#FF4D1C]/10 disabled:opacity-60"
                  >
                    <HardHat className="h-4 w-4" />
                    2. Experts handling it
                  </button>
                </div>
              </div>
            )}

            {step === "experts" && (
              <motion.form
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void submitIssue("experts");
                }}
                className="relative overflow-hidden rounded-2xl border border-[#FF4D1C]/20 bg-gradient-to-br from-[#FFF7F3] via-card to-[#F3FAF8] p-4 shadow-[0_18px_50px_-28px_rgba(255,77,28,0.45)] sm:p-6 dark:from-[#2a1812] dark:via-card dark:to-[#142a28]"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#FF4D1C]/15 blur-3xl"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl"
                  aria-hidden
                />

                <button
                  type="button"
                  onClick={() => setStep("intake")}
                  className="relative inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>

                <div className="relative mt-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF4D1C]">
                      Dispatch preferences
                    </p>
                    <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl tracking-wide sm:text-3xl">
                      Experts handling it
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Tell us your preferred timing so we can dispatch a verified professional.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-[#FF4D1C]/25 bg-white/70 px-3 py-2 text-xs font-medium text-[#FF4D1C] backdrop-blur dark:bg-black/20">
                    <HardHat className="h-4 w-4" />
                    Verified pros only
                  </div>
                </div>

                {/* Progress dots */}
                <div className="relative mt-5 flex items-center gap-2">
                  {["Timing", "Window", "Date", "Property"].map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#FF4D1C] text-[11px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{label}</span>
                      {i < 3 && <span className="mx-1 hidden h-px w-6 bg-[#FF4D1C]/30 sm:block" />}
                    </div>
                  ))}
                </div>

                {/* Service timing */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="text-sm font-semibold">Preferred service timing</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {SERVICE_TIMING_OPTIONS.map((opt) => {
                      const selected = serviceTiming === opt.value;
                      const Icon = opt.icon;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setServiceTiming(opt.value)}
                          aria-pressed={selected}
                          className={`group relative overflow-hidden rounded-xl border px-4 py-4 text-left transition ${
                            selected
                              ? "border-[#FF4D1C] bg-[#FF4D1C] text-white shadow-[0_12px_28px_-16px_rgba(255,77,28,0.9)]"
                              : "border-border/80 bg-white/80 hover:border-[#FF4D1C]/45 hover:bg-white dark:bg-background/60"
                          }`}
                        >
                          <Icon className={`mb-3 h-5 w-5 ${selected ? "text-white" : "text-[#FF4D1C]"}`} />
                          <p className="text-sm font-semibold leading-snug">{opt.label}</p>
                          <p className={`mt-1 text-xs leading-snug ${selected ? "text-white/85" : "text-muted-foreground"}`}>
                            {opt.hint}
                          </p>
                          <AnimatePresence>
                            {selected && (
                              <motion.span
                                initial={{ scale: 0.6, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute right-3 top-3"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Time window timeline */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-[#FF4D1C]" />
                    Preferred time window
                  </legend>
                  <div className="rounded-xl border border-border/70 bg-white/70 p-3 dark:bg-background/50">
                    <div className="mb-3 flex justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Morning</span>
                      <span>Evening</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {TIME_WINDOW_OPTIONS.map((opt, idx) => {
                        const selected = preferredTimeSlot === opt.value;
                        return (
                          <motion.button
                            key={opt.value}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setPreferredTimeSlot(opt.value)}
                            aria-pressed={selected}
                            className={`relative rounded-lg px-2 py-3 text-center transition ${
                              selected
                                ? "bg-[#FF4D1C] text-white"
                                : "bg-muted/60 hover:bg-[#FF4D1C]/10"
                            }`}
                          >
                            <span className="block text-[10px] font-medium uppercase tracking-wide opacity-80">
                              {opt.period}
                            </span>
                            <span className="mt-0.5 block text-sm font-semibold tabular-nums">{opt.label}</span>
                            {selected && (
                              <motion.span
                                layoutId="time-window-glow"
                                className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-white/70"
                              />
                            )}
                            {!selected && idx < TIME_WINDOW_OPTIONS.length - 1 && (
                              <span className="pointer-events-none absolute -right-1 top-1/2 hidden h-px w-2 -translate-y-1/2 bg-border sm:block" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </fieldset>

                {/* Preferred date */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-[#FF4D1C]" />
                    Preferred date
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Tomorrow", value: addDaysFromToday(1) },
                      { label: "In 2 days", value: addDaysFromToday(2) },
                      { label: "This weekend", value: nextWeekendDate() },
                      { label: "Next week", value: addDaysFromToday(7) },
                    ].map((chip) => {
                      const selected = preferredDate === chip.value;
                      return (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => setPreferredDate(chip.value)}
                          className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                            selected
                              ? "bg-[#FF4D1C] text-white"
                              : "border border-border bg-white/80 text-foreground hover:border-[#FF4D1C]/40 dark:bg-background/60"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="relative block">
                    <span className="sr-only">Pick a date</span>
                    <input
                      type="date"
                      min={toDateInputValue(new Date())}
                      className="w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm tabular-nums outline-none transition focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20 dark:bg-background/60"
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                    />
                  </label>
                  <AnimatePresence mode="wait">
                    {preferredDate ? (
                      <motion.p
                        key={preferredDate}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-medium text-[#FF4D1C]"
                      >
                        Selected · {formatDisplayDate(preferredDate)}
                      </motion.p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Optional — leave blank if your date is flexible.</p>
                    )}
                  </AnimatePresence>
                </fieldset>

                {/* Property purpose */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="text-sm font-semibold">Property purpose</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PROPERTY_PURPOSE_OPTIONS.map((opt) => {
                      const selected = propertyPurpose === opt.value;
                      const Icon = opt.icon;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setPropertyPurpose(opt.value)}
                          aria-pressed={selected}
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition ${
                            selected
                              ? "border-[#FF4D1C] bg-[#FF4D1C]/10 text-foreground ring-1 ring-[#FF4D1C]/30"
                              : "border-border/80 bg-white/70 hover:border-[#FF4D1C]/35 dark:bg-background/50"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              selected ? "bg-[#FF4D1C] text-white" : "bg-muted text-[#FF4D1C]"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="font-medium leading-snug">{opt.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Project stage */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="text-sm font-semibold">Project stage</legend>
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {PROJECT_STAGE_OPTIONS.map((opt, i) => {
                      const selected = transactionStage === opt.value;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setTransactionStage(opt.value)}
                          aria-pressed={selected}
                          className={`relative flex min-w-[9.5rem] shrink-0 flex-col gap-1 rounded-xl border px-3 py-3 text-left transition ${
                            selected
                              ? "border-[#FF4D1C] bg-[#FF4D1C] text-white"
                              : "border-border/80 bg-white/70 hover:border-[#FF4D1C]/35 dark:bg-background/50"
                          }`}
                        >
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${selected ? "text-white/75" : "text-muted-foreground"}`}>
                            Step {i + 1}
                          </span>
                          <span className="text-sm font-medium leading-snug">{opt.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Discount code */}
                <fieldset className="relative mt-7 space-y-3">
                  <legend className="flex items-center gap-2 text-sm font-semibold">
                    <DollarSign className="h-4 w-4 text-[#FF4D1C]" />
                    Discount code
                  </legend>
                  <div className="rounded-xl border border-border/70 bg-white/70 p-4 dark:bg-background/50">
                    <label className="grid gap-1.5 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">Promo / discount code</span>
                      <input
                        className="rounded-xl border border-border bg-white/90 px-4 py-3 font-mono uppercase tracking-wide outline-none transition focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20 dark:bg-background/60"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(normalizeDiscountCodeInput(e.target.value))}
                        placeholder="Enter code"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <div className="mt-3">
                      {discountLookingUp && discountCode.trim() ? (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up…
                        </p>
                      ) : discountInfo ? (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl border border-[#FF4D1C]/30 bg-[#FF4D1C]/10 p-3 text-sm"
                        >
                          <p className="flex items-center gap-1.5 font-medium text-[#FF4D1C]">
                            <CheckCircle className="h-4 w-4" /> Discount applied automatically
                          </p>
                          <p className="mt-1 font-semibold">{discountInfo.summary}</p>
                          {discountInfo.label && (
                            <p className="mt-0.5 text-muted-foreground">{discountInfo.label}</p>
                          )}
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{discountInfo.code}</p>
                        </motion.div>
                      ) : discountCode.trim() ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {discountMessage || "Code saved — will try to apply on submit."}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Optional — % or $ off the customer estimate.</p>
                      )}
                    </div>
                  </div>
                </fieldset>

                {/* Live summary */}
                <motion.div
                  layout
                  className="relative mt-7 rounded-xl border border-[#FF4D1C]/20 bg-white/80 px-4 py-3 text-sm dark:bg-background/60"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Your dispatch plan
                  </p>
                  <p className="mt-1.5 leading-relaxed">
                    <span className="font-semibold text-[#FF4D1C]">
                      {SERVICE_TIMING_OPTIONS.find((o) => o.value === serviceTiming)?.label}
                    </span>
                    {" · "}
                    {TIME_WINDOW_OPTIONS.find((o) => o.value === preferredTimeSlot)?.label}
                    {preferredDate ? ` · ${formatDisplayDate(preferredDate)}` : " · date flexible"}
                    {" · "}
                    {PROPERTY_PURPOSE_OPTIONS.find((o) => o.value === propertyPurpose)?.label}
                    {" · "}
                    {PROJECT_STAGE_OPTIONS.find((o) => o.value === transactionStage)?.label}
                    {discountInfo
                      ? ` · ${discountInfo.summary}`
                      : discountCode.trim()
                        ? ` · code ${discountCode.trim().toUpperCase()}`
                        : ""}
                  </p>
                </motion.div>

                <button
                  type="submit"
                  disabled={busy}
                  className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-3.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardHat className="h-4 w-4" />}
                  Continue to assessment &amp; dispatch
                </button>
              </motion.form>
            )}

            {step === "assessment" && activeJob && (
              <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => setStep("intake")}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Report another issue
                </button>
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-[#FF4D1C]" />
                  <div>
                    <h2 className="text-lg font-semibold">Assessment</h2>
                    <p className="text-sm text-muted-foreground">{activeJob.aiAssessment?.disclaimer}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{activeJob.aiAssessment?.summary || "Assessment saved."}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-muted-foreground">Urgency</p>
                    <p className="font-medium capitalize">{activeJob.aiAssessment?.urgency || "—"}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-muted-foreground">Trade</p>
                    <p className="font-medium">{activeJob.aiAssessment?.recommended_trade || "—"}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="font-medium">
                      {activeJob.aiAssessment?.confidence != null
                        ? `${Math.round(activeJob.aiAssessment.confidence * 100)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
                {(activeJob.aiAssessment?.immediate_safety_steps?.length || 0) > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-medium">Safety steps</p>
                    <ul className="mt-1 list-disc pl-5">
                      {activeJob.aiAssessment?.immediate_safety_steps?.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rounded-md border border-border p-4">
                  <p className="text-sm text-muted-foreground">Estimated {brand.productName} service range</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{moneyRange(activeJob)}</p>
                  {activeJob.discountCode && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FF4D1C]/10 px-2.5 py-1 text-xs font-medium text-[#FF4D1C]">
                      <CheckCircle className="h-3.5 w-3.5" />
                      {activeJob.discountSummary || activeJob.discountCode} applied
                      {activeJob.discountAmountLow != null && activeJob.discountAmountHigh != null
                        ? ` (−${formatMoney(activeJob.discountAmountLow)}–${formatMoney(activeJob.discountAmountHigh)})`
                        : ""}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {assessmentMsg ||
                      activeJob.pricingDisclaimer ||
                      "Includes coordination and platform costs. Not a binding quote until you approve a proposal."}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{activeJob.preferredTimeNote}</p>
                </div>
                {activeJob.aiAssessment?.safe_diy_allowed && (
                  <div className="rounded-md border border-border p-3 text-sm">
                    <p className="font-medium">DIY may be allowed</p>
                    <ul className="mt-2 list-decimal pl-5">
                      {(activeJob.aiAssessment.diy_steps || []).map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void payFee()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#FF4D1C] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  Pay Service Assessment &amp; Dispatch fee
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "jobs" && (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold">My Jobs</h1>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet. Report an issue to get started.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full rounded-lg border p-3 text-left ${
                        selectedJobId === job.id ? "border-[#FF4D1C] bg-card" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{job.title || job.category}</p>
                        <span className="text-xs text-muted-foreground">{job.bookingId}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{STATUS_LABELS[job.status] || job.status}</p>
                      <p className="mt-1 text-sm tabular-nums">{moneyRange(job)}</p>
                    </button>
                  ))}
                </div>
                {selectedJob && (
                  <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-lg font-semibold">{selectedJob.title}</h2>
                    <p className="text-sm">{STATUS_LABELS[selectedJob.status] || selectedJob.status}</p>
                    <p className="text-sm text-muted-foreground">{selectedJob.description}</p>
                    <p className="text-sm tabular-nums">Estimate: {moneyRange(selectedJob)}</p>

                    {["awaiting_service_payment", "ai_review_complete"].includes(selectedJob.status) && (
                      <button
                        type="button"
                        className="rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await payDispatchFee(selectedJob.id);
                          await refresh();
                          setBusy(false);
                        }}
                      >
                        Pay dispatch fee
                      </button>
                    )}

                    {proposal && ["proposal_sent", "awaiting_customer_approval", "approved"].includes(selectedJob.status) && (
                      <div className="rounded-md border border-border p-3 text-sm">
                        <p className="font-medium">Retail proposal</p>
                        <p className="mt-1 tabular-nums text-lg font-semibold">{formatMoney(proposal.retailAmount)}</p>
                        <p className="mt-1 text-muted-foreground">{proposal.scopeSummary}</p>
                        {proposal.status !== "approved" && (
                          <button
                            type="button"
                            className="mt-3 rounded-md bg-[#FF4D1C] px-3 py-2 text-white"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              await approveProposal(selectedJob.id);
                              await refresh();
                              setBusy(false);
                            }}
                          >
                            Approve proposal
                          </button>
                        )}
                        {["approved", "awaiting_customer_approval", "proposal_sent"].includes(selectedJob.status) && proposal.status === "approved" && (
                          <button
                            type="button"
                            className="mt-3 ml-2 rounded-md border border-border px-3 py-2"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              await payRetail(selectedJob.id);
                              await refresh();
                              setBusy(false);
                            }}
                          >
                            Pay now
                          </button>
                        )}
                      </div>
                    )}

                    {selectedJob.status === "customer_review_pending" && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await confirmCompletion(selectedJob.id);
                          await refresh();
                          setBusy(false);
                        }}
                      >
                        <CheckCircle className="h-4 w-4" /> Confirm completion
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "properties" && (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold">Properties</h1>
            <form onSubmit={addProperty} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
              <input required placeholder="Street address" className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
              <input placeholder="City" className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
              <input placeholder="State" className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newState} onChange={(e) => setNewState(e.target.value)} />
              <input placeholder="ZIP" className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={newZip} onChange={(e) => setNewZip(e.target.value)} />
              <button type="submit" disabled={busy} className="rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white md:col-span-2">
                Add property
              </button>
            </form>
            <div className="space-y-2">
              {properties.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{p.label || p.addressLine1}</p>
                  <p className="text-muted-foreground">
                    {[p.addressLine1, p.city, p.state, p.zip].filter(Boolean).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "profile" && (
          <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
            <h1 className="text-2xl font-semibold">Profile</h1>
            <p><span className="text-muted-foreground">Name:</span> {user.name}</p>
            <p><span className="text-muted-foreground">Email:</span> {user.email}</p>
            <p className="text-muted-foreground">Managed service jobs use confidential contractor net pricing. You only see {brand.productName} retail amounts.</p>
          </section>
        )}
        </main>
      </div>
    </div>
  );
}
