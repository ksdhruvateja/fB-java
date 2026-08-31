import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
 Home, PlusCircle, LogOut, Sun, Moon, Menu, X,
 Loader2, ImagePlus, ShieldAlert, AlertTriangle, CheckCircle, DollarSign, Sparkles, HardHat, ArrowLeft, ArrowRight,
 CalendarDays, Clock, Zap, Building2, KeyRound, Hammer, Store, BadgeCheck,
 Send, MessageSquare, Bot, Volume2, VolumeX, Star, Search, LayoutDashboard, Wrench, Shield,
 FileText, CreditCard, Headphones, Settings, HelpCircle, Mic, Camera, Droplets, Wind, Bug, History,
 Trees, Snowflake, Brush,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { AuthUser } from "./auth";
import { getStoredToken } from "./auth";
import { chatWithAi, type ChatMessage } from "./geminiAssessment";
import { brand } from "../config/brand";
import AppLogo from "./AppLogo";
import AppBackButton from "./AppBackButton";
import { type HomeownerNavFrame } from "./navigation";
import { useDashboardNavigation } from "./useDashboardNavigation";
import {
 STATUS_LABELS,
 assessManagedJob,
 createManagedJob,
 createProperty,
 formatMoney,
 getProposal,
 listMyManagedJobs,
 listProperties,
 lookupPartner,
 lookupDiscount,
 payDispatchFee,
 getManagedJob,
 retailRangeLabel,
 homeownerInvoicePaymentStatus,
 updatePropertyHealth,
 updateProperty,
 type HomeSystemRecord,
 type ManagedJob,
 type Property,
 type Proposal,
} from "./managedJobs";
import { startSubscription } from "./platformApi";
import { listGoProPlans } from "./subscriptionPlansApi";
import { PAID_HOME_CARE_PLAN_CODE, isPaidHomeCarePlan, displayPlanLabel } from "./subscriptionCatalog";
import { resolveClientProAccess } from "./proFeatures";
import { assessmentUnavailableMessage, isHtmlOrGatewayErrorBody } from "./apiErrors";
import {
 jobTitleForHomeowner,
 type HomeownerService,
} from "./homeownerCategories";
import HomeownerServiceIntake, { type IntakePhase, normalizeIntakePhase } from "./HomeownerServiceIntake";
import { clearIntakeDraft, loadIntakeDraft, saveIntakeDraft } from "./intakeDraft";
import {
 tradeToCategory,
 categoryToTradeId,
 formatAdaptiveAnswersNote,
 resolveRequestTradeId,
 resolveServiceLocation,
 serviceRequestTitle,
 type AdaptiveAnswers,
 type ServiceLocation,
} from "./serviceRequestFlow";
import {
 analyzePropertyHealthProfile,
 normalizeHealthProfile,
 type PropertyHealthProfile,
} from "./homeownerPropertyHealth";
import HomeownerOverview from "./HomeownerOverview";
import HomeownerHomeUpdates from "./HomeownerHomeUpdates";
import HomeownerPropertyCare from "./HomeownerPropertyCare";
import HomeownerHomeProtection from "./HomeownerHomeProtection";
import HomeownerReferEarn from "./HomeownerReferEarn";
import HomeownerLegalPanel from "./HomeownerLegalPanel";
import { buildHomeUpdatesSnapshot, type HomeUpdateItem } from "./homeUpdates";
import { buildPassportAiContext } from "./propertyPassport";
import AppErrorBoundary, { DashboardTabFallback } from "./AppErrorBoundary";
import { ProFeatureProvider } from "./ProFeatureProvider";
import ProLockedShell from "./ProLockedShell";
import { promptProUpgrade } from "./proFeatureEvents";
import type { ProFeatureId } from "./proFeatures";
import {
 type DashTab,
 type JobsSegment,
 type PropertyCareSection,
 NAV_SECTIONS,
 FOOTER_NAV,
 resolveNavTab,
 propertyCareSectionForTab,
 jobsForSegment,
 jobsForProperty,
 countQuotesWaiting,
 sanitizeDashTab,
 sanitizeJobsSegment,
 isHomeownerTabRendered,
} from "./homeownerNav";
import ServiceTrackingCard from "./ServiceTrackingCard";
import HomeownerPropertyPage, { DEFAULT_HOME_SYSTEMS } from "./HomeownerPropertyPage";
import HomeownerBottomNav from "./HomeownerBottomNav";
import HomeownerMoreMenu from "./HomeownerMoreMenu";
import HomeownerInboxPanel from "./HomeownerInboxPanel";
import HomeownerPropertySheet from "./HomeownerPropertySheet";
import HomeownerJobDetailPanel from "./HomeownerJobDetailPanel";
import HomeownerPaymentsPanel from "./HomeownerPaymentsPanel";
import HomeownerDocumentsPanel from "./HomeownerDocumentsPanel";
import HomeownerSupportPanel from "./HomeownerSupportPanel";
import HomeAssistantPanel from "./HomeAssistantPanel";
import { clearAssistantHandoff, readAssistantHandoff } from "./assistantHandoff";
import HomeownerGoProPlans, { type GoProPlanCard } from "./HomeownerGoProPlans";
import SubscriptionSuccessModal from "./SubscriptionSuccessModal";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";
import { ConsentCheckbox, ConsentSection } from "./ConsentCheckbox";
import { fetchHomeownerConsentStatus, recordConsentAction } from "./homeownerConsentApi";
import { useAcknowledgmentGate } from "./useAcknowledgmentGate";
import HomeownerLocalEstimate, { EstimateLoadingSteps } from "./HomeownerLocalEstimate";
import HireProfessionalWizard from "./HireProfessionalWizard";
import DispatchCouponField, { type DispatchCouponPreview } from "./DispatchCouponField";
import AddressAutocompleteField from "./AddressAutocompleteField";
import { VerifiedAddressFields, type AddressVerificationMeta } from "./VerifiedAddressInput";
import { normalizeUsStateCode } from "./UsLocationFields";
import { isAddressComplete } from "./addressFormat";
import { useIsMobile } from "./components/ui/use-mobile";
import { isValidUsZip, normalizeZip, zipInputProps } from "./zipCode";

function formatChatMessage(text: string): string {
 if (!text) return "";
 return text
 .replace(/^#+\s+/gm, "") // strip markdown headers
 .replace(/\*\*/g, ""); // strip markdown bolding
}

function assessmentStringList(value: unknown): string[] {
 if (!Array.isArray(value)) return [];
 return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function hasRenderableAssessment(job: ManagedJob | null | undefined): job is ManagedJob & { aiAssessment: NonNullable<ManagedJob["aiAssessment"]> } {
 const assessment = job?.aiAssessment;
 return Boolean(assessment && typeof assessment === "object" && !Array.isArray(assessment));
}

function isAssessmentProcessing(job: ManagedJob | null | undefined) {
 const st = job?.assessmentStatus;
 return st === "processing" || st === "pending";
}

function normalizeAssessmentMessage(msg?: string | null) {
 if (!msg || isHtmlOrGatewayErrorBody(msg)) return assessmentUnavailableMessage();
 return msg;
}

/** Shrink phone photos so create+assess don't hang on multi'MB data URLs. */
function compressImageForAssessment(file: File, maxEdge = 1280, quality = 0.72): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onerror = () => reject(new Error("Could not read image"));
 reader.onload = () => {
 const src = String(reader.result || "");
 const img = new Image();
 img.onerror = () => reject(new Error("Could not decode image"));
 img.onload = () => {
 const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
 const w = Math.max(1, Math.round(img.width * scale));
 const h = Math.max(1, Math.round(img.height * scale));
 const canvas = document.createElement("canvas");
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext("2d");
 if (!ctx) {
 reject(new Error("Canvas unavailable"));
 return;
 }
 ctx.drawImage(img, 0, 0, w, h);
 try {
 resolve(canvas.toDataURL("image/jpeg", quality));
 } catch (err) {
 reject(err instanceof Error ? err : new Error("Compress failed"));
 }
 };
 img.src = src;
 };
 reader.readAsDataURL(file);
 });
}

type ReportStep = "intake" | "experts" | "assessment";

const JOBS_SEGMENTS: { id: JobsSegment; label: string }[] = [
 { id: "active", label: "Active" },
 { id: "quotes", label: "Quotes" },
 { id: "upcoming", label: "Upcoming" },
 { id: "history", label: "History" },
];

const REQUEST_ICONS: Record<string, React.ElementType> = {
 droplet: Droplets,
 zap: Zap,
 wind: Wind,
 refrigerator: Home,
 hammer: Hammer,
 bug: Bug,
 home: Home,
 trees: Trees,
 snowflake: Snowflake,
 cleaning: Brush,
 more: PlusCircle,
};

const SERVICE_TIMING_OPTIONS = [
 {
 value: "weekday",
 label: "Scheduled weekday",
 hint: "Standard dispatch | best availability",
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
 hint: "After-hours & Sat-Sun windows",
 icon: Moon,
 },
] as const;

