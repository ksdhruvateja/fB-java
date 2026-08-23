import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Home, PlusCircle, LogOut, Sun, Moon, Menu, X,
  Loader2, ImagePlus, ShieldAlert, AlertTriangle, CheckCircle, DollarSign, Sparkles, HardHat, ArrowLeft, ArrowRight,
  CalendarDays, Clock, Zap, Building2, KeyRound, Hammer, Store, BadgeCheck,
  Send, MessageSquare, Bot, Volume2, VolumeX, Star, Search, LayoutDashboard, Wrench, Shield,
  FileText, CreditCard, Headphones, Settings, HelpCircle, Mic, Camera, Droplets, Wind, Bug, History,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { AuthUser } from "./auth";
import { chatWithAi, type ChatMessage } from "./geminiAssessment";
import { brand } from "../config/brand";
import { BrandLogo } from "./BrandLogo";
import { StarRating, fileToReviewImage, MAX_REVIEW_IMAGES } from "./StarRating";
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
  updatePropertyHealth,
  type ManagedJob,
  type Property,
  type Proposal,
} from "./managedJobs";
import { listPlans, startSubscription } from "./platformApi";
import {
  HOMEOWNER_AREA_DEFAULT_SERVICE,
  HOMEOWNER_AREA_ICONS,
  HOMEOWNER_AREAS,
  jobTitleForHomeowner,
  servicesForArea,
  type HomeownerArea,
  type HomeownerService,
} from "./homeownerCategories";
import {
  REQUEST_SYSTEM_OPTIONS,
  normalizeHealthProfile,
  type PropertyHealthProfile,
} from "./homeownerPropertyHealth";
import HomeownerOverview from "./HomeownerOverview";
import HomeownerHealthPanel from "./HomeownerHealthPanel";
import ServiceTrackingCard from "./ServiceTrackingCard";
import HomeownerPropertyPage, { DEFAULT_HOME_SYSTEMS } from "./HomeownerPropertyPage";
import HomeownerMaintenanceTimeline from "./HomeownerMaintenanceTimeline";
import HomeownerServiceHistory from "./HomeownerServiceHistory";

function formatChatMessage(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#+\s+/gm, "") // strip markdown headers
    .replace(/\*\*/g, "");   // strip markdown bolding
}

type DashTab =
  | "overview"
  | "property"
  | "report"
  | "jobs"
  | "maintenance"
  | "timeline"
  | "protection"
  | "health"
  | "documents"
  | "payments"
  | "history"
  | "messages"
  | "assistant"
  | "settings"
  | "help"
  | "properties"
  | "profile";

type ReportStep = "intake" | "experts" | "assessment";
type IntakePhase = "whats" | "details";

const NAV_SECTIONS: {
  label?: string;
  items: { id: DashTab; label: string; icon: React.ElementType }[];
}[] = [
  {
    items: [{ id: "overview", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Home",
    items: [
      { id: "property", label: "My Property", icon: Home },
      { id: "jobs", label: "Service Requests", icon: Wrench },
      { id: "maintenance", label: "Maintenance", icon: CalendarDays },
      { id: "timeline", label: "Maintenance Timeline", icon: History },
      { id: "protection", label: "Home Protection", icon: Shield },
      { id: "health", label: "Property Health", icon: Sparkles },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "documents", label: "Documents", icon: FileText },
      { id: "payments", label: "Payments", icon: CreditCard },
      { id: "history", label: "Service History", icon: History },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "messages", label: "Messages", icon: MessageSquare },
      { id: "assistant", label: "FixBridge Assistant", icon: Headphones },
    ],
  },
];

const FOOTER_NAV: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "help", label: "Help & Support", icon: HelpCircle },
];

