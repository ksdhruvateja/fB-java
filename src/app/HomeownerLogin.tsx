import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
 ArrowRight,
 ArrowLeft,
 Loader2,
 CheckCircle2,
 MapPin,
 Sparkles,
 Camera,
 UserRound,
 ShieldCheck,
 Star,
 Lock,
 Wrench,
 Home,
 Zap,
} from "lucide-react";
import { signInUser, signUpUser, createPublicGuestJob, type AuthUser } from "./auth";
import GuestReportSteps, { GuestReportSummary } from "./GuestReportSteps";
import ForgotPasswordModal from "./ForgotPasswordModal";
import {
 AuthShell,
 AuthPanel,
 AuthTabs,
 AuthFieldLabel,
 AuthError,
 AuthSwitchCard,
 authInputClass,
} from "./AuthShell";
import { AuthEmailField, AuthPasswordField, AuthTextField } from "./AuthFormFields";
import AddressAutocompleteField from "./AddressAutocompleteField";
import ServiceAdaptiveQuestions from "./ServiceAdaptiveQuestions";
import {
 SERVICE_TRADE_OPTIONS,
 SERVICE_LOCATION_OPTIONS,
 tradeToCategory,
 serviceRequestTitle,
 formatAdaptiveAnswersNote,
 type AdaptiveAnswers,
 type ServiceLocation,
 type ServiceTradeId,
} from "./serviceRequestFlow";
import { isValidUsZip, normalizeZip } from "./zipCode";
import { ConsentCheckbox, ConsentSection, consentsFromState } from "./ConsentCheckbox";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";

type ReportStep = 0 | 1 | 2 | 3;

const REPORT_STEPS = [
 { id: 0, label: "Service", hint: "What?" },
 { id: 1, label: "Location", hint: "Where?" },
 { id: 2, label: "Details", hint: "Describe" },
 { id: 3, label: "Contact", hint: "Finish" },
] as const;

