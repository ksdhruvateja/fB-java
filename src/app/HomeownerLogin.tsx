import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  MapPin,
  Sparkles,
  Search,
  Camera,
  UserRound,
  ShieldCheck,
  Star,
  Lock,
} from "lucide-react";
import { getDemoUser, signInUser, signUpUser, createPublicGuestJob, type AuthUser } from "./auth";
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
import { AuthEmailField, AuthPasswordField } from "./AuthFormFields";
import {
  HOMEOWNER_AREA_DEFAULT_SERVICE,
  HOMEOWNER_AREA_ICONS,
  HOMEOWNER_AREAS,
  jobTitleForHomeowner,
  servicesForArea,
  type HomeownerArea,
  type HomeownerService,
} from "./homeownerCategories";

type ReportStep = 0 | 1 | 2 | 3;

const REPORT_STEPS = [
  { id: 0, label: "Area", hint: "Where?" },
  { id: 1, label: "Service", hint: "What?" },
  { id: 2, label: "Details", hint: "Describe" },
  { id: 3, label: "Contact", hint: "Finish" },
] as const;

export default function HomeownerLogin({
  onLogin,
  onBack,
  onGoContractor,
  onGoStaff,
}: {
  onLogin: (user: AuthUser) => void;
  onBack: () => void;
  onGoContractor: () => void;
  onGoStaff: () => void;
}) {
  const demoUser = getDemoUser("homeowner");
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"report" | "login" | "signup">("report");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(demoUser.email);
  const [password, setPassword] = useState(demoUser.password);
  const [showForgot, setShowForgot] = useState(false);

  const [reportStep, setReportStep] = useState<ReportStep>(0);
  const [reportArea, setReportArea] = useState<HomeownerArea | "">("");
  const [reportCategory, setReportCategory] = useState<HomeownerService | "">("");
  const [areaSearch, setAreaSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportStreet, setReportStreet] = useState("");
  const [reportCity, setReportCity] = useState("");
  const [reportState, setReportState] = useState("");
  const [reportZip, setReportZip] = useState("");
  const [reportCountry, setReportCountry] = useState("US");
  const [reportPhone, setReportPhone] = useState("");
  const [reportName, setReportName] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [mediaName, setMediaName] = useState("");

  const filteredAreas = useMemo(
    () =>
      HOMEOWNER_AREAS.filter(
        (area) => !areaSearch.trim() || area.toLowerCase().includes(areaSearch.trim().toLowerCase())
      ),
    [areaSearch]
  );

  const filteredServices = useMemo(() => {
    if (!reportArea) return [];
    return servicesForArea(reportArea).filter(
      (svc) => !serviceSearch.trim() || svc.toLowerCase().includes(serviceSearch.trim().toLowerCase())
    );
  }, [reportArea, serviceSearch]);

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
    if (reportStep === 0 && !reportArea) {
      setError("Pick where the issue is to continue.");
      return;
    }
    if (reportStep === 1 && !reportCategory) {
      setError("Pick a service type to continue.");
      return;
    }
    if (reportStep === 2) {
      if (!reportDescription.trim()) {
        setError("Add a short description of the problem.");
        return;
      }
      if (!reportStreet || !reportCity || !reportState || !reportZip) {
        setError("Fill in the service address to continue.");
        return;
      }
    }
    setReportStep((s) => Math.min(3, s + 1) as ReportStep);
  };

  const goBackReport = () => {
    setError("");
    setReportStep((s) => Math.max(0, s - 1) as ReportStep);
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
        if (!reportArea || !reportCategory) {
          setError("Please select where the issue is and a service type.");
          setLoading(false);
          return;
        }
        if (
          !reportEmail ||
          !reportName ||
          !reportDescription ||
          !reportStreet ||
          !reportCity ||
          !reportState ||
          !reportZip
        ) {
          setError("All contact fields are required to submit.");
          setLoading(false);
          return;
        }
        const result = await createPublicGuestJob({
          category: reportCategory,
          title: jobTitleForHomeowner(reportArea, reportCategory),
          description: reportDescription,
          mediaDataUrl,
          mediaType,
          streetAddress: reportStreet,
          city: reportCity,
          state: reportState,
          zip: reportZip,
          country: reportCountry,
          contactName: reportName,
          contactPhone: reportPhone,
          email: reportEmail,
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
        const result =
          tab === "signup"
            ? await signUpUser({ role: "homeowner", name: fullName, email, password })
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
    report: "A few quick details and we’ll connect you with vetted local pros.",
    login: "Sign in to track jobs, messages, and your home profile.",
    signup: "Free to join — you only pay when you book a pro.",
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
        onBack={onBack}
        loading={loading}
        error={Boolean(error)}
        mascot={{
          variant: "homeowner",
          title: titles[tab],
          subtitle: subtitles[tab],
          badges: (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur dark:bg-card/80 dark:text-muted-foreground">
                <ShieldCheck size={13} className="text-emerald-600" /> Verified pros
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur dark:bg-card/80 dark:text-muted-foreground">
                <Lock size={13} /> Secure account
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur dark:bg-card/80 dark:text-muted-foreground">
                <Star size={13} className="fill-amber-400 text-amber-400" /> 4.8 avg rating
              </span>
            </>
          ),
          features: (
            <div className="space-y-3 rounded-2xl border border-white/60 bg-white/50 p-4 shadow-sm backdrop-blur dark:border-border dark:bg-card/60">
              {[
                { icon: Sparkles, title: "Clear next steps", text: "AI helps explain the issue before you hire." },
                { icon: MapPin, title: "Local, vetted pros", text: "Matched contractors in your area." },
                { icon: CheckCircle2, title: "No surprise fees", text: "Free to post — pay only when you book." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-foreground">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-muted-foreground">{text}</p>
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
                exit={{ opacity: 0 }}
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
                  Step {reportStep + 1} of {REPORT_STEPS.length} · {REPORT_STEPS[reportStep].hint}
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
                {tab === "report" && reportStep === 0 && (
                  <motion.div
                    key="r0"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Where is the issue?</p>
                      <label className="relative w-[150px] shrink-0">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="search"
                          value={areaSearch}
                          onChange={(e) => setAreaSearch(e.target.value)}
                          placeholder="Search…"
                          className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/40"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {filteredAreas.map((area) => {
                        const selected = reportArea === area;
                        const Icon = HOMEOWNER_AREA_ICONS[area];
                        return (
                          <motion.button
                            key={area}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              setReportArea(area);
                              setReportCategory(HOMEOWNER_AREA_DEFAULT_SERVICE[area]);
                              setServiceSearch("");
                              setError("");
                              setTimeout(() => setReportStep(1), 180);
                            }}
                            className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition ${
                              selected
                                ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900/10 dark:border-primary dark:bg-primary/5"
                                : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-border dark:bg-background"
                            }`}
                          >
                            <span
                              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                                selected ? "bg-neutral-900 text-white dark:bg-primary" : "bg-neutral-100 text-neutral-700 dark:bg-muted"
                              }`}
                            >
                              <Icon size={18} color="currentColor" />
                            </span>
                            <span className="text-sm font-semibold leading-tight">{area}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                    {filteredAreas.length === 0 && (
                      <p className="text-xs text-muted-foreground">No areas match that search.</p>
                    )}
                  </motion.div>
                )}

                {tab === "report" && reportStep === 1 && (
                  <motion.div
                    key="r1"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">What service do you need?</p>
                        <p className="text-xs text-muted-foreground">Suggested for {reportArea}</p>
                      </div>
                      <label className="relative w-[150px] shrink-0">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="search"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          placeholder="Search…"
                          className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary/40"
                        />
                      </label>
                    </div>
                    {reportCategory && (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        <CheckCircle2 size={13} /> {reportCategory}
                      </p>
                    )}
                    <div className="max-h-52 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-2.5">
                      <div className="flex flex-wrap gap-2">
                        {filteredServices.map((svc) => {
                          const selected = reportCategory === svc;
                          return (
                            <button
                              key={svc}
                              type="button"
                              onClick={() => {
                                setReportCategory(svc);
                                setError("");
                              }}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                selected
                                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-primary dark:bg-primary"
                                  : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-border dark:bg-card"
                              }`}
                            >
                              {svc}
                            </button>
                          );
                        })}
                      </div>
                      {filteredServices.length === 0 && (
                        <p className="px-1 py-3 text-xs text-muted-foreground">No services match that search.</p>
                      )}
                    </div>
                  </motion.div>
                )}

                {tab === "report" && reportStep === 2 && (
                  <motion.div
                    key="r2"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-4"
                  >
                    <div>
                      <AuthFieldLabel soft>Describe the problem</AuthFieldLabel>
                      <textarea
                        rows={3}
                        placeholder="What’s happening? When did it start?"
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        className={`${authInputClass} min-h-[96px] resize-y`}
                      />
                    </div>
                    <div>
                      <AuthFieldLabel soft>Photo or video (optional)</AuthFieldLabel>
                      <label className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center transition hover:border-neutral-400 hover:bg-white dark:border-border dark:bg-muted/20">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:scale-105">
                          {mediaDataUrl ? <CheckCircle2 size={20} /> : <Camera size={20} />}
                        </span>
                        <span className="text-sm font-medium">
                          {mediaDataUrl ? mediaName || "Media attached" : "Tap to add a photo"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">Helps pros quote faster</span>
                        <input type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" />
                      </label>
                      {mediaDataUrl && mediaType === "image" && (
                        <img
                          src={mediaDataUrl}
                          alt=""
                          className="mt-3 h-28 w-auto rounded-2xl border border-border object-cover"
                        />
                      )}
                    </div>
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-3.5">
                      <p className="text-xs font-semibold text-muted-foreground">Service address</p>
                      <div>
                        <AuthFieldLabel>Street</AuthFieldLabel>
                        <input
                          type="text"
                          placeholder="123 Main St"
                          value={reportStreet}
                          onChange={(e) => setReportStreet(e.target.value)}
                          className={authInputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <AuthFieldLabel>City</AuthFieldLabel>
                          <input
                            type="text"
                            placeholder="Brooklyn"
                            value={reportCity}
                            onChange={(e) => setReportCity(e.target.value)}
                            className={authInputClass}
                          />
                        </div>
                        <div>
                          <AuthFieldLabel>State</AuthFieldLabel>
                          <input
                            type="text"
                            placeholder="NY"
                            value={reportState}
                            onChange={(e) => setReportState(e.target.value)}
                            className={authInputClass}
                          />
                        </div>
                        <div>
                          <AuthFieldLabel>ZIP</AuthFieldLabel>
                          <input
                            type="text"
                            placeholder="11201"
                            value={reportZip}
                            onChange={(e) => setReportZip(e.target.value)}
                            className={authInputClass}
                          />
                        </div>
                        <div>
                          <AuthFieldLabel>Country</AuthFieldLabel>
                          <input
                            type="text"
                            placeholder="US"
                            value={reportCountry}
                            onChange={(e) => setReportCountry(e.target.value)}
                            className={authInputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {tab === "report" && reportStep === 3 && (
                  <motion.div
                    key="r3"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.22 }}
                    className="space-y-4"
                  >
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm dark:border-border dark:bg-muted/20">
                      <p className="font-semibold text-foreground">
                        {reportArea} · {reportCategory}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{reportDescription}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[reportStreet, reportCity, reportState, reportZip].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <UserRound size={16} className="text-primary" />
                      How can we reach you?
                    </div>
                    <div>
                      <AuthFieldLabel>Full name</AuthFieldLabel>
                      <input
                        type="text"
                        placeholder="Alex Rivera"
                        value={reportName}
                        onChange={(e) => setReportName(e.target.value)}
                        required
                        className={authInputClass}
                      />
                    </div>
                    <div>
                      <AuthFieldLabel>Email</AuthFieldLabel>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={reportEmail}
                        onChange={(e) => setReportEmail(e.target.value)}
                        required
                        className={authInputClass}
                      />
                    </div>
                    <div>
                      <AuthFieldLabel>Phone</AuthFieldLabel>
                      <input
                        type="tel"
                        placeholder="(555) 555-5555"
                        value={reportPhone}
                        onChange={(e) => setReportPhone(e.target.value)}
                        required
                        className={authInputClass}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {tab === "signup" && (
                <div>
                  <AuthFieldLabel soft>Full name</AuthFieldLabel>
                  <input
                    type="text"
                    placeholder="Maria Santos"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className={authInputClass}
                  />
                </div>
              )}

              {(tab === "login" || tab === "signup") && (
                <>
                  <AuthEmailField value={email} onChange={setEmail} placeholder="maria@example.com" />
                  <AuthPasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPass}
                    onToggleShow={() => setShowPass((s) => !s)}
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
                <ShieldCheck size={14} className="text-emerald-600" /> Verified pros
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} /> Secure
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Star size={14} className="fill-amber-400 text-amber-400" /> 4.8 rating
              </span>
            </div>

            <AuthSwitchCard
              variant="homeowner"
              prompt="Are you a licensed contractor?"
              actionLabel="Go to contractor portal →"
              onAction={onGoContractor}
              secondary={
                <button type="button" onClick={onGoStaff} className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-muted-foreground dark:hover:text-foreground">
                  Staff member? Sign in as Staff →
                </button>
              }
            />
          </AuthPanel>
        </motion.div>
      </AuthShell>
    </>
  );
}