const REQUEST_ICONS: Record<string, React.ElementType> = {
  droplet: Droplets,
  zap: Zap,
  wind: Wind,
  refrigerator: Home,
  hammer: Hammer,
  bug: Bug,
  home: Home,
  more: PlusCircle,
};

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
    // not a URL
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
  onUserUpdated,
}: {
  onLogout: () => void;
  user: AuthUser;
  isDark: boolean;
  onToggleDark: () => void;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const [tab, setTab] = useState<DashTab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [jobs, setJobs] = useState<ManagedJob[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<ReportStep>("intake");
  const [intakePhase, setIntakePhase] = useState<IntakePhase>("whats");
  const [requestSystemId, setRequestSystemId] = useState<string>("");
  const [issueArea, setIssueArea] = useState<HomeownerArea | "">("");
  const [category, setCategory] = useState<HomeownerService | "">("");
  const [areaSearch, setAreaSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [description, setDescription] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const voiceBaseRef = useRef("");
  const voiceRecRef = useRef<{ stop: () => void } | null>(null);
  const [assessmentMode, setAssessmentMode] = useState<"expert" | "diy">("diy");
  const [proPlan, setProPlan] = useState<{ amount: number } | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user.name);
  const [editEmail, setEditEmail] = useState(user.email);
  const [editPhone, setEditPhone] = useState(user.phone || "");
  const [editGender, setEditGender] = useState(user.gender || "");
  const [editDob, setEditDob] = useState(user.dob || "");
  const [editPhotoDataUrl, setEditPhotoDataUrl] = useState<string | null>(user.photoDataUrl || null);

  useEffect(() => {
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPhone(user.phone || "");
    setEditGender(user.gender || "");
    setEditDob(user.dob || "");
    setEditPhotoDataUrl(user.photoDataUrl || null);
  }, [user]);

  const [propertyId, setPropertyId] = useState<number | "">("");
  const [showZipPromptPropertyId, setShowZipPromptPropertyId] = useState<number | null>(null);
  const [zipPromptInput, setZipPromptInput] = useState("");
  const [zipPromptAction, setZipPromptAction] = useState<"ai" | "experts" | null>(null);

  const [showAddressPromptPropertyId, setShowAddressPromptPropertyId] = useState<number | null>(null);
  const [addressPromptLine1, setAddressPromptLine1] = useState("");
  const [addressPromptLine2, setAddressPromptLine2] = useState("");
  const [addressPromptCity, setAddressPromptCity] = useState("");
  const [addressPromptState, setAddressPromptState] = useState("");
  const [addressPromptZip, setAddressPromptZip] = useState("");
  const [addressPromptJobId, setAddressPromptJobId] = useState<number | null>(null);
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);
  const [modalAddressLine1, setModalAddressLine1] = useState("");
  const [modalCity, setModalCity] = useState("");
  const [modalState, setModalState] = useState("");
  const [modalZip, setModalZip] = useState("");
  const [modalCountry, setModalCountry] = useState("US");
  const [modalActionAfterSave, setModalActionAfterSave] = useState<"ai" | "experts" | null>(null);
  const [speakingText, setSpeakingText] = useState<string | null>(null);

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
  const [showTechMessage, setShowTechMessage] = useState(false);
  const [techMessageDraft, setTechMessageDraft] = useState("");
  const [techMessageSent, setTechMessageSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Guided DIY interactive states
  const [diyIsGuided, setDiyIsGuided] = useState(false);
  const [diyStepIndex, setDiyStepIndex] = useState(0);
  const [diyCompletedSteps, setDiyCompletedSteps] = useState<Record<number, boolean>>({});

  // AI DIY Chat
  const [diyChatMessages, setDiyChatMessages] = useState<ChatMessage[]>([]);
  const [diyChatInput, setDiyChatInput] = useState("");
  const [diyChatBusy, setDiyChatBusy] = useState(false);

  useEffect(() => {
    if (activeJob) {
      setDiyChatMessages([
        {
          role: "assistant",
          content: `Hi ${user.name}! I've generated this DIY Action Plan for your ${activeJob.category || "repair"} issue. Ask me anything about the tools, materials, or steps above if you need clarification!`
        }
      ]);
    }
  }, [activeJob]);

  // New property form
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("NY");
  const [newZip, setNewZip] = useState("");
  const [newCountry, setNewCountry] = useState("US");
  const [completionRating, setCompletionRating] = useState(5);
  const [completionReview, setCompletionReview] = useState("");
  const [completionLocation, setCompletionLocation] = useState("");
  const [completionImages, setCompletionImages] = useState<string[]>([]);
  const [completionImageBusy, setCompletionImageBusy] = useState(false);
  const completionFileRef = useRef<HTMLInputElement>(null);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  useEffect(() => {
    if (tab === "jobs" && jobs.length && selectedJobId == null) {
      setSelectedJobId(jobs[0].id);
    }
  }, [tab, jobs, selectedJobId]);

  const primaryProperty = useMemo(() => properties[0] || null, [properties]);
  const healthProfile = useMemo(() => {
    const base = normalizeHealthProfile(primaryProperty?.healthProfile as PropertyHealthProfile | null);
    return {
      ...base,
      beds: primaryProperty?.beds ?? base.beds,
      baths: primaryProperty?.baths ?? base.baths,
      sqft: primaryProperty?.sqft ?? base.sqft,
    };
  }, [primaryProperty]);

  async function saveHealthProfile(propertyId: number, next: PropertyHealthProfile) {
    setBusy(true);
    setError(null);
    try {
      // Optimistic local update so Overview / Maintenance reflect changes immediately
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propertyId
            ? {
                ...p,
                healthProfile: next as Property["healthProfile"],
                beds: next.beds ?? p.beds,
                baths: next.baths ?? p.baths,
                sqft: next.sqft ?? p.sqft,
              }
            : p
        )
      );
      const r = await updatePropertyHealth(propertyId, next);
      if (!r.ok) {
        setError(r.message || "Could not save property health.");
        await refresh();
        return;
      }
      if (r.property) {
        setProperties((prev) => prev.map((p) => (p.id === propertyId ? { ...p, ...r.property! } : p)));
      } else {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addHealthProperty(input: {
    addressLine1: string;
    city?: string;
    state?: string;
    zip?: string;
    label?: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const r = await createProperty({
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        zip: input.zip,
        label: input.label,
        homeSystems: DEFAULT_HOME_SYSTEMS,
      });
      if (!r.ok || !r.property) {
        setError(r.message || "Could not add address.");
        return null;
      }
      await refresh();
      return r.property;
    } finally {
      setBusy(false);
    }
  }

  function openRequestService() {
    setTab("report");
    setStep("intake");
    setIntakePhase("whats");
    setMobileNav(false);
  }

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

  async function handleSaveZipAndProceed() {
    if (!showZipPromptPropertyId || !zipPromptInput.trim()) {
      alert("Please enter a valid ZIP code.");
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem("fixbridge-token");
      const res = await fetch(`/api/properties/${showZipPromptPropertyId}/zip`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ zip: zipPromptInput.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || "Failed to save ZIP code.");
        return;
      }
      
      await refresh();
      
      const action = zipPromptAction;
      setShowZipPromptPropertyId(null);
      setZipPromptInput("");
      setZipPromptAction(null);
      if (action) {
        await submitIssue(action);
      }
    } catch (e: any) {
      alert(e.message || "Failed to save ZIP code.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAddressAndProceed() {
    if (!showAddressPromptPropertyId) return;
    if (!addressPromptLine1.trim() || !addressPromptCity.trim() || !addressPromptState.trim() || !addressPromptZip.trim()) {
      alert("Please fill in all required address fields.");
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem("fixbridge-token");
      const res = await fetch(`/api/properties/${showAddressPromptPropertyId}/address`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          addressLine1: addressPromptLine1.trim(),
          addressLine2: addressPromptLine2.trim() || undefined,
          city: addressPromptCity.trim(),
          state: addressPromptState.trim(),
          zip: addressPromptZip.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || "Failed to update address.");
        return;
      }
      
      await refresh();
      
      const jobId = addressPromptJobId;
      setShowAddressPromptPropertyId(null);
      setAddressPromptJobId(null);
      
      if (jobId) {
        const r = await payDispatchFee(jobId);
        if (r.ok && r.url) {
          window.location.href = r.url;
        } else if (r.ok) {
          await refresh();
        } else {
          alert(r.message || "Payment failed.");
        }
      }
    } catch (e: any) {
      alert(e.message || "Failed to update address.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAddressModal() {
    if (!modalAddressLine1.trim() || !modalCity.trim() || !modalState.trim() || !modalZip.trim()) {
      alert("Please fill in all address details.");
      return;
    }
    setBusy(true);
    try {
      const r = await createProperty({
        addressLine1: modalAddressLine1.trim(),
        city: modalCity.trim(),
        state: modalState.trim(),
        zip: modalZip.trim(),
        country: modalCountry.trim() || "US",
        streetAddress: modalAddressLine1.trim(),
        label: modalAddressLine1.trim(),
        homeSystems: DEFAULT_HOME_SYSTEMS,
      });
      if (r.ok && r.property) {
        // Select the newly added property
        const newPropId = r.property.id;
        setPropertyId(newPropId);
        
        await refresh();
        
        const action = modalActionAfterSave;
        setShowAddAddressModal(false);
        setModalActionAfterSave(null);
        if (action) {
          if (action === "ai") {
            await submitIssue("ai");
          } else if (action === "experts") {
            setError(null);
            setStep("experts");
          }
        }
      } else {
        alert(r.message || "Could not save property.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to save property.");
    } finally {
      setBusy(false);
    }
  }

  function speakText(text: string) {
    if ("speechSynthesis" in window) {
      if (speakingText) {
        window.speechSynthesis.cancel();
        if (speakingText === text) {
          setSpeakingText(null);
          return;
        }
      }
      
      const plainText = text
        .replace(/\*\*+/g, "")
        .replace(/\*+/g, "")
        .replace(/`+/g, "")
        .replace(/#+/g, "");

      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.onend = () => setSpeakingText(null);
      utterance.onerror = () => setSpeakingText(null);
      setSpeakingText(text);
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in this browser.");
    }
  }

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    void refresh();
    void listPlans().then((r) => {
      if (r.ok && Array.isArray(r.plans)) {
        const found = r.plans.find((p) => p.code === "pro_membership");
        if (found) setProPlan(found);
      }
    });

    try {
      const guestJobId = localStorage.getItem("fixbridge-guest-job-id");
      if (guestJobId) {
        setSelectedJobId(Number(guestJobId));
        setTab("jobs");
        localStorage.removeItem("fixbridge-guest-job-id");
      }

      const stripeJobId = sessionStorage.getItem("fixbridge-stripe-active-job-id");
      if (stripeJobId) {
        setSelectedJobId(Number(stripeJobId));
        setTab("jobs");
        sessionStorage.removeItem("fixbridge-stripe-active-job-id");
      }
    } catch {
      // ignore
    }
  }, []);

  async function handleSubscribe(jobId?: number) {
    setBusy(true);
    try {
      const r = await startSubscription("pro_membership", jobId);
      if (!r.ok) {
        setError(r.message || "Failed to start subscription.");
        return;
      }
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      if (r.simulated) {
        if (onUserUpdated && user) {
          onUserUpdated({ ...user, planCode: "pro_membership" });
        }
      }
    } catch (e: any) {
      setError(e.message || "Could not complete subscription.");
    } finally {
      setBusy(false);
    }
  }

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
    if (!issueArea) {
      alert("Please select where the issue is (Kitchen, Bathroom, etc.).");
      setError("Please select where the issue is.");
      return;
    }
    if (!category) {
      alert("Please select a service type from the dropdown.");
      setError("Please select a service type.");
      return;
    }
    if (!description.trim()) {
      alert("Please describe the issue first.");
      setError("Please describe the issue first.");
      return;
    }

    if (!propertyId) {
      setModalAddressLine1("");
      setModalCity("");
      setModalState("");
      setModalZip("");
      setModalActionAfterSave(path);
      setShowAddAddressModal(true);
      return;
    }

    const prop = properties.find((p) => p.id === propertyId);
    if (!prop) {
      alert("Property not found. Please select a valid property.");
      return;
    }

    if (!prop.zip || !prop.zip.trim()) {
      // Prompt for ZIP code
      setShowZipPromptPropertyId(prop.id);
      setZipPromptInput("");
      setZipPromptAction(path);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const code = partnerCode.trim().toUpperCase();
      const usePartner = Boolean(code);
      const created = await createManagedJob({
        category,
        title: jobTitleForHomeowner(issueArea || category, category),
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
      // Keep assessment for DIY/hire choice; tracking is one click away
      setSelectedJobId(created.job.id);
    } finally {
      setBusy(false);
    }
  }

  function goToExperts() {
    if (!description.trim()) {
      alert("Please describe the issue first.");
      setError("Please describe the issue first.");
      return;
    }
    if (!propertyId) {
      setModalAddressLine1("");
      setModalCity("");
      setModalState("");
      setModalZip("");
      setModalActionAfterSave("experts");
      setShowAddAddressModal(true);
      return;
    }
    const prop = properties.find((p) => p.id === propertyId);
    if (!prop) {
      alert("Property not found. Please select a valid property.");
      return;
    }
    if (!prop.zip || !prop.zip.trim()) {
      setShowZipPromptPropertyId(prop.id);
      setZipPromptInput("");
      setZipPromptAction("experts");
      return;
    }
    setError(null);
    setStep("experts");
  }

  async function payFee() {
    if (!activeJob) return;
    const prop = properties.find((p) => p.id === activeJob.propertyId);
    if (prop) {
      const isMissingAddress = !prop.addressLine1?.trim() || !prop.city?.trim() || !prop.state?.trim() || !prop.zip?.trim();
      if (isMissingAddress) {
        setShowAddressPromptPropertyId(prop.id);
        setAddressPromptLine1(prop.addressLine1 || "");
        setAddressPromptLine2(prop.addressLine2 || "");
        setAddressPromptCity(prop.city || "");
        setAddressPromptState(prop.state || "");
        setAddressPromptZip(prop.zip || "");
        setAddressPromptJobId(activeJob.id);
        return;
      }
    }
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
        country: newCountry,
        streetAddress: newAddress,
        label: newAddress,
        homeSystems: DEFAULT_HOME_SYSTEMS,
      });
      if (r.ok) {
        setNewAddress("");
        setNewCity("");
        setNewZip("");
        setNewCountry("US");
        await refresh();
      } else {
        setError(r.message || "Could not save property.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendDiyChatMessage() {
    if (!diyChatInput.trim() || !activeJob) return;
    const text = diyChatInput.trim();
    setDiyChatInput("");
    setDiyChatBusy(true);

    const newUserMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...diyChatMessages, newUserMessage];
    setDiyChatMessages(updatedMessages);

    try {
      const category = activeJob.category || "general";
      const desc = activeJob.description || "";
      const tools = (activeJob.aiAssessment?.tools_required || []).join(", ") || "None";
      const materials = (activeJob.aiAssessment?.materials_needed || []).join(", ") || "None";
      const steps = (activeJob.aiAssessment?.diy_steps || []).map((s, idx) => `${idx + 1}. ${s}`).join("\n") || "No steps generated.";

      const systemContext: ChatMessage = {
        role: "user",
        content: `Instructions: You are a friendly, helpful home-repair AI coach helping the homeowner clarify the step-by-step DIY Action Plan generated for their issue.
Here is the context of the repair issue they are trying to solve:
- Category: ${category}
- Description: "${desc}"
- Required Tools: ${tools}
- Materials Needed: ${materials}

Instructions/Steps:
${steps}

Your role is to answer questions about these steps, tools, and materials. Be clear, concise, and encourage safety.
CRITICAL SAFETY INSTRUCTION: If the user describes a dangerous situation (e.g. gas leak, electrical sparks, structural collapse) or asks to do something unsafe, immediately tell them to STOP and hire a professional (using the "Hire a Professional" option in FixBridge).`
      };

      const ackContext: ChatMessage = {
        role: "assistant",
        content: "Understood. I will act as their home-repair AI coach and help them clarify the steps safely."
      };

      const payloadMessages = [systemContext, ackContext, ...updatedMessages];
      const result = await chatWithAi(payloadMessages);

      if (result.reply) {
        setDiyChatMessages([...updatedMessages, { role: "assistant", content: result.reply }]);
      } else {
        setDiyChatMessages([...updatedMessages, { role: "assistant", content: result.error || "Sorry, I encountered an error. Please try again." }]);
      }
    } catch (err) {
      setDiyChatMessages([...updatedMessages, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setDiyChatBusy(false);
    }
  }

  const sidebarNav = (
    <nav className="flex flex-col gap-4 p-3">
      <div className="px-2 pb-1">
        <p className="[font-family:'Barlow_Condensed',sans-serif] text-xl font-black uppercase tracking-tight text-foreground">
          {brand.productName}
        </p>
      </div>
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.label || `top-${si}`} className="space-y-1">
          {section.label ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "property") setTab("properties");
                else setTab(item.id);
                setMobileNav(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                tab === item.id || (item.id === "property" && (tab === "properties" || tab === "property"))
                  ? "bg-[#FF4D1C] text-white shadow-sm"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="mx-2 border-t border-border" />
      <div className="space-y-1">
        {FOOTER_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "settings") setTab("profile");
              else setTab(item.id);
              setMobileNav(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              tab === item.id || (item.id === "settings" && tab === "profile")
                ? "bg-[#FF4D1C] text-white"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );

  const comingSoon = (title: string, blurb: string) => (
    <section className="mx-auto max-w-2xl rounded-[1.5rem] border border-dashed border-border bg-card/80 px-6 py-12 text-center">
      <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
      <button
        type="button"
        onClick={openRequestService}
        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
      >
        <PlusCircle size={16} /> Request Service
      </button>
    </section>
  );

  const goProPromoCard = user.planCode !== "pro_membership" && (
    <div className="mx-3.5 my-3 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 text-center shadow-[0_4px_16px_-6px_rgba(245,158,11,0.25)] relative overflow-hidden">
      <div className="absolute -right-8 -top-8 h-16 w-16 rounded-full bg-amber-500/10 blur-xl" />
      <div className="absolute -left-8 -bottom-8 h-16 w-16 rounded-full bg-teal-500/5 blur-xl" />
      <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-pulse" /> Pro Member
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
        Unlock AI DIY Action Plans, step checklists & safety rules.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSubscribe(selectedJobId || undefined)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2 text-xs font-semibold text-white shadow hover:brightness-105 active:scale-[0.98] transition duration-200"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 fill-current" />}
        Upgrade Now
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          {user.photoDataUrl ? (
            <img src={user.photoDataUrl} alt="Avatar" className="h-9 w-9 rounded-full object-cover border border-border" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground text-sm font-bold border border-border">
              {String(user.name || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <BrandLogo variant="auth" tone="auto" className="mb-0.5" />
            <p className="text-[10px] text-muted-foreground leading-none">Homeowner · {user.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.planCode !== "pro_membership" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubscribe()}
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:brightness-105 active:scale-[0.98] transition shrink-0"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Go Pro
            </button>
          )}
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
              <BrandLogo variant="auth" tone="auto" className="mb-1" />
              <p className="text-xs text-muted-foreground">Homeowner · {user.name}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sidebarNav}
              {goProPromoCard}
            </div>
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
          <div className="border-b border-border px-4 py-4 flex items-center gap-3">
            {user.photoDataUrl ? (
              <img src={user.photoDataUrl} alt="Avatar" className="h-9 w-9 rounded-full object-cover border border-border" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground text-sm font-bold border border-border">
                {String(user.name || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <BrandLogo variant="auth" tone="auto" className="mb-0.5" />
              <p className="text-[10px] text-muted-foreground leading-none">Homeowner · {user.name}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sidebarNav}
            {goProPromoCard}
          </div>
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

        {tab === "overview" && (
          <HomeownerOverview
            userName={user.name || "there"}
            property={primaryProperty}
            health={healthProfile}
            jobs={jobs}
            onRequestService={openRequestService}
            onOpenJob={(id) => {
              setSelectedJobId(id);
              setTab("jobs");
            }}
            onOpenHealth={() => setTab("health")}
            onOpenProperty={() => setTab("properties")}
          />
        )}

        {tab === "health" && (
          <HomeownerHealthPanel
            properties={properties}
            jobs={jobs}
            busy={busy}
            onSave={saveHealthProfile}
            onAddProperty={addHealthProperty}
            onRequestService={openRequestService}
          />
        )}

        {(tab === "maintenance") && (
          <section className="mx-auto max-w-3xl space-y-4">
            <div>
              <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">
                Maintenance
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Upcoming care items from your Property Health schedule.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-border/70 bg-card divide-y divide-border">
              {properties.flatMap((p) => {
                const profile = normalizeHealthProfile(p.healthProfile as PropertyHealthProfile | null);
                return (profile.maintenance || []).map((m) => ({
                  ...m,
                  homeLabel: p.label || p.addressLine1 || `Home #${p.id}`,
                  key: `${p.id}-${m.label}-${m.dueDate}`,
                }));
              })
                .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
                .map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {[m.system || "Home", properties.length > 1 ? m.homeLabel : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {m.dueDate
                      ? new Date(`${m.dueDate}T12:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              ))}
              {properties.every((p) => {
                const profile = normalizeHealthProfile(p.healthProfile as PropertyHealthProfile | null);
                return !(profile.maintenance || []).length;
              }) && (
                <p className="px-5 py-8 text-sm text-muted-foreground">No upcoming maintenance yet. Add past services in Property Health to get AI suggestions.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setTab("timeline")}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Open Maintenance Timeline →
            </button>
          </section>
        )}

        {tab === "timeline" && (
          <HomeownerMaintenanceTimeline
            properties={properties}
            jobs={jobs}
            onOpenJob={(id) => {
              setSelectedJobId(id);
              setTab("jobs");
            }}
          />
        )}

        {tab === "protection" &&
          comingSoon(
            "Home Protection",
            "Warranty coverage and FixBridge protection plans will appear here as jobs are completed."
          )}
        {tab === "documents" &&
          comingSoon("Documents", "Invoices, warranties, and completion reports will be collected here.")}
        {tab === "payments" &&
          comingSoon("Payments", "Dispatch holds, invoices, and home spend history will show here.")}
        {tab === "history" && (
          <HomeownerServiceHistory
            jobs={jobs}
            properties={properties}
            onOpenTracking={(id) => {
              setSelectedJobId(id);
              setTab("jobs");
            }}
          />
        )}
        {tab === "messages" &&
          comingSoon("Messages", "Chat with FixBridge and your assigned contractors will land here.")}
        {tab === "assistant" &&
          comingSoon("FixBridge Assistant", "Ask about DIY steps, scheduling, and home health — coming soon.")}
        {tab === "help" &&
          comingSoon("Help & Support", "Guides and contact options for homeowners will live here.")}

        {tab === "report" && (
          <section className="mx-auto max-w-3xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
                  Request Service
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tell FixBridge what&apos;s going on — we&apos;ll analyze it and help you DIY or hire a pro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab("jobs")}
                className="text-sm font-semibold text-primary hover:underline"
              >
                View my requests →
              </button>
            </div>

            {step === "intake" && (
              <div className="space-y-5 rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
                {intakePhase === "whats" && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-lg font-semibold">What&apos;s going on?</p>
                      <p className="mt-1 text-sm text-muted-foreground">Pick the system that best matches the issue.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {REQUEST_SYSTEM_OPTIONS.map((opt) => {
                        const Icon = REQUEST_ICONS[opt.iconHint] || Wrench;
                        const selected = requestSystemId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setRequestSystemId(opt.id);
                              setIssueArea(opt.area);
                              setCategory(opt.service);
                              setServiceSearch("");
                              setError(null);
                            }}
                            className={`rounded-2xl border px-3 py-4 text-left transition ${
                              selected
                                ? "border-primary bg-primary/10 shadow-[0_8px_24px_rgba(255,77,28,0.12)]"
                                : "border-border hover:border-primary/35 hover:bg-muted/40"
                            }`}
                          >
                            <span
                              className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${
                                selected ? "bg-primary text-white" : "bg-muted text-foreground"
                              }`}
                            >
                              <Icon size={16} />
                            </span>
                            <span className="block text-sm font-semibold">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="border-t border-border pt-5">
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">Describe the problem</span>
                        <textarea
                          rows={4}
                          className={`rounded-2xl border bg-background px-4 py-3 outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10 ${
                            voiceListening ? "border-primary ring-[3px] ring-primary/15" : "border-border"
                          }`}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder={'say:\n"Water is leaking underneath my kitchen sink."'}
                        />
                        {voiceListening && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                            Listening — speak your problem…
                          </span>
                        )}
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          type SpeechRec = {
                            continuous: boolean;
                            interimResults: boolean;
                            lang: string;
                            start: () => void;
                            stop: () => void;
                            onstart: (() => void) | null;
                            onend: (() => void) | null;
                            onerror: ((ev?: { error?: string }) => void) | null;
                            onresult: ((ev: {
                              resultIndex: number;
                              results: ArrayLike<{
                                isFinal: boolean;
                                0: { transcript: string };
                              }>;
                            }) => void) | null;
                          };
                          const W = window as unknown as {
                            SpeechRecognition?: new () => SpeechRec;
                            webkitSpeechRecognition?: new () => SpeechRec;
                          };
                          const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
                          if (!SpeechRecognition) {
                            setError("Voice input isn’t supported in this browser — type the problem or add a photo.");
                            return;
                          }
                          setError(null);
                          if (voiceListening) {
                            try {
                              voiceRecRef.current?.stop();
                            } catch {
                              /* ignore */
                            }
                            voiceRecRef.current = null;
                            setVoiceListening(false);
                            return;
                          }
                          voiceBaseRef.current = description.trim();
                          const rec = new SpeechRecognition();
                          voiceRecRef.current = rec;
                          rec.continuous = true;
                          rec.interimResults = true;
                          rec.lang = "en-US";
                          rec.onstart = () => setVoiceListening(true);
                          rec.onend = () => {
                            voiceRecRef.current = null;
                            setVoiceListening(false);
                          };
                          rec.onerror = () => {
                            voiceRecRef.current = null;
                            setVoiceListening(false);
                            setError("Couldn’t capture voice. Try typing instead.");
                          };
                          rec.onresult = (ev) => {
                            let finalChunk = "";
                            let interimChunk = "";
                            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                              const piece = ev.results[i][0]?.transcript || "";
                              if (ev.results[i].isFinal) finalChunk += piece;
                              else interimChunk += piece;
                            }
                            if (finalChunk) {
                              voiceBaseRef.current = [voiceBaseRef.current, finalChunk.trim()]
                                .filter(Boolean)
                                .join(" ")
                                .trim();
                              setDescription(voiceBaseRef.current);
                            } else if (interimChunk) {
                              setDescription(
                                [voiceBaseRef.current, interimChunk.trim()].filter(Boolean).join(" ").trim()
                              );
                            }
                          };
                          try {
                            rec.start();
                          } catch {
                            setVoiceListening(false);
                            setError("Couldn’t start the microphone. Check browser permissions.");
                          }
                        }}
                        className={`inline-flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-semibold transition ${
                          voiceListening
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/20 hover:border-primary/35"
                        }`}
                      >
                        <Mic className={`h-5 w-5 ${voiceListening ? "animate-pulse text-primary" : "text-primary"}`} />
                        {voiceListening ? "Listening…" : "Tell FixBridge"}
                      </button>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-4 text-xs font-semibold transition hover:border-primary/35"
                      >
                        <Camera className="h-5 w-5 text-primary" />
                        Add Photos
                      </button>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onFile(e.target.files?.[0] || null)}
                    />
                    {mediaDataUrl && (
                      <p className="text-xs font-medium text-primary">
                        Photo attached
                        {mediaType === "image" ? (
                          <img
                            src={mediaDataUrl}
                            alt=""
                            className="mt-2 max-h-40 rounded-xl border border-border object-contain"
                          />
                        ) : null}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!requestSystemId) {
                            setError("Pick what kind of issue this is to continue.");
                            return;
                          }
                          if (!description.trim()) {
                            setError("Describe the problem so we can analyze it.");
                            return;
                          }
                          setError(null);
                          setIntakePhase("details");
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,77,28,0.25)]"
                      >
                        Continue <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {intakePhase === "details" && (
                  <div className="space-y-5">
                    <button
                      type="button"
                      onClick={() => setIntakePhase("whats")}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>

                    <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                      <p className="font-semibold">
                        {REQUEST_SYSTEM_OPTIONS.find((o) => o.id === requestSystemId)?.label || "Issue"} · {category}
                      </p>
                      <p className="mt-1 line-clamp-3 text-muted-foreground">{description}</p>
                    </div>

                <div>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium shrink-0">Where is the issue?</p>
                    <label className="relative w-full sm:max-w-[220px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={areaSearch}
                        onChange={(e) => setAreaSearch(e.target.value)}
                        placeholder="Search areas…"
                        className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                        aria-label="Search issue areas"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {HOMEOWNER_AREAS.filter((area) =>
                      !areaSearch.trim() || area.toLowerCase().includes(areaSearch.trim().toLowerCase())
                    ).map((area) => {
                      const selected = issueArea === area;
                      const Icon = HOMEOWNER_AREA_ICONS[area];
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => {
                            setIssueArea(area);
                            if (!category) setCategory(HOMEOWNER_AREA_DEFAULT_SERVICE[area]);
                            setServiceSearch("");
                          }}
                          className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                            selected
                              ? "border-[#FF4D1C] bg-[#FF4D1C]/10 ring-2 ring-[#FF4D1C]/40"
                              : "border-border hover:border-[#FF4D1C]/50 hover:bg-muted/40"
                          }`}
                        >
                          <span
                            className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-transform ${
                              selected ? "scale-110 bg-primary/15 text-primary" : "bg-muted/60 text-foreground"
                            }`}
                          >
                            <Icon size={28} color="currentColor" />
                          </span>
                          <span className={`text-sm font-medium ${selected ? "text-[#FF4D1C]" : ""}`}>{area}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {issueArea ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Refine service type (optional)</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Suggested for {issueArea} — tap to adjust.
                        </p>
                      </div>
                      <label className="relative w-full sm:max-w-[220px]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="search"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          placeholder="Search services…"
                          className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                          aria-label="Search service types"
                        />
                      </label>
                    </div>
                    {category ? (
                      <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Selected: {category}
                      </p>
                    ) : null}
                    <div className="max-h-56 overflow-y-auto rounded-2xl border border-border bg-muted/15 p-2.5">
                      <div className="flex flex-wrap gap-2">
                        {servicesForArea(issueArea)
                          .filter(
                            (svc) =>
                              !serviceSearch.trim() ||
                              svc.toLowerCase().includes(serviceSearch.trim().toLowerCase())
                          )
                          .map((svc) => {
                            const selected = category === svc;
                            return (
                              <button
                                key={svc}
                                type="button"
                                onClick={() => setCategory(svc)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                  selected
                                    ? "border-primary bg-primary text-white shadow-sm shadow-primary/25"
                                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5"
                                }`}
                              >
                                {svc}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Property Address <span className="text-red-500">*</span></span>
                  <select
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20"
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
                  <button
                    type="button"
                    onClick={() => {
                      setModalAddressLine1("");
                      setModalCity("");
                      setModalState("");
                      setModalZip("");
                      setModalActionAfterSave(null);
                      setShowAddAddressModal(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF4D1C] hover:underline self-start mt-1"
                  >
                    Add a New Address
                  </button>
                </div>

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
                    Get AI assessment
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={goToExperts}
                    className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-[#FF4D1C] bg-transparent px-4 py-3.5 text-sm font-medium text-[#FF4D1C] hover:bg-[#FF4D1C]/10 disabled:opacity-60"
                  >
                    <HardHat className="h-4 w-4" />
                    Hire a Professional
                  </button>
                </div>
                  </div>
                )}
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
                      Hire a Professional
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
              <div className="space-y-5 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("intake")}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" /> Report another issue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJobId(activeJob.id);
                      setTab("jobs");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                  >
                    Track this request →
                  </button>
                </div>

                <ServiceTrackingCard
                  job={jobs.find((j) => j.id === activeJob.id) || activeJob}
                  compact
                  onMessage={() => {
                    setSelectedJobId(activeJob.id);
                    setTab("jobs");
                    setShowTechMessage(true);
                  }}
                />

                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-[#FF4D1C]" />
                  <div>
                    <h2 className="text-lg font-semibold">Assessment</h2>
                    <p className="text-sm text-muted-foreground">{activeJob.aiAssessment?.disclaimer}</p>
                  </div>
                </div>

                {/* Mode Selector Toggle */}
                <div className="flex border-b border-border">
                  <button
                    type="button"
                    onClick={() => setAssessmentMode("diy")}
                    className={`flex-1 pb-3 text-center text-sm font-semibold border-b-2 transition ${
                      assessmentMode === "diy"
                        ? "border-[#FF4D1C] text-[#FF4D1C]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    💡 Do It Yourself (DIY)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssessmentMode("expert")}
                    className={`flex-1 pb-3 text-center text-sm font-semibold border-b-2 transition ${
                      assessmentMode === "expert"
                        ? "border-[#FF4D1C] text-[#FF4D1C]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🛠️ Hire a Professional
                  </button>
                </div>

                {activeJob.aiAssessment?.questions_needed && activeJob.aiAssessment.questions_needed.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 flex gap-3 shadow-sm">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1.5 w-full">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">Clarification Needed to Refine Estimate</p>
                      <p className="text-xs opacity-90 leading-relaxed">
                        Our AI detected potential uncertainty or mismatch in the details provided (e.g. description and photo trade categories mismatch, or extremely vague summary). Please review the following questions:
                      </p>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-amber-800 dark:text-amber-300 font-medium">
                        {activeJob.aiAssessment.questions_needed.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                      <p className="text-xs pt-1 font-medium text-amber-900 dark:text-amber-200">
                        💡 To fix, click <strong className="text-[#FF4D1C]">Report another issue</strong> above and upload a matching photo and clear description.
                      </p>
                    </div>
                  </div>
                )}

                {busy && !activeJob.aiAssessment ? (
                  <div className="space-y-6 animate-pulse py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded bg-muted-foreground/25 animate-pulse" />
                      <p className="text-sm font-semibold text-muted-foreground animate-pulse">FixBridge AI is analyzing your repair details...</p>
                    </div>
                    <div className="space-y-2 bg-muted/20 p-4 rounded-xl">
                      <div className="h-3 w-full rounded bg-muted-foreground/20" />
                      <div className="h-3 w-5/6 rounded bg-muted-foreground/20" />
                      <div className="h-3 w-4/5 rounded bg-muted-foreground/20" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                        <div className="h-2.5 w-12 rounded bg-muted-foreground/20" />
                        <div className="h-3.5 w-20 rounded bg-muted-foreground/20" />
                      </div>
                      <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                        <div className="h-2.5 w-12 rounded bg-muted-foreground/20" />
                        <div className="h-3.5 w-20 rounded bg-muted-foreground/20" />
                      </div>
                      <div className="rounded-lg bg-muted/40 p-4 space-y-2">
                        <div className="h-2.5 w-12 rounded bg-muted-foreground/20" />
                        <div className="h-3.5 w-20 rounded bg-muted-foreground/20" />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                      <div className="h-3.5 w-1/3 rounded bg-muted-foreground/20" />
                      <div className="h-2.5 w-2/3 rounded bg-muted-foreground/20" />
                      <div className="h-10 w-full rounded-xl bg-[#FF4D1C]/25" />
                    </div>
                  </div>
                ) : assessmentMode === "expert" ? (
                  <div className="space-y-4">
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
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                      <h3 className="font-semibold text-sm uppercase tracking-wider text-foreground">📋 Pricing & Dispatch Summary</h3>
                      
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Estimated Repair Cost Range:</span>
                          <span className="font-semibold tabular-nums">{moneyRange(activeJob)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Contractor Visit Fee:</span>
                          <span className="font-semibold text-foreground">
                            ${activeJob.pricing?.contractor_visit_fee || 125}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">FixBridge Beta Fee:</span>
                          <span className="font-semibold text-emerald-600">
                            <span className="line-through text-muted-foreground/60 mr-1.5">$49.00</span>
                            $0.00 (Waived)
                          </span>
                        </div>
                        <div className="border-t border-border/60 pt-2.5 flex justify-between text-sm font-bold">
                          <span className="text-foreground">Dispatch Authorization Hold:</span>
                          <span className="text-primary">${activeJob.pricing?.contractor_visit_fee || 125}</span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-900 leading-relaxed">
                        🔒 <strong>Pre-Authorization Hold:</strong> Your card will not be charged today. A temporary hold will be placed to secure the dispatch. The charge is captured only when the contractor arrives and checks in. If you cancel, the hold is released.
                      </div>

                      <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2 text-xs leading-relaxed text-muted-foreground">
                        <h4 className="font-bold text-foreground text-[11px] uppercase tracking-wider">### Estimated Repair</h4>
                        <p>
                          <em>Disclaimer:</em> This estimate is based solely on the photos provided. Not all damage or repair requirements can be assessed from photos. Additional damage discovered during an in-person inspection may result in higher repair costs.
                        </p>
                        <p>
                          <em>Visit Fee:</em> If you proceed with repairs through the FixBridge team, the visit fee will be deducted from your final repair bill. The visit fee can be customized through the Admin Page.
                        </p>
                      </div>
                      
                      <p className="text-[11px] text-muted-foreground">{activeJob.preferredTimeNote}</p>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void payFee()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(255,77,28,0.2)] hover:bg-primary/95 disabled:opacity-60 transition-all"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize Dispatch & Hold Card"}
                      </button>
                    </div>
                  </div>
                ) : (
                  user.planCode !== "pro_membership" ? (
                    <div className="relative space-y-6">
                      {/* Blurred teaser layout of tools / materials */}
                      <div className="grid gap-4 sm:grid-cols-2 pointer-events-none select-none opacity-20 blur-sm">
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <h4 className="font-semibold text-sm mb-3">🔧 Required Tools</h4>
                          <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                          <div className="h-4 w-1/2 bg-muted rounded" />
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <h4 className="font-semibold text-sm mb-3">📦 Materials Needed</h4>
                          <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                          <div className="h-4 w-1/2 bg-muted rounded" />
                        </div>
                      </div>

                      {/* Blurred teaser steps */}
                      <div className="rounded-xl border border-border p-4 pointer-events-none select-none opacity-20 blur-[4px]">
                        <h4 className="font-semibold text-sm mb-3">Step-by-Step Instructions</h4>
                        <div className="space-y-3">
                          <div className="h-8 bg-muted rounded w-full" />
                          <div className="h-8 bg-muted rounded w-11/12" />
                        </div>
                      </div>

                      {/* Premium Glassmorphic Lock Card Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="w-full max-w-md rounded-2xl border border-border/80 bg-background/85 p-6 text-center shadow-2xl backdrop-blur-md">
                          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF4D1C]/10 text-[#FF4D1C]">
                            <Sparkles className="h-6 w-6 animate-pulse" />
                          </div>
                          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-wide text-foreground">
                            Unlock DIY Action Plan
                          </h3>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            Upgrade to <strong className="text-foreground font-semibold">Pro Membership</strong> to access full step-by-step guides, required tool lists, safety checkpoints, and real-time AI guidance tailored for your repair.
                          </p>

                          <div className="mt-4 border-t border-border/60 pt-3.5">
                            <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#FF4D1C]">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                              7-Day Free Trial Included
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Then just {proPlan ? formatMoney(proPlan.amount) : "$49.00"}/month. Cancel anytime.
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSubscribe()}
                            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(255,77,28,0.15)] hover:bg-[#FF4D1C]/95 active:scale-[0.98] transition-all disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-current" />}
                            Start Free Trial & Unlock
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* DIY Caution Banner if not safe */}
                      {!activeJob.aiAssessment?.safe_diy_allowed && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-red-950 dark:text-red-100 flex gap-3">
                          <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-semibold">Professional Service Recommended</p>
                            <p className="mt-1 opacity-90 text-xs leading-relaxed">
                              Our AI safety protocol indicates this repair has heightened risks or complexity. We strongly advise using a licensed professional. If you proceed, do so with extreme caution.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Split Grid Layout: Left Side (Action plan tools, steps) and Right Side (AI Assistant chat) */}
                      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
                        
                        {/* Left Side: Plan, Tools, checklist */}
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                            <div>
                              <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">AI DIY Action Plan</h3>
                              <p className="text-xs text-muted-foreground">Tailored for: {activeJob.category}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Difficulty:</span>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                                String(activeJob.aiAssessment?.diy_difficulty || "").toLowerCase() === "easy"
                                  ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                  : String(activeJob.aiAssessment?.diy_difficulty || "").toLowerCase() === "moderate"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                              }`}>
                                {activeJob.aiAssessment?.diy_difficulty || "Moderate"}
                              </span>
                            </div>
                          </div>

                          {/* Tools and Materials grid */}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                              <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                                🔧 Required Tools
                              </h4>
                              {activeJob.aiAssessment?.tools_required && activeJob.aiAssessment.tools_required.length > 0 ? (
                                <ul className="space-y-2">
                                  {activeJob.aiAssessment.tools_required.map((tool, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-xs">
                                      <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 rounded border-border text-[#FF4D1C] focus:ring-[#FF4D1C]" />
                                      <span className="text-muted-foreground">{tool}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">No special tools required.</p>
                              )}
                            </div>

                            <div className="rounded-xl border border-border bg-muted/20 p-4">
                              <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                                📦 Materials Needed
                              </h4>
                              {activeJob.aiAssessment?.materials_needed && activeJob.aiAssessment.materials_needed.length > 0 ? (
                                <ul className="space-y-2">
                                  {activeJob.aiAssessment.materials_needed.map((item, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-xs">
                                      <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 rounded border-border text-[#FF4D1C] focus:ring-[#FF4D1C]" />
                                      <span className="text-muted-foreground">{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">No special materials needed.</p>
                              )}
                            </div>
                          </div>

                          {/* Steps Checklist */}
                          <div className="rounded-xl border border-border p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-semibold text-sm">📝 Step-by-Step Instructions</h4>
                              {activeJob.aiAssessment?.diy_steps && activeJob.aiAssessment.diy_steps.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setDiyIsGuided(!diyIsGuided)}
                                  className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                                >
                                  {diyIsGuided ? "Switch to List View" : "⚡ Switch to Guided Mode"}
                                </button>
                              )}
                            </div>

                            {activeJob.aiAssessment?.diy_steps && activeJob.aiAssessment.diy_steps.length > 0 ? (
                              diyIsGuided ? (
                                <div className="space-y-4">
                                  {/* Progress bar */}
                                  <div>
                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                      <span>Progress</span>
                                      <span>
                                        {Math.round(
                                          (Object.values(diyCompletedSteps).filter(Boolean).length /
                                            activeJob.aiAssessment.diy_steps.length) *
                                            100
                                        )}% Complete
                                      </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary transition-all duration-300"
                                        style={{
                                          width: `${
                                            (Object.values(diyCompletedSteps).filter(Boolean).length /
                                              activeJob.aiAssessment.diy_steps.length) *
                                            100
                                          }%`,
                                        }}
                                      />
                                    </div>
                                  </div>

                                  {/* Active Step Card */}
                                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 relative overflow-hidden">
                                    <div className="absolute right-3 top-3 text-[10px] font-bold text-primary/30 uppercase tracking-widest">
                                      Step {diyStepIndex + 1} of {activeJob.aiAssessment.diy_steps.length}
                                    </div>
                                    
                                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Active Step</p>
                                    <p className="text-sm font-medium text-foreground leading-relaxed">
                                      {activeJob.aiAssessment.diy_steps[diyStepIndex]}
                                    </p>

                                    {/* Checkbox click to complete */}
                                    <div className="mt-5 flex items-center">
                                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          checked={!!diyCompletedSteps[diyStepIndex]}
                                          onChange={(e) => {
                                            setDiyCompletedSteps({
                                              ...diyCompletedSteps,
                                              [diyStepIndex]: e.target.checked,
                                            });
                                          }}
                                          className="h-4 w-4 rounded border-border text-[#FF4D1C] focus:ring-[#FF4D1C]"
                                        />
                                        <span className="text-xs font-bold text-muted-foreground hover:text-foreground">
                                          {diyCompletedSteps[diyStepIndex] ? "✓ I completed this step!" : "Mark this step as done"}
                                        </span>
                                      </label>
                                    </div>
                                  </div>

                                  {/* Navigation buttons */}
                                  <div className="flex justify-between gap-3 pt-2">
                                    <button
                                      type="button"
                                      disabled={diyStepIndex === 0}
                                      onClick={() => setDiyStepIndex((idx) => idx - 1)}
                                      className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/40 disabled:opacity-50"
                                    >
                                      ← Previous Step
                                    </button>
                                    <button
                                      type="button"
                                      disabled={diyStepIndex === activeJob.aiAssessment.diy_steps.length - 1}
                                      onClick={() => setDiyStepIndex((idx) => idx + 1)}
                                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                                    >
                                      Next Step →
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative border-l border-border/80 pl-4 ml-2 space-y-4">
                                  {activeJob.aiAssessment.diy_steps.map((stepItem, idx) => (
                                    <div key={idx} className="relative">
                                      <div className="absolute -left-[25px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border text-[9px] font-bold">
                                        {idx + 1}
                                      </div>
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <p className="text-xs font-semibold text-foreground">Step {idx + 1}</p>
                                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{stepItem}</p>
                                        </div>
                                        <input
                                          type="checkbox"
                                          checked={!!diyCompletedSteps[idx]}
                                          onChange={(e) => {
                                            setDiyCompletedSteps({
                                              ...diyCompletedSteps,
                                              [idx]: e.target.checked,
                                            });
                                          }}
                                          className="h-3.5 w-3.5 rounded border-border text-[#FF4D1C] focus:ring-[#FF4D1C] shrink-0 mt-0.5"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : (
                              <p className="text-xs text-muted-foreground">No instructions generated.</p>
                            )}
                          </div>

                          {/* Stop conditions warning */}
                          {activeJob.aiAssessment?.stop_conditions && activeJob.aiAssessment.stop_conditions.length > 0 && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                              <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                                ⚠️ Safety Stop Conditions
                              </h4>
                              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                                Stop immediately and request a professional dispatcher if you experience any of the following:
                              </p>
                              <ul className="space-y-2">
                                {activeJob.aiAssessment.stop_conditions.map((stopItem, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-200">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#FF4D1C] shrink-0" />
                                    <span>{stopItem}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Right Side: AI Assistant Chat (Sticky on Desktop) */}
                        <div className="lg:sticky lg:top-24 space-y-4">
                          <style dangerouslySetInnerHTML={{__html: `
                            @keyframes soundwave {
                              0%, 100% { height: 4px; }
                              50% { height: 14px; }
                            }
                            .sound-bar {
                              animation: soundwave 0.8s infinite ease-in-out;
                            }
                          `}} />
                          <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between border-b border-border pb-3">
                              <div className="flex items-center gap-2.5">
                                {/* Animated Mascot */}
                                <div
                                  onClick={() => speakText("Hi! I am your FixBridge DIY assistant bot. Feel free to type any questions, or click on the speaker icon on any message to hear me read it out loud!")}
                                  className={`cursor-pointer rounded-full p-2 bg-[#FF4D1C]/15 text-[#FF4D1C] transition-transform active:scale-95 duration-200 ${
                                    diyChatBusy ? "animate-bounce" : "hover:scale-105"
                                  }`}
                                  title="Click me to speak!"
                                >
                                  <Bot className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="font-semibold text-sm text-foreground flex items-center gap-1">
                                    DIY Assistant Chat
                                    {speakingText && (
                                      <span className="flex items-center gap-0.5 h-3.5 ml-1" title="Speaking...">
                                        <span className="w-0.5 bg-[#FF4D1C] rounded-full sound-bar" />
                                        <span className="w-0.5 bg-[#FF4D1C] rounded-full sound-bar" style={{ animationDelay: "0.15s" }} />
                                        <span className="w-0.5 bg-[#FF4D1C] rounded-full sound-bar" style={{ animationDelay: "0.3s" }} />
                                      </span>
                                    )}
                                  </h4>
                                  <p className="text-[11px] text-muted-foreground leading-none mt-1">Ask questions or tap messages to hear them</p>
                                </div>
                              </div>
                            </div>

                            {/* Scrollable messages container */}
                            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1 flex flex-col scrollbar-thin">
                              {diyChatMessages.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className={`group relative max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                    msg.role === "user"
                                      ? "bg-[#FF4D1C] text-white self-end rounded-tr-none"
                                      : "bg-muted text-foreground self-start rounded-tl-none border border-border"
                                  }`}
                                >
                                  <p className="whitespace-pre-line pr-5">{formatChatMessage(msg.content)}</p>
                                  
                                  {/* Speak button overlay */}
                                  <button
                                    type="button"
                                    onClick={() => speakText(msg.content)}
                                    className={`absolute right-1.5 top-1.5 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity ${
                                      speakingText === msg.content ? "opacity-100 text-primary" : "text-muted-foreground"
                                    }`}
                                    title={speakingText === msg.content ? "Stop speaking" : "Speak message"}
                                  >
                                    {speakingText === msg.content ? (
                                      <VolumeX className="h-3 w-3" />
                                    ) : (
                                      <Volume2 className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              ))}
                              {diyChatBusy && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground self-start bg-muted rounded-xl rounded-tl-none px-3 py-2 border border-border">
                                  <Loader2 className="h-3 w-3 animate-spin text-[#FF4D1C]" />
                                  <span>Assistant is typing...</span>
                                </div>
                              )}
                            </div>

                            {/* Chat input form */}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void sendDiyChatMessage();
                              }}
                              className="flex gap-2 border-t border-border pt-3"
                            >
                              <input
                                type="text"
                                disabled={diyChatBusy}
                                value={diyChatInput}
                                onChange={(e) => setDiyChatInput(e.target.value)}
                                placeholder="Ask a question about instructions..."
                                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-[#FF4D1C] focus:outline-none focus:ring-1 focus:ring-[#FF4D1C] disabled:opacity-50 text-foreground"
                              />
                              <button
                                type="submit"
                                disabled={diyChatBusy || !diyChatInput.trim()}
                                className="inline-flex items-center justify-center rounded-lg bg-[#FF4D1C] p-2 text-white hover:brightness-105 active:scale-[0.98] transition disabled:opacity-55"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            </form>
                          </div>
                        </div>

                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {tab === "jobs" && (
          <section className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
                  Service Tracking
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Follow your request like a delivery — from submission to completion.
                </p>
              </div>
              <button
                type="button"
                onClick={openRequestService}
                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                <PlusCircle size={16} /> New request
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : jobs.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">No requests yet. Report an issue to start tracking.</p>
                <button
                  type="button"
                  onClick={openRequestService}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Request Service
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setShowTechMessage(false);
                        setTechMessageSent(false);
                      }}
                      className={`w-full rounded-2xl border p-3.5 text-left transition ${
                        (selectedJobId ?? jobs[0]?.id) === job.id
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{job.title || job.category}</p>
                        <span className="text-[11px] text-muted-foreground">{job.bookingId || `FB-${job.id}`}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{STATUS_LABELS[job.status] || job.status}</p>
                      <p className="mt-1 text-sm tabular-nums">{moneyRange(job)}</p>
                    </button>
                  ))}
                </div>
                {(selectedJob || jobs[0]) && (
                  <div className="space-y-3">
                    <ServiceTrackingCard
                      job={selectedJob || jobs[0]}
                      onMessage={() => {
                        setShowTechMessage(true);
                        setTechMessageSent(false);
                      }}
                    />
                    {showTechMessage && (
                      <div className="rounded-[1.5rem] border border-border bg-card p-4 space-y-3">
                        <p className="text-sm font-semibold">Message technician</p>
                        {techMessageSent ? (
                          <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                            Message sent. Your technician will reply here when available.
                          </p>
                        ) : (
                          <>
                            <textarea
                              rows={3}
                              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                              placeholder="Hi — any update on arrival time?"
                              value={techMessageDraft}
                              onChange={(e) => setTechMessageDraft(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={!techMessageDraft.trim()}
                                onClick={() => {
                                  setTechMessageSent(true);
                                  setTechMessageDraft("");
                                }}
                                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Send
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowTechMessage(false)}
                                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  <div className="space-y-3 rounded-[1.5rem] border border-border bg-card p-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Request details</h2>
                    <p className="text-sm text-muted-foreground">{(selectedJob || jobs[0]).description}</p>
                    <p className="text-sm tabular-nums">Estimate: {moneyRange(selectedJob || jobs[0])}</p>
                    {["awaiting_service_payment", "ai_review_complete"].includes((selectedJob || jobs[0]).status) && (
                      <div className="mt-3 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Contractor Visit Fee:</span>
                            <span className="font-semibold text-foreground">${selectedJob.pricing?.contractor_visit_fee || 125}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">FixBridge Beta Fee:</span>
                            <span className="font-semibold text-emerald-600">$0.00 (Waived)</span>
                          </div>
                          <div className="flex justify-between font-bold border-t border-border/40 pt-1.5 mt-1">
                            <span className="text-foreground">Authorization Hold:</span>
                            <span className="text-primary">${selectedJob.pricing?.contractor_visit_fee || 125}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-normal">
                          🔒 Card hold placed now. Only charged when contractor checks in on-site. Released if cancelled.
                        </p>
                        <button
                          type="button"
                          className="w-full rounded-md bg-[#FF4D1C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#FF4D1C]/90 transition-colors"
                          disabled={busy}
                          onClick={async () => {
                            const prop = properties.find((p) => p.id === selectedJob.propertyId);
                            if (prop) {
                              const isMissingAddress = !prop.addressLine1?.trim() || !prop.city?.trim() || !prop.state?.trim() || !prop.zip?.trim();
                              if (isMissingAddress) {
                                setShowAddressPromptPropertyId(prop.id);
                                setAddressPromptLine1(prop.addressLine1 || "");
                                setAddressPromptLine2(prop.addressLine2 || "");
                                setAddressPromptCity(prop.city || "");
                                setAddressPromptState(prop.state || "");
                                setAddressPromptZip(prop.zip || "");
                                setAddressPromptJobId(selectedJob.id);
                                return;
                              }
                            }
                            setBusy(true);
                            const r = await payDispatchFee(selectedJob.id);
                            if (r.ok && r.url) {
                              window.location.href = r.url;
                            } else {
                              await refresh();
                            }
                            setBusy(false);
                          }}
                        >
                          Authorize Dispatch &amp; Hold Card
                        </button>
                      </div>
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
                              const r = await approveProposal(selectedJob.id);
                              if (r.ok) {
                                setProposal(r.proposal || null);
                                await refresh();
                              }
                              setBusy(false);
                            }}
                          >
                            Approve proposal
                          </button>
                        )}
                        {["approved", "awaiting_customer_approval", "proposal_sent"].includes(selectedJob.status) && proposal.status === "approved" && (
                          <button
                            type="button"
                            className="mt-3 ml-2 rounded-md border border-border px-3 py-2 bg-[#FF4D1C] text-white hover:brightness-105"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                const r = await payRetail(selectedJob.id);
                                if (r.ok) {
                                  if (r.url) {
                                    window.location.href = r.url;
                                    return;
                                  }
                                  await refresh();
                                } else {
                                  setError(r.message || "Payment failed.");
                                }
                              } catch (err: any) {
                                setError(err.message || "Payment request failed.");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Pay now
                          </button>
                        )}
                      </div>
                    )}

                    {selectedJob.status === "completed" && (
                      <button
                        type="button"
                        className="rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white disabled:opacity-60"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await confirmCompletion(selectedJob.id);
                          if (r.ok) {
                            await refresh();
                          }
                          setBusy(false);
                        }}
                      >
                        Confirm completion &amp; pay balance
                      </button>
                    )}

                    {/* Completion proof — shown whenever report exists */}
                    {selectedJob.completionReport && (
                      <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <HardHat className="h-4 w-4 text-[#FF4D1C]" /> Completion report
                        </p>
                        {(selectedJob.completionReport as Record<string,unknown>).summary && (
                          <p className="text-sm text-muted-foreground">{String((selectedJob.completionReport as Record<string,unknown>).summary)}</p>
                        )}
                        {((selectedJob.completionReport as Record<string,unknown>).beforePhotoUrl || (selectedJob.completionReport as Record<string,unknown>).afterPhotoUrl) && (
                          <div className="grid grid-cols-2 gap-3">
                            {(selectedJob.completionReport as Record<string,unknown>).beforePhotoUrl && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground font-medium">Before</p>
                                <img
                                  src={String((selectedJob.completionReport as Record<string,unknown>).beforePhotoUrl)}
                                  alt="Before work"
                                  className="h-32 w-full rounded-lg object-cover border border-border"
                                />
                              </div>
                            )}
                            {(selectedJob.completionReport as Record<string,unknown>).afterPhotoUrl && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground font-medium">After</p>
                                <img
                                  src={String((selectedJob.completionReport as Record<string,unknown>).afterPhotoUrl)}
                                  alt="After work"
                                  className="h-32 w-full rounded-lg object-cover border border-border"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedJob.status === "customer_review_pending" && (
                      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <p className="text-sm font-semibold">Confirm completion & leave a review</p>
                        <p className="text-xs text-muted-foreground">
                          Your rating publishes on the public Customer Trust page as soon as you submit.
                        </p>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Your rating</p>
                          <StarRating
                            value={completionRating}
                            onChange={setCompletionRating}
                            size={24}
                            interactive
                            tone="coral"
                          />
                        </div>
                        <input
                          value={completionLocation}
                          onChange={(e) => setCompletionLocation(e.target.value)}
                          placeholder="Neighborhood (e.g. Astoria, Queens)"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <textarea
                          value={completionReview}
                          onChange={(e) => setCompletionReview(e.target.value)}
                          placeholder="How did the job go? (optional but publishes live if 20+ characters)"
                          rows={3}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Photos (optional)</p>
                          <input
                            ref={completionFileRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files?.length) return;
                              setCompletionImageBusy(true);
                              setError(null);
                              try {
                                const next = [...completionImages];
                                for (const file of Array.from(files)) {
                                  if (next.length >= MAX_REVIEW_IMAGES) break;
                                  next.push(await fileToReviewImage(file));
                                }
                                setCompletionImages(next.slice(0, MAX_REVIEW_IMAGES));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Could not add image.");
                              } finally {
                                setCompletionImageBusy(false);
                                if (completionFileRef.current) completionFileRef.current.value = "";
                              }
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            {completionImages.map((src, i) => (
                              <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                                <img src={src} alt="" className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white"
                                  onClick={() => setCompletionImages((prev) => prev.filter((_, idx) => idx !== i))}
                                  aria-label="Remove photo"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {completionImages.length < MAX_REVIEW_IMAGES && (
                              <button
                                type="button"
                                disabled={completionImageBusy}
                                onClick={() => completionFileRef.current?.click()}
                                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-[#FF4D1C]/40 disabled:opacity-60"
                              >
                                {completionImageBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ImagePlus className="h-4 w-4" />
                                )}
                                <span className="text-[9px] uppercase tracking-wide">Add</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-md bg-[#FF4D1C] px-3 py-2 text-sm text-white disabled:opacity-60"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            setError(null);
                            const payload =
                              completionReview.trim().length >= 20
                                ? {
                                    rating: Math.round(completionRating),
                                    review: completionReview.trim(),
                                    location: completionLocation.trim() || undefined,
                                    images: completionImages.length ? completionImages : undefined,
                                  }
                                : undefined;
                            const r = await confirmCompletion(selectedJob.id, payload);
                            if (r.ok) {
                              setCompletionReview("");
                              setCompletionLocation("");
                              setCompletionRating(5);
                              setCompletionImages([]);
                              await refresh();
                            } else {
                              setError((r as { message?: string }).message || "Could not confirm completion.");
                            }
                            setBusy(false);
                          }}
                        >
                          <CheckCircle className="h-4 w-4" /> Confirm completion
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}



        {tab === "properties" && (
          <HomeownerPropertyPage
            properties={properties}
            busy={busy}
            onBusy={setBusy}
            onError={setError}
            onRefresh={refresh}
          />
        )}

        {tab === "profile" && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-5 text-sm shadow-sm max-w-xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h1 className="text-xl font-bold tracking-wide">Account Profile</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Manage your personal and contact details.</p>
              </div>
              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white hover:bg-muted/40 px-3 py-1.5 text-xs font-semibold transition dark:bg-background/40"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!editName.trim() || !editEmail.trim()) {
                    setError("Name and Email cannot be empty.");
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    const { updateUserProfile } = await import("./auth");
                    const r = await updateUserProfile({
                      name: editName.trim(),
                      email: editEmail.trim(),
                      phone: editPhone.trim() || undefined,
                      gender: editGender.trim() || undefined,
                      dob: editDob.trim() || undefined,
                      photoDataUrl: editPhotoDataUrl,
                    });
                    if (r.ok) {
                      if (onUserUpdated) onUserUpdated(r.user);
                      setIsEditingProfile(false);
                    } else {
                      setError(r.message || "Failed to update profile.");
                    }
                  } catch (err: any) {
                    setError(err.message || "Network error. Please try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="space-y-4"
              >
                {/* Profile Pic Upload */}
                <div className="flex items-center gap-4 border-b border-border/60 pb-4">
                  {editPhotoDataUrl ? (
                    <img
                      src={editPhotoDataUrl}
                      alt="Profile Avatar"
                      className="h-16 w-16 rounded-full object-cover border border-[#FF4D1C]/20 shadow-sm"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary/80 text-secondary-foreground font-semibold text-lg border border-border">
                      {String(editName || user.name || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold">Profile Picture</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#FF4D1C]/10 file:text-[#FF4D1C] hover:file:bg-[#FF4D1C]/20 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2_000_000) {
                            alert("Image must be smaller than 2MB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            setEditPhotoDataUrl(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {editPhotoDataUrl && (
                      <button
                        type="button"
                        onClick={() => setEditPhotoDataUrl(null)}
                        className="text-[10px] text-red-500 font-medium hover:underline text-left"
                      >
                        Remove photo
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Full Name</span>
                    <input
                      required
                      type="text"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Email Address</span>
                    <input
                      required
                      type="email"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Phone Number</span>
                    <input
                      type="tel"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 000-0000"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Gender</span>
                    <select
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20 text-foreground"
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value)}
                    >
                      <option value="">Select Gender (Optional)</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Date of Birth (DOB)</span>
                    <input
                      type="date"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20 text-foreground"
                      value={editDob}
                      onChange={(e) => setEditDob(e.target.value)}
                    />
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditName(user.name);
                      setEditEmail(user.email);
                      setEditPhone(user.phone || "");
                      setEditGender(user.gender || "");
                      setEditDob(user.dob || "");
                      setEditPhotoDataUrl(user.photoDataUrl || null);
                      setIsEditingProfile(false);
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF4D1C] px-3 py-2 text-xs font-medium text-white shadow hover:brightness-105 active:scale-[0.98] disabled:opacity-60 transition"
                  >
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Premium Avatar Header in View Mode */}
                <div className="flex items-center gap-4 border-b border-border/60 pb-4">
                  {user.photoDataUrl ? (
                    <img
                      src={user.photoDataUrl}
                      alt="Profile Avatar"
                      className="h-16 w-16 rounded-full object-cover border border-[#FF4D1C]/20 shadow-sm"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FF4D1C]/10 text-[#FF4D1C] font-semibold text-lg border border-[#FF4D1C]/20">
                      {String(user.name || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-base">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    <p className="mt-1 font-semibold text-foreground">{user.name}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Email Address</p>
                    <p className="mt-1 font-semibold text-foreground">{user.email}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Phone Number</p>
                    <p className="mt-1 font-semibold text-foreground">{user.phone || "Not set"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Gender</p>
                    <p className="mt-1 font-semibold text-foreground">{user.gender || "Not specified"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Date of Birth (DOB)</p>
                    <p className="mt-1 font-semibold text-foreground">{user.dob || "Not specified"}</p>
                  </div>
                  {user.referralCode && (
                    <div className="rounded-lg border border-[#FF4D1C]/20 bg-gradient-to-br from-[#FF4D1C]/5 to-transparent p-4 sm:col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">🎉 Your Unique Referral Code</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(user.referralCode || "");
                            alert("Referral code copied to clipboard!");
                          }}
                          className="text-[11px] font-bold text-[#FF4D1C] hover:underline"
                        >
                          Copy Code
                        </button>
                      </div>
                      <p className="text-lg font-mono font-bold tracking-widest text-[#FF4D1C] bg-white dark:bg-zinc-900 border border-border/80 px-3 py-2 rounded-lg text-center uppercase">
                        {user.referralCode}
                      </p>
                      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                        Share this code with other homeowners! They get $25 off their first dispatch booking by using your code, and you earn a $25 reward coupon code once they book their first dispatch!
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                  Managed service jobs use confidential contractor net pricing. You only see {brand.productName} retail amounts.
                </p>
              </div>
            )}
          </section>
        )}
        </main>
      </div>
      
      {/* ZIP Prompt Modal */}
      <AnimatePresence>
        {showZipPromptPropertyId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 text-sm"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-lg font-bold tracking-wide text-foreground">Add your ZIP code to give you exact info</h3>
                <button
                  type="button"
                  onClick={() => setShowZipPromptPropertyId(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Please enter your property ZIP code to load location-based cost ranges and regional service rules.
              </p>

              <div className="space-y-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property ZIP Code</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10001"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20 text-foreground"
                    value={zipPromptInput}
                    onChange={(e) => setZipPromptInput(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowZipPromptPropertyId(null)}
                  className="rounded-lg border border-border px-4 py-2 hover:bg-muted font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !zipPromptInput.trim()}
                  onClick={() => void handleSaveZipAndProceed()}
                  className="rounded-lg bg-[#FF4D1C] px-4 py-2 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save & Proceed"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Address Prompt Modal */}
      <AnimatePresence>
        {showAddressPromptPropertyId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 text-sm"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-lg font-bold tracking-wide text-foreground">Complete Address Details</h3>
                <button
                  type="button"
                  onClick={() => setShowAddressPromptPropertyId(null)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Prior to completing checkout, please provide the full service address details of this property so the dispatched technician can locate you.
              </p>

              <div className="space-y-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Street Address <span className="text-red-500">*</span></span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 123 Main St"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                    value={addressPromptLine1}
                    onChange={(e) => setAddressPromptLine1(e.target.value)}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Apartment, Suite, Unit, etc. <span className="font-normal text-muted-foreground">(Optional)</span></span>
                  <input
                    type="text"
                    placeholder="e.g. Apt 4B"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                    value={addressPromptLine2}
                    onChange={(e) => setAddressPromptLine2(e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Brooklyn"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                      value={addressPromptCity}
                      onChange={(e) => setAddressPromptCity(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">State <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. NY"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                      value={addressPromptState}
                      onChange={(e) => setAddressPromptState(e.target.value)}
                    />
                  </label>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ZIP Code <span className="text-red-500">*</span></span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 11201"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                    value={addressPromptZip}
                    onChange={(e) => setAddressPromptZip(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddressPromptPropertyId(null)}
                  className="rounded-lg border border-border px-4 py-2 hover:bg-muted font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !addressPromptLine1.trim() || !addressPromptCity.trim() || !addressPromptState.trim() || !addressPromptZip.trim()}
                  onClick={() => void handleSaveAddressAndProceed()}
                  className="rounded-lg bg-[#FF4D1C] px-4 py-2 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save & Complete Checkout"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Address Modal */}
      <AnimatePresence>
        {showAddAddressModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4 text-sm"
            >
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-lg font-bold tracking-wide text-foreground">Add New Address</h3>
                <button
                  type="button"
                  onClick={() => setShowAddAddressModal(false)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                Add your property address details and ZIP code to retrieve exact regional info and matching providers.
              </p>

              <div className="space-y-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Street Address <span className="text-red-500">*</span></span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 123 Main St"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                    value={modalAddressLine1}
                    onChange={(e) => setModalAddressLine1(e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">City <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Brooklyn"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                      value={modalCity}
                      onChange={(e) => setModalCity(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">State <span className="text-red-500">*</span></span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. NY"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                      value={modalState}
                      onChange={(e) => setModalState(e.target.value)}
                    />
                  </label>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ZIP Code <span className="text-red-500">*</span></span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 11201"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
                    value={modalZip}
                    onChange={(e) => setModalZip(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAddressModal(false)}
                  className="rounded-lg border border-border px-4 py-2 hover:bg-muted font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !modalAddressLine1.trim() || !modalCity.trim() || !modalState.trim() || !modalZip.trim()}
                  onClick={() => void handleSaveAddressModal()}
                  className="rounded-lg bg-[#FF4D1C] px-4 py-2 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save Address"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
