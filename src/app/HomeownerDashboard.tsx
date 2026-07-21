import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import { format, addDays, nextSaturday, isBefore, startOfDay } from "date-fns";
import {
  PlusCircle, Briefcase, MessageSquare, Phone,
  Bell, LogOut, Zap, Wrench, Flame, PaintBucket,
  Home, Layers, Hammer, ChevronRight, Star, Clock,
  CheckCircle, AlertCircle, Send, MapPin, DollarSign,
  Mail, Sun, Moon, Menu, X, ImagePlus, Loader2, CalendarDays,
  Video, Truck, Navigation, HardHat, Receipt, ThumbsUp, User,
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
  analyzeWithGemini,
  getGeminiKeyIssue,
  isGeminiConfigured,
  type GeminiAssessment,
} from "./geminiAssessment";
import {
  getJobLifecycle,
  getAllLifecycles,
  updateJobRating,
  STATUS_LABELS,
  type JobStatus,
  type JobLifecycle,
} from "./jobLifecycle";

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
  { icon: Wrench, label: "Plumbing" },
  { icon: Zap, label: "Electrical" },
  { icon: Flame, label: "HVAC" },
  { icon: PaintBucket, label: "Painting" },
  { icon: Home, label: "Roofing" },
  { icon: Layers, label: "Flooring" },
  { icon: Hammer, label: "Carpentry" },
  { icon: Home, label: "Others" },
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

const INITIAL_JOBS: HomeJob[] = [
  {
    id: 1,
    bookingId: "FB-DEMO-0001",
    title: "Kitchen sink drain clog",
    category: "Plumbing",
    posted: "Jun 22, 2024",
    bids: 4,
    status: "open",
    est: "$180–$340",
    topBid: "$195",
    aiAssessed: true,
  },
  {
    id: 2,
    bookingId: "FB-DEMO-0002",
    title: "Furnace not heating evenly — 2nd floor",
    category: "HVAC",
    posted: "Jun 18, 2024",
    bids: 7,
    status: "in-progress",
    est: "$280–$520",
    topBid: "$310",
    aiAssessed: true,
    contractor: "Ed Kowalski HVAC",
  },
  {
    id: 3,
    bookingId: "FB-DEMO-0003",
    title: "Bathroom tile re-grouting",
    category: "General",
    posted: "May 30, 2024",
    bids: 5,
    status: "completed",
    est: "$300–$600",
    topBid: "$385",
    aiAssessed: true,
    saved: "$215",
    rating: 5,
  },
  {
    id: 4,
    bookingId: "FB-DEMO-0004",
    title: "Outdoor deck board replacement",
    category: "Carpentry",
    posted: "Jun 24, 2024",
    bids: 0,
    status: "open",
    est: "Pending AI",
    topBid: "—",
    aiAssessed: false,
  },
];

const CHAT_MESSAGES = [
  { role: "user", text: "My bathroom faucet is dripping constantly. It started about a week ago." },
  { role: "ai", label: "Assessment", text: "A constantly dripping faucet is usually a worn cartridge, O-ring, or washer. It's low urgency but wastes water — a typical NYC household loses 3,000+ gallons/year from a drip." },
  { role: "ai", label: "Cost Estimate", text: "NYC area repair range: $85–$200. Faucet cartridge replacement if DIY-able: $15–$40 in parts. Licensed plumber visit: $95–$185 including labor." },
  { role: "ai", label: "Next Steps", text: "Ready to post this for bids? I'll include the assessment in your job listing so contractors come prepared with the right parts." },
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
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div>
      <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-2">{title}</p>
      <ListTag className={`space-y-1.5 text-sm text-foreground ${ordered ? "list-decimal list-inside" : ""}`}>
        {items.map((item) => (
          <li key={item} className={ordered ? "" : "flex gap-2"}>
            {!ordered && <span className="text-primary shrink-0">•</span>}
            <span>{item}</span>
          </li>
        ))}
      </ListTag>
    </div>
  );
}

