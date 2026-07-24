import { useEffect, useState, useRef, type FormEvent } from "react";
import { motion, useInView } from "motion/react";
import { format, addDays, nextSaturday, isBefore, startOfDay } from "date-fns";
import {
  PlusCircle, Briefcase, MessageSquare, Phone,
  Bell, LogOut, Zap, Wrench,
  Home, Layers, Hammer, ChevronRight, Star, Clock,
  CheckCircle, AlertCircle, Send, MapPin, DollarSign,
  Mail, Sun, Moon, Menu, X, ImagePlus, Loader2, CalendarDays,
  Video, Truck, Navigation, HardHat, Receipt, ThumbsUp, User,
  Eye, Sparkles, ArrowRight, ShieldAlert,
} from "lucide-react";
import { Calendar } from "./components/ui/calendar";
import { getStoredUsers, loadAllUsers, updateUserProfile, type AuthUser } from "./auth";
import JobChatPanel from "./JobChatPanel";
import {
  addJobBoardJob,
  contractorCanDoJob,
  getJobRequirements,
  getMyJobs,
  formatJobNumber,
  type JobCategory,
} from "./jobBoard";
import {
  analyzeWithAi,
  chatWithAi,
  isAiConfigured,
  refreshAiStatus,
  type AiAssessment,
  type AiProviderSource,
} from "./geminiAssessment";
import {
  getJobLifecycle,
  getAllLifecycles,
  updateJobRating,
  STATUS_LABELS,
  type JobStatus,
  type JobLifecycle,
} from "./jobLifecycle";
import iconPlumbing from "../assets/category-icons/cat-plumbing.png";
import iconElectrical from "../assets/category-icons/cat-electrical.png";
import iconHvac from "../assets/category-icons/cat-hvac.png";
import iconPainting from "../assets/category-icons/cat-painting.png";
import iconRoofing from "../assets/category-icons/cat-roofing.png";
import iconFlooring from "../assets/category-icons/cat-flooring.png";
import iconCarpentry from "../assets/category-icons/cat-carpentry.png";
import iconOthers from "../assets/category-icons/cat-others.png";

type DashTab = "post" | "jobs" | "ai" | "profile" | "contact";

type HomeJob = {
  id: number;
  bookingId?: string | null;
  title: string;
  category: string;
  posted: string;
  bids: number;
  status: "open" | "in-progress" | "completed";
  est: string;
  topBid: string;
  aiAssessed: boolean;
  contractor?: string;
  saved?: string;
  rating?: number;
  scheduledDate?: string;
  timeSlot?: string;
  serviceTiming?: string;
};

type PostStep = "category" | "describe" | "assessment" | "timing" | "timeslot" | "done";
type TimingOption = "same-day" | "next-day" | "weekend" | "custom";
type TimeSlotId = "9-11" | "11-2" | "2-5" | "5-7" | "7-9";

const NAV_ITEMS: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: "post", label: "Post a Job", icon: PlusCircle },
  { id: "jobs", label: "My Jobs", icon: Briefcase },
  { id: "ai", label: "AI Assistance", icon: MessageSquare },
  { id: "profile", label: "My Profile", icon: User },
  { id: "contact", label: "Contact Us", icon: Phone },
];

const CATEGORIES = [
  { label: "Plumbing", iconSrc: iconPlumbing, tint: "from-sky-100 to-blue-50", Fallback: Wrench },
  { label: "Electrical", iconSrc: iconElectrical, tint: "from-amber-100 to-yellow-50", Fallback: Zap },
  { label: "HVAC", iconSrc: iconHvac, tint: "from-cyan-100 to-sky-50", Fallback: Home },
  { label: "Painting", iconSrc: iconPainting, tint: "from-orange-100 to-rose-50", Fallback: Layers },
  { label: "Roofing", iconSrc: iconRoofing, tint: "from-stone-200 to-slate-50", Fallback: Home },
  { label: "Flooring", iconSrc: iconFlooring, tint: "from-amber-100 to-orange-50", Fallback: Layers },
  { label: "Carpentry", iconSrc: iconCarpentry, tint: "from-yellow-100 to-amber-50", Fallback: Hammer },
  { label: "Others", iconSrc: iconOthers, tint: "from-neutral-200 to-stone-50", Fallback: Wrench },
];

const POST_STEPS: { id: PostStep; label: string }[] = [
  { id: "category", label: "Category" },
  { id: "describe", label: "Problem" },
  { id: "assessment", label: "AI Review" },
  { id: "timing", label: "When & Where" },
  { id: "timeslot", label: "Time Slot" },
];

const TIMING_OPTIONS: { id: TimingOption; label: string; desc: string }[] = [
  { id: "same-day", label: "Same Day Service", desc: "Request a professional for today" },
  { id: "next-day", label: "Next Day Service", desc: "Schedule for tomorrow" },
  { id: "weekend", label: "Weekend Service", desc: "Saturday or Sunday availability" },
  { id: "custom", label: "Choose a Date", desc: "Open calendar and pick your day" },
];

const TIME_SLOTS: { id: TimeSlotId; label: string; surcharge?: boolean }[] = [
  { id: "9-11", label: "9:00 AM – 11:00 AM" },
  { id: "11-2", label: "11:00 AM – 2:00 PM" },
  { id: "2-5", label: "2:00 PM – 5:00 PM" },
  { id: "5-7", label: "5:00 PM – 7:00 PM" },
  { id: "7-9", label: "7:00 PM – 9:00 PM (small surcharge may apply)", surcharge: true },
];

const CHAT_MESSAGES: { role: "user" | "ai"; label?: string; text: string }[] = [
  {
    role: "ai",
    label: "FixBridge AI",
    text: "Hi there — thanks for reaching out. I'm here to help with whatever's going on at home, whether it's a leak, no heat, a breaker that keeps tripping, or something else entirely. Tell me what's happening and we'll figure out the best next step together.",
  },
];

const JOB_STATUS_UI: Record<JobStatus, { label: string; className: string; icon: React.ElementType }> = {
  open:           { label: "Open",         className: "bg-green-100 text-green-700 border-green-200",   icon: AlertCircle },
  accepted:       { label: "Accepted",     className: "bg-blue-100 text-blue-700 border-blue-200",      icon: CheckCircle },
  "on-the-way":   { label: "On the Way",   className: "bg-sky-100 text-sky-700 border-sky-200",         icon: Truck },
  arrived:        { label: "Arrived",      className: "bg-violet-100 text-violet-700 border-violet-200", icon: Navigation },
  "work-started": { label: "Work Started", className: "bg-orange-100 text-orange-700 border-orange-200", icon: HardHat },
  completed:      { label: "Completed",    className: "bg-muted text-muted-foreground border-border",   icon: CheckCircle },
};

function StatusBadge({ status }: { status: string }) {
  const lc = status as JobStatus;
  const ui = JOB_STATUS_UI[lc] ?? JOB_STATUS_UI.open;
  return (
    <span className={`font-mono text-[10px] tracking-wider uppercase border px-2 py-0.5 ${ui.className}`}>
      {ui.label}
    </span>
  );
}

function resolveServiceDate(timing: TimingOption | null, customDate: Date | undefined): Date | null {
  const today = startOfDay(new Date());
  if (timing === "same-day") return today;
  if (timing === "next-day") return addDays(today, 1);
  if (timing === "weekend") {
    const saturday = startOfDay(nextSaturday(today));
    return isBefore(saturday, today) ? addDays(saturday, 7) : saturday;
  }
  if (timing === "custom" && customDate) return startOfDay(customDate);
  return null;
}

function formatServiceDate(date: Date | null) {
  if (!date) return "Date not set";
  return format(date, "EEEE, MMM d, yyyy");
}

