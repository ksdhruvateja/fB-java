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
} from "lucide-react";
import { signInUser, signUpUser, createPublicGuestJob, saveSession, type AuthUser } from "./auth";
import GuestReportSteps, { GuestReportSummary } from "./GuestReportSteps";
import ForgotPasswordModal from "./ForgotPasswordModal";
import { useAuthSurfaceStyles } from "./authSurfaceStyles";
import {
 AuthShell,
 AuthPanel,
 AuthTabs,
 AuthFieldLabel,
 AuthError,
 AuthSwitchCard,
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
import GoogleSignInButton from "./GoogleSignInButton";
import {
  completeGoogleMarketingPreferences,
  signInWithGoogle,
} from "./marketingApi";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import { AuthMobileActions } from "./AuthMobileActions";
import { AuthReportStepper } from "./AuthReportStepper";

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
 const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
 const [marketingSmsOptIn, setMarketingSmsOptIn] = useState(false);
 const [googleOnboarding, setGoogleOnboarding] = useState(false);
 const [googlePendingUser, setGooglePendingUser] = useState<AuthUser | null>(null);

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
 const authStyles = useAuthSurfaceStyles();

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
 marketingEmailOptIn,
 marketingSmsOptIn,
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
 marketingEmailOptIn,
 marketingSmsOptIn,
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

 const handleGoogleCredential = async (credential: string) => {
 setLoading(true);
 setError("");
 try {
 const body: Record<string, unknown> = {
 consents: consentsFromState(accountConsents),
 marketingEmailOptIn: tab === "signup" ? marketingEmailOptIn : false,
 marketingSmsOptIn: tab === "signup" ? marketingSmsOptIn : false,
 phone: tab === "report" ? reportPhone : undefined,
 };
 const data = await signInWithGoogle(credential, body);
 if (!data.ok) {
 if (data.code === "CONSENT_REQUIRED") {
 setError("You must agree to the Terms of Service and Privacy Policy before continuing with Google.");
 } else {
 setError(data.message || "Google sign-in failed.");
 }
 setLoading(false);
 return;
 }
 saveSession(data.token, data.user);
 if (data.needsMarketingOnboarding) {
 setGooglePendingUser(data.user);
 setGoogleOnboarding(true);
 setLoading(false);
 return;
 }
 onLogin(data.user);
 } catch {
 setError("Google sign-in failed.");
 } finally {
 setLoading(false);
 }
 };

 const completeGoogleOnboarding = async () => {
 setLoading(true);
 setError("");
 const r = await completeGoogleMarketingPreferences({
 marketingEmailOptIn,
 marketingSmsOptIn,
 });
 setLoading(false);
 if (!r.ok) {
 setError(r.message || "Could not save preferences.");
 return;
 }
 setGoogleOnboarding(false);
 if (googlePendingUser) onLogin(googlePendingUser);
 };

 const titles = {
 report: "What do you need help with?",
 login: "Welcome back",
 signup: "Create your account",
 } as const;
 const subtitles = {
 report: "A few quick details and we'll connect you with vetted pros nationwide.",
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
 contentWide={tab === "report"}
 split={{
 role: "homeowner",
 title: "Your home, handled with care.",
 subtitle: "Welcome to FixBridge",
 body: "Describe what you need, get AI guidance, and connect with trusted professionals nationwide.",
 }}
 >
 <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
 <AuthPanel variant="split">
 <AnimatePresence mode="wait">
 <motion.div
 key={tab}
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -4 }}
 transition={{ duration: 0.2 }}
 >
 <h1 className="hidden text-[26px] font-bold tracking-tight text-primary sm:text-[28px] lg:block">
 {titles[tab]}
 </h1>
 <p className="mt-2 hidden text-[15px] leading-relaxed text-neutral-500 lg:block">
 {subtitles[tab]}
 </p>
 </motion.div>
 </AnimatePresence>

 <AuthTabs
 variant="split"
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

 <p className="mt-4 text-lg font-bold text-neutral-900 lg:hidden">{titles[tab]}</p>
 <p className="mt-1 text-sm text-neutral-500 lg:hidden">{subtitles[tab]}</p>

 {tab === "report" && (
 <AuthReportStepper
 steps={REPORT_STEPS}
 current={reportStep}
 onStepClick={(step) => {
 if (step <= reportStep) {
 setError("");
 setReportStep(step as ReportStep);
 }
 }}
 />
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
 <div className={`flex items-center gap-2 text-sm font-semibold ${authStyles.title}`}>
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
 className={authStyles.input}
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
 className={authStyles.input}
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
 className={authStyles.input}
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
 className="text-[13px] font-medium text-primary underline-offset-2 hover:underline"
 >
 Forgot password?
 </button>
 </div>
 )}

 <AuthError message={error} />

 {(tab === "login" || tab === "signup") && (
 <div className="mt-4 space-y-3">
 <div className="flex items-center gap-3 text-xs text-neutral-400">
 <span className="h-px flex-1 bg-neutral-200" />
 or
 <span className="h-px flex-1 bg-neutral-200" />
 </div>
 <GoogleSignInButton
 disabled={loading || (tab === "signup" && (!accountConsents.ACCOUNT_TERMS || !accountConsents.PRIVACY_POLICY))}
 text={tab === "signup" ? "signup_with" : "signin_with"}
 onCredential={(cred) => void handleGoogleCredential(cred)}
 />
 </div>
 )}

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
 <ConsentSection title="Stay updated with FixBridge" optional>
 <ConsentCheckbox
 id="marketing-email"
 required={false}
 checked={marketingEmailOptIn}
 onChange={setMarketingEmailOptIn}
 label="Email me FixBridge offers, home-care tips, promotions, and service updates."
 />
 <ConsentCheckbox
 id="marketing-sms"
 required={false}
 checked={marketingSmsOptIn}
 onChange={setMarketingSmsOptIn}
 label="Send me promotional text messages and special offers."
 />
 <p className="text-[11px] leading-relaxed text-neutral-500 pl-1">
 By opting in to SMS, you agree to receive recurring promotional text messages from FixBridge. Message and data rates may apply. Message frequency varies. Reply STOP to unsubscribe. See our{" "}
 <a href="/legal/privacy-policy" className="text-primary underline-offset-2 hover:underline">Privacy Policy</a> and{" "}
 <a href="/legal/homeowner-terms" className="text-primary underline-offset-2 hover:underline">Terms</a>.
 </p>
 </ConsentSection>
 </div>
 )}

 <AuthMobileActions>
 <div className="flex gap-2">
 {tab === "report" && reportStep > 0 && (
 <button
 type="button"
 onClick={goBackReport}
 className="inline-flex items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-3.5 text-sm font-semibold text-neutral-800 transition active:scale-[0.97] hover:border-neutral-300 hover:bg-neutral-50"
 >
 <ArrowLeft size={15} />
 Back
 </button>
 )}
 <button
 type="submit"
 disabled={loading}
 className="group flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-4 text-[15px] font-bold text-white shadow-[0_12px_32px_rgba(255,77,28,0.35)] transition active:scale-[0.98] hover:brightness-105 disabled:opacity-60"
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
 </AuthMobileActions>
 </form>

 <div className="mt-6 flex flex-wrap justify-center gap-4 border-t border-neutral-200 pt-5 text-xs text-neutral-500">
 <span className="inline-flex items-center gap-1.5">
 <ShieldCheck size={14} className="text-emerald-600" /> Verified professionals
 </span>
 <span className="inline-flex items-center gap-1.5">
 <Lock size={14} /> Secure payments
 </span>
 <span className="inline-flex items-center gap-1.5">
 Nationwide coverage
 </span>
 </div>

 <AuthSwitchCard
 variant="split"
 prompt="Are you a licensed contractor?"
              actionLabel="Go to contractor portal"
 onAction={onGoContractor}
 />
 </AuthPanel>
 </motion.div>
 </AuthShell>

 {googleOnboarding && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
 <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
 <h2 className="text-lg font-bold text-neutral-900">Stay connected with FixBridge</h2>
 <p className="mt-1 text-sm text-neutral-500">Both options are optional. You can change these anytime in Settings.</p>
 <div className="mt-4 space-y-3">
 <ConsentCheckbox
 id="google-marketing-email"
 required={false}
 checked={marketingEmailOptIn}
 onChange={setMarketingEmailOptIn}
 label="Email me offers, promotions, and home-care tips."
 />
 <ConsentCheckbox
 id="google-marketing-sms"
 required={false}
 checked={marketingSmsOptIn}
 onChange={setMarketingSmsOptIn}
 label="Send me promotional texts and special offers."
 />
 </div>
 <AuthError message={error} />
 <button
 type="button"
 disabled={loading}
 onClick={() => void completeGoogleOnboarding()}
 className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-bold text-white disabled:opacity-60"
 >
 {loading ? "Saving…" : "Continue"}
 </button>
 </div>
 </div>
 )}
 </>
 );
}