function StepIndicator({ current }: { current: PostStep }) {
  const order = POST_STEPS.map((s) => s.id);
  const currentIndex = order.indexOf(current);
  return (
    <div className="flex flex-wrap gap-2 mb-8">
      {POST_STEPS.map((step, index) => {
        const active = step.id === current;
        const complete = index < currentIndex;
        return (
          <div
            key={step.id}
            className={`font-mono text-[10px] tracking-wider uppercase px-2.5 py-1 border ${
              active
                ? "border-primary bg-primary/10 text-primary"
                : complete
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-border text-muted-foreground"
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
  const [assessment, setAssessment] = useState<GeminiAssessment | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"gemini" | "fallback" | "error" | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [timing, setTiming] = useState<TimingOption | null>(null);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [address, setAddress] = useState("");
  const [timeSlot, setTimeSlot] = useState<TimeSlotId | null>(null);
  const [bookingSummary, setBookingSummary] = useState<{
    dateLabel: string;
    slotLabel: string;
    surcharge: boolean;
    bookingId?: string;
  } | null>(null);

  const [contractorUsers, setContractorUsers] = useState<AuthUser[]>([]);
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
    setAssessment(null);
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

  const runGeminiAssessment = async () => {
    if (!selectedCat || !description.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    const result = await analyzeWithGemini({
      category: selectedCat as JobCategory,
      description,
      imageDataUrl: mediaType === "image" ? mediaPreview : null,
    });
    setAnalysisSource(result.source);
    setAnalysisError(result.error ?? null);
    if (result.source === "error" || !result.assessment) {
      setAssessment(null);
      setAnalyzing(false);
      return;
    }
    setAssessment(result.assessment);
    setAnalyzing(false);
    setStep("assessment");
  };

  const submitBooking = async () => {
    if (!selectedCat || !description.trim() || !assessment || !timing || !timeSlot || !serviceDate) return;
    const slot = TIME_SLOTS.find((s) => s.id === timeSlot);
    const dateLabel = formatServiceDate(serviceDate);
    const finalTitle = titleInput.trim() || description.trim().slice(0, 70);
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
        description: description.trim(),
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
        contactPhone: "(917) 555-0100",
        dist: "2.0 mi",
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
    <div className="max-w-3xl">
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Report an Issue
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Select a category, describe the problem, get Gemini suggestions, then book a pro if needed.
      </p>
      {!isGeminiConfigured() && (
        <p className="text-xs text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2 mb-4">
          {getGeminiKeyIssue()}. Get a free key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">
            aistudio.google.com/apikey
          </a>
          , add it as a Replit Secret named <code className="font-mono">VITE_GEMINI_API_KEY</code>, then restart the app.
        </p>
      )}
      {isGeminiConfigured() && (
        <p className="text-xs text-green-700 border border-green-200 bg-green-50 px-3 py-2 mb-4">
          Gemini API connected. Upload a photo and click Analyze for live AI repair assessment.
        </p>
      )}
      <StepIndicator current={step} />

      {/* STEP 1 — Category */}
      {step === "category" && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
            Step 1 — What category is this?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-8">
            {CATEGORIES.map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedCat(label)}
                className={`flex flex-col items-center gap-2 py-4 px-2 border transition-all duration-150 ${
                  selectedCat === label
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                }`}
              >
                <Icon size={18} />
                <span className="font-mono text-[10px] tracking-wider uppercase">{label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!selectedCat}
            onClick={() => setStep("describe")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              selectedCat ? "bg-primary text-white hover:bg-primary/90" : "bg-primary/40 text-white/80 cursor-not-allowed"
            }`}
          >
            Continue
          </button>
        </div>
      )}

      {/* STEP 2 — Describe */}
      {step === "describe" && (
        <div>
          <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-4">
            Step 2 — Title, description & media
          </p>

          <div className="mb-4">
            <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">
              Job Title (optional — we'll generate one if left blank)
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder={`e.g. ${selectedCat} issue at my home`}
              maxLength={100}
              className="w-full border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, when it started, and what you've already tried..."
            rows={5}
            className="w-full border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors resize-none"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleMediaUpload(e.target.files?.[0] ?? null)}
          />
          <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm hover:border-primary transition-colors"
            >
              {mediaType === "video"
                ? <Video size={15} className="text-primary" />
                : <ImagePlus size={15} className="text-primary" />
              }
              {mediaName ? "Change Photo / Video" : "Upload Photo or Video (recommended)"}
            </button>
            {mediaName && <p className="font-mono text-[10px] text-muted-foreground truncate">{mediaName}</p>}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground mt-2">
            Gemini uses your photo to identify damage, likely parts, and the professional repair plan.
            {mediaType === "video" && " Video uploaded — AI will analyze based on your description."}
          </p>

          {mediaPreview && mediaType === "image" && (
            <img src={mediaPreview} alt="Uploaded issue" className="mt-4 max-h-56 w-full object-cover border border-border" />
          )}
          {mediaPreview && mediaType === "video" && (
            <video src={mediaPreview} controls className="mt-4 max-h-56 w-full border border-border" />
          )}

          {selectedCat && (
            <div className="mt-6 border border-border bg-card p-4">
              <p className="font-mono text-[11px] tracking-[0.15em] text-primary uppercase mb-2">
                Recommended Contractors: {recommendedCount}
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {getJobRequirements(selectedCat as JobCategory).map((req) => (
                  <li key={req} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysisError && (
            <p className="mt-4 text-xs text-red-700 border border-red-200 bg-red-50 px-3 py-2">
              {analysisError}
            </p>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setStep("category")} className="border border-border px-5 py-3 text-sm">
              Back
            </button>
            <button
              type="button"
              disabled={!description.trim() || analyzing}
              onClick={runGeminiAssessment}
              className={`flex-1 py-3 text-sm font-medium inline-flex items-center justify-center gap-2 ${
                description.trim() && !analyzing
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "bg-primary/40 text-white/80 cursor-not-allowed"
              }`}
            >
              {analyzing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {mediaType === "image" ? "Analyzing photo + description..." : "Analyzing description..."}
                </>
              ) : (
                "Analyze with Gemini"
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Assessment */}
      {step === "assessment" && assessment && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <p className="font-mono text-[11px] tracking-[0.15em] text-primary uppercase">
              Gemini Repair Analysis
            </p>
            {analysisSource === "gemini" && (
              <span className="font-mono text-[9px] uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 px-2 py-0.5">
                Live AI
              </span>
            )}
            {analysisSource === "fallback" && (
              <span className="font-mono text-[9px] uppercase tracking-wider bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5">
                Offline — no API key
              </span>
            )}
          </div>
          {analysisError && analysisSource === "fallback" && (
            <p className="text-xs text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2 mb-4">
              {analysisError}
            </p>
          )}

          {mediaPreview && mediaType === "image" && (
            <img src={mediaPreview} alt="Analyzed issue" className="mb-4 max-h-48 w-full object-cover border border-border" />
          )}
          {mediaPreview && mediaType === "video" && (
            <video src={mediaPreview} controls className="mb-4 max-h-48 w-full border border-border" />
          )}

          <div className="border border-primary/30 bg-primary/5 p-5 space-y-5 mb-6">
            <div>
              <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1">Overview</p>
              <p className="text-sm text-foreground leading-relaxed">{assessment.overview}</p>
            </div>
            <AssessmentSection title="What we see in your image" items={assessment.imageObservations} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1">Diagnosis</p>
                <p className="text-sm text-foreground">{assessment.diagnosis}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase mb-1">Likely Root Cause</p>
                <p className="text-sm text-foreground">{assessment.likelyRootCause}</p>
              </div>
            </div>
            <AssessmentSection title="Professional repair process" items={assessment.professionalSteps} ordered />
            <AssessmentSection title="Parts & materials needed" items={assessment.partsNeeded} />
            <AssessmentSection title="Tools a pro would bring" items={assessment.toolsRequired} />
            <AssessmentSection title="Safe DIY steps (if you want to try)" items={assessment.diySteps} ordered />
            <AssessmentSection title="Safety tips" items={assessment.safetyNotes ? [assessment.safetyNotes] : []} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm border-t border-primary/20 pt-4">
              <p className="text-muted-foreground">Est. cost<br /><span className="text-foreground font-medium">{assessment.estimatedCost}</span></p>
              <p className="text-muted-foreground">Est. duration<br /><span className="text-foreground font-medium">{assessment.estimatedDuration}</span></p>
              <p className="text-muted-foreground">Urgency<br /><span className="text-foreground font-medium">{assessment.urgency}</span></p>
            </div>
            <p className="text-xs text-orange-700 border border-orange-200 bg-orange-50 px-3 py-2">
              {assessment.safetyNotes}
            </p>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {assessment.professionalRecommended
              ? "Based on the assessment, a licensed professional is recommended."
              : "You can try the DIY steps above, or book a vetted professional for peace of mind."}
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => setStep("describe")} className="border border-border px-5 py-3 text-sm">
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep("timing")}
              className="flex-1 bg-primary text-white py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Hire a Professional
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="border border-border px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Fix It Myself
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
                <p className="text-foreground">{titleInput.trim() || description.trim().slice(0, 70)}</p>
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
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        My Jobs
      </h2>
      <p className="text-sm text-muted-foreground mb-8">Track posted jobs, bids received, contractor status, and repair history.</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Posted", val: total, icon: Briefcase },
          { label: "Active Jobs", val: active, icon: AlertCircle },
          { label: "Completed", val: completed, icon: CheckCircle },
          { label: "Total Bids", val: totalBids, icon: Star },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="bg-card border border-border p-4">
            <Icon size={14} className="text-primary mb-2" />
            <p className="[font-family:'Barlow_Condensed',sans-serif] font-black text-3xl text-foreground leading-none mb-1">{val}</p>
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
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

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", text: input }]);
    const q = input;
    setInput("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          label: "AI Response",
          text: `I understand your question about "${q}". Based on typical NYC-area jobs, this sounds like a repair that would cost approximately $150–$400 and may require a licensed professional. Shall I help you post this as a job for contractor bids?`,
        },
      ]);
    }, 800);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="mb-6">
        <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
          AI Assistance
        </h2>
        <p className="text-sm text-muted-foreground">
          Describe any repair problem — get an instant assessment, cost estimate, and next steps.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto border border-border bg-card p-5 space-y-4 mb-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[80%] p-4 ${msg.role === "user" ? "bg-primary/10 border border-primary/20" : "bg-background border border-border"}`}>
              {"label" in msg && msg.label && (
                <p className="font-mono text-[10px] tracking-[0.15em] text-primary uppercase mb-1.5">{msg.label}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed">{msg.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Describe your repair problem…"
          className="flex-1 border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 transition-colors"
        />
        <button onClick={handleSend} className="bg-primary text-white px-4 py-3 hover:bg-primary/90 transition-colors">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function ContactTab() {
  return (
    <div>
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">
        Contact & Support
      </h2>
      <p className="text-sm text-muted-foreground mb-8">We're here to help with anything on the platform.</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
        {[
          { icon: MessageSquare, label: "Live Chat", desc: "Usually responds in under 2 min", cta: "Start Chat", primary: true },
          { icon: Mail, label: "Email Support", desc: "support@fixbridge.ai · 4–6h response", cta: "Send Email", primary: false },
          { icon: Phone, label: "Phone", desc: "(212) 555-0182 · Mon–Fri 9am–6pm EST", cta: "Call Now", primary: false },
        ].map(({ icon: Icon, label, desc, cta, primary }) => (
          <div key={label} className="bg-card border border-border p-6 flex flex-col gap-3">
            <Icon size={20} className="text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground mb-0.5">{label}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <button className={`text-sm font-medium px-4 py-2 transition-colors mt-auto ${primary ? "bg-primary text-white hover:bg-primary/90" : "border border-border text-foreground hover:border-foreground/30"}`}>
              {cta}
            </button>
          </div>
        ))}
      </div>
      <div className="border border-border bg-card p-6 mb-6">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase mb-4">Send a Message</p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Subject</label>
              <input type="text" placeholder="Issue with bid received" className="w-full border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Related Job</label>
              <select className="w-full border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60">
                <option>Kitchen sink drain clog</option>
                <option>Furnace repair</option>
                <option>General inquiry</option>
              </select>
            </div>
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase block mb-1.5">Message</label>
            <textarea rows={4} placeholder="Describe your issue or question…" className="w-full border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 resize-none" />
          </div>
          <button className="bg-primary text-white px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">Send Message</button>
        </div>
      </div>
      <div className="bg-muted/50 border border-border p-5">
        <p className="font-mono text-[11px] tracking-wider text-foreground uppercase mb-3">Quick FAQs</p>
        <div className="space-y-2">
          {["How long until I get my first bid?", "Can I reject a bid after accepting?", "What does the booking fee cover?", "How are contractors vetted?"].map((q) => (
            <button key={q} className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground py-2 border-b border-border/50 last:border-0 transition-colors text-left">
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
  onUserUpdated,
}: {
  user: AuthUser | null;
  onUserUpdated: (u: AuthUser) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [contactEmail, setContactEmail] = useState(user?.contactEmail ?? user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await updateUserProfile({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      contactEmail: contactEmail.trim(),
      emails: contactEmail.trim() ? [contactEmail.trim()] : [],
      phones: phone.trim() ? [phone.trim()] : [],
      addresses: address.trim() ? [address.trim()] : [],
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUserUpdated(result.user);
    setMessage("Profile saved.");
  };

  return (
    <div className="max-w-2xl">
      <h2 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-3xl text-foreground mb-1">My Profile</h2>
      <p className="text-sm text-muted-foreground mb-8">Contact details shared with contractors after they accept your job.</p>
      <div className="bg-card border border-border p-6 space-y-4">
        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Full Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Account Email</label>
          <input value={user?.email ?? ""} disabled className="w-full border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground" />
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Contact Email</label>
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="w-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(917) 555-0100" className="w-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
        </div>
        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase block mb-1.5">Service Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Brooklyn, NY 11201" className="w-full border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:border-primary/60" />
        </div>
        {error && <p className="text-sm text-red-700 border border-red-200 bg-red-50 px-3 py-2">{error}</p>}
        {message && <p className="text-sm text-green-700 border border-green-200 bg-green-50 px-3 py-2">{message}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save Profile
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
  const [jobs, setJobs] = useState<HomeJob[]>(INITIAL_JOBS);
  const [profileUser, setProfileUser] = useState<AuthUser | null>(user);
  const displayName = profileUser?.name || user?.name || "Maria Santos";
  const initials = displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mine = await getMyJobs();
      if (cancelled || !mine.length) return;
      setJobs(
        mine.map((j) => ({
          id: j.id,
          bookingId: j.bookingId,
          title: j.title,
          category: j.category,
          posted: j.posted,
          bids: j.bids,
          status: "open" as const,
          est: j.est,
          topBid: "—",
          aiAssessed: Boolean(j.ai),
          scheduledDate: j.scheduledDate,
          timeSlot: j.timeSlot,
          serviceTiming: j.serviceTiming,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProfileUpdated = (u: AuthUser) => {
    setProfileUser(u);
    onUserUpdated?.(u);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar overlay (mobile) */}
      {mobileMenuOpen && (
        <button type="button" className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu overlay" />
      )}

      {/* Sidebar — desktop always visible, mobile slide-in for secondary actions */}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} ${sidebarOpen ? "md:w-56" : "md:w-16"} w-72 shrink-0`}>
        <div className="border-b border-border px-4 py-4 flex items-center justify-between h-16">
          <button onClick={() => setSidebarOpen((s) => !s)} className="flex items-center gap-1.5">
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-foreground">FIX</span>
            <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-lg tracking-wider text-primary">BRIDGE</span>
            {sidebarOpen && <span className="font-mono text-[9px] bg-primary text-white px-1 py-0.5 ml-0.5">AI</span>}
          </button>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="md:hidden p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Mobile-only user info */}
        <div className="md:hidden px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Homeowner</p>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 transition-colors rounded-sm ${activeTab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className={`text-sm font-medium truncate ${!sidebarOpen ? "md:hidden" : ""}`}>{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-border p-3 space-y-0.5">
          <button onClick={onToggleDark} className="w-full flex items-center gap-3 px-3 py-2.5 md:py-2 text-muted-foreground hover:text-foreground transition-colors rounded-sm">
            {isDark ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
            <span className={`text-sm ${!sidebarOpen ? "md:hidden" : ""}`}>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 md:py-2 text-muted-foreground hover:text-foreground transition-colors rounded-sm">
            <LogOut size={16} className="shrink-0" />
            <span className={`text-sm ${!sidebarOpen ? "md:hidden" : ""}`}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-14 md:h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card shrink-0">
          <div className="flex items-center gap-3">
            {/* Desktop sidebar toggle / Mobile logo */}
            <button type="button" className="md:hidden flex items-center gap-1" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-base tracking-wider text-foreground">FIX</span>
              <span className="[font-family:'Barlow_Condensed',sans-serif] font-black text-base tracking-wider text-primary">BRIDGE</span>
            </button>
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-foreground leading-tight">{displayName}</p>
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-primary" />
                <p className="font-mono text-[10px] text-muted-foreground">Homeowner</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button className="relative w-9 h-9 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="md:hidden w-8 h-8 bg-orange-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </button>
            <div className="hidden md:flex w-8 h-8 bg-orange-400 rounded-full items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <span className="hidden lg:inline font-mono text-[9px] text-muted-foreground tracking-wider" title="Deploy build stamp">
              {typeof __FIXBRIDGE_BUILD__ !== "undefined" ? __FIXBRIDGE_BUILD__ : "dev"}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 md:pb-8">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {activeTab === "post" && (
              <PostTab
                onJobPosted={(job) => setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])}
                onViewJobs={() => setActiveTab("jobs")}
                user={profileUser}
              />
            )}
            {activeTab === "jobs" && <JobsTab jobs={jobs} user={profileUser} />}
            {activeTab === "ai" && <AITab />}
            {activeTab === "profile" && (
              <HomeownerProfileTab user={profileUser} onUserUpdated={handleProfileUpdated} />
            )}
            {activeTab === "contact" && <ContactTab />}
          </motion.div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border flex safe-area-inset-bottom">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors min-h-[56px] ${
              activeTab === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 1.8} />
            <span className="font-mono text-[9px] uppercase tracking-wide leading-none">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