function urgencyTone(urgency: string) {
  const u = urgency.toLowerCase();
  if (u.includes("high")) {
    return {
      label: "High",
      ring: "stroke-red-500",
      soft: "bg-red-50 text-red-700 border-red-100",
      bar: "bg-red-500",
      pct: 90,
    };
  }
  if (u.includes("low")) {
    return {
      label: "Low",
      ring: "stroke-emerald-500",
      soft: "bg-emerald-50 text-emerald-700 border-emerald-100",
      bar: "bg-emerald-500",
      pct: 35,
    };
  }
  return {
    label: "Medium",
    ring: "stroke-amber-500",
    soft: "bg-amber-50 text-amber-800 border-amber-100",
    bar: "bg-amber-500",
    pct: 62,
  };
}

function UrgencyRing({ urgency }: { urgency: string }) {
  const tone = urgencyTone(urgency);
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (tone.pct / 100) * c;
  return (
    <div className="relative flex h-[100px] w-[100px] items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={tone.ring}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black leading-none text-foreground">
          {tone.label}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Urgency</span>
      </div>
    </div>
  );
}

function AssessmentSection({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h3 className="text-[13px] font-semibold text-foreground tracking-tight">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-3 text-sm text-foreground/90 leading-relaxed">
            <span
              className={`mt-0.5 shrink-0 ${
                ordered
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background"
                  : "mt-2 h-1.5 w-1.5 rounded-full bg-primary"
              }`}
            >
              {ordered ? index + 1 : null}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shrink photo before AI upload for faster analysis. */
function compressImageDataUrl(dataUrl: string, maxSide = 768, quality = 0.55): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_10px_24px_rgba(10,10,10,0.04)]">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}

function StepIndicator({ current }: { current: PostStep }) {
  const order = POST_STEPS.map((s) => s.id);
  const currentIndex = order.indexOf(current);
  return (
    <div className="mb-5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
      {POST_STEPS.map((step, index) => {
        const active = step.id === current;
        const complete = index < currentIndex;
        return (
          <div
            key={step.id}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              active
                ? "border-primary/30 bg-primary text-white shadow-[0_6px_14px_rgba(255,77,28,0.22)]"
                : complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-border/70 bg-card text-muted-foreground"
            }`}
          >
            {index + 1}. {step.label}
          </div>
        );
      })}
    </div>
  );
}

function PostTab({
  onJobPosted,
  onViewJobs,
  user,
}: {
  onJobPosted: (job: HomeJob) => void;
  onViewJobs: () => void;
  user: AuthUser | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<PostStep>("category");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [description, setDescription] = useState("");
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [diyLoading, setDiyLoading] = useState(false);
  const [diyReady, setDiyReady] = useState(false);
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<AiAssessment | null>(null);
  const [assessmentView, setAssessmentView] = useState<"summary" | "diy">("summary");
  const [analysisSource, setAnalysisSource] = useState<AiProviderSource | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [timing, setTiming] = useState<TimingOption | null>(null);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [address, setAddress] = useState(user?.address ?? "");
  const [timeSlot, setTimeSlot] = useState<TimeSlotId | null>(null);
  const [bookingSummary, setBookingSummary] = useState<{
    dateLabel: string;
    slotLabel: string;
    surcharge: boolean;
    bookingId?: string;
  } | null>(null);

  const [contractorUsers, setContractorUsers] = useState<AuthUser[]>([]);
  const [aiConfigured, setAiConfigured] = useState(isAiConfigured());
  useEffect(() => {
    void refreshAiStatus().then(setAiConfigured);
  }, []);
  useEffect(() => {
    // getStoredUsers is synchronous (localStorage cache). Calling .then on it
    // threw TypeError and white-screened the entire homeowner dashboard.
    const apply = () => {
      setContractorUsers(getStoredUsers().filter((u) => u.role === "contractor"));
    };
    apply();
    void loadAllUsers().then(apply);
  }, []);
  const recommendedCount = selectedCat
    ? contractorUsers.filter((c) => contractorCanDoJob(c.trade, selectedCat as JobCategory)).length
    : 0;
  const serviceDate = resolveServiceDate(timing, customDate);

  const resetFlow = () => {
    setStep("category");
    setSelectedCat(null);
    setTitleInput("");
    setDescription("");
    setMediaPreview(null);
    setMediaName(null);
    setMediaType(null);
    setAnalyzing(false);
    setDiyLoading(false);
    setDiyReady(false);
    setCompressedImage(null);
    setAssessment(null);
    setAssessmentView("summary");
    setAnalysisSource(null);
    setAnalysisError(null);
    setTiming(null);
    setCustomDate(undefined);
    setAddress("");
    setTimeSlot(null);
    setBookingSummary(null);
  };

  const handleMediaUpload = (file: File | null) => {
    if (!file) return;
    setMediaName(file.name);
    const isVideo = file.type.startsWith("video/");
    setMediaType(isVideo ? "video" : "image");
    const reader = new FileReader();
    reader.onload = () => setMediaPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canAnalyze =
    Boolean(selectedCat) &&
    (Boolean(description.trim()) || (mediaType === "image" && Boolean(mediaPreview)));

  const runAiAssessment = async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setDiyReady(false);
    let imageDataUrl: string | null = mediaType === "image" ? mediaPreview : null;
    if (imageDataUrl) {
      try {
        imageDataUrl = await compressImageDataUrl(imageDataUrl);
        setCompressedImage(imageDataUrl);
      } catch {
        setCompressedImage(imageDataUrl);
      }
    } else {
      setCompressedImage(null);
    }
    const result = await analyzeWithAi({
      category: selectedCat as JobCategory,
      description:
        description.trim() ||
        "No written description provided. Analyze the attached photo and infer the repair issue.",
      imageDataUrl,
      mode: "summary",
    });
    setAnalysisSource(result.source);
    setAnalysisError(result.error ?? null);
    if (result.source === "error" || !result.assessment) {
      setAssessment(null);
      setAnalyzing(false);
      return;
    }
    setAssessment(result.assessment);
    setAssessmentView("summary");
    setAnalyzing(false);
    setStep("assessment");
  };

  const openDiyGuide = async () => {
    if (!selectedCat || !assessment) return;
    if (!description.trim() && !(mediaType === "image" && (compressedImage || mediaPreview))) return;
    setAssessmentView("diy");
    if (diyReady && assessment.diagnosis) return;
    setDiyLoading(true);
    setAnalysisError(null);
    const result = await analyzeWithAi({
      category: selectedCat as JobCategory,
      description:
        description.trim() ||
        "No written description provided. Analyze the attached photo and infer the repair issue.",
      imageDataUrl: compressedImage ?? (mediaType === "image" ? mediaPreview : null),
      mode: "detail",
    });
    if (result.assessment) {
      setAssessment((prev) =>
        prev
          ? {
              ...prev,
              ...result.assessment!,
              overview: prev.overview || result.assessment!.overview,
              imageObservations:
                prev.imageObservations.length > 0
                  ? prev.imageObservations
                  : result.assessment!.imageObservations,
            }
          : result.assessment,
      );
      setDiyReady(true);
      setAnalysisSource(result.source);
    } else {
      setAnalysisError(result.error ?? "Could not load DIY details");
    }
    setDiyLoading(false);
  };

  const submitBooking = async () => {
    if (!selectedCat || !assessment || !timing || !timeSlot || !serviceDate) return;
    const jobDescription =
      description.trim() || assessment.overview || "Photo-based repair request";
    if (!jobDescription.trim()) return;
    const slot = TIME_SLOTS.find((s) => s.id === timeSlot);
    const dateLabel = formatServiceDate(serviceDate);
    const finalTitle =
      titleInput.trim() ||
      assessment.diagnosis?.slice(0, 70) ||
      jobDescription.slice(0, 70);
    // Extract neighbourhood from address (everything after first comma)
    // so the exact street number isn't shown to contractors before acceptance.
    const fullAddr = address.trim();
    const cityStateZip = fullAddr.includes(",")
      ? fullAddr.split(",").slice(1).join(",").trim()
      : fullAddr || "NYC & Long Island";

    try {
      const created = await addJobBoardJob({
        category: selectedCat as JobCategory,
        title: finalTitle,
        description: jobDescription,
        ...(mediaType === "image" && mediaPreview ? { mediaDataUrl: mediaPreview, mediaType: "image" as const } : {}),
        ...(mediaType === "video" ? { mediaType: "video" as const } : {}),
        aiAssessment: {
          overview: assessment.overview,
          diagnosis: assessment.diagnosis,
          likelyRootCause: assessment.likelyRootCause,
          toolsRequired: assessment.toolsRequired,
          diySteps: assessment.diySteps,
          safetyNotes: assessment.safetyNotes,
          estimatedCost: assessment.estimatedCost,
          estimatedDuration: assessment.estimatedDuration,
          urgency: assessment.urgency,
          professionalRecommended: assessment.professionalRecommended,
        },
        cityStateZip,
        fullAddress: fullAddr || "Address shared after contractor acceptance",
        contactName: user?.name || "Homeowner",
        contactPhone: user?.phone || user?.phones?.[0] || "Not provided",
        dist: "Nearby",
        est: assessment.estimatedCost,
        bids: 0,
        urgent: timing === "same-day",
        ai: true,
        scheduledDate: dateLabel,
        timeSlot: slot?.label,
        serviceTiming: TIMING_OPTIONS.find((t) => t.id === timing)?.label,
      });

      const newJob: HomeJob = {
        id: created.id,
        bookingId: created.bookingId,
        title: finalTitle,
        category: selectedCat,
        posted: created.posted || "Just now",
        bids: 0,
        status: "open",
        est: assessment.estimatedCost,
        topBid: "—",
        aiAssessed: true,
        scheduledDate: dateLabel,
        timeSlot: slot?.label,
        serviceTiming: TIMING_OPTIONS.find((t) => t.id === timing)?.label,
      };
      onJobPosted(newJob);
      // Persist booking contact details to the homeowner profile in DB
      if (fullAddr || user?.phone) {
        void updateUserProfile({
          name: user?.name || "Homeowner",
          ...(fullAddr ? { address: fullAddr, addresses: [fullAddr] } : {}),
          ...(user?.phone ? { phone: user.phone, phones: [user.phone] } : {}),
        }).then((result) => {
          if (result.ok) {
            /* profile cache refreshed by auth helper */
          }
        });
      }
      setBookingSummary({
        dateLabel,
        slotLabel: slot?.label ?? "",
        surcharge: Boolean(slot?.surcharge),
        bookingId: created.bookingId ?? undefined,
      });
      setStep("done");
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Failed to post job. Please try again.");
    }
  };

  if (step === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center max-w-lg mx-auto"
      >
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={28} className="text-green-600" />
        </div>
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold text-3xl uppercase text-foreground mb-2">
          Booking Requested!
        </h3>
        <p className="text-muted-foreground text-sm mb-4">
          Matching contractors have been notified and will review your AI assessment.
        </p>
        {bookingSummary && (
          <div className="w-full border border-border bg-card p-4 text-left text-sm mb-6 space-y-1">
            {bookingSummary.bookingId && (
              <p>
                <span className="text-muted-foreground">Job #:</span>{" "}
                <span className="font-mono font-semibold text-primary tracking-wider">{bookingSummary.bookingId}</span>
              </p>
            )}
            <p><span className="text-muted-foreground">Date:</span> {bookingSummary.dateLabel}</p>
            <p><span className="text-muted-foreground">Time:</span> {bookingSummary.slotLabel}</p>
            {address.trim() && (
              <p><span className="text-muted-foreground">Address:</span> {address.trim()}</p>
            )}
            {bookingSummary.surcharge && (
              <p className="text-orange-600 text-xs mt-2">
                Evening slot selected — a small surcharge may apply at checkout.
              </p>
            )}
          </div>
        )}
        <button onClick={resetFlow} className="bg-primary text-white px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
          Post Another Issue
        </button>
        <button onClick={onViewJobs} className="mt-3 border border-border text-foreground px-6 py-2.5 text-sm font-medium hover:border-foreground/30 transition-colors">
          View My Jobs
        </button>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 text-center sm:text-left">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-bold uppercase tracking-tight text-foreground md:text-[1.75rem]">
            Report an Issue
          </h2>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              aiConfigured
                ? "border-green-300 bg-green-50 text-green-800"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            {aiConfigured ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Select a category, describe the problem, get AI suggestions, then book a pro if needed.
        </p>
      </div>
      <StepIndicator current={step} />

      {/* STEP 1 — Category */}
      {step === "category" && (
        <div className="rounded-[1.35rem] border border-border/70 bg-card p-4 shadow-[0_14px_32px_rgba(10,10,10,0.05)] sm:p-5">
          <p className="mb-3.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-left">
            Step 1 — What category is this?
          </p>
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {CATEGORIES.map(({ label, iconSrc, tint, Fallback }) => {
              const selected = selectedCat === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedCat(label)}
                  className={`group relative flex flex-col items-center gap-1.5 rounded-[1.1rem] border px-2 py-3 transition-all duration-200 ${
                    selected
                      ? "border-primary/45 bg-primary/[0.07] shadow-[0_10px_22px_rgba(255,77,28,0.14)] ring-1 ring-primary/20"
                      : "border-border/60 bg-secondary/30 hover:-translate-y-0.5 hover:border-foreground/12 hover:bg-secondary/50 hover:shadow-[0_10px_20px_rgba(10,10,10,0.06)]"
                  }`}
                >
                  <span
                    className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b ${tint} shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_8px_16px_rgba(10,10,10,0.08)] transition-transform duration-200 group-hover:scale-[1.04] ${
                      selected ? "scale-[1.05]" : ""
                    }`}
                  >
                    <img
                      src={iconSrc}
                      alt={label}
                      width={48}
                      height={48}
                      className="relative z-10 h-12 w-12 object-contain"
                      draggable={false}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <span className="hidden h-full w-full items-center justify-center text-primary">
                      <Fallback size={22} />
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center sm:justify-start">
            <button
              type="button"
              disabled={!selectedCat}
              onClick={() => setStep("describe")}
              className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
                selectedCat
                  ? "bg-primary text-white shadow-[0_10px_22px_rgba(255,77,28,0.26)] hover:bg-primary/90"
                  : "cursor-not-allowed bg-primary/35 text-white/80"
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Describe */}
      {step === "describe" && (
        <div className="rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.05)] sm:p-7">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Step 2 — Title, description & media
          </p>

          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Job Title (optional — we&apos;ll generate one if left blank)
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={`e.g. ${selectedCat} issue at my home`}
              maxLength={100}
              className="w-full rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none transition-colors"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, when it started, and what you've already tried..."
            rows={5}
            className="w-full resize-none rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none transition-colors"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleMediaUpload(e.target.files?.[0] ?? null)}
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/10"
            >
              {mediaType === "video"
                ? <Video size={15} className="text-primary" />
                : <ImagePlus size={15} className="text-primary" />
              }
              {mediaName ? "Change Photo / Video" : "Upload Photo or Video (recommended)"}
            </button>
            {mediaName && <p className="truncate text-[11px] text-muted-foreground">{mediaName}</p>}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Upload a photo to analyze even without a written description — title is optional.
            {mediaType === "video" && " Video uploaded — add a short description so AI can assess it."}
          </p>

          {mediaPreview && mediaType === "image" && (
            <img src={mediaPreview} alt="Uploaded issue" className="mt-5 max-h-64 w-full rounded-2xl border border-border/70 object-cover" />
          )}
          {mediaPreview && mediaType === "video" && (
            <video src={mediaPreview} controls className="mt-5 max-h-64 w-full rounded-2xl border border-border/70" />
          )}

          {selectedCat && (
            <div className="mt-6 rounded-2xl border border-border/60 bg-secondary/50 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                Recommended Contractors: {recommendedCount}
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {getJobRequirements(selectedCat as JobCategory).map((req) => (
                  <li key={req} className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">•</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysisError && (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {analysisError}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => setStep("category")} className="rounded-2xl border border-border bg-background px-5 py-3.5 text-sm font-medium">
              Back
            </button>
            <button
              type="button"
              disabled={!canAnalyze || analyzing}
              onClick={runAiAssessment}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold ${
                canAnalyze && !analyzing
                  ? "bg-primary text-white shadow-[0_12px_28px_rgba(255,77,28,0.28)] hover:bg-primary/90"
                  : "cursor-not-allowed bg-primary/40 text-white/80"
              }`}
            >
              {analyzing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {mediaType === "image" && !description.trim()
                    ? "Analyzing photo..."
                    : mediaType === "image"
                      ? "Analyzing photo + description..."
                      : "Analyzing description..."}
                </>
              ) : (
                "Analyze with AI"
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Assessment summary */}
      {step === "assessment" && assessment && assessmentView === "summary" && (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">AI review</p>
              <h3 className="mt-1 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight text-foreground">
                What we found
              </h3>
            </div>
            {analysisSource && analysisSource !== "fallback" && analysisSource !== "error" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                <Sparkles size={12} />
                Live analysis
              </span>
            )}
          </div>

          {analysisError && analysisSource === "fallback" && (
            <p className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {analysisError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Photo / media card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-[0_18px_40px_rgba(10,10,10,0.05)] lg:col-span-5"
            >
              {mediaPreview && mediaType === "image" ? (
                <img src={mediaPreview} alt="Analyzed issue" className="h-56 w-full object-cover sm:h-64" />
              ) : mediaPreview && mediaType === "video" ? (
                <video src={mediaPreview} controls className="h-56 w-full object-cover sm:h-64" />
              ) : (
                <div className="flex h-56 items-center justify-center bg-secondary sm:h-64">
                  <div className="text-center px-6">
                    <Eye size={28} className="mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">No photo attached — overview is based on your description.</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Category</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{selectedCat}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${urgencyTone(assessment.urgency).soft}`}>
                  {urgencyTone(assessment.urgency).label} urgency
                </span>
              </div>
            </motion.div>

            {/* Overview + urgency ring */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex flex-col justify-between rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.05)] sm:p-6 lg:col-span-7"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                    <Sparkles size={12} />
                    Overview
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{assessment.overview}</p>
                </div>
                <div className="shrink-0 self-center sm:self-start">
                  <UrgencyRing urgency={assessment.urgency || "Medium"} />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-secondary/80 px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={14} />
                    <span className="text-[11px] uppercase tracking-wider">Est. cost</span>
                  </div>
                  <p className="mt-1 [font-family:'Barlow_Condensed',sans-serif] text-xl font-black text-foreground">
                    {assessment.estimatedCost || "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-secondary/80 px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock size={14} />
                    <span className="text-[11px] uppercase tracking-wider">Est. duration</span>
                  </div>
                  <p className="mt-1 [font-family:'Barlow_Condensed',sans-serif] text-xl font-black text-foreground">
                    {assessment.estimatedDuration || "—"}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* What we see */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.05)] sm:p-6 lg:col-span-12"
            >
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-foreground text-background">
                  <Eye size={16} />
                </span>
                <div>
                  <h4 className="text-[15px] font-semibold text-foreground">What we see in your image</h4>
                  <p className="text-xs text-muted-foreground">
                    {assessment.imageObservations.length
                      ? `${assessment.imageObservations.length} visual findings from your upload`
                      : "Visual findings will appear when a photo is analyzed"}
                  </p>
                </div>
              </div>

              {assessment.imageObservations.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assessment.imageObservations.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="rounded-2xl border border-border/60 bg-secondary/50 px-4 py-3.5 transition-colors hover:bg-secondary"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Finding
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90">{item}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
                  No photo findings yet — add a clearer image for visual details.
                </p>
              )}

              {assessment.professionalRecommended && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-orange-200/80 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <p>
                    Based on this review, a licensed professional is often the safer choice — or continue with a guided DIY plan.
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_1fr]">
            <button
              type="button"
              onClick={() => setStep("describe")}
              className="rounded-2xl border border-border bg-card px-5 py-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void openDiyGuide()}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-[0_12px_28px_rgba(10,10,10,0.04)] transition-all hover:-translate-y-0.5 hover:border-foreground/15"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Fix Myself</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Guided DIY steps & parts</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                <ArrowRight size={15} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("timing")}
              className="group flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-left text-white shadow-[0_14px_30px_rgba(255,77,28,0.28)] transition-all hover:-translate-y-0.5 hover:bg-primary/90"
            >
              <div>
                <p className="text-sm font-semibold">Hire a Professional</p>
                <p className="mt-0.5 text-xs text-white/80">Get bids from vetted contractors</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                <ArrowRight size={15} />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3b — DIY guide (soft bento) */}
      {step === "assessment" && assessment && assessmentView === "diy" && (
        <div className="mx-auto w-full space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">DIY guide</p>
              <h3 className="mt-1 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight text-foreground sm:text-4xl">
                Fix it yourself
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Soft step cards based on your issue{mediaPreview && mediaType === "image" ? " and photo" : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAssessmentView("summary")}
              className="self-start rounded-full border border-border/70 bg-card px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            >
              ← Overview
            </button>
          </div>

          {diyLoading && (
            <div className="flex items-start gap-3 rounded-[1.75rem] border border-border/60 bg-card px-5 py-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)]">
              <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Building your DIY plan…</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Please allow a few minutes so we can analyse this and give you accurate information.
                </p>
              </div>
            </div>
          )}

          {analysisError && !diyLoading && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {analysisError}
            </p>
          )}

          {!diyLoading && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
              {/* Hero / diagnosis card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-5"
              >
                <div className="relative h-36 bg-gradient-to-br from-primary/90 via-primary to-[#c43a12] sm:h-40">
                  {mediaPreview && mediaType === "image" ? (
                    <img src={mediaPreview} alt="Your repair" className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, white 0%, transparent 55%)" }} />
                  )}
                  <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    {urgencyTone(assessment.urgency || "Medium").label} urgency
                  </span>
                </div>
                <div className="relative px-5 pb-5 pt-0">
                  <div className="-mt-8 mb-3 flex h-16 w-16 items-center justify-center rounded-full border-4 border-card bg-foreground text-white shadow-lg">
                    <Wrench size={24} />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Diagnosis</p>
                  <h4 className="mt-1 text-lg font-bold leading-snug text-foreground">
                    {assessment.diagnosis || "Repair assessment ready"}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {assessment.likelyRootCause || "Review the steps and materials below before you start."}
                  </p>
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="mt-4 w-full rounded-full bg-gradient-to-r from-primary to-[#ff7a45] py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,77,28,0.35)] transition-transform hover:scale-[1.01]"
                  >
                    Done — I&apos;ll fix it myself
                  </button>
                </div>
              </motion.div>

              {/* Metric tiles */}
              <div className="grid grid-cols-3 gap-3 lg:col-span-3 lg:grid-cols-1">
                {[
                  { label: "Est. cost", value: assessment.estimatedCost, icon: DollarSign, tone: "bg-primary/10 text-primary" },
                  { label: "Duration", value: assessment.estimatedDuration, icon: Clock, tone: "bg-amber-100 text-amber-700" },
                  { label: "Urgency", value: assessment.urgency, icon: Zap, tone: "bg-emerald-100 text-emerald-700" },
                ].map(({ label, value, icon: Icon, tone }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex flex-col justify-between rounded-[1.5rem] border border-border/60 bg-card p-4 shadow-[0_14px_32px_rgba(10,10,10,0.05)]"
                  >
                    <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-2xl ${tone}`}>
                      <Icon size={16} />
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="mt-1 text-sm font-bold leading-snug text-foreground">{value || "—"}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* DIY timeline */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-4"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">Safe DIY steps</h4>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                    {(assessment.diySteps?.length || 0)} steps
                  </span>
                </div>
                {(assessment.diySteps?.length ?? 0) > 0 ? (
                  <ol className="relative space-y-0 pl-2">
                    {assessment.diySteps.map((item, index) => (
                      <li key={`diy-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                        {index < assessment.diySteps.length - 1 && (
                          <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
                        )}
                        <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                          {index + 1}
                        </span>
                        <p className="pt-1.5 text-sm leading-relaxed text-foreground/90">{item}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">Steps will appear once analysis finishes.</p>
                )}
              </motion.div>

              {/* Parts grid */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-5"
              >
                <h4 className="mb-4 text-sm font-bold text-foreground">Parts & materials</h4>
                {(assessment.partsNeeded?.length ?? 0) > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {assessment.partsNeeded.map((part, i) => {
                      const tones = [
                        "from-primary/15 to-primary/5 text-primary",
                        "from-amber-100 to-amber-50 text-amber-800",
                        "from-emerald-100 to-emerald-50 text-emerald-800",
                        "from-sky-100 to-sky-50 text-sky-800",
                        "from-violet-100 to-violet-50 text-violet-800",
                        "from-rose-100 to-rose-50 text-rose-800",
                      ];
                      return (
                        <div
                          key={`part-${i}`}
                          className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-[1.25rem] bg-gradient-to-br p-3 text-center ${tones[i % tones.length]}`}
                        >
                          <Layers size={18} />
                          <span className="line-clamp-3 text-[11px] font-semibold leading-tight text-foreground/90">{part}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No specific parts listed.</p>
                )}
              </motion.div>

              {/* Tools list */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-4"
              >
                <h4 className="mb-4 text-sm font-bold text-foreground">Tools you&apos;ll need</h4>
                {(assessment.toolsRequired?.length ?? 0) > 0 ? (
                  <ul className="space-y-2.5">
                    {assessment.toolsRequired.map((tool, i) => (
                      <li key={`tool-${i}`} className="flex items-center gap-3 rounded-2xl bg-secondary/50 px-3 py-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm">
                          <Hammer size={14} />
                        </span>
                        <span className="text-sm font-medium text-foreground">{tool}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No tools listed.</p>
                )}
              </motion.div>

              {/* Safety + pro process */}
              <div className="flex flex-col gap-4 lg:col-span-3">
                {assessment.safetyNotes && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14 }}
                    className="rounded-[1.5rem] border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50 p-4 shadow-[0_14px_32px_rgba(10,10,10,0.04)]"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <ShieldAlert size={14} />
                      </span>
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-900">Safety</p>
                    </div>
                    <p className="text-sm leading-relaxed text-orange-950/90">{assessment.safetyNotes}</p>
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16 }}
                  className="flex flex-1 flex-col rounded-[1.5rem] bg-foreground p-4 text-background shadow-[0_18px_40px_rgba(10,10,10,0.12)]"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Need a hand?</p>
                  <p className="mt-1 text-sm font-semibold leading-snug">Hire a vetted pro instead</p>
                  <p className="mt-1 flex-1 text-xs text-white/60">
                    {(assessment.professionalSteps?.length ?? 0) > 0
                      ? `Pros typically run ${assessment.professionalSteps.length} steps for this job.`
                      : "Get bids from licensed contractors nearby."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep("timing")}
                    className="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-xs font-bold text-white hover:bg-primary/90"
                  >
                    Hire a Professional <ArrowRight size={12} />
                  </button>
                </motion.div>
              </div>

              {/* Pro process list */}
              {(assessment.professionalSteps?.length ?? 0) > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 }}
                  className="rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-12"
                >
                  <h4 className="mb-4 text-sm font-bold text-foreground">What a professional would do</h4>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {assessment.professionalSteps.map((item, index) => (
                      <div key={`pro-${index}`} className="flex gap-3 rounded-2xl bg-secondary/40 px-3.5 py-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-relaxed text-foreground/90">{item}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setAssessmentView("summary")}
              className="rounded-2xl border border-border/70 bg-card px-5 py-3.5 text-sm font-medium shadow-sm"
            >
              Back to overview
            </button>
            <button
              type="button"
              onClick={() => setStep("timing")}
              className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(255,77,28,0.28)] hover:bg-primary/90"
            >
              Hire a Professional instead
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="rounded-2xl border border-border/70 bg-card px-5 py-3.5 text-sm text-muted-foreground shadow-sm hover:text-foreground"
            >
              Done — I&apos;ll fix it myself
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Timing & Address */}
      {step === "timing" && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
            Step 4 — When & where do you need service?
          </p>

          <div className="mb-6">
            <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">
              Your Address <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 31-42 30th St, Astoria, NY 11102"
              className="w-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors"
            />
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              Shared with the contractor only after they accept your job.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
            {TIMING_OPTIONS.map(({ id, label, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTiming(id);
                  if (id !== "custom") setCustomDate(undefined);
                }}
                className={`flex flex-col items-start gap-1 p-4 border text-left transition-all ${
                  timing === id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20"
                }`}
              >
                <span className={`text-sm font-medium ${timing === id ? "text-primary" : "text-foreground"}`}>{label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>

          {timing === "custom" && (
            <div className="border border-border bg-card p-4 mb-6 inline-block">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={14} className="text-primary" />
                <p className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">Select Date</p>
              </div>
              <Calendar
                mode="single"
                selected={customDate}
                onSelect={setCustomDate}
                disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
              />
            </div>
          )}

          {serviceDate && (
            <p className="text-sm text-muted-foreground mb-4">
              Service date: <span className="text-foreground font-medium">{formatServiceDate(serviceDate)}</span>
            </p>
          )}

          {/* Time slot selection — shown on same screen as date */}
          <div className="mb-6">
            <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-3">
              Your Availability <span className="text-primary">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setTimeSlot(slot.id)}
                  className={`p-4 border text-left transition-all ${
                    timeSlot === slot.id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/20"
                  }`}
                >
                  <span className={`text-sm font-medium ${timeSlot === slot.id ? "text-primary" : "text-foreground"}`}>
                    {slot.label}
                  </span>
                  {slot.surcharge && (
                    <p className="font-mono text-[10px] text-orange-600 mt-1">Small additional fee may apply</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setStep("assessment")} className="border border-border px-5 py-3 text-sm">
              Back
            </button>
            <button
              type="button"
              disabled={!timing || !address.trim() || (timing === "custom" && !customDate) || !timeSlot}
              onClick={() => setStep("timeslot")}
              className={`flex-1 py-3 text-sm font-medium ${
                timing && address.trim() && (timing !== "custom" || customDate) && timeSlot
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "bg-primary/40 text-white/80 cursor-not-allowed"
              }`}
            >
              Review & Confirm
            </button>
          </div>
        </div>
      )}

      {/* STEP 5 — Booking Summary & Submit */}
      {step === "timeslot" && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-6">
            Step 5 — Review your booking
          </p>

          <div className="border border-border bg-card p-5 mb-6 space-y-3 text-sm">
            <p className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-3">Booking Summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Category</p>
                <p className="text-foreground font-medium">{selectedCat}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Estimate</p>
                <p className="text-foreground font-medium">{assessment?.estimatedCost || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Job Title</p>
                <p className="text-foreground">
                  {titleInput.trim() ||
                    assessment?.diagnosis?.slice(0, 70) ||
                    description.trim().slice(0, 70) ||
                    assessment?.overview?.slice(0, 70) ||
                    "Photo-based repair"}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Service Date</p>
                <p className="text-foreground font-medium">{formatServiceDate(serviceDate)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Time Window</p>
                <p className="text-foreground font-medium">{TIME_SLOTS.find((s) => s.id === timeSlot)?.label || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Location</p>
                <p className="text-foreground">{address}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">Exact address hidden until contractor accepts.</p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Available Contractors</p>
                <p className="text-foreground font-medium">{recommendedCount} in your area</p>
              </div>
              {TIME_SLOTS.find((s) => s.id === timeSlot)?.surcharge && (
                <div>
                  <p className="font-mono text-[10px] text-orange-600 uppercase">Evening Surcharge</p>
                  <p className="text-orange-600 text-xs">May apply for this time window</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setStep("timing")} className="border border-border px-5 py-3 text-sm">
              Back
            </button>
            <button
              type="button"
              onClick={submitBooking}
              className="flex-1 py-3 text-sm font-medium bg-primary text-white hover:bg-primary/90 inline-flex items-center justify-center gap-2"
            >
              Post Job & Notify Contractors
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rating Form ────────────────────────────────────────────────────────────

function RatingForm({ jobId, onSubmitted }: { jobId: number; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [review, setReview] = useState("");

  const submit = async () => {
    if (!rating) return;
    await updateJobRating(jobId, rating, review.trim());
    onSubmitted();
  };

  return (
    <div className="mt-4 border border-primary/30 bg-primary/5 p-4 space-y-3">
      <p className="font-mono text-[10px] tracking-wider uppercase text-primary">Rate this contractor</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(0)}
          >
            <Star
              size={22}
              fill={(hovered || rating) >= s ? "#FF4D1C" : "none"}
              className={(hovered || rating) >= s ? "text-primary" : "text-muted-foreground"}
            />
          </button>
        ))}
      </div>
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Leave a review (optional)..."
        rows={2}
        className="w-full border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 resize-none"
      />
      <button
        type="button"
        disabled={!rating}
        onClick={submit}
        className={`px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 ${
          rating ? "bg-primary text-white hover:bg-primary/90" : "bg-primary/40 text-white/80 cursor-not-allowed"
        }`}
      >
        <ThumbsUp size={12} />
        Submit Review
      </button>
    </div>
  );
}

// ─── Job Card ────────────────────────────────────────────────────────────────

function JobCard({ job, index, user }: { job: HomeJob; index: number; user: AuthUser | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [lifecycle, setLifecycle] = useState<JobLifecycle>({ jobId: job.id, status: "open" });
  const [showRatingForm, setShowRatingForm] = useState(false);
  const homeownerName = user?.name || "Homeowner";

  const refreshData = async () => {
    const lc = await getJobLifecycle(job.id);
    setLifecycle(lc);
  };

  useEffect(() => {
    refreshData();
    window.addEventListener("fixbridge-lifecycle-update", refreshData);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", refreshData);
    };
  }, [job.id]);

  const liveStatus = lifecycle.status;
  const isCompleted = liveStatus === "completed";
  const hasRating = Boolean(lifecycle.rating);
  const statusUi = JOB_STATUS_UI[liveStatus] ?? JOB_STATUS_UI.open;
  const StatusIcon = statusUi.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.08 }}
      className="bg-card border border-border p-5 hover:border-primary/30 transition-colors group"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-[11px] tracking-wider text-primary font-semibold border border-primary/30 bg-primary/5 px-2 py-0.5">
              {formatJobNumber(job)}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{job.category}</span>
            <span className={`font-mono text-[10px] tracking-wider uppercase border px-2 py-0.5 inline-flex items-center gap-1 ${statusUi.className}`}>
              <StatusIcon size={9} />
              {statusUi.label}
            </span>
            {!job.aiAssessed && (
              <span className="font-mono text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 uppercase tracking-wider">
                AI Pending
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mb-1">{job.title}</p>
          {(job.scheduledDate || job.timeSlot) && (
            <p className="font-mono text-[11px] text-muted-foreground mb-1">
              {job.scheduledDate}{job.timeSlot ? ` · ${job.timeSlot}` : ""}
            </p>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-mono text-[11px] text-muted-foreground">
              <Clock size={10} className="inline mr-1" />Posted {job.posted}
            </span>
            {lifecycle.contractorName && (
              <span className="font-mono text-[11px] text-blue-600">→ {lifecycle.contractorName}</span>
            )}
            {!lifecycle.contractorName && job.contractor && (
              <span className="font-mono text-[11px] text-blue-600">→ {job.contractor}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-center">
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-2xl text-foreground leading-none">{job.bids}</p>
            <p className="font-mono text-[10px] text-muted-foreground">bids</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{job.topBid}</p>
            <p className="font-mono text-[10px] text-muted-foreground">top bid</p>
          </div>
          {job.saved && (
            <div className="text-center">
              <p className="text-sm font-semibold text-green-600">{job.saved}</p>
              <p className="font-mono text-[10px] text-muted-foreground">saved</p>
            </div>
          )}
          {isCompleted && hasRating && (
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={11} fill={s <= (lifecycle.rating ?? 0) ? "#FF4D1C" : "none"} className={s <= (lifecycle.rating ?? 0) ? "text-primary" : "text-muted-foreground"} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invoice display */}
      {lifecycle.invoiceAmount !== undefined && (
        <div className="mt-3 border border-border bg-background px-3 py-2 text-xs flex items-center gap-2">
          <Receipt size={13} className="text-primary shrink-0" />
          <span className="text-muted-foreground">Invoice:</span>
          <span className="font-medium text-foreground">${lifecycle.invoiceAmount.toLocaleString()}</span>
          {lifecycle.invoiceFileName && (
            <span className="font-mono text-[10px] text-muted-foreground truncate">· {lifecycle.invoiceFileName}</span>
          )}
        </div>
      )}

      {/* Rating form */}
      {isCompleted && !hasRating && !showRatingForm && (
        <button
          type="button"
          onClick={() => setShowRatingForm(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary border border-primary/30 px-3 py-1.5 hover:bg-primary hover:text-white transition-all"
        >
          <Star size={11} />
          Rate this contractor
        </button>
      )}
      {isCompleted && !hasRating && showRatingForm && (
        <RatingForm
          jobId={job.id}
          onSubmitted={() => {
            setShowRatingForm(false);
            void getJobLifecycle(job.id).then(setLifecycle);
          }}
        />
      )}

      <JobChatPanel
        jobId={job.id}
        jobTitle={job.title}
        myRole="homeowner"
        myName={homeownerName}
        placeholder="Type a message to your contractor…"
      />
    </motion.div>
  );
}

function JobsTab({ jobs, user }: { jobs: HomeJob[]; user: AuthUser | null }) {
  const [lifecycleMap, setLifecycleMap] = useState<Record<number, string>>({});
  useEffect(() => {
    const fetchLc = async () => {
      const lcs = await getAllLifecycles();
      const map: Record<number, string> = {};
      lcs.forEach((lc) => { map[lc.jobId] = lc.status; });
      setLifecycleMap(map);
    };
    fetchLc();
    window.addEventListener("fixbridge-lifecycle-update", fetchLc);
    window.addEventListener("fixbridge-chat-update", fetchLc);
    return () => {
      window.removeEventListener("fixbridge-lifecycle-update", fetchLc);
      window.removeEventListener("fixbridge-chat-update", fetchLc);
    };
  }, []);

  const total = jobs.length;
  const active = jobs.filter((j) => {
    const s = lifecycleMap[j.id] ?? "open";
    return s === "open" || s === "accepted" || s === "on-the-way" || s === "arrived" || s === "work-started";
  }).length;
  const completed = jobs.filter((j) => (lifecycleMap[j.id] ?? "open") === "completed").length;
  const totalBids = jobs.reduce((s, j) => s + j.bids, 0);

  return (
    <div className="mx-auto w-full">
      <div className="mb-8 text-center sm:text-left">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl md:text-4xl text-foreground mb-1">
          My Jobs
        </h2>
        <p className="text-sm text-muted-foreground">Track posted jobs, bids received, contractor status, and repair history.</p>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Total Posted", val: total, icon: Briefcase },
          { label: "Active Jobs", val: active, icon: AlertCircle },
          { label: "Completed", val: completed, icon: CheckCircle },
          { label: "Total Bids", val: totalBids, icon: Star },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-[0_14px_32px_rgba(10,10,10,0.05)]">
            <Icon size={14} className="mb-2 text-primary" />
            <p className="[font-family:'Barlow_Condensed',sans-serif] mb-1 text-3xl font-black leading-none text-foreground">{val}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {jobs.map((job, i) => (
          <JobCard key={job.id} job={job} index={i} user={user} />
        ))}
      </div>
    </div>
  );
}

function AITab() {
  const [messages, setMessages] = useState(CHAT_MESSAGES);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    setChatError(null);
    const nextMessages = [...messages, { role: "user" as const, text: q }];
    setMessages(nextMessages);
    setSending(true);

    const history = nextMessages
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({
        role: (m.role === "ai" ? "assistant" : "user") as "user" | "assistant",
        content: m.text,
      }));

    const result = await chatWithAi(history);
    if (result.reply) {
      setMessages((m) => [
        ...m,
        { role: "ai", label: "FixBridge AI", text: result.reply! },
      ]);
    } else {
      setChatError(result.error ?? "Could not reach AI right now. Try again.");
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          label: "FixBridge AI",
          text: "Sorry — I couldn't reach the AI service just now. Please try again in a moment.",
        },
      ]);
    }
    setSending(false);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] w-full max-w-5xl flex-col">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] mb-1 text-3xl font-bold uppercase text-foreground md:text-4xl">
          AI Assistance
        </h2>
        <p className="text-sm text-muted-foreground">
          Chat live about any repair — causes, cost ranges, DIY tips, and when to hire a pro.
        </p>
      </div>
      <div className="mb-4 flex-1 space-y-4 overflow-y-auto rounded-[1.75rem] border border-border/70 bg-card p-5 shadow-[0_18px_40px_rgba(10,10,10,0.05)]">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[80%] p-4 ${msg.role === "user" ? "bg-primary/10 border border-primary/20" : "bg-background border border-border"}`}>
              {"label" in msg && msg.label && (
                <p className="font-mono text-[10px] tracking-[0.15em] text-primary uppercase mb-1.5">{msg.label}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </motion.div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {chatError && (
        <p className="mb-2 text-xs text-red-700 border border-red-200 bg-red-50 px-3 py-2">{chatError}</p>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          disabled={sending}
          placeholder="Ask about a leak, no heat, breaker trips…"
          className="flex-1 border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="bg-primary text-white px-4 py-3 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function ContactTab() {
  const SUPPORT_EMAIL = "Services@omnipronetwork.com";
  const [subject, setSubject] = useState("");
  const [relatedJob, setRelatedJob] = useState("General inquiry");
  const [message, setMessage] = useState("");
  const [sentHint, setSentHint] = useState("");
  const [sending, setSending] = useState(false);

  const openSupportEmail = () => {
    window.location.href = `mailto:${SUPPORT_EMAIL}`;
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedSubject = subject.trim() || "FixBridge support request";
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setSentHint("Please enter a message before sending.");
      return;
    }
    setSending(true);
    setSentHint("");
    try {
      const token = window.localStorage.getItem("fixbridge-auth-token");
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subject: trimmedSubject,
          relatedJob,
          message: trimmedMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSentHint(data.message || "Could not save your message. Please try again.");
        setSending(false);
        return;
      }
      const body = [
        `Related job: ${relatedJob}`,
        "",
        trimmedMessage,
        "",
        "— Sent from FixBridge Contact Us",
      ].join("\n");
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(trimmedSubject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      setSentHint(`Saved to FixBridge and opening your email app for ${SUPPORT_EMAIL}…`);
      setSubject("");
      setMessage("");
    } catch {
      setSentHint("Network error while saving. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full">
      <div className="mb-8 text-center sm:text-left">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] mb-1 text-3xl font-bold uppercase text-foreground md:text-4xl">
          Contact & Support
        </h2>
        <p className="text-sm text-muted-foreground">We&apos;re here to help with anything on the platform.</p>
      </div>
      <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card p-6 opacity-75 shadow-[0_14px_32px_rgba(10,10,10,0.05)]">
          <MessageSquare size={20} className="text-muted-foreground" />
          <div>
            <p className="mb-0.5 text-sm font-medium text-foreground">Live Chat</p>
            <p className="text-[11px] text-muted-foreground">Live chat is not available yet.</p>
          </div>
          <button
            type="button"
            disabled
            className="mt-auto cursor-not-allowed rounded-2xl bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground"
          >
            Coming Soon
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-[0_14px_32px_rgba(10,10,10,0.05)]">
          <Mail size={20} className="text-primary" />
          <div>
            <p className="mb-0.5 text-sm font-medium text-foreground">Email Support</p>
            <p className="text-[11px] text-muted-foreground">{SUPPORT_EMAIL}</p>
          </div>
          <button
            type="button"
            onClick={openSupportEmail}
            className="mt-auto rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            Send Email
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-[0_14px_32px_rgba(10,10,10,0.05)]">
          <Phone size={20} className="text-primary" />
          <div>
            <p className="mb-0.5 text-sm font-medium text-foreground">Phone</p>
            <p className="text-[11px] text-muted-foreground">(212) 555-0182 · Mon–Fri 9am–6pm EST</p>
          </div>
          <a
            href="tel:+12125550182"
            className="mt-auto rounded-2xl border border-border px-4 py-2 text-center text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            Call Now
          </a>
        </div>
      </div>

      <form
        onSubmit={sendMessage}
        className="mb-6 rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-[0_14px_32px_rgba(10,10,10,0.05)]"
      >
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Send a Message</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Messages are sent to <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span>.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Issue with bid received"
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Related Job</label>
              <select
                value={relatedJob}
                onChange={(e) => setRelatedJob(e.target.value)}
                className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:border-primary/60 focus:outline-none"
              >
                <option>Kitchen sink drain clog</option>
                <option>Furnace repair</option>
                <option>General inquiry</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Message</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question…"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/60 focus:outline-none"
            />
          </div>
          {sentHint && <p className="text-xs text-muted-foreground">{sentHint}</p>}
          <button
            type="submit"
            disabled={sending}
            className="rounded-2xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {sending ? "Saving…" : "Send Message"}
          </button>
        </div>
      </form>

      <div className="rounded-[1.5rem] border border-border/70 bg-muted/50 p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-foreground">Quick FAQs</p>
        <div className="space-y-2">
          {["How long until I get my first bid?", "Can I reject a bid after accepting?", "What does the booking fee cover?", "How are contractors vetted?"].map((q) => (
            <button key={q} type="button" className="flex w-full items-center justify-between border-b border-border/50 py-2 text-left text-sm text-muted-foreground transition-colors last:border-0 hover:text-foreground">
              {q}
              <ChevronRight size={14} className="shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeownerProfileTab({
  user,
  jobs = [],
  onUserUpdated,
  onViewJobs,
}: {
  user: AuthUser | null;
  jobs?: HomeJob[];
  onUserUpdated: (u: AuthUser) => void;
  onViewJobs?: () => void;
}) {
  const nameParts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(nameParts[0] ?? "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [contactEmail, setContactEmail] = useState(user?.contactEmail ?? user?.email ?? "");
  const [photoDataUrl, setPhotoDataUrl] = useState(user?.photoDataUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const parts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" ") || "");
    setPhone(user?.phone ?? "");
    setAddress(user?.address ?? "");
    setContactEmail(user?.contactEmail ?? user?.email ?? "");
    setPhotoDataUrl(user?.photoDataUrl ?? "");
  }, [user]);

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || user?.name || "Homeowner";
  const initials = fullName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "HO";

  const openCount = jobs.filter((j) => j.status === "open" || j.status === "in-progress").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const totalBids = jobs.reduce((s, j) => s + (j.bids || 0), 0);
  const profileFill = [firstName, lastName, phone, address, contactEmail, photoDataUrl].filter((v) => String(v).trim()).length;
  const profilePct = Math.round((profileFill / 6) * 100);

  const fieldClass =
    "w-full rounded-2xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none";

  const handlePhoto = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await updateUserProfile({
      name: fullName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      contactEmail: contactEmail.trim(),
      emails: contactEmail.trim() ? [contactEmail.trim()] : [],
      phones: phone.trim() ? [phone.trim()] : [],
      addresses: address.trim() ? [address.trim()] : [],
      ...(photoDataUrl ? { photoDataUrl } : {}),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUserUpdated(result.user);
    setMessage("Profile saved.");
  };

  const recentJobs = jobs.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="text-center sm:text-left">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-bold uppercase text-foreground md:text-4xl">
          My Profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Details shared with contractors after they accept your job.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Profile summary */}
        <div className="flex flex-col items-center rounded-[1.75rem] border border-border/60 bg-card p-6 text-center shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-4">
          <div className="relative mb-4">
            {photoDataUrl ? (
              <img src={photoDataUrl} alt={fullName} className="h-28 w-28 rounded-full object-cover shadow-md ring-4 ring-secondary" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-3xl font-black text-white shadow-md ring-4 ring-secondary [font-family:'Barlow_Condensed',sans-serif]">
                {initials}
              </div>
            )}
          </div>
          <h3 className="text-xl font-bold text-foreground">{fullName}</h3>
          <div className="mt-2 flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-primary" />
              {address.trim() || "Add your service address"}
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Homeowner
            </span>
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
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account Email</label>
              <input value={user?.email ?? ""} disabled className={`${fieldClass} opacity-70`} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact Email</label>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(917) 555-0100" className={fieldClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Service Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Brooklyn, NY" className={fieldClass} />
            </div>
          </div>
        </div>

        {/* Activity meters */}
        <div className="rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-5">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">My Activity</h3>
            <span className="text-[11px] font-semibold text-primary">{profilePct}% complete</span>
          </div>
          <div className="space-y-5">
            {[
              { label: "Profile completeness", pct: profilePct, scale: ["Start", "Halfway", "Ready"] },
              { label: "Active jobs", pct: Math.min(100, openCount * 25), scale: ["0", "Few", "Busy"], hint: `${openCount} open` },
              { label: "Jobs completed", pct: Math.min(100, completedCount * 20), scale: ["0", "Some", "Many"], hint: `${completedCount} done` },
              { label: "Bids received", pct: Math.min(100, totalBids * 10), scale: ["Low", "Steady", "High"], hint: `${totalBids} total` },
            ].map(({ label, pct, scale, hint }) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
                </div>
                <div className="relative h-2.5 rounded-full bg-secondary">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  <span
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
                    style={{ left: `calc(${pct}% - 8px)` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  {scale.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent jobs */}
        <div className="rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_40px_rgba(10,10,10,0.06)] lg:col-span-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">My Jobs</h3>
            {onViewJobs && (
              <button type="button" onClick={onViewJobs} className="text-xs font-semibold text-primary hover:underline">
                View all
              </button>
            )}
          </div>
          {recentJobs.length === 0 ? (
            <p className="rounded-2xl bg-secondary/50 px-4 py-8 text-center text-sm text-muted-foreground">
              No jobs yet — post a repair to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex flex-col rounded-[1.25rem] border border-border/60 bg-secondary/30 p-4">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{job.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Briefcase size={11} className="text-primary" />
                      {job.category}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {job.posted}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {job.status}
                    </span>
                    {onViewJobs && (
                      <button
                        type="button"
                        onClick={onViewJobs}
                        className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

export default function HomeownerDashboard({
  onLogout,
  user,
  isDark,
  onToggleDark,
  onUserUpdated,
}: {
  onLogout: () => void;
  user: AuthUser | null;
  isDark: boolean;
  onToggleDark: () => void;
  onUserUpdated?: (u: AuthUser) => void;
}) {
  const [activeTab, setActiveTab] = useState<DashTab>("post");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jobs, setJobs] = useState<HomeJob[]>([]);
  const [profileUser, setProfileUser] = useState<AuthUser | null>(user);
  const mainScrollRef = useRef<HTMLElement>(null);
  const displayName = profileUser?.name || user?.name || "Maria Santos";
  const initials = displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const goToTab = (id: DashTab) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
    // Always start Contact Us (and other tabs) from the top of the content area
    requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: id === "contact" ? "smooth" : "auto" });
      window.scrollTo({ top: 0, behavior: id === "contact" ? "smooth" : "auto" });
    });
  };

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const mapStatus = (s: string): HomeJob["status"] => {
      if (s === "completed") return "completed";
      if (s && s !== "open") return "in-progress";
      return "open";
    };
    const refreshJobs = async () => {
      const [mine, lcs] = await Promise.all([getMyJobs(), getAllLifecycles()]);
      if (cancelled) return;
      const lcMap = Object.fromEntries(lcs.map((lc) => [lc.jobId, lc]));
      setJobs(
        mine.map((j) => {
          const lc = lcMap[j.id];
          return {
            id: j.id,
            bookingId: j.bookingId,
            title: j.title,
            category: j.category,
            posted: j.posted,
            bids: j.bids,
            status: mapStatus(lc?.status ?? "open"),
            est: j.est,
            topBid: "—",
            aiAssessed: Boolean(j.ai),
            scheduledDate: j.scheduledDate,
            timeSlot: j.timeSlot,
            serviceTiming: j.serviceTiming,
            contractor: lc?.contractorName,
            rating: lc?.rating,
          };
        }),
      );
    };
    void refreshJobs();
    const onLc = () => { void refreshJobs(); };
    window.addEventListener("fixbridge-lifecycle-update", onLc);
    return () => {
      cancelled = true;
      window.removeEventListener("fixbridge-lifecycle-update", onLc);
    };
  }, []);

  const handleProfileUpdated = (u: AuthUser) => {
    setProfileUser(u);
    onUserUpdated?.(u);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F0EA]">
      {/* Sidebar overlay (mobile) */}
      {mobileMenuOpen && (
        <button type="button" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu overlay" />
      )}

      {/* Slim pill sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 m-0 flex flex-col transition-all duration-300 md:m-3 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${sidebarOpen ? "md:w-56" : "md:w-[4.5rem]"} w-72 shrink-0`}>
        <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-[#1A1614] text-white shadow-[0_20px_50px_rgba(10,10,10,0.18)]">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
            <button type="button" onClick={() => setSidebarOpen((s) => !s)} className="flex items-center gap-1.5">
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-lg font-black tracking-wider">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-lg font-black tracking-wider text-primary">BRIDGE</span>
              {sidebarOpen && <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold">AI</span>}
            </button>
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-white/60 hover:text-white md:hidden">
              <X size={18} />
            </button>
          </div>

          <div className="border-b border-white/10 bg-white/5 px-4 py-3 md:hidden">
            <p className="text-sm font-semibold">{displayName}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/50">Homeowner</p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => goToTab(id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-colors md:py-2.5 ${
                  activeTab === id ? "bg-primary text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className={`truncate text-sm font-medium ${!sidebarOpen ? "md:hidden" : ""}`}>{label}</span>
              </button>
            ))}
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

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:pr-3 md:pt-3 md:pb-3">
        <header className="mb-0 flex h-14 shrink-0 items-center justify-between rounded-none border-b border-border/60 bg-card/90 px-4 backdrop-blur md:mb-3 md:h-16 md:rounded-[1.5rem] md:border md:px-6 md:shadow-[0_12px_30px_rgba(10,10,10,0.05)]">
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-1 md:hidden" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-base font-black tracking-wider text-foreground">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] text-base font-black tracking-wider text-primary">BRIDGE</span>
            </button>
            <div className="hidden md:block">
              <p className="text-sm font-semibold leading-tight text-foreground">{displayName}</p>
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-primary" />
                <p className="text-[10px] text-muted-foreground">Homeowner</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:text-foreground">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white md:hidden">
              {initials}
            </button>
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white md:flex">
              {initials}
            </div>
          </div>
        </header>

        <main
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto rounded-none p-4 pb-20 md:rounded-[1.75rem] md:border md:border-border/60 md:bg-card/40 md:p-6 md:pb-8 lg:p-8"
        >
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto w-full max-w-5xl"
          >
            {activeTab === "post" && (
              <PostTab
                onJobPosted={(job) => setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])}
                onViewJobs={() => goToTab("jobs")}
                user={profileUser}
              />
            )}
            {activeTab === "jobs" && <JobsTab jobs={jobs} user={profileUser} />}
            {activeTab === "ai" && <AITab />}
            {activeTab === "profile" && (
              <HomeownerProfileTab
                user={profileUser}
                jobs={jobs}
                onUserUpdated={handleProfileUpdated}
                onViewJobs={() => goToTab("jobs")}
              />
            )}
            {activeTab === "contact" && <ContactTab />}
          </motion.div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border/70 bg-card/95 backdrop-blur safe-area-inset-bottom md:hidden">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => goToTab(id)}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              activeTab === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 1.8} />
            <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
