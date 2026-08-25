import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle,
  Clock,
  DollarSign,
  Hammer,
  HardHat,
  Home,
  KeyRound,
  Loader2,
  Moon,
  Store,
  Zap,
} from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { payDispatchFee, requestProfessionalDispatch, retailRangeLabel } from "./managedJobs";
import DispatchCouponField, { type DispatchCouponPreview } from "./DispatchCouponField";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";

const SERVICE_TIMING_OPTIONS = [
  { value: "weekday", label: "Scheduled weekday", hint: "Standard dispatch · best availability", icon: CalendarDays },
  { value: "same-day", label: "Same-day priority", hint: "Faster response when slots open", icon: Zap },
  { value: "evening-weekend", label: "Evening / weekend", hint: "After-hours & Sat–Sun windows", icon: Moon },
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

const HIRE_STEPS = ["timing", "window", "date", "info", "confirm", "payment"] as const;
type HireStep = (typeof HIRE_STEPS)[number];

const STEP_LABELS: Record<HireStep, string> = {
  timing: "Timing",
  window: "Time window",
  date: "Date",
  info: "Property info",
  confirm: "Confirm",
  payment: "Payment",
};

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

function initialStep(job: ManagedJob): HireStep {
  if (job.visitFeeAuthorized || job.status === "paid_for_dispatch" || job.status === "awaiting_contractor") {
    return "payment";
  }
  if (job.status === "awaiting_service_payment") return "payment";
  return "timing";
}

export default function HireProfessionalWizard({
  job,
  busy,
  setBusy,
  onError,
  onJobUpdated,
  onPaid,
}: {
  job: ManagedJob;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onJobUpdated: (job: ManagedJob) => void;
  onPaid?: () => void;
}) {
  const [step, setStep] = useState<HireStep>(() => initialStep(job));
  const [serviceTiming, setServiceTiming] = useState(job.serviceTiming || "weekday");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState(job.preferredTimeSlot || "9-11");
  const [preferredDate, setPreferredDate] = useState(job.preferredDate || "");
  const [propertyPurpose, setPropertyPurpose] = useState(job.propertyPurpose || "current_homeowner");
  const [transactionStage, setTransactionStage] = useState(job.transactionStage || "ongoing_maintenance");
  const [discountCode, setDiscountCode] = useState(job.discountCode || "");
  const [dispatchCouponPreview, setDispatchCouponPreview] = useState<DispatchCouponPreview | null>(null);
  const [prefsSaved, setPrefsSaved] = useState(job.status === "awaiting_service_payment");

  const baseDispatchFee = job.visitFeeAmount ?? job.pricing?.contractor_visit_fee ?? 125;
  const dispatchHoldAmount = dispatchCouponPreview?.discountedAmount ?? baseDispatchFee;
  const dispatchPaid =
    job.visitFeeAuthorized ||
    ["paid_for_dispatch", "awaiting_contractor", "contractor_invited", "scheduled"].includes(job.status);

  useEffect(() => {
    setServiceTiming(job.serviceTiming || "weekday");
    setPreferredTimeSlot(job.preferredTimeSlot || "9-11");
    setPreferredDate(job.preferredDate || "");
    setPropertyPurpose(job.propertyPurpose || "current_homeowner");
    setTransactionStage(job.transactionStage || "ongoing_maintenance");
    setDiscountCode(job.discountCode || "");
    setPrefsSaved(job.status === "awaiting_service_payment" || dispatchPaid);
    if (dispatchPaid) setStep("payment");
    else if (job.status === "awaiting_service_payment") setStep("payment");
  }, [job.id, job.status, job.visitFeeAuthorized]);

  function goBack() {
    onError(null);
    const idx = HIRE_STEPS.indexOf(step);
    if (idx > 0) setStep(HIRE_STEPS[idx - 1]);
  }

  function goNext() {
    onError(null);
    const idx = HIRE_STEPS.indexOf(step);
    if (idx < HIRE_STEPS.length - 1) setStep(HIRE_STEPS[idx + 1]);
  }

  async function savePreferences() {
    setBusy(true);
    onError(null);
    try {
      const r = await requestProfessionalDispatch(job.id, {
        serviceTiming,
        preferredDate: preferredDate || undefined,
        preferredTimeSlot,
        propertyPurpose,
        transactionStage,
        discountCode: discountCode.trim() || undefined,
      });
      if (!r.ok || !r.job) {
        onError(r.message || "Could not save your dispatch request.");
        return false;
      }
      onJobUpdated(r.job);
      setPrefsSaved(true);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const ok = await savePreferences();
    if (ok) setStep("payment");
  }

  async function handlePay() {
    setBusy(true);
    onError(null);
    try {
      if (!prefsSaved) {
        const ok = await savePreferences();
        if (!ok) return;
      }
      const r = await payDispatchFee(job.id, dispatchCouponPreview?.code || job.discountCode || undefined);
      if (!r.ok) {
        onError(r.message || "Payment failed.");
        return;
      }
      if (r.url) {
        try {
          sessionStorage.setItem("fixbridge-stripe-active-job-id", String(job.id));
        } catch {
          /* ignore */
        }
        window.location.href = r.url;
        return;
      }
      onError("Stripe checkout could not be started. Check payment configuration.");
    } finally {
      setBusy(false);
    }
  }

  const summaryLine = [
    SERVICE_TIMING_OPTIONS.find((o) => o.value === serviceTiming)?.label,
    TIME_WINDOW_OPTIONS.find((o) => o.value === preferredTimeSlot)?.label,
    preferredDate ? formatDisplayDate(preferredDate) : "date flexible",
    PROPERTY_PURPOSE_OPTIONS.find((o) => o.value === propertyPurpose)?.label,
    PROJECT_STAGE_OPTIONS.find((o) => o.value === transactionStage)?.label,
  ].join(" · ");

  const stepIndex = HIRE_STEPS.indexOf(step);

  if (dispatchPaid) {
    return (
      <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Dispatch fee authorized</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              FixBridge has been notified. An admin will contact a qualified contractor and schedule your visit
              {preferredDate ? ` around ${formatDisplayDate(preferredDate)}` : ""}
              {preferredTimeSlot ? ` (${TIME_WINDOW_OPTIONS.find((o) => o.value === preferredTimeSlot)?.label})` : ""}.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{summaryLine}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[#FF4D1C]/20 bg-gradient-to-br from-[#FFF7F3] via-card to-[#F3FAF8] p-4 sm:p-6 dark:from-[#2a1812] dark:via-card dark:to-[#142a28]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF4D1C]">Hire a professional</p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl tracking-wide sm:text-2xl">
            Schedule & authorize dispatch
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#FF4D1C]/25 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#FF4D1C] dark:bg-black/20">
          <HardHat className="h-3.5 w-3.5" /> Step {stepIndex + 1} of {HIRE_STEPS.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {HIRE_STEPS.map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
              i <= stepIndex ? "bg-[#FF4D1C] text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {STEP_LABELS[s]}
          </span>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {step === "timing" && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Preferred service timing</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {SERVICE_TIMING_OPTIONS.map((opt) => {
                  const selected = serviceTiming === opt.value;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setServiceTiming(opt.value)}
                      className={`rounded-xl border px-4 py-4 text-left transition ${
                        selected
                          ? "border-[#FF4D1C] bg-[#FF4D1C] text-white shadow-lg"
                          : "border-border bg-white/80 hover:border-[#FF4D1C]/45 dark:bg-background/60"
                      }`}
                    >
                      <Icon className={`mb-2 h-5 w-5 ${selected ? "text-white" : "text-[#FF4D1C]"}`} />
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className={`mt-1 text-xs ${selected ? "text-white/85" : "text-muted-foreground"}`}>{opt.hint}</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === "window" && (
            <fieldset className="space-y-3">
              <legend className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-[#FF4D1C]" /> Preferred time window
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIME_WINDOW_OPTIONS.map((opt) => {
                  const selected = preferredTimeSlot === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPreferredTimeSlot(opt.value)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                        selected
                          ? "border-[#FF4D1C] bg-[#FF4D1C]/10 ring-1 ring-[#FF4D1C]/30"
                          : "border-border bg-white/80 hover:border-[#FF4D1C]/35 dark:bg-background/50"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase text-muted-foreground">{opt.period}</span>
                      <span className="font-semibold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === "date" && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Preferred service date</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Tomorrow", value: addDaysFromToday(1) },
                  { label: "In 2 days", value: addDaysFromToday(2) },
                  { label: "This weekend", value: nextWeekendDate() },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setPreferredDate(chip.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      preferredDate === chip.value
                        ? "border-[#FF4D1C] bg-[#FF4D1C]/10 text-[#FF4D1C]"
                        : "border-border hover:border-[#FF4D1C]/40"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                min={toDateInputValue(new Date())}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm dark:bg-background/60"
              />
              <p className="text-xs text-muted-foreground">
                {preferredDate ? `Selected · ${formatDisplayDate(preferredDate)}` : "Optional — leave blank if flexible."}
              </p>
            </fieldset>
          )}

          {step === "info" && (
            <div className="space-y-5">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Property purpose</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PROPERTY_PURPOSE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = propertyPurpose === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPropertyPurpose(opt.value)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${
                          selected ? "border-[#FF4D1C] bg-[#FF4D1C]/10" : "border-border bg-white/70 dark:bg-background/50"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[#FF4D1C]" />
                        <span className="font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Project stage</legend>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_STAGE_OPTIONS.map((opt) => {
                    const selected = transactionStage === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTransactionStage(opt.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                          selected ? "border-[#FF4D1C] bg-[#FF4D1C] text-white" : "border-border"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-2 text-sm font-semibold">
                  <DollarSign className="h-4 w-4 text-[#FF4D1C]" /> Discount code (optional)
                </legend>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="PROMO2026"
                  className="w-full rounded-xl border border-border bg-white/80 px-4 py-2.5 text-sm uppercase dark:bg-background/60"
                />
              </fieldset>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#FF4D1C]/20 bg-white/80 p-4 text-sm dark:bg-background/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your dispatch plan</p>
                <p className="mt-2 leading-relaxed">{summaryLine}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repair estimate</span>
                  <span className="font-semibold tabular-nums">{retailRangeLabel(job)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contractor visit fee (hold)</span>
                  <span className="font-semibold">${baseDispatchFee}</span>
                </div>
                <AiEstimateDisclaimer compact />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Next you&apos;ll authorize a temporary card hold for the visit fee via Stripe. FixBridge is notified once payment succeeds, then we contact a vetted contractor.
              </p>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
                <p className="font-semibold">Confirm & pay visit fee</p>
                <p className="text-xs text-muted-foreground">{summaryLine}</p>
                <div className="flex justify-between border-t border-border pt-2">
                  <span>Dispatch authorization hold</span>
                  <span className="font-bold text-primary tabular-nums">${dispatchHoldAmount}</span>
                </div>
              </div>
              <DispatchCouponField
                jobId={job.id}
                baseAmount={baseDispatchFee}
                initialCode={job.discountCode}
                disabled={busy}
                onVerified={(preview) => {
                  setDispatchCouponPreview(preview);
                  onError(null);
                }}
                onClear={() => setDispatchCouponPreview(null)}
              />
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
                🔒 Your card is not charged today — Stripe places a temporary hold. The charge is captured only when the contractor checks in.
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap gap-2 pt-2">
        {stepIndex > 0 && step !== "payment" && (
          <button
            type="button"
            onClick={goBack}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step === "payment" && !dispatchPaid && (
          <button
            type="button"
            onClick={() => setStep("confirm")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step !== "confirm" && step !== "payment" && (
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-60"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === "confirm" && (
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to payment <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === "payment" && !dispatchPaid && (
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={busy}
            className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-60 sm:flex-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Pay with Stripe — ${dispatchHoldAmount}
          </button>
        )}
      </div>
    </div>
  );
}