export default function HomeownerLogin({
 onLogin,
 onBack,
 onGoContractor,
}: {
 onLogin: (user: AuthUser) => void;
 onBack: () => void;
 onGoContractor: () => void;
}) {
 const [showPass, setShowPass] = useState(false);
 const [tab, setTab] = useState<"report" | "login" | "signup">("report");
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const [fullName, setFullName] = useState("");
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [showForgot, setShowForgot] = useState(false);
 const [accountConsents, setAccountConsents] = useState<ConsentState>({
   ACCOUNT_TERMS: false,
   PRIVACY_POLICY: false,
 });
 const [marketingConsent, setMarketingConsent] = useState(false);

 const [reportStep, setReportStep] = useState<ReportStep>(0);
 const [reportTradeId, setReportTradeId] = useState<ServiceTradeId | "">("");
 const [reportLocation, setReportLocation] = useState<ServiceLocation | "">("");
 const [adaptiveAnswers, setAdaptiveAnswers] = useState<AdaptiveAnswers>({});
 const [reportDescription, setReportDescription] = useState("");
 const [reportAddressLine1, setReportAddressLine1] = useState("");
 const [reportAddressLine2, setReportAddressLine2] = useState("");
 const [reportCity, setReportCity] = useState("");
 const [reportState, setReportState] = useState("");
 const [reportZip, setReportZip] = useState("");
 const [reportPhone, setReportPhone] = useState("");
 const [reportName, setReportName] = useState("");
 const [reportEmail, setReportEmail] = useState("");
 const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
 const [mediaType, setMediaType] = useState<string | null>(null);
 const [mediaName, setMediaName] = useState("");

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = () => {
 setMediaDataUrl(String(reader.result));
 setMediaType(file.type.startsWith("video") ? "video" : "image");
 setMediaName(file.name);
 };
 reader.readAsDataURL(file);
 };

 const goNextReport = () => {
 setError("");
 if (reportStep === 0 && !reportTradeId) {
 setError("Pick what you need to continue.");
 return;
 }
 if (reportStep === 1 && !reportLocation) {
 setError("Pick where in your home this is.");
 return;
 }
 if (reportStep === 2) {
 if (!reportDescription.trim()) {
 setError("Add a short description of the problem.");
 return;
 }
 if (!reportAddressLine1 || !reportCity || !reportState || !reportZip) {
 setError("Enter your service address to continue.");
 return;
 }
 if (!isValidUsZip(reportZip)) {
 setError("Enter a valid 5-digit US ZIP code (or ZIP+4).");
 return;
 }
 }
 setReportStep((s) => Math.min(3, s + 1) as ReportStep);
 };

 const goBackReport = () => {
 setError("");
 setReportStep((s) => Math.max(0, s - 1) as ReportStep);
 };

 const handleShellBack = () => {
 if (tab === "report" && reportStep > 0) {
 goBackReport();
 return;
 }
 onBack();
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (loading) return;

 if (tab === "report" && reportStep < 3) {
 goNextReport();
 return;
 }

 setError("");
 setLoading(true);
 try {
 if (tab === "report") {
 if (!reportTradeId || !reportLocation) {
 setError("Please select a service type and location.");
 setLoading(false);
 return;
 }
 const reportCategory = tradeToCategory(reportTradeId);
 const fullDescription = `${reportDescription.trim()}${formatAdaptiveAnswersNote(reportTradeId, adaptiveAnswers)}`;
 if (
 !reportEmail ||
 !reportName ||
 !reportDescription ||
 !reportAddressLine1 ||
 !reportCity ||
 !reportState ||
 !reportZip
 ) {
 setError("All contact fields are required to submit.");
 setLoading(false);
 return;
 }
 if (!isValidUsZip(reportZip)) {
 setError("Enter a valid 5-digit US ZIP code (or ZIP+4).");
 setLoading(false);
 return;
 }
 if (!accountConsents.ACCOUNT_TERMS || !accountConsents.PRIVACY_POLICY) {
 setError("You must agree to the Terms of Service and Privacy Policy.");
 setLoading(false);
 return;
 }
 const result = await createPublicGuestJob({
 category: reportCategory,
 title: serviceRequestTitle(reportLocation, reportTradeId),
 description: fullDescription,
 mediaDataUrl,
 mediaType,
 streetAddress: reportAddressLine1,
 addressLine2: reportAddressLine2.trim() || undefined,
 city: reportCity,
 state: reportState,
 zip: normalizeZip(reportZip),
 country: "US",
 contactName: reportName,
 contactPhone: reportPhone,
 email: reportEmail,
 consents: consentsFromState(accountConsents),
 marketingConsent,
 });
 setLoading(false);
 if (!result.ok) {
 setError(result.message);
 return;
 }
 try {
 localStorage.setItem("fixbridge-guest-job-id", String(result.job.id));
 } catch {
 /* ignore */
 }
 onLogin(result.user);
 } else {
 if (tab === "signup" && (!accountConsents.ACCOUNT_TERMS || !accountConsents.PRIVACY_POLICY)) {
 setError("You must agree to the Terms of Service and Privacy Policy.");
 setLoading(false);
 return;
 }
 const result =
 tab === "signup"
 ? await signUpUser({
 role: "homeowner",
 name: fullName,
 email,
 password,
 consents: consentsFromState(accountConsents),
 marketingConsent,
 })
 : await signInUser("homeowner", email, password);
 setLoading(false);
 if (!result.ok) {
 setError(result.message);
 return;
 }
 onLogin(result.user);
 }
 } catch {
 setLoading(false);
 setError("Something went wrong. Please try again.");
 }
 };

 const titles = {
 report: "What do you need help with?",
 login: "Welcome back",
 signup: "Create your account",
 } as const;
 const subtitles = {
 report: "A few quick details and we'll connect you with vetted local pros.",
 login: "Sign in to track jobs, messages, and your home profile.",
 signup: "Free to join - you only pay when you book a pro.",
 } as const;

 const ctaLabel =
 tab === "report"
 ? reportStep < 3
 ? "Continue"
 : "Get my assessment"
 : tab === "login"
 ? "Sign in"
 : "Create account";

 return (
 <>
 {showForgot && <ForgotPasswordModal role="homeowner" onClose={() => setShowForgot(false)} />}

 <AuthShell
 onBack={handleShellBack}
 backLabel={tab === "report" && reportStep > 0 ? "Back" : "Back to site"}
 loading={loading}
 error={Boolean(error)}
 mascot={{
 variant: "homeowner",
 title: titles[tab],
 subtitle: subtitles[tab],
 hero: {
 line1: "Need something fixed?",
 line2: "We've got you covered.",
 subtitle:
 "Connect with trusted professionals for repairs, maintenance, and services across NYC & Long Island.",
 trustTitle: "Trusted. Verified. Reliable.",
 trustBody:
 "Real bids from licensed, background-checked pros - no subscription, no cold calls.",
 },
 features: (
 <div className="space-y-4">
 {[
 { icon: Wrench, title: "Repairs", text: "Fix it right the first time." },
 { icon: Home, title: "Maintenance", text: "Keep your home running smoothly." },
 { icon: Zap, title: "Emergency help", text: "We're here when you need us most." },
 ].map(({ icon: Icon, title, text }) => (
 <div key={title} className="flex items-center gap-3">
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-primary ring-1 ring-white/10">
 <Icon size={18} strokeWidth={1.75} />
 </span>
 <div>
 <p className="text-sm font-semibold text-white">{title}</p>
 <p className="mt-0.5 text-xs leading-relaxed text-white/60">{text}</p>
 </div>
 </div>
 ))}
 </div>
 ),
 }}
 >
 <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
 <AuthPanel variant="homeowner">
 <AnimatePresence mode="wait">
 <motion.div
 key={tab}
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 transition={{ duration: 0.2 }}
 >
 <h1 className="text-[26px] font-semibold tracking-tight text-neutral-900 sm:text-[28px] dark:text-foreground">
 {titles[tab]}
 </h1>
 <p className="mt-2 text-[15px] leading-relaxed text-neutral-600 dark:text-muted-foreground">
 {subtitles[tab]}
 </p>
 </motion.div>
 </AnimatePresence>

 <AuthTabs
 variant="homeowner"
 value={tab}
 onChange={(t) => {
 setTab(t);
 setError("");
 if (t === "report") setReportStep(0);
 if (t === "signup") {
 setFullName("");
 setEmail("");
 setPassword("");
 }
 }}
 tabs={[
 { id: "report", label: "Get help" },
 { id: "login", label: "Sign in" },
 { id: "signup", label: "Sign up" },
 ]}
 />

 {tab === "report" && (
 <div className="mt-6">
 <p className="text-[13px] text-neutral-500 dark:text-muted-foreground">
 Step {reportStep + 1} of {REPORT_STEPS.length} | {REPORT_STEPS[reportStep].hint}
 </p>
 <div className="mt-2 flex gap-1">
 {REPORT_STEPS.map((s) => (
 <button
 key={s.id}
 type="button"
 onClick={() => {
 if (s.id <= reportStep) {
 setError("");
 setReportStep(s.id as ReportStep);
 }
 }}
 className={`h-1 flex-1 rounded-full transition ${
 s.id <= reportStep ? "bg-neutral-900 dark:bg-primary" : "bg-neutral-200 dark:bg-muted"
 }`}
 aria-label={`Go to ${s.label}`}
 />
 ))}
 </div>
 </div>
 )}

 <form onSubmit={handleSubmit} className="mt-4 space-y-4">
 <AnimatePresence mode="wait">
 {tab === "report" && reportStep < 3 && (
 <GuestReportSteps
 reportStep={reportStep}
 reportTradeId={reportTradeId}
 setReportTradeId={setReportTradeId}
 reportLocation={reportLocation}
 setReportLocation={setReportLocation}
 reportDescription={reportDescription}
 setReportDescription={setReportDescription}
 adaptiveAnswers={adaptiveAnswers}
 setAdaptiveAnswers={setAdaptiveAnswers}
 mediaDataUrl={mediaDataUrl}
 mediaType={mediaType}
 mediaName={mediaName}
 onFileChange={handleFileChange}
 reportAddressLine1={reportAddressLine1}
 reportAddressLine2={reportAddressLine2}
 reportCity={reportCity}
 reportState={reportState}
 reportZip={reportZip}
 setReportAddressLine1={setReportAddressLine1}
 setReportAddressLine2={setReportAddressLine2}
 setReportCity={setReportCity}
 setReportState={setReportState}
 setReportZip={setReportZip}
 setError={setError}
 />
 )}
 </AnimatePresence>

 {tab === "report" && reportStep === 3 && (
 <div className="space-y-4">
 <GuestReportSummary
 reportLocation={reportLocation}
 reportTradeId={reportTradeId}
 reportDescription={reportDescription}
 reportAddressLine1={reportAddressLine1}
 reportAddressLine2={reportAddressLine2}
 reportCity={reportCity}
 reportState={reportState}
 reportZip={reportZip}
 />
 <div className="flex items-center gap-2 text-sm font-semibold">
 <UserRound size={16} className="text-primary" />
 How can we reach you?
 </div>
 <div>
 <AuthFieldLabel required>Full name</AuthFieldLabel>
 <input
 type="text"
 placeholder="Your full name"
 value={reportName}
 onChange={(e) => setReportName(e.target.value)}
 required
 className={authInputClass}
 />
 </div>
 <div>
 <AuthFieldLabel required>Email</AuthFieldLabel>
 <input
 type="email"
 placeholder="you@email.com"
 value={reportEmail}
 onChange={(e) => setReportEmail(e.target.value)}
 required
 className={authInputClass}
 />
 </div>
 <div>
 <AuthFieldLabel required>Phone</AuthFieldLabel>
 <input
 type="tel"
 placeholder="Phone number"
 value={reportPhone}
 onChange={(e) => setReportPhone(e.target.value)}
 required
 className={authInputClass}
 />
 </div>
 </div>
 )}
 {tab === "signup" && (
 <AuthTextField
 value={fullName}
 onChange={setFullName}
 label="Full name"
 placeholder="Your full name"
 required
 />
 )}

 {(tab === "login" || tab === "signup") && (
 <>
 <AuthEmailField value={email} onChange={setEmail} placeholder="you@email.com" />
 <AuthPasswordField
 value={password}
 onChange={setPassword}
 show={showPass}
 onToggleShow={() => setShowPass((s) => !s)}
 autoComplete={tab === "signup" ? "new-password" : "current-password"}
 />
 </>
 )}

 {tab === "login" && (
 <div className="text-right -mt-1">
 <button
 type="button"
 onClick={() => setShowForgot(true)}
 className="text-[13px] font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-muted-foreground"
 >
 Forgot password?
 </button>
 </div>
 )}

 <AuthError message={error} />

 {(tab === "signup" || (tab === "report" && reportStep === 3)) && (
 <div className="space-y-3">
 <ConsentSection title="Required">
 <ConsentCheckbox
 id="terms"
 checked={accountConsents.ACCOUNT_TERMS === true}
 onChange={(v) => setAccountConsents((s) => ({ ...s, ACCOUNT_TERMS: v }))}
 label="I agree to the FixBridge Terms of Service."
 documentKey="HOMEOWNER_TERMS"
 documentLabel="Terms of Service"
 />
 <ConsentCheckbox
 id="privacy"
 checked={accountConsents.PRIVACY_POLICY === true}
 onChange={(v) => setAccountConsents((s) => ({ ...s, PRIVACY_POLICY: v }))}
 label="I agree to the FixBridge Privacy Policy."
 documentKey="PRIVACY_POLICY"
 documentLabel="Privacy Policy"
 />
 </ConsentSection>
 <ConsentSection title="Marketing" optional>
 <ConsentCheckbox
 id="marketing"
 required={false}
 checked={marketingConsent}
 onChange={setMarketingConsent}
 label="Yes, FixBridge may send me marketing by SMS/email."
 documentKey="MARKETING_CONSENT"
 documentLabel="Marketing policy"
 />
 </ConsentSection>
 </div>
 )}

 <div className="flex gap-2">
 {tab === "report" && reportStep > 0 && (
 <button
 type="button"
 onClick={goBackReport}
 className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-border dark:bg-card"
 >
 <ArrowLeft size={15} />
 Back
 </button>
 )}
 <button
 type="submit"
 disabled={loading}
 className="group flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-4 text-[15px] font-semibold text-white shadow-[0_16px_40px_rgba(23,23,23,0.18)] transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-primary dark:shadow-[0_16px_40px_rgba(255,77,28,0.25)] dark:hover:bg-primary/90"
 >
 {loading ? (
 <Loader2 size={15} className="animate-spin" />
 ) : (
 <>
 {ctaLabel}
 <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
 </>
 )}
 </button>
 </div>
 </form>

 <div className="mt-6 flex flex-wrap justify-center gap-4 border-t border-neutral-100 pt-5 text-xs text-neutral-500 lg:hidden dark:border-border dark:text-muted-foreground">
 <span className="inline-flex items-center gap-1.5">
 <ShieldCheck size={14} className="text-emerald-600" /> Verified professionals
 </span>
 <span className="inline-flex items-center gap-1.5">
 <Lock size={14} /> Secure payments
 </span>
 <span className="inline-flex items-center gap-1.5">
 Local service coverage
 </span>
 </div>

 <AuthSwitchCard
 variant="homeowner"
 prompt="Are you a licensed contractor?"
              actionLabel="Go to contractor portal"
 onAction={onGoContractor}
 />
 </AuthPanel>
 </motion.div>
 </AuthShell>
 </>
 );
}