const TIME_WINDOW_OPTIONS = [
 { value: "9-11", label: "9-11 AM", period: "Morning" },
 { value: "11-2", label: "11 AM-2 PM", period: "Midday" },
 { value: "2-5", label: "2-5 PM", period: "Afternoon" },
 { value: "5-7", label: "5-7 PM", period: "Evening" },
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

function dateForServiceTiming(timing: string): string {
 if (timing === "same-day") return addDaysFromToday(0);
 if (timing === "evening-weekend") return nextWeekendDate();
 return "";
}

function selectServiceTimingOption(
 timing: string,
 setServiceTiming: (v: string) => void,
 setPreferredDate: (v: string) => void,
 preferredDate: string
) {
 setServiceTiming(timing);
 const implied = dateForServiceTiming(timing);
 if (implied) setPreferredDate(implied);
 else if (timing === "weekday" && preferredDate === addDaysFromToday(0)) {
 setPreferredDate("");
 }
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
 initialTab,
 showSubscriptionSuccess,
 subscriptionSuccessPlanCode,
 subscriptionActivating,
 onDismissSubscriptionSuccess,
}: {
 onLogout: () => void;
 user: AuthUser;
 isDark: boolean;
 onToggleDark: () => void;
 onUserUpdated?: (u: AuthUser) => void;
 initialTab?: DashTab;
 showSubscriptionSuccess?: boolean;
 subscriptionSuccessPlanCode?: string | null;
 subscriptionActivating?: boolean;
 onDismissSubscriptionSuccess?: () => void;
}) {
 const [tab, setTab] = useState<DashTab>(() => sanitizeDashTab(initialTab || "overview"));
 const [careSection, setCareSection] = useState<PropertyCareSection>(() =>
 propertyCareSectionForTab(initialTab || "overview")
 );
 const [jobsSegment, setJobsSegment] = useState<JobsSegment>("active");
 const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
 const [primaryPropertyId, setPrimaryPropertyId] = useState<number | null>(null);
 const isMobile = useIsMobile();
 const [jobs, setJobs] = useState<ManagedJob[]>([]);
 const [properties, setProperties] = useState<Property[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
 const [proposal, setProposal] = useState<Proposal | null>(null);
 const [busy, setBusy] = useState(false);
 const [step, setStep] = useState<ReportStep>("intake");
 const [intakePhase, setIntakePhase] = useState<IntakePhase>("describe");
 const [reportPath, setReportPath] = useState<"ai" | "experts" | null>(null);
 const [requestSystemId, setRequestSystemId] = useState<string>("");
 const [issueArea, setIssueArea] = useState<ServiceLocation | "">("");
 const [category, setCategory] = useState<HomeownerService | "">("");
 const [adaptiveAnswers, setAdaptiveAnswers] = useState<AdaptiveAnswers>({});
 const [description, setDescription] = useState("");
 const [voiceListening, setVoiceListening] = useState(false);
 const voiceBaseRef = useRef("");
 const voiceRecRef = useRef<{ stop: () => void } | null>(null);
 const [assessmentMode, setAssessmentMode] = useState<"expert" | "diy">("diy");
 const [diyUnlockCodes, setDiyUnlockCodes] = useState<string[]>([
 "free",
 PAID_HOME_CARE_PLAN_CODE,
 "pro_membership",
 "homecare",
 "property_pro",
 ]);
 const [goProPlans, setGoProPlans] = useState<GoProPlanCard[]>([]);

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
 const [addressPromptVerification, setAddressPromptVerification] = useState<AddressVerificationMeta>({
 status: "unverified",
 addressVerified: false,
 });
 const [addressPromptJobId, setAddressPromptJobId] = useState<number | null>(null);
 const [showAddAddressModal, setShowAddAddressModal] = useState(false);
 const [modalAddressLine1, setModalAddressLine1] = useState("");
 const [modalAddressLine2, setModalAddressLine2] = useState("");
 const [modalCity, setModalCity] = useState("");
 const [modalState, setModalState] = useState("");
 const [modalZip, setModalZip] = useState("");
 const [modalAddressVerification, setModalAddressVerification] = useState<AddressVerificationMeta>({
 status: "unverified",
 addressVerified: false,
 });
 const [modalActionAfterSave, setModalActionAfterSave] = useState<"ai" | "experts" | null>(null);
 const [speakingText, setSpeakingText] = useState<string | null>(null);

 const [serviceTiming, setServiceTiming] = useState("weekday");
 const [preferredDate, setPreferredDate] = useState("");
 const [preferredTimeSlot, setPreferredTimeSlot] = useState("9-11");
 const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
 const [mediaType, setMediaType] = useState<string | null>(null);
 const [assistantHandoffIntent, setAssistantHandoffIntent] = useState<"remote_quote" | "site_visit" | "diy" | null>(null);
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
 const [dispatchCouponPreview, setDispatchCouponPreview] = useState<DispatchCouponPreview | null>(null);
 const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);
 const [invoicePaymentMsg, setInvoicePaymentMsg] = useState<string | null>(null);
 const [activeJob, setActiveJob] = useState<ManagedJob | null>(null);
 const [assessmentMsg, setAssessmentMsg] = useState<string | null>(null);
 const [assessLoadingStep, setAssessLoadingStep] = useState<number | null>(null);
 const [assessLoadingZip, setAssessLoadingZip] = useState<string | null>(null);
 const [intakeDraftSavedAt, setIntakeDraftSavedAt] = useState<string | null>(null);
 const [hasIntakeDraft, setHasIntakeDraft] = useState(false);
 const [showTechMessage, setShowTechMessage] = useState(false);
 const [forceEditSchedule, setForceEditSchedule] = useState(false);
 const [techMessageDraft, setTechMessageDraft] = useState("");
 const [techMessageSent, setTechMessageSent] = useState(false);
 const fileRef = useRef<HTMLInputElement>(null);
 const videoRef = useRef<HTMLInputElement>(null);
 const assessInFlightRef = useRef<number | null>(null);
 const assessmentRecoveryRef = useRef<number | null>(null);

 // Guided DIY interactive states
 const [diyIsGuided, setDiyIsGuided] = useState(false);
 const [diyStepIndex, setDiyStepIndex] = useState(0);
 const [diyCompletedSteps, setDiyCompletedSteps] = useState<Record<number, boolean>>({});
 const [diySafetyAccepted, setDiySafetyAccepted] = useState(false);
 const [diyConsentOpen, setDiyConsentOpen] = useState(false);
 const [diyConsentChecked, setDiyConsentChecked] = useState(false);
 const [diyConsentBusy, setDiyConsentBusy] = useState(false);
 const diyAckGate = useAcknowledgmentGate();

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

 useEffect(() => {
 void fetchHomeownerConsentStatus().then((r) => {
 if (r.ok) setDiySafetyAccepted(r.diySafetyAccepted === true);
 });
 }, [user.id]);

 async function startGuidedDiy() {
 if (activeJob?.diyRiskLevel === "red" || activeJob?.aiAssessment?.diy_risk_level === "red") {
 setError("Guided DIY is not available for this safety risk. Please request a professional.");
 return;
 }
 if (diySafetyAccepted) {
 setDiyIsGuided(true);
 return;
 }
 setDiyConsentChecked(false);
 setDiyConsentOpen(true);
 }

 async function confirmDiySafetyConsent(extraConsents?: Record<string, boolean>) {
 const consents = { DIY_SAFETY: true, ...extraConsents };
 if (!consents.DIY_SAFETY) return;
 setDiyConsentBusy(true);
 const r = await recordConsentAction({
 actionKey: "DIY_START",
 consents,
 jobId: activeJob?.id,
 });
 setDiyConsentBusy(false);
 if (!r.ok) {
 if (
 diyAckGate.promptFromResponse(r, {
 currentState: { DIY_SAFETY: diyConsentChecked },
 fallbackMissing: ["DIY_SAFETY"],
 onConfirm: async (next) => {
 setDiyConsentChecked(true);
 await confirmDiySafetyConsent(next);
 },
 })
 ) {
 return;
 }
 setError(r.message || "Could not save DIY safety acknowledgment.");
 return;
 }
 setDiySafetyAccepted(true);
 setDiyConsentOpen(false);
 setDiyIsGuided(true);
 }

 const selectedJob = useMemo(
 () => jobs.find((j) => j.id === selectedJobId) || null,
 [jobs, selectedJobId]
 );

 const filteredJobs = useMemo(() => jobsForSegment(jobs, jobsSegment), [jobs, jobsSegment]);

 useEffect(() => {
 if (tab === "jobs" && filteredJobs.length && selectedJobId == null) {
 setSelectedJobId(filteredJobs[0].id);
 }
 }, [tab, filteredJobs, selectedJobId, jobsSegment]);

 const primaryProperty = useMemo(() => {
 if (primaryPropertyId != null) {
 return properties.find((p) => p.id === primaryPropertyId) || properties[0] || null;
 }
 return properties[0] || null;
 }, [properties, primaryPropertyId]);

 const primaryPropertyJobs = useMemo(
 () => jobsForProperty(jobs, primaryProperty?.id),
 [jobs, primaryProperty?.id]
 );

 useEffect(() => {
 if (properties.length && primaryPropertyId == null) {
 setPrimaryPropertyId(properties[0].id);
 }
 if (
 primaryPropertyId != null &&
 properties.length > 0 &&
 !properties.some((p) => p.id === primaryPropertyId)
 ) {
 setPrimaryPropertyId(properties[0].id);
 }
 }, [properties, primaryPropertyId]);

 useEffect(() => {
 if (!properties.length || propertyId !== "") return;
 setPropertyId(primaryPropertyId ?? properties[0].id);
 }, [properties, propertyId, primaryPropertyId]);

 function navigateTab(next: DashTab) {
 navigateTo({
 role: "homeowner",
 tab: resolveNavTab(next),
 jobId: null,
 });
 }

 function openPropertyCare(section: PropertyCareSection = "passport") {
 setCareSection(section);
 navigateTo({
 role: "homeowner",
 tab: "property-care",
 jobId: null,
 });
 }

 function selectPrimaryProperty(id: number) {
 setPrimaryPropertyId(id);
 setPropertyId(id);
 }

 function openJobsSegment(segment: JobsSegment, jobId?: number) {
 navigateTo({
 role: "homeowner",
 tab: "jobs",
 jobsSegment: segment,
 jobId: jobId ?? null,
 });
 }

 const applyNavFrame = useCallback((f: HomeownerNavFrame) => {
 const nextTab = sanitizeDashTab(f.tab);
 setCareSection(propertyCareSectionForTab(nextTab));
 setTab(nextTab);
 if (f.jobId !== undefined) setSelectedJobId(f.jobId);
 if (f.jobsSegment) setJobsSegment(sanitizeJobsSegment(f.jobsSegment));
 if (f.tab === "report") {
 const nextStep =
 f.reportStep === "intake" || f.reportStep === "experts" || f.reportStep === "assessment"
 ? (f.reportStep as ReportStep)
 : "intake";
 setStep(nextStep);
 setIntakePhase(normalizeIntakePhase(f.intakePhase));
 if (f.reportPath !== undefined) setReportPath(f.reportPath);
 }
 }, []);

 const navFrame = useMemo(
 (): HomeownerNavFrame => ({
 role: "homeowner",
 tab,
 jobId: tab === "jobs" ? selectedJobId : null,
 jobsSegment: tab === "jobs" ? jobsSegment : undefined,
 reportStep: tab === "report" ? step : undefined,
 intakePhase: tab === "report" && step === "intake" ? intakePhase : undefined,
 reportPath: tab === "report" ? reportPath : undefined,
 }),
 [tab, selectedJobId, jobsSegment, step, intakePhase, reportPath]
 );

 const { goHome, goBack, canBack, navigateTo } = useDashboardNavigation(
 "homeowner",
 "homeowner-dashboard",
 navFrame,
 applyNavFrame
 );
 const healthProfile = useMemo(() => {
 const base = normalizeHealthProfile(primaryProperty?.healthProfile as PropertyHealthProfile | null);
 return {
 ...base,
 beds: primaryProperty?.beds ?? base.beds,
 baths: primaryProperty?.baths ?? base.baths,
 sqft: primaryProperty?.sqft ?? base.sqft,
 };
 }, [primaryProperty]);

 async function saveProperty(
 propertyId: number,
 body: Partial<Property> & { homeSystems?: HomeSystemRecord[] }
 ): Promise<boolean> {
 setBusy(true);
 setError(null);
 try {
 const r = await updateProperty(propertyId, body);
 if (!r.ok) {
 setError(r.message || "Could not save property.");
 return false;
 }
 if (r.property) {
 upsertPropertyInState(r.property, { makePrimary: false });
 } else {
 await refresh();
 }
 return true;
 } finally {
 setBusy(false);
 }
 }

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
 upsertPropertyInState(r.property, { makePrimary: false });
 } else {
 await refresh();
 }
 } finally {
 setBusy(false);
 }
 }

 function upsertPropertyInState(
 property: Property,
 opts?: { makePrimary?: boolean; forReport?: boolean }
 ) {
 setProperties((prev) => {
 const idx = prev.findIndex((p) => p.id === property.id);
 if (idx >= 0) {
 const next = [...prev];
 next[idx] = { ...next[idx], ...property };
 return next;
 }
 return [...prev, property];
 });
 if (opts?.makePrimary) setPrimaryPropertyId(property.id);
 if (opts?.forReport) setPropertyId(property.id);
 }

 async function adoptProperty(
 property: Property,
 opts?: { makePrimary?: boolean; forReport?: boolean; analyzeHealth?: boolean }
 ) {
 upsertPropertyInState(property, {
 makePrimary: opts?.makePrimary === true,
 forReport: opts?.forReport,
 });
 if (opts?.analyzeHealth !== false) {
 await syncHealthFromProperty(property.id, property);
 }
 }

 async function createAndAdoptProperty(
 body: Parameters<typeof createProperty>[0],
 opts?: { makePrimary?: boolean; forReport?: boolean; analyzeHealth?: boolean }
 ) {
 const r = await createProperty(body);
 if (!r.ok || !r.property) {
 return { ok: false as const, message: r.message || "Could not add property." };
 }
 await adoptProperty(r.property, {
 makePrimary: opts?.makePrimary ?? properties.length === 0,
 forReport: opts?.forReport,
 analyzeHealth: opts?.analyzeHealth,
 });
 return { ok: true as const, property: r.property };
 }

 async function syncHealthFromProperty(propertyId: number, propertyOverride?: Property) {
 const listed = propertyOverride ? null : await listProperties();
 const prop =
 propertyOverride ||
 listed?.properties?.find((p) => p.id === propertyId) ||
 properties.find((p) => p.id === propertyId);
 if (!prop) return;
 const analyzed = analyzePropertyHealthProfile(prop, prop.healthProfile as PropertyHealthProfile | null);
 await saveHealthProfile(propertyId, analyzed);
 }

 async function applyPropertyUpdate(property: Property) {
 upsertPropertyInState(property, { makePrimary: false });
 await syncHealthFromProperty(property.id, property);
 }

 async function reloadProperty(propertyId: number) {
 const listed = await listProperties();
 const prop =
 listed.properties?.find((p) => p.id === propertyId) ||
 properties.find((p) => p.id === propertyId);
 if (!prop) return null;
 upsertPropertyInState(prop, { makePrimary: false });
 return prop;
 }

 async function addHealthProperty(input: {
 addressLine1: string;
 addressLine2?: string;
 city?: string;
 state?: string;
 zip?: string;
 label?: string;
 addressVerified?: boolean;
 postalCodePlus4?: string;
 }) {
 setBusy(true);
 setError(null);
 try {
 const r = await createAndAdoptProperty(
 {
 addressLine1: input.addressLine1,
 addressLine2: input.addressLine2,
 city: input.city,
 state: input.state,
 zip: input.zip,
 label: input.label,
 addressVerified: input.addressVerified,
 postalCodePlus4: input.postalCodePlus4,
 homeSystems: DEFAULT_HOME_SYSTEMS,
 },
 { makePrimary: true, analyzeHealth: true }
 );
 if (!r.ok) {
 setError(r.message || "Could not add address.");
 return null;
 }
 return r.property;
 } finally {
 setBusy(false);
 }
 }

 function openRequestService(prefill?: HomeUpdateItem["requestPrefill"]) {
 setError(null);
 setStep("intake");
 setIntakePhase("describe");
 setReportPath(null);
 setAssessmentMode("diy");
 setAssessLoadingStep(null);
 setAssessLoadingZip(null);
 setAssessmentMsg(null);
 const handoff = readAssistantHandoff();
 if (handoff) {
 if (handoff.propertyId) setPropertyId(handoff.propertyId);
 if (handoff.category) {
 setCategory(handoff.category as HomeownerService);
 if (!handoff.requestSystemId) setRequestSystemId(categoryToTradeId(handoff.category));
 }
 if (handoff.requestSystemId) setRequestSystemId(handoff.requestSystemId);
 const descParts: string[] = [];
 if (handoff.title?.trim()) descParts.push(handoff.title.trim());
 if (handoff.description?.trim()) descParts.push(handoff.description.trim());
 if (handoff.assistantSummary?.trim()) descParts.push(`Assistant notes: ${handoff.assistantSummary.trim()}`);
 if (descParts.length) setDescription(descParts.join("\n\n").slice(0, 3000));
 if (handoff.issueArea) setIssueArea(handoff.issueArea as ServiceLocation);
 if (handoff.mediaDataUrl) {
 setMediaDataUrl(handoff.mediaDataUrl);
 setMediaType(handoff.mediaType || (String(handoff.mediaDataUrl).startsWith("data:video") ? "video" : "image"));
 }
 if (handoff.intent) {
 setAssistantHandoffIntent(handoff.intent);
 if (handoff.intent === "site_visit") setReportPath("experts");
 else setReportPath("ai");
 }
 clearAssistantHandoff();
 } else {
 setAssistantHandoffIntent(null);
 if (prefill?.systemId) setRequestSystemId(prefill.systemId);
 if (prefill?.area) setIssueArea(prefill.area);
 if (prefill?.service) setCategory(prefill.service);
 if (prefill?.description) setDescription(prefill.description);
 }
 navigateTo({
 role: "homeowner",
 tab: "report",
 reportStep: "intake",
 intakePhase:
 handoff?.description || handoff?.title || prefill?.description || handoff?.category
 ? "details"
 : "describe",
 reportPath: handoff?.intent === "site_visit" ? "experts" : handoff?.intent ? "ai" : null,
 jobId: null,
 });
 }

 function goBackOneReportStep() {
 setError(null);
 goBack();
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
 if (!showZipPromptPropertyId || !isValidUsZip(zipPromptInput)) {
 alert("Please enter a valid 5-digit US ZIP code.");
 return;
 }
 setBusy(true);
 try {
 const token = getStoredToken();
 if (!token) {
 alert("Please sign in again.");
 return;
 }
 const res = await fetch(`/api/properties/${showZipPromptPropertyId}/zip`, {
 method: "PUT",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ zip: normalizeZip(zipPromptInput) }),
 });
 const data = await res.json();
 if (!data.ok) {
 alert(data.message || "Failed to save ZIP code.");
 return;
 }
 
 const zipPropertyId = showZipPromptPropertyId;
 const action = zipPromptAction;
 setShowZipPromptPropertyId(null);
 setZipPromptInput("");
 setZipPromptAction(null);

 const reloaded = zipPropertyId ? await reloadProperty(zipPropertyId) : null;
 if (reloaded) {
 await syncHealthFromProperty(reloaded.id, reloaded);
 } else {
 await refresh();
 }

 if (action) {
 await submitIssue(action);
 }
 } catch (e: any) {
 alert(e.message || "Failed to save ZIP code.");
 } finally {
 setBusy(false);
 }
 }

 function closeAddressPrompt() {
 setShowAddressPromptPropertyId(null);
 setAddressPromptJobId(null);
 setAddressPromptLine1("");
 setAddressPromptLine2("");
 setAddressPromptCity("");
 setAddressPromptState("");
 setAddressPromptZip("");
 }

 function closeAddAddressModal() {
 setShowAddAddressModal(false);
 setModalActionAfterSave(null);
 setModalAddressLine1("");
 setModalAddressLine2("");
 setModalCity("");
 setModalState("");
 setModalZip("");
 }

 async function handleSaveAddressAndProceed() {
 if (!showAddressPromptPropertyId) return;
 if (!addressPromptLine1.trim() || !addressPromptCity.trim() || !addressPromptState.trim() || !addressPromptZip.trim()) {
 alert("Please fill in all required address fields.");
 return;
 }
 if (!isValidUsZip(addressPromptZip)) {
 alert("Please enter a valid 5-digit US ZIP code.");
 return;
 }
 setBusy(true);
 try {
 const token = getStoredToken();
 if (!token) {
 alert("Please sign in again.");
 return;
 }
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
 state: normalizeUsStateCode(addressPromptState),
 zip: normalizeZip(addressPromptZip),
 addressVerified: addressPromptVerification.addressVerified,
 postalCodePlus4: addressPromptVerification.postalCodePlus4 || undefined,
 }),
 });
 const data = await res.json();
 if (!data.ok) {
 alert(data.message || "Failed to update address.");
 return;
 }

 const propertyIdForAddress = showAddressPromptPropertyId;
 const jobId = addressPromptJobId;
 closeAddressPrompt();

 if (data.property && propertyIdForAddress) {
 const existing = properties.find((p) => p.id === propertyIdForAddress);
 if (existing) {
 upsertPropertyInState({ ...existing, ...data.property });
 }
 }
 const reloaded = propertyIdForAddress ? await reloadProperty(propertyIdForAddress) : null;
 if (reloaded) {
 await syncHealthFromProperty(reloaded.id, reloaded);
 } else {
 await refresh();
 }

 if (jobId) {
 const r = await payDispatchFee(jobId);
 if (r.ok && r.url) {
 window.location.href = r.url;
 } else {
 alert(r.message || "Stripe checkout could not be started.");
 }
 }
 } catch (e: any) {
 alert(e.message || "Failed to update address.");
 } finally {
 setBusy(false);
 }
 }

 async function handleSaveAddressModal() {
 const structured = {
 addressLine1: modalAddressLine1.trim(),
 addressLine2: modalAddressLine2.trim(),
 city: modalCity.trim(),
 state: normalizeUsStateCode(modalState),
 zip: modalZip.trim(),
 };
 if (!isAddressComplete(structured) || !isValidUsZip(structured.zip)) {
 alert("Please fill in Address Line 1, City, State, and a valid ZIP Code.");
 return;
 }
 setBusy(true);
 try {
 const r = await createAndAdoptProperty(
 {
 addressLine1: structured.addressLine1,
 addressLine2: structured.addressLine2 || undefined,
 city: structured.city,
 state: structured.state,
 zip: normalizeZip(structured.zip),
 addressVerified: modalAddressVerification.addressVerified,
 postalCodePlus4: modalAddressVerification.postalCodePlus4 || undefined,
 country: "US",
 streetAddress: structured.addressLine1,
 label: structured.addressLine1,
 homeSystems: DEFAULT_HOME_SYSTEMS,
 },
 { makePrimary: true, forReport: true, analyzeHealth: true }
 );
 if (r.ok) {
 const action = modalActionAfterSave;
 closeAddAddressModal();
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
 if (step !== "assessment" || !activeJob?.id) return;
 if (hasRenderableAssessment(activeJob)) return;
 if (!isAssessmentProcessing(activeJob)) return;
 if (busy || assessInFlightRef.current === activeJob.id) return;
 if (assessmentRecoveryRef.current === activeJob.id) return;
 assessmentRecoveryRef.current = activeJob.id;
 const jobId = activeJob.id;
 const propZip = properties.find((p) => p.id === activeJob.propertyId)?.zip || null;
 void (async () => {
 setBusy(true);
 try {
 const assessed = await runAssessWithProgress(jobId, propZip);
 if (assessed.ok && assessed.job) {
 setActiveJob(assessed.job);
 setAssessmentMsg(assessed.warning || assessed.pricing?.message || null);
 } else {
 setAssessmentMsg(normalizeAssessmentMessage(assessed.message));
 }
 } finally {
 setBusy(false);
 if (assessmentRecoveryRef.current === jobId) assessmentRecoveryRef.current = null;
 }
 })();
 }, [step, activeJob?.id, activeJob?.assessmentStatus, activeJob?.aiAssessment, busy, properties]);

 useEffect(() => {
 void refresh();
 void listGoProPlans()
 .then((r) => {
 const codes = (r.plans || []).filter((p) => p.unlocksDiy).map((p) => p.code);
 if (codes.length) setDiyUnlockCodes(codes);
 })
 .catch(() => {
 /* keep defaults */
 });

 try {
 const guestJobId = localStorage.getItem("fixbridge-guest-job-id");
 if (guestJobId) {
 const id = Number(guestJobId);
 localStorage.removeItem("fixbridge-guest-job-id");
 void (async () => {
 try {
 const r = await getManagedJob(id);
 if (r.ok && r.job) {
 setActiveJob(r.job);
 setSelectedJobId(id);
 setReportPath("ai");
 setAssessmentMode("diy");
 setStep("assessment");
 setTab("report");
 scrollReportToTop();
 if (!r.job.aiAssessment && !isAssessmentProcessing(r.job)) {
 const zip = r.job.zip || r.job.cityStateZip?.match(/\b\d{5}\b/)?.[0] || null;
 const assessed = await runAssessWithProgress(id, zip);
 if (assessed.ok && assessed.job) {
 setActiveJob(assessed.job);
 setAssessmentMsg(assessed.warning || assessed.pricing?.message || null);
 } else {
 setAssessmentMsg(normalizeAssessmentMessage(assessed.message));
 }
 } else if (isAssessmentProcessing(r.job) && !hasRenderableAssessment(r.job)) {
 const zip = r.job.zip || r.job.cityStateZip?.match(/\b\d{5}\b/)?.[0] || null;
 const assessed = await runAssessWithProgress(id, zip);
 if (assessed.ok && assessed.job) {
 setActiveJob(assessed.job);
 setAssessmentMsg(assessed.warning || assessed.pricing?.message || null);
 } else {
 setAssessmentMsg(normalizeAssessmentMessage(assessed.message));
 }
 }
 await refresh();
 } else {
 setSelectedJobId(id);
 setTab("jobs");
 }
 } catch {
 setSelectedJobId(id);
 setTab("jobs");
 }
 })();
 }

 const stripeJobId = sessionStorage.getItem("fixbridge-stripe-active-job-id");
 const dispatchConfirming = sessionStorage.getItem("fixbridge-dispatch-confirming") === "1";
 const dispatchCanceled = sessionStorage.getItem("fixbridge-dispatch-canceled") === "1";

 if (dispatchConfirming) {
 setDispatchSuccessMsg("Confirming payment with FixBridge...");
 setTab("report");
 setStep("assessment");
 setAssessmentMode("expert");
 if (stripeJobId) {
 setSelectedJobId(Number(stripeJobId));
 }
 sessionStorage.removeItem("fixbridge-dispatch-confirming");
 const confirmJobId = Number(stripeJobId || 0);
 if (confirmJobId) {
 void (async () => {
 for (let i = 0; i < 12; i++) {
 try {
 const r = await getManagedJob(confirmJobId);
 const job = r.ok ? r.job : null;
 const paid =
 job &&
 (job.visitFeeAuthorized === true ||
 Boolean(job.paymentCompletedAt) ||
 ["paid_for_dispatch", "awaiting_contractor"].includes(String(job.status)));
 if (paid) {
 setDispatchSuccessMsg(
 "Payment Successful - Your request has been submitted to FixBridge. An admin will review it shortly."
 );
 return;
 }
 } catch {
 /* keep polling */
 }
 await new Promise((resolve) => setTimeout(resolve, 2000));
 }
 setDispatchSuccessMsg(null);
 setError(
 "We could not confirm your payment yet. If you were charged, refresh this page or contact support - do not pay again."
 );
 })();
 }
 } else if (dispatchCanceled) {
 setError("Payment was not completed. Your request has not been submitted for dispatch. Return to checkout to try again.");
 if (stripeJobId) {
 setSelectedJobId(Number(stripeJobId));
 }
 sessionStorage.removeItem("fixbridge-dispatch-canceled");
 } else if (stripeJobId) {
 setSelectedJobId(Number(stripeJobId));
 setTab("jobs");
 }

 if (stripeJobId) {
 sessionStorage.removeItem("fixbridge-stripe-active-job-id");
 }

 const invoiceConfirming = sessionStorage.getItem("fixbridge-invoice-confirming");
 const invoiceCanceled = sessionStorage.getItem("fixbridge-invoice-canceled");
 if (invoiceConfirming) {
 setInvoicePaymentMsg("Confirming your payment...");
 setTab("jobs");
 const invNum = invoiceConfirming;
 void (async () => {
 for (let i = 0; i < 15; i++) {
 try {
 const r = await homeownerInvoicePaymentStatus(invNum);
 if (r.ok && r.paid) {
 try {
 sessionStorage.removeItem("fixbridge-invoice-confirming");
 } catch {
 /* ignore */
 }
 setInvoicePaymentMsg("Payment received OK");
 void refresh();
 return;
 }
 } catch {
 /* keep polling */
 }
 await new Promise((resolve) => setTimeout(resolve, 2000));
 }
 try {
 sessionStorage.removeItem("fixbridge-invoice-confirming");
 } catch {
 /* ignore */
 }
 setInvoicePaymentMsg(null);
 setError(
 "We could not confirm your payment yet. If you were charged, refresh this page or contact support - do not pay again."
 );
 })();
 } else if (invoiceCanceled) {
 setError("Payment wasn't completed. Please try again.");
 setTab("jobs");
 sessionStorage.removeItem("fixbridge-invoice-canceled");
 }
 } catch {
 // ignore
 }
 }, []);

 useEffect(() => {
 if (selectedJobId && step === "assessment" && tab === "report") {
 const j = jobs.find((x) => x.id === selectedJobId);
 if (j) {
 setActiveJob((prev) => {
 if (!prev || prev.id !== j.id) return j;
 if (prev.aiAssessment && !j.aiAssessment) return prev;
 return j;
 });
 }
 }
 }, [selectedJobId, jobs, step, tab]);

 async function handleSubscribe(jobId?: number, planCode = PAID_HOME_CARE_PLAN_CODE) {
 setBusy(true);
 setError(null);
 try {
 const r = await startSubscription(planCode, jobId);
 if (!r.ok) {
 setError(r.message || "Failed to start subscription.");
 return;
 }
 if (r.url) {
 window.location.href = r.url;
 return;
 }
 setError("Stripe checkout could not be started. Check payment configuration.");
 } catch (e: unknown) {
 setError(e instanceof Error ? e.message : "Could not complete subscription.");
 } finally {
 setBusy(false);
 }
 }

 const handleAuthenticatedCheckout = async (planCode: string) => {
 await handleSubscribe(selectedJobId || undefined, planCode);
 };

 function handleSelectGoProPlan(plan: GoProPlanCard) {
 if (!plan.planCode) return;
 void handleSubscribe(selectedJobId || undefined, plan.planCode);
 }

 const successPlanCard =
 goProPlans.find((p) => p.planCode === subscriptionSuccessPlanCode) ||
 goProPlans.find((p) => p.planCode === user.planCode) ||
 null;

 const hasDiyAccess = Boolean(
 user.planCode && diyUnlockCodes.includes(user.planCode)
 );
 const { isPro: hasHomeCarePro } = resolveClientProAccess(user);
 const homeCareSub = user.homeCareSubscription ?? null;

 function handleProActivated(feature: ProFeatureId | null) {
 if (!feature) return;
 if (feature === "document_vault") setTab("documents");
 if (feature === "maintenance_calendar") openPropertyCare("maintenance");
 if (feature === "property_aware_ai") openPropertyCare("passport");
 }

 useEffect(() => {
 if (!hasHomeCarePro && tab === "documents") {
 promptProUpgrade("document_vault", tab);
 }
 }, [tab, hasHomeCarePro]);

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
 const draft = loadIntakeDraft(user.id);
 setHasIntakeDraft(
 Boolean(draft && (draft.intakePhase !== "describe" || draft.description || draft.requestSystemId))
 );
 if (draft?.savedAt) setIntakeDraftSavedAt(draft.savedAt);
 }, [user.id]);

 useEffect(() => {
 if (tab !== "report") return;
 if (step === "assessment" && !activeJob && assessLoadingStep == null) {
 setStep("intake");
 setIntakePhase("describe");
 }
 if (step === "intake") {
 setIntakePhase((phase) => normalizeIntakePhase(phase));
 }
 }, [tab, step, activeJob, assessLoadingStep]);

 useEffect(() => {
 if (tab !== "report" || step !== "intake") return;
 const timer = window.setTimeout(() => {
 saveIntakeDraft({
 userId: user.id,
 intakePhase,
 requestSystemId,
 issueArea,
 description,
 adaptiveAnswers,
 propertyId,
 partnerCode,
 mediaDataUrl,
 mediaType,
 savedAt: new Date().toISOString(),
 });
 setIntakeDraftSavedAt(new Date().toISOString());
 setHasIntakeDraft(intakePhase !== "describe" || Boolean(description.trim()) || Boolean(requestSystemId));
 }, 500);
 return () => window.clearTimeout(timer);
 }, [
 tab,
 step,
 user.id,
 intakePhase,
 requestSystemId,
 issueArea,
 description,
 adaptiveAnswers,
 propertyId,
 partnerCode,
 mediaDataUrl,
 mediaType,
 ]);

 function resumeIntakeDraft() {
 const draft = loadIntakeDraft(user.id);
 if (!draft) return;
 setIntakePhase(normalizeIntakePhase(draft.intakePhase));
 if (draft.requestSystemId) setRequestSystemId(draft.requestSystemId);
 if (draft.issueArea) setIssueArea(draft.issueArea);
 if (draft.description) setDescription(draft.description);
 if (draft.adaptiveAnswers) setAdaptiveAnswers(draft.adaptiveAnswers);
 if (draft.propertyId) setPropertyId(draft.propertyId);
 if (draft.partnerCode) setPartnerCode(draft.partnerCode);
 if (draft.mediaDataUrl) {
 setMediaDataUrl(draft.mediaDataUrl);
 setMediaType(draft.mediaType);
 }
 navigateTo({
 role: "homeowner",
 tab: "report",
 reportStep: "intake",
 intakePhase: normalizeIntakePhase(draft.intakePhase),
 reportPath: null,
 jobId: null,
 });
 }

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
 if (file.type.startsWith("video")) {
 if (file.size > 8_000_000) {
 setError("Video is too large. Please use a photo under ~8 MB, or a short clip.");
 return;
 }
 const reader = new FileReader();
 reader.onload = () => {
 setMediaDataUrl(String(reader.result));
 setMediaType("video");
 };
 reader.readAsDataURL(file);
 return;
 }
 if (!file.type.startsWith("image/")) {
 setError("Please upload a photo (JPEG, PNG, or WebP).");
 return;
 }
 void (async () => {
 try {
 setError(null);
 const dataUrl = await compressImageForAssessment(file);
 setMediaDataUrl(dataUrl);
 setMediaType("image");
 } catch {
 // Fallback to raw read if canvas compress fails
 const reader = new FileReader();
 reader.onload = () => {
 setMediaDataUrl(String(reader.result));
 setMediaType("image");
 };
 reader.readAsDataURL(file);
 }
 })();
 }

 async function runAssessWithProgress(
 jobId: number,
 zip?: string | null,
 { force = false }: { force?: boolean } = {}
 ) {
 if (!force && assessInFlightRef.current === jobId) {
 return {
 ok: false as const,
 message: "Assessment is already in progress.",
 code: "IN_FLIGHT",
 };
 }
 assessInFlightRef.current = jobId;
 setAssessLoadingStep(0);
 setAssessLoadingZip(zip ? String(zip).slice(0, 5) : null);
 const timer = window.setInterval(() => {
 setAssessLoadingStep((s) => (s == null ? 0 : Math.min(3, s + 1)));
 }, 900);
 try {
 return await assessManagedJob(jobId, { force });
 } finally {
 window.clearInterval(timer);
 setAssessLoadingStep(3);
 window.setTimeout(() => {
 setAssessLoadingStep(null);
 setAssessLoadingZip(null);
 }, 350);
 if (assessInFlightRef.current === jobId) assessInFlightRef.current = null;
 }
 }

 function scrollReportToTop() {
 if (typeof window === "undefined") return;
 window.scrollTo({ top: 0, behavior: "smooth" });
 document.querySelector("main")?.scrollTo?.({ top: 0, behavior: "smooth" });
 }

 function openAssessmentFlow(reportPathValue: "ai" | "experts" = "ai") {
 setAssessmentMsg(null);
 setAssessLoadingStep(0);
 if (reportPathValue === "ai") {
 setAssessmentMode("diy");
 }
 const propZip = properties.find((p) => p.id === propertyId)?.zip || null;
 setAssessLoadingZip(propZip ? String(propZip).slice(0, 5) : null);
 navigateTo({
 role: "homeowner",
 tab: "report",
 reportStep: "assessment",
 reportPath: reportPathValue,
 jobId: null,
 });
 scrollReportToTop();
 }

 function returnToIntakeDetails() {
 setAssessLoadingStep(null);
 setAssessLoadingZip(null);
 navigateTo({
 role: "homeowner",
 tab: "report",
 reportStep: "intake",
 intakePhase: "details",
 reportPath: reportPath ?? "ai",
 jobId: null,
 });
 scrollReportToTop();
 }

 async function submitIssue(path: "ai" | "experts") {
 if (!description.trim()) {
 alert("Please describe the issue first.");
 setError("Please describe the issue first.");
 return;
 }

 const resolvedTrade = resolveRequestTradeId(requestSystemId, description);
 const resolvedLocation = resolveServiceLocation(issueArea, description);
 if (!requestSystemId) {
 setRequestSystemId(resolvedTrade);
 setCategory(tradeToCategory(resolvedTrade));
 }
 if (!issueArea) {
 setIssueArea(resolvedLocation);
 }

 const category = tradeToCategory(resolvedTrade);
 const fullDescription = `${description.trim()}${formatAdaptiveAnswersNote(resolvedTrade, adaptiveAnswers)}`;

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
 setAssessmentMsg(null);
 const propZip = properties.find((p) => p.id === propertyId)?.zip || null;
 if (path === "ai") {
 openAssessmentFlow("ai");
 } else {
 setAssessmentMode("expert");
 }
 try {
 const code = partnerCode.trim().toUpperCase();
 const usePartner = Boolean(code);
 const created = await createManagedJob({
 category,
 title: serviceRequestTitle(resolvedLocation, resolvedTrade),
 description: fullDescription,
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
 if (path === "ai") returnToIntakeDetails();
 return;
 }
 try {
 sessionStorage.removeItem("fixbridge-partner-intake");
 clearIntakeDraft();
 setHasIntakeDraft(false);
 setIntakeDraftSavedAt(null);
 // Keep code applied for this session in case they file another job;
 // clear intake flag only.
 } catch {
 // ignore
 }
 setActiveJob(created.job);
 setAssistantHandoffIntent(null);
 setReportPath(path);
 if (path === "experts") {
 navigateTo({
 role: "homeowner",
 tab: "report",
 reportStep: "assessment",
 reportPath: "experts",
 jobId: null,
 });
 setAssessmentMode("expert");
 scrollReportToTop();
 }
 const assessed = await runAssessWithProgress(created.job.id, propZip);
 if (!assessed.ok || !assessed.job) {
 setAssessmentMsg(normalizeAssessmentMessage(assessed.message));
 setActiveJob(created.job);
 } else {
 setActiveJob(assessed.job);
 setAssessmentMsg(
 assessed.warning ||
 assessed.pricing?.message ||
 null
 );
 }
 if (path === "ai") {
 setAssessmentMode("diy");
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
 setReportPath("experts");
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
 setError(null);
 try {
 const r = await payDispatchFee(
 activeJob.id,
 dispatchCouponPreview?.code || activeJob.discountCode || undefined
 );
 if (!r.ok) {
 setError(r.message || "Payment failed.");
 return;
 }
 if (r.url) {
 window.location.href = r.url;
 return;
 }
 setError("Stripe checkout could not be started. Check payment configuration.");
 } finally {
 setBusy(false);
 }
 }

 const baseDispatchFee =
 activeJob?.visitFeeAmount ??
 activeJob?.pricing?.contractor_visit_fee ??
 125;
 const dispatchHoldAmount = dispatchCouponPreview?.discountedAmount ?? baseDispatchFee;

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

 const jobProperty =
 properties.find((p) => p.id === activeJob.propertyId) ||
 properties.find((p) => p.id === primaryPropertyId) ||
 primaryProperty ||
 null;
 const jobHealth = normalizeHealthProfile(jobProperty?.healthProfile as PropertyHealthProfile | null);
 const passportContext = hasHomeCarePro ? buildPassportAiContext(jobProperty, jobHealth) : null;

 const systemContext: ChatMessage = {
 role: "user",
 content: `Instructions: You are a friendly, helpful home-repair AI coach helping the homeowner clarify the step-by-step DIY Action Plan generated for their issue.
Here is the context of the repair issue they are trying to solve:
- Category: ${category}
- Description: "${desc}"
- Required Tools: ${tools}
- Materials Needed: ${materials}

Property Passport (selected home — tailor advice to this property when relevant):
${passportContext || "Upgrade to HomeCare Pro for property-aware recommendations based on your Property Passport."}

Instructions/Steps:
${steps}

Your role is to answer questions about these steps, tools, and materials. Be clear, concise, and encourage safety. When equipment age, systems, or home details matter, use the Property Passport context above.
CRITICAL SAFETY INSTRUCTION: If the user describes a dangerous situation (e.g. gas leak, electrical sparks, structural collapse) or asks to do something unsafe, immediately tell them to STOP and hire a professional (using the "Hire a Professional" option in FixBridge).`
 };

 const ackContext: ChatMessage = {
 role: "assistant",
 content: "Understood. I will act as their home-repair AI coach and help them clarify the steps safely."
 };

 const payloadMessages = [systemContext, ackContext, ...updatedMessages];
 const result = await chatWithAi(payloadMessages, { jobId: activeJob.id });

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
 navigateTab(item.id);
 }}
 className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
 tab === resolveNavTab(item.id) ||
 (item.id === "property" && (tab === "properties" || tab === "property")) ||
 (item.id === "property-care" && tab === "property-care")
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
 <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
 Account
 </p>
 {FOOTER_NAV.map((item) => (
 <button
 key={item.id}
 type="button"
 onClick={() => {
 navigateTab(item.id);
 }}
 className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
 tab === resolveNavTab(item.id) || (item.id === "settings" && tab === "profile")
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

 const goProPromoCard = !hasHomeCarePro && (
 <div className="mx-3.5 my-3 rounded-xl border border-border/80 bg-muted/30 p-4 text-left">
 <p className="text-xs font-semibold text-foreground">HomeCare Pro</p>
 <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
 Year-round home management — maintenance calendar, document vault, priority routing, and more.
 </p>
 <button
 type="button"
 onClick={() => navigateTab("go-pro")}
 className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted"
 >
 View Plans
 </button>
 </div>
 );

 return (
 <ProFeatureProvider
 planCode={user.planCode}
 homeCareSubscription={user.homeCareSubscription}
 busy={busy}
 onUpgrade={handleAuthenticatedCheckout}
 onProActivated={handleProActivated}
 >
 <div className="min-h-screen bg-background text-foreground">
 {/* Mobile top bar - title + quick actions; full nav lives in bottom bar */}
 <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
 <div className="flex min-w-0 items-center gap-1">
 {canBack && <AppBackButton onBack={goBack} className="-ml-1 shrink-0" />}
 <div className="min-w-0">
 <AppLogo onHome={goHome} variant="auth" className="mb-0.5" />
 <p className="truncate text-[10px] text-muted-foreground">{user.name}</p>
 </div>
 </div>
 <div className="flex items-center gap-1">
 {!hasHomeCarePro && (
 <button
 type="button"
 onClick={() => navigateTab("go-pro")}
 className="inline-flex items-center gap-1 rounded-full bg-[#FF6B2C] px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
 >
 <Sparkles className="h-3 w-3" />
 HomeCare
 </button>
 )}
 </div>
 </header>

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
 <AppLogo onHome={goHome} variant="auth" className="mb-0.5" />
 <p className="text-[10px] text-muted-foreground leading-none">Homeowner | {user.name}</p>
 {hasHomeCarePro ? (
 <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#FF6B2C]/35 bg-[#FF6B2C]/10 px-2 py-0.5">
 <Sparkles className="h-3 w-3 text-[#FF6B2C]" aria-hidden />
 <span className="text-[10px] font-semibold text-[#FF6B2C]">HomeCare Pro Member</span>
 </div>
 ) : null}
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

 <main className="min-w-0 flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-6">
 {error && (
 <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
 {error}
 </div>
 )}

 {tab === "overview" && (
 <div className="space-y-6">
 {hasIntakeDraft ? (
 <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
 <p className="text-sm font-medium">You have an unfinished service request.</p>
 <button
 type="button"
 onClick={resumeIntakeDraft}
 className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
 >
 Continue Request
 </button>
 </div>
 ) : null}
 <HomeownerOverview
 userName={user.name || "there"}
 property={primaryProperty}
 health={healthProfile}
 jobs={primaryPropertyJobs}
 quotesWaiting={countQuotesWaiting(primaryPropertyJobs)}
 onRequestService={() => openRequestService()}
 onOpenJob={(id) => openJobsSegment("active", id)}
 onOpenHealth={() => openPropertyCare("passport")}
 onOpenProperty={() => navigateTab("properties")}
 onOpenPropertyPicker={() => setPropertyPickerOpen(true)}
 onOpenQuotes={() => openJobsSegment("quotes")}
 onOpenHomeUpdates={() => openPropertyCare("recommendations")}
 />
 <div className="mx-auto max-w-5xl">
 <HomeownerHomeUpdates
 property={primaryProperty}
 health={healthProfile}
 jobs={primaryPropertyJobs}
 busy={busy}
 compact
 onSaveHealth={async (next) => {
 if (!primaryProperty?.id) return;
 await saveHealthProfile(primaryProperty.id, next);
 }}
 onRequestService={(prefill) => openRequestService(prefill)}
 onOpenProperty={() => navigateTab("properties")}
 />
 </div>
 </div>
 )}

 {tab === "property-care" && (
 <HomeownerPropertyCare
 properties={properties}
 jobs={jobs}
 busy={busy}
 initialSection={careSection}
 initialPropertyId={primaryPropertyId}
 onSaveHealth={saveHealthProfile}
 onSaveProperty={saveProperty}
 onRefresh={refresh}
 onAddProperty={addHealthProperty}
 onPropertySelect={selectPrimaryProperty}
 onRequestService={(prefill) => openRequestService(prefill)}
 onOpenJob={(id) => {
 setSelectedJobId(id);
 setTab("jobs");
 }}
 />
 )}

 {tab === "more" && (
 <HomeownerMoreMenu
 userName={user.name || "Homeowner"}
 planCode={user.planCode}
 isPro={hasHomeCarePro}
 isDark={isDark}
 onNavigate={navigateTab}
 onToggleDark={onToggleDark}
 onLogout={onLogout}
 onGoPro={() => navigateTab("go-pro")}
 goProBusy={busy}
 showGoPro={!hasHomeCarePro}
 />
 )}

 {tab === "inbox" && (
 <HomeownerInboxPanel
 jobs={jobs}
 homeUpdates={buildHomeUpdatesSnapshot({
 property: primaryProperty,
 health: healthProfile,
 jobs: primaryPropertyJobs,
 prefs: healthProfile.homeUpdateState || null,
 }).items}
 onOpenJob={(id, segment) => openJobsSegment(segment ?? "active", id)}
 onRequestService={() => openRequestService()}
 onOpenHomeUpdates={() => openPropertyCare("recommendations")}
 />
 )}

 {tab === "protection" && (
 <HomeownerHomeProtection userEmail={user.email} userId={user.id} />
 )}
 {tab === "refer-earn" && <HomeownerReferEarn referredByCode={user.referredByCode} />}
 {tab === "documents" &&
 (hasHomeCarePro ? (
 <HomeownerDocumentsPanel
 jobs={jobs}
 properties={properties}
 onOpenJob={(id) => {
 setSelectedJobId(id);
 setTab("jobs");
 }}
 />
 ) : (
 <ProLockedShell
 feature="document_vault"
 onUnlock={() => promptProUpgrade("document_vault", "documents")}
 />
 ))}
 {tab === "payments" && (
 <HomeownerPaymentsPanel
 jobs={jobs}
 properties={properties}
 onOpenJob={(id) => {
 setSelectedJobId(id);
 setTab("jobs");
 }}
 />
 )}
 {tab === "messages" &&
 comingSoon("Messages", "Chat with FixBridge and your assigned contractors will land here.")}
{tab === "assistant" && (
 <HomeAssistantPanel
 properties={properties}
 propertyId={typeof propertyId === "number" ? propertyId : primaryPropertyId}
 jobs={jobs}
 onStartReport={() => openRequestService()}
 onOpenRecurring={() => setTab("property-care")}
 onOpenJob={(id) => {
 setSelectedJobId(id);
 setTab("jobs");
 }}
 />
)}
 {tab === "help" && (
 <HomeownerSupportPanel channel="help" user={user} properties={properties} jobs={jobs} />
 )}

 {tab === "go-pro" && (
 <div className="rounded-[1.75rem] bg-[#F3F4F6] px-4 py-8 dark:bg-muted/30 sm:px-6">
 <HomeownerGoProPlans
 currentPlanCode={user.planCode}
 busy={busy}
 isAuthenticated
 onAuthenticatedCheckout={handleAuthenticatedCheckout}
 onSelectPlan={handleSelectGoProPlan}
 onPlansLoaded={(cards) => {
 setGoProPlans(cards);
 setDiyUnlockCodes(
 cards.filter((c) => c.unlocksDiy).map((c) => c.planCode)
 );
 }}
 onSubscribeSuccess={(u) => onUserUpdated?.(u)}
 checkPricingUpdates
 showFeatureMatrix
 />
 {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
 </div>
 )}

 <SubscriptionSuccessModal
 open={Boolean(showSubscriptionSuccess)}
 plan={successPlanCard}
 activating={Boolean(subscriptionActivating)}
 onClose={() => onDismissSubscriptionSuccess?.()}
 onViewFeatures={() => {
 setTab("go-pro");
 onDismissSubscriptionSuccess?.();
 }}
 />

 {diyConsentOpen ? (
 <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
 <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
 <h3 className="text-lg font-semibold">Guided DIY safety acknowledgment</h3>
 <p className="mt-1 text-sm text-muted-foreground">
 Before using Guided DIY, confirm you understand the safety limits of AI guidance.
 </p>
 <div className="mt-4">
 <ConsentSection title="Required">
 <ConsentCheckbox
 id="diy-safety-consent"
 checked={diyConsentChecked}
 onChange={setDiyConsentChecked}
 label="I understand FixBridge AI guidance is informational, may be wrong, and I must stop if the task is unsafe or beyond my ability."
 documentKey="DIY_SAFETY_DISCLAIMER"
 documentLabel="AI / DIY Safety Disclaimer"
 />
 </ConsentSection>
 </div>
 <div className="mt-5 flex flex-wrap justify-end gap-2">
 <button
 type="button"
 className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
 onClick={() => setDiyConsentOpen(false)}
 disabled={diyConsentBusy}
 >
 Cancel
 </button>
 <button
 type="button"
 className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
 disabled={!diyConsentChecked || diyConsentBusy}
 onClick={() => void confirmDiySafetyConsent()}
 >
 {diyConsentBusy ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null}
 Start Guided DIY
 </button>
 </div>
 </div>
 </div>
 ) : null}
 {diyAckGate.modal}

 {tab === "report" && (
 <section className="mx-auto max-w-3xl space-y-5">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
 Request Service
 </h1>
 <p className="mt-1 text-sm text-muted-foreground">
 Tell FixBridge what&apos;s going on - we&apos;ll analyze it and help you DIY or hire a pro.
 </p>
 </div>
 <button
 type="button"
 onClick={() => setTab("jobs")}
 className="text-sm font-semibold text-primary hover:underline"
 >
 View my requests
 </button>
 </div>

 {assistantHandoffIntent ? (
 <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-foreground">
 {assistantHandoffIntent === "site_visit"
 ? "From Home Assistant — review details below, then continue to schedule a site visit."
 : assistantHandoffIntent === "remote_quote"
 ? "From Home Assistant — your issue is prefilled. Review and request a remote quote."
 : "From Home Assistant — review safe DIY guidance or request professional help."}
 </p>
 ) : null}

 {step === "intake" && (
 <HomeownerServiceIntake
 intakePhase={intakePhase}
 setIntakePhase={setIntakePhase}
 requestSystemId={requestSystemId}
 setRequestSystemId={setRequestSystemId}
 setCategory={(c) => setCategory(c as HomeownerService)}
 issueArea={issueArea}
 setIssueArea={setIssueArea}
 description={description}
 setDescription={setDescription}
 adaptiveAnswers={adaptiveAnswers}
 setAdaptiveAnswers={setAdaptiveAnswers}
 voiceListening={voiceListening}
 setVoiceListening={setVoiceListening}
 voiceRecRef={voiceRecRef}
 voiceBaseRef={voiceBaseRef}
 fileRef={fileRef}
 videoRef={videoRef}
 onFile={onFile}
 mediaDataUrl={mediaDataUrl}
 mediaType={mediaType}
 propertyId={propertyId}
 setPropertyId={setPropertyId}
 properties={properties}
 onAddAddress={() => {
 setModalAddressLine1("");
 setModalCity("");
 setModalState("");
 setModalZip("");
 setModalActionAfterSave(null);
 setShowAddAddressModal(true);
 }}
 partnerCode={partnerCode}
 setPartnerCode={(c) => setPartnerCode(normalizePartnerCodeInput(c))}
 partnerLookingUp={partnerLookingUp}
 partnerInfo={partnerInfo}
 partnerConsent={partnerConsent}
 setPartnerConsent={setPartnerConsent}
 busy={busy}
 error={error}
 setError={setError}
 onBack={goBackOneReportStep}
 onSubmitAi={() => void submitIssue("ai")}
 onHirePro={goToExperts}
 onClearMedia={() => {
 setMediaDataUrl(null);
 setMediaType(null);
 }}
 draftSavedAt={intakeDraftSavedAt}
 />
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
 onClick={goBackOneReportStep}
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
 {["Timing", "Window", "Property"].map((label, i) => (
 <div key={label} className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#FF4D1C] text-[11px] font-semibold text-white">
 {i + 1}
 </span>
 <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{label}</span>
 {i < 2 && <span className="mx-1 hidden h-px w-6 bg-[#FF4D1C]/30 sm:block" />}
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
 onClick={() => selectServiceTimingOption(opt.value, setServiceTiming, setPreferredDate, preferredDate)}
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

 {/* Preferred date — only when timing doesn't already imply it */}
 {serviceTiming === "same-day" ? (
 <p className="relative mt-7 rounded-xl border border-[#FF4D1C]/20 bg-[#FF4D1C]/5 px-4 py-3 text-sm text-muted-foreground">
 <span className="font-semibold text-foreground">Date: </span>
 Today ({formatDisplayDate(preferredDate || addDaysFromToday(0))}) — same-day dispatch when a pro is available.
 </p>
 ) : serviceTiming === "evening-weekend" ? (
 <div className="relative mt-7 space-y-2">
 <p className="rounded-xl border border-[#FF4D1C]/20 bg-[#FF4D1C]/5 px-4 py-3 text-sm text-muted-foreground">
 <span className="font-semibold text-foreground">Target: </span>
 {formatDisplayDate(preferredDate || nextWeekendDate())} (next available evening or weekend window).
 </p>
 <details className="text-xs text-muted-foreground">
 <summary className="cursor-pointer font-medium text-foreground/80">Pick a different date</summary>
 <input
 type="date"
 min={toDateInputValue(new Date())}
 className="mt-2 w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm tabular-nums outline-none transition focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20 dark:bg-background/60"
 value={preferredDate}
 onChange={(e) => setPreferredDate(e.target.value)}
 />
 </details>
 </div>
 ) : (
 <fieldset className="relative mt-7 space-y-3">
 <legend className="flex items-center gap-2 text-sm font-semibold">
 <CalendarDays className="h-4 w-4 text-[#FF4D1C]" />
 Preferred weekday <span className="font-normal text-muted-foreground">(optional)</span>
 </legend>
 <p className="text-xs text-muted-foreground">
 Scheduled weekday means we match the next available weekday — only pick a date if you have a specific day in mind.
 </p>
 <div className="flex flex-wrap gap-2">
 {[
 { label: "Tomorrow", value: addDaysFromToday(1) },
 { label: "In 2 days", value: addDaysFromToday(2) },
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
 {preferredDate ? (
 <button
 type="button"
 onClick={() => setPreferredDate("")}
 className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-[#FF4D1C]/40"
 >
 Flexible — any weekday
 </button>
 ) : null}
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
 Selected | {formatDisplayDate(preferredDate)}
 </motion.p>
 ) : (
 <p className="text-xs text-muted-foreground">No date selected — we&apos;ll use the next available weekday slot.</p>
 )}
 </AnimatePresence>
 </fieldset>
 )}

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
 <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up...
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
 {discountMessage || "Code saved - will try to apply on submit."}
 </p>
 ) : (
 <p className="text-xs text-muted-foreground">Optional - % or $ off the customer estimate.</p>
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
 {" | "}
 {TIME_WINDOW_OPTIONS.find((o) => o.value === preferredTimeSlot)?.label}
 {preferredDate ? ` | ${formatDisplayDate(preferredDate)}` : " | date flexible"}
 {" | "}
 {PROPERTY_PURPOSE_OPTIONS.find((o) => o.value === propertyPurpose)?.label}
 {" | "}
 {PROJECT_STAGE_OPTIONS.find((o) => o.value === transactionStage)?.label}
 {discountInfo
 ? ` | ${discountInfo.summary}`
 : discountCode.trim()
 ? ` | code ${discountCode.trim().toUpperCase()}`
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

 {step === "assessment" && (activeJob || assessLoadingStep != null) && (
 <div className="space-y-5 rounded-lg border border-border bg-card p-4">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <button
 type="button"
 onClick={goBackOneReportStep}
 className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
 >
 <ArrowLeft className="h-4 w-4" /> Back
 </button>
 {activeJob && assessmentMode === "expert" ? (
 <button
 type="button"
 onClick={() => {
 setSelectedJobId(activeJob.id);
 setTab("jobs");
 }}
 className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
 >
 Track this request
 </button>
 ) : null}
 </div>

 <div className="flex items-start gap-2">
 <ShieldAlert className="mt-0.5 h-5 w-5 text-[#FF4D1C]" />
 <div>
 <h2 className="text-lg font-semibold">Assessment</h2>
 <p className="text-sm text-muted-foreground">
 {activeJob?.aiAssessment
 ? activeJob.aiAssessment.disclaimer ||
 "AI-assisted assessment, not a professional diagnosis."
 : "Reviewing your request and preparing your local price estimate."}
 </p>
 </div>
 </div>

 {assessmentMsg && activeJob?.aiAssessment ? (
 <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
 {assessmentMsg}
 </p>
 ) : null}

 {assessLoadingStep != null ||
 busy ||
 (isAssessmentProcessing(activeJob) && !hasRenderableAssessment(activeJob)) ? (
 <EstimateLoadingSteps zip={assessLoadingZip} activeStep={assessLoadingStep ?? 0} />
 ) : !hasRenderableAssessment(activeJob) ? (
 <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
 <p className="text-sm font-semibold">We couldn&apos;t finish the assessment right now</p>
 <p className="text-sm leading-relaxed">
 {normalizeAssessmentMessage(assessmentMsg)}
 </p>
 {activeJob ? (
 <div className="flex flex-wrap gap-2">
 <button
 type="button"
 disabled={busy}
 onClick={() => {
 void (async () => {
 setBusy(true);
 setAssessmentMsg(null);
 try {
 const retryZip =
 properties.find((p) => p.id === activeJob.propertyId)?.zip || null;
 const assessed = await runAssessWithProgress(activeJob.id, retryZip, { force: true });
 if (!assessed.ok || !assessed.job) {
 setAssessmentMsg(normalizeAssessmentMessage(assessed.message));
 } else {
 setActiveJob(assessed.job);
 setAssessmentMsg(assessed.warning || assessed.pricing?.message || null);
 await refresh();
 }
 } finally {
 setBusy(false);
 }
 })();
 }}
 className="inline-flex items-center gap-2 rounded-md bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
 >
 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
 Try assessment again
 </button>
 {assessmentMode === "expert" || reportPath === "experts" ? (
 <button
 type="button"
 onClick={() => {
 setSelectedJobId(activeJob.id);
 setTab("jobs");
 }}
 className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium"
 >
 Continue request
 </button>
 ) : (
 <button
 type="button"
 onClick={() => {
 setAssessmentMode("expert");
 if (activeJob) setSelectedJobId(activeJob.id);
 }}
 className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium"
 >
 Continue to hire a professional
 </button>
 )}
 </div>
 ) : null}
 </div>
 ) : hasRenderableAssessment(activeJob) ? (
 <>
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
 Do It Yourself (DIY)
 </button>
 <button
 type="button"
 onClick={() => {
 setAssessmentMode("expert");
 if (activeJob) setSelectedJobId(activeJob.id);
 }}
 className={`flex-1 pb-3 text-center text-sm font-semibold border-b-2 transition ${
 assessmentMode === "expert"
 ? "border-[#FF4D1C] text-[#FF4D1C]"
 : "border-transparent text-muted-foreground hover:text-foreground"
 }`}
 >
 Hire a Professional
 </button>
 </div>

 {assessmentStringList(activeJob.aiAssessment?.questions_needed).length > 0 && (
 <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 flex gap-3 shadow-sm">
 <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
 <div className="text-sm space-y-1.5 w-full">
 <p className="font-semibold text-amber-900 dark:text-amber-200">Clarification Needed to Refine Estimate</p>
 <p className="text-xs opacity-90 leading-relaxed">
 Our AI detected potential uncertainty or mismatch in the details provided (e.g. description and photo trade categories mismatch, or extremely vague summary). Please review the following questions:
 </p>
 <ul className="list-disc pl-5 text-xs space-y-1 text-amber-800 dark:text-amber-300 font-medium">
 {assessmentStringList(activeJob.aiAssessment?.questions_needed).map((q, idx) => (
 <li key={idx}>{q}</li>
 ))}
 </ul>
 <p className="text-xs pt-1 font-medium text-amber-900 dark:text-amber-200">
 To fix, click <strong className="text-[#FF4D1C]">Report another issue</strong> above and upload a matching photo and clear description.
 </p>
 </div>
 </div>
 )}

 {assessmentMode === "expert" ? (
 <div className="space-y-4">
 {activeJob ? (
 <ServiceTrackingCard
 job={jobs.find((j) => j.id === activeJob.id) || activeJob}
 compact
 onMessage={() => {
 setSelectedJobId(activeJob.id);
 setTab("jobs");
 setShowTechMessage(true);
 }}
 onChangeSchedule={() => {
 setSelectedJobId(activeJob.id);
 setTab("jobs");
 setForceEditSchedule(true);
 }}
 />
 ) : null}
 {dispatchSuccessMsg ? (
 <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
 {dispatchSuccessMsg}
 </p>
 ) : null}
 <p className="text-sm leading-relaxed">{activeJob.aiAssessment?.summary || "Assessment saved."}</p>
 <div className="grid gap-3 sm:grid-cols-3">
 <div className="rounded-md bg-muted/50 p-3 text-sm">
 <p className="text-muted-foreground">Urgency</p>
 <p className="font-medium capitalize">{activeJob.aiAssessment?.urgency || " - "}</p>
 </div>
 <div className="rounded-md bg-muted/50 p-3 text-sm">
 <p className="text-muted-foreground">Trade</p>
 <p className="font-medium">{activeJob.aiAssessment?.recommended_trade || " - "}</p>
 </div>
 <div className="rounded-md bg-muted/50 p-3 text-sm">
 <p className="text-muted-foreground">Confidence</p>
 <p className="font-medium">
 {typeof activeJob.aiAssessment?.confidence === "number" &&
 Number.isFinite(activeJob.aiAssessment.confidence)
 ? `${Math.round(activeJob.aiAssessment.confidence * 100)}%`
 : " - "}
 </p>
 </div>
 </div>
 {assessmentStringList(activeJob.aiAssessment?.immediate_safety_steps).length > 0 && (
 <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
 <p className="font-medium">Safety steps</p>
 <ul className="mt-1 list-disc pl-5">
 {assessmentStringList(activeJob.aiAssessment?.immediate_safety_steps).map((s) => (
 <li key={s}>{s}</li>
 ))}
 </ul>
 </div>
 )}
 <HomeownerLocalEstimate job={activeJob} />
 <HireProfessionalWizard
 job={activeJob}
 busy={busy}
 setBusy={setBusy}
 onError={setError}
 onJobUpdated={(updated) => {
 setActiveJob(updated);
 setSelectedJobId(updated.id);
 }}
 onPaid={async () => {
 setDispatchSuccessMsg("Dispatch fee authorized - FixBridge has been notified.");
 setTab("jobs");
 setSelectedJobId(activeJob.id);
 await refresh();
 }}
 />
 </div>
 ) : (
 !hasDiyAccess ? (
 <div className="relative space-y-4">
 <div className="pointer-events-none select-none opacity-20 blur-sm">
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="rounded-xl border border-border bg-muted/20 p-4">
 <h4 className="font-semibold text-sm mb-3">Required Tools</h4>
 <div className="h-4 w-3/4 bg-muted rounded mb-2" />
 <div className="h-4 w-1/2 bg-muted rounded" />
 </div>
 <div className="rounded-xl border border-border bg-muted/20 p-4">
 <h4 className="font-semibold text-sm mb-3">Materials Needed</h4>
 <div className="h-4 w-3/4 bg-muted rounded mb-2" />
 <div className="h-4 w-1/2 bg-muted rounded" />
 </div>
 </div>
 </div>

 <div className="relative z-10 rounded-[1.5rem] bg-[#F3F4F6] p-4 dark:bg-muted/40 sm:p-6">
 <div className="mb-4 text-center">
 <h3 className="[font-family:'Barlow_Condensed',sans-serif] text-2xl font-black uppercase tracking-tight">
 Unlock DIY Action Plan
 </h3>
 <p className="mt-1 text-xs text-muted-foreground">
 Upgrade to HomeCare Pro for full DIY action plans — includes a 7-day free trial.
 </p>
 </div>
 <HomeownerGoProPlans
 compact
 currentPlanCode={user.planCode}
 busy={busy}
 isAuthenticated
 onAuthenticatedCheckout={handleAuthenticatedCheckout}
 onSelectPlan={handleSelectGoProPlan}
 onPlansLoaded={(cards) => {
 setGoProPlans(cards);
 setDiyUnlockCodes(
 cards.filter((c) => c.unlocksDiy).map((c) => c.planCode)
 );
 }}
 showFeatureMatrix={false}
 checkPricingUpdates={false}
 />
 </div>
 </div>
 ) : (
 <div className="space-y-4">
 {(() => {
 const risk = String(activeJob.diyRiskLevel || activeJob.aiAssessment?.diy_risk_level || "green").toLowerCase();
 if (risk === "red") {
 return (
 <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-950 dark:text-red-100 space-y-3">
 <div className="flex gap-3">
 <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
 <div className="text-sm">
 <p className="font-semibold">Safety risk detected</p>
 <p className="mt-1 text-xs leading-relaxed opacity-90">
 Do not attempt this repair yourself. Follow immediate safety steps and request a licensed professional.
 </p>
 </div>
 </div>
 {(activeJob.aiAssessment?.immediate_safety_steps || []).length > 0 ? (
 <ul className="list-disc pl-5 text-xs space-y-1">
 {assessmentStringList(activeJob.aiAssessment?.immediate_safety_steps).map((step, i) => (
 <li key={i}>{step}</li>
 ))}
 </ul>
 ) : null}
 <button
 type="button"
 onClick={() => setAssessmentMode("expert")}
 className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
 >
 Request a Professional
 </button>
 </div>
 );
 }
 if (risk === "yellow") {
 return (
 <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-amber-950 dark:text-amber-100 flex gap-3">
 <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
 <div className="text-sm">
 <p className="font-semibold">Caution — Limited DIY Guidance</p>
 <p className="mt-1 opacity-90 text-xs leading-relaxed">
 We can help with low-risk checks, but this issue may require a professional.
 </p>
 <button
 type="button"
 onClick={() => setAssessmentMode("expert")}
 className="mt-3 inline-flex items-center rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary"
 >
 Get a Pro
 </button>
 </div>
 </div>
 );
 }
 return null;
 })()}
 {/* DIY Caution Banner if not safe */}
 {!activeJob.aiAssessment?.safe_diy_allowed && String(activeJob.diyRiskLevel || "green") !== "red" && (
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

 <HomeownerLocalEstimate job={activeJob} compact />

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
 Required Tools
 </h4>
 {assessmentStringList(activeJob.aiAssessment?.tools_required).length > 0 ? (
 <ul className="space-y-2">
 {assessmentStringList(activeJob.aiAssessment?.tools_required).map((tool, idx) => (
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
 Materials Needed
 </h4>
 {assessmentStringList(activeJob.aiAssessment?.materials_needed).length > 0 ? (
 <ul className="space-y-2">
 {assessmentStringList(activeJob.aiAssessment?.materials_needed).map((item, idx) => (
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
 <h4 className="font-semibold text-sm">Step-by-Step Instructions</h4>
 {assessmentStringList(activeJob.aiAssessment?.diy_steps).length > 0 &&
 String(activeJob.diyRiskLevel || activeJob.aiAssessment?.diy_risk_level || "green") !== "red" && (
 <button
 type="button"
 onClick={() => void (diyIsGuided ? setDiyIsGuided(false) : startGuidedDiy())}
 className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
 >
 {diyIsGuided ? "Switch to List View" : "Switch to Guided Mode"}
 </button>
 )}
 </div>

 {assessmentStringList(activeJob.aiAssessment?.diy_steps).length > 0 ? (
 String(activeJob.diyRiskLevel || activeJob.aiAssessment?.diy_risk_level || "green") === "red" ? (
 <p className="text-sm text-muted-foreground">
 Repair instructions are not shown for this safety risk. Request a professional for on-site help.
 </p>
 ) : diyIsGuided ? (
 <div className="space-y-4">
 {/* Progress bar */}
 <div>
 <div className="flex justify-between text-xs text-muted-foreground mb-1">
 <span>Progress</span>
 <span>
 {Math.round(
 (Object.values(diyCompletedSteps).filter(Boolean).length /
 assessmentStringList(activeJob.aiAssessment?.diy_steps).length) *
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
 assessmentStringList(activeJob.aiAssessment?.diy_steps).length) *
 100
 }%`,
 }}
 />
 </div>
 </div>

 {/* Active Step Card */}
 <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 relative overflow-hidden">
 <div className="absolute right-3 top-3 text-[10px] font-bold text-primary/30 uppercase tracking-widest">
 Step {diyStepIndex + 1} of {assessmentStringList(activeJob.aiAssessment?.diy_steps).length}
 </div>
 
 <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Active Step</p>
 <p className="text-sm font-medium text-foreground leading-relaxed">
 {assessmentStringList(activeJob.aiAssessment?.diy_steps)[diyStepIndex]}
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
 {diyCompletedSteps[diyStepIndex] ? "OK I completed this step!" : "Mark this step as done"}
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
 Previous Step
 </button>
 <button
 type="button"
 disabled={diyStepIndex === assessmentStringList(activeJob.aiAssessment?.diy_steps).length - 1}
 onClick={() => setDiyStepIndex((idx) => idx + 1)}
 className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
 >
 Next Step
 </button>
 </div>
 </div>
 ) : (
 <div className="relative border-l border-border/80 pl-4 ml-2 space-y-4">
 {assessmentStringList(activeJob.aiAssessment?.diy_steps).map((stepItem, idx) => (
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
 {assessmentStringList(activeJob.aiAssessment?.stop_conditions).length > 0 && (
 <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
 <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1.5">
 Warning: Safety Stop Conditions
 </h4>
 <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
 Stop immediately and request a professional dispatcher if you experience any of the following:
 </p>
 <ul className="space-y-2">
 {assessmentStringList(activeJob.aiAssessment?.stop_conditions).map((stopItem, idx) => (
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

 <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground">
 Prefer not to do it yourself?{" "}
 <button
 type="button"
 onClick={() => {
 setAssessmentMode("expert");
 if (activeJob) setSelectedJobId(activeJob.id);
 }}
 className="inline-flex items-center gap-1 font-semibold text-[#FF4D1C] underline-offset-2 hover:underline"
 >
 <HardHat className="h-3.5 w-3.5" />
 Hire a professional instead
 </button>
 </p>
 </div>

 </div>
 </div>
 )
 )}
 </>
 ) : null}
 </div>
 )}
 </section>
 )}

 {tab === "jobs" && (
 <section className="mx-auto max-w-5xl space-y-4">
 {invoicePaymentMsg ? (
 <p
 className={`rounded-xl border px-4 py-3 text-sm ${
 invoicePaymentMsg.includes("OK")
 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
 : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
 }`}
 >
 {invoicePaymentMsg}
 </p>
 ) : null}
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
 Jobs
 </h1>
 <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
 Active work, quotes, appointments, and history - same as desktop, organized for mobile.
 </p>
 </div>
 <button
 type="button"
 onClick={openRequestService}
 className="hidden sm:inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
 >
 <PlusCircle size={16} /> New request
 </button>
 </div>

 <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
 {JOBS_SEGMENTS.map((s) => (
 <button
 key={s.id}
 type="button"
 onClick={() => {
 setJobsSegment(s.id);
 setSelectedJobId(null);
 }}
 className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
 jobsSegment === s.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
 }`}
 >
 {s.label}
 </button>
 ))}
 </div>

 {loading ? (
 <p className="text-sm text-muted-foreground">Loading...</p>
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
 ) : filteredJobs.length === 0 ? (
 <div className="rounded-[1.5rem] border border-dashed border-border bg-card px-6 py-10 text-center">
 <p className="text-sm text-muted-foreground">Nothing in {jobsSegment} right now.</p>
 </div>
 ) : (
 <div className="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
 <div className={`space-y-2 ${isMobile && selectedJobId ? "hidden" : ""}`}>
 {filteredJobs.map((job) => (
 <button
 key={job.id}
 type="button"
 onClick={() => {
 navigateTo({
 role: "homeowner",
 tab: "jobs",
 jobsSegment,
 jobId: job.id,
 });
 setShowTechMessage(false);
 setTechMessageSent(false);
 }}
 className={`w-full rounded-2xl border p-3.5 text-left transition ${
 (selectedJobId ?? filteredJobs[0]?.id) === job.id
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
 {(selectedJob || filteredJobs[0]) && (
 <div className={`space-y-3 ${isMobile && !selectedJobId ? "hidden" : ""}`}>
 {isMobile && selectedJobId && (
 <AppBackButton onBack={goBack} label="Back to Jobs" className="-ml-1" />
 )}
 <ServiceTrackingCard
 job={selectedJob || filteredJobs[0]}
 onMessage={() => {
 setShowTechMessage(true);
 setTechMessageSent(false);
 }}
 onChangeSchedule={() => {
 setForceEditSchedule(true);
 // Keep details visible; scroll-friendly cue via force flag
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
 placeholder="Hi - any update on arrival time?"
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
 <HomeownerJobDetailPanel
 job={selectedJob || filteredJobs[0]}
 proposal={proposal}
 properties={properties}
 busy={busy}
 estimateLabel={moneyRange(selectedJob || filteredJobs[0])}
 onBusy={setBusy}
 onError={setError}
 onRefresh={refresh}
 forceEditSchedule={forceEditSchedule}
 onEditScheduleConsumed={() => setForceEditSchedule(false)}
 onNeedAddress={({
 propertyId,
 jobId,
 line1,
 line2,
 city,
 state,
 zip,
 }) => {
 setShowAddressPromptPropertyId(propertyId);
 setAddressPromptLine1(line1);
 setAddressPromptLine2(line2);
 setAddressPromptCity(city);
 setAddressPromptState(state);
 setAddressPromptZip(zip);
 setAddressPromptJobId(jobId);
 }}
 />
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
 onCreateProperty={createAndAdoptProperty}
 onPropertyUpdated={applyPropertyUpdate}
 onReloadProperty={(id) => void reloadProperty(id)}
 />
 )}

 {tab === "legal" && (
 <HomeownerLegalPanel />
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

 <div className="rounded-lg border border-border bg-muted/20 p-4">
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HomeCare subscription</p>
 {hasHomeCarePro ? (
 <>
 <p className="mt-1 text-base font-semibold">HomeCare Pro</p>
 <p className="mt-1 text-xs text-muted-foreground">
 Status: <span className="font-medium text-foreground">Active</span>
 </p>
 {homeCareSub?.currentPeriodEnd ? (
 <p className="mt-1 text-xs text-muted-foreground">
 Next billing date:{" "}
 <span className="font-medium text-foreground">
 {new Date(homeCareSub.currentPeriodEnd).toLocaleDateString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 })}
 </span>
 </p>
 ) : null}
 {homeCareSub?.cancelAtPeriodEnd && homeCareSub.currentPeriodEnd ? (
 <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
 Cancels on{" "}
 {new Date(homeCareSub.currentPeriodEnd).toLocaleDateString(undefined, {
 month: "short",
 day: "numeric",
 year: "numeric",
 })}
 </p>
 ) : null}
 <p className="mt-2 text-xs text-muted-foreground">
 Manage billing from HomeCare plans or contact support if you need help.
 </p>
 </>
 ) : homeCareSub?.paymentIssue ? (
 <>
 <p className="mt-1 text-base font-semibold text-amber-700 dark:text-amber-300">Payment issue</p>
 <p className="mt-1 text-xs text-muted-foreground">
 Update your payment method to restore HomeCare Pro access.
 </p>
 <button
 type="button"
 onClick={() => navigateTab("go-pro")}
 className="mt-3 inline-flex rounded-lg border border-[#FF6B2C]/40 bg-[#FF6B2C]/10 px-3 py-2 text-xs font-semibold text-[#FF6B2C]"
 >
 Update payment method
 </button>
 </>
 ) : (
 <>
 <p className="mt-1 text-base font-semibold">{displayPlanLabel(user.planCode)}</p>
 <button
 type="button"
 onClick={() => navigateTab("go-pro")}
 className="mt-3 inline-flex rounded-lg bg-[#FF6B2C] px-3 py-2 text-xs font-semibold text-white"
 >
 Upgrade to HomeCare Pro
 </button>
 </>
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
 </div>
 <p className="text-xs text-muted-foreground leading-relaxed pt-2">
 Managed service jobs use confidential contractor net pricing. You only see {brand.productName} retail amounts.
 </p>
 </div>
 )}
 </section>
 )}

 {!isHomeownerTabRendered(tab) ? (
 <DashboardTabFallback tab={tab} onGoHome={() => navigateTab("overview")} />
 ) : null}
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
 {...zipInputProps()}
 className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] focus:ring-1 focus:ring-[#FF4D1C]/20 text-foreground"
 value={zipPromptInput}
 onChange={(e) => setZipPromptInput(normalizeZip(e.target.value))}
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
 disabled={busy || !isValidUsZip(zipPromptInput)}
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
 onClick={closeAddressPrompt}
 className="rounded p-1 hover:bg-muted"
 >
 <X className="h-5 w-5" />
 </button>
 </div>

 <p className="text-muted-foreground leading-relaxed">
 Prior to completing checkout, please provide the full service address details of this property so the dispatched technician can locate you.
 </p>

 <div className="space-y-3">
 <VerifiedAddressFields
 idPrefix="address-prompt"
 addressLine1={addressPromptLine1}
 addressLine2={addressPromptLine2}
 city={addressPromptCity}
 state={addressPromptState}
 zip={addressPromptZip}
 onAddressLine1Change={setAddressPromptLine1}
 onAddressLine2Change={setAddressPromptLine2}
 onCityChange={setAddressPromptCity}
 onStateChange={setAddressPromptState}
 onZipChange={setAddressPromptZip}
 onVerificationChange={setAddressPromptVerification}
 disabled={busy}
 />
 </div>

 <div className="flex justify-end gap-3 pt-2">
 <button
 type="button"
 onClick={closeAddressPrompt}
 className="rounded-lg border border-border px-4 py-2 hover:bg-muted font-medium text-foreground"
 >
 Cancel
 </button>
 <button
 type="button"
 disabled={busy || !addressPromptLine1.trim() || !addressPromptCity.trim() || !normalizeUsStateCode(addressPromptState) || !isValidUsZip(addressPromptZip)}
 onClick={() => void handleSaveAddressAndProceed()}
 className="rounded-lg bg-[#FF4D1C] px-4 py-2 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
 >
 {busy ? "Saving..." : "Save Address"}
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
 onClick={closeAddAddressModal}
 className="rounded p-1 hover:bg-muted"
 >
 <X className="h-5 w-5" />
 </button>
 </div>

 <p className="text-muted-foreground leading-relaxed">
 Add your property address details and ZIP code to retrieve exact regional info and matching providers.
 </p>

 <div className="space-y-3">
 <AddressAutocompleteField
 idPrefix="add-address"
 requireAuth
 streetAddress={modalAddressLine1}
 unit={modalAddressLine2}
 city={modalCity}
 state={modalState}
 zip={modalZip}
 onStreetAddressChange={setModalAddressLine1}
 onUnitChange={setModalAddressLine2}
 onCityChange={setModalCity}
 onStateChange={setModalState}
 onZipChange={setModalZip}
 />
 </div>

 <div className="flex justify-end gap-3 pt-2">
 <button
 type="button"
 onClick={closeAddAddressModal}
 className="rounded-lg border border-border px-4 py-2 hover:bg-muted font-medium text-foreground"
 >
 Cancel
 </button>
 <button
 type="button"
 disabled={busy || !modalAddressLine1.trim() || !modalCity.trim() || !normalizeUsStateCode(modalState) || !isValidUsZip(modalZip)}
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

 {propertyPickerOpen && (
 <HomeownerPropertySheet
 properties={properties}
 selectedId={primaryProperty?.id ?? null}
 onSelect={selectPrimaryProperty}
 onManage={() => navigateTab("properties")}
 onAdd={() => navigateTab("properties")}
 onClose={() => setPropertyPickerOpen(false)}
 />
 )}

 <HomeownerBottomNav
 tab={tab}
 onHome={() => navigateTab("overview")}
 onJobs={() => openJobsSegment("active")}
 onRequest={openRequestService}
 onInbox={() => navigateTab("inbox")}
 onMore={() => navigateTab("more")}
 />
 </div>
 </ProFeatureProvider>
 );
}
