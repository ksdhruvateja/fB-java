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
import { payDispatchFee, prepareCheckout, requestProfessionalDispatch, retailRangeLabel, fetchDispatchPricing, formatMoney, type CheckoutBreakdown } from "./managedJobs";
import DispatchCouponField, { type DispatchCouponPreview } from "./DispatchCouponField";
import ProfessionalServiceRequestBetaCard from "./ProfessionalServiceRequestBetaCard";
import { consentsFromState, allChecked } from "./ConsentCheckbox";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";
import { mergeConsentRecords, useAcknowledgmentGate } from "./useAcknowledgmentGate";

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

const HIRE_STEPS = ["schedule", "info", "checkout", "review"] as const;
type HireStep = (typeof HIRE_STEPS)[number];

const STEP_LABELS: Record<HireStep, string> = {
  schedule: "Schedule",
  info: "Details",
  checkout: "Pricing",
  review: "Review & Confirm",
};

function dateForTiming(timing: string): string {
  if (timing === "same-day") return addDaysFromToday(0);
  if (timing === "evening-weekend") return nextWeekendDate();
  return "";
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

function initialStep(job: ManagedJob): HireStep {
  if (job.visitFeeAuthorized || job.status === "paid_for_dispatch" || job.status === "awaiting_contractor") {
    return "review";
  }
  if (job.status === "awaiting_service_payment") return "checkout";
  return "schedule";
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
  const [dispatchConsents, setDispatchConsents] = useState<ConsentState>({
    PROFESSIONAL_REQUEST_BETA_ACK: false,
  });
  const [dispatchPricing, setDispatchPricing] = useState<CheckoutBreakdown | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const ackGate = useAcknowledgmentGate();

  const dispatchConsentKeys: AcceptanceType[] = ["PROFESSIONAL_REQUEST_BETA_ACK"];

  const baseDispatchFee = job.visitFeeAmount ?? job.pricing?.contractor_visit_fee ?? 125;
  const dispatchHoldAmount =
    dispatchPricing?.authorizedNow ??
    dispatchCouponPreview?.discountedAmount ??
    baseDispatchFee;
  const dispatchReady =
    ["ai_review_complete", "awaiting_service_payment", "paid_for_dispatch", "awaiting_contractor"].includes(job.status) ||
    (job.assessmentStatus === "failed" && job.status === "draft");
  const dispatchPaid =
    job.visitFeeAuthorized ||
    ["paid_for_dispatch", "awaiting_contractor", "contractor_invited", "scheduled"].includes(job.status);

  useEffect(() => {
    setServiceTiming(job.serviceTiming || "weekday");
    setPreferredTimeSlot(job.preferredTimeSlot || "9-11");
    const timing = job.serviceTiming || "weekday";
    setPreferredDate(job.preferredDate || dateForTiming(timing) || "");
    setPropertyPurpose(job.propertyPurpose || "current_homeowner");
    setTransactionStage(job.transactionStage || "ongoing_maintenance");
    setDiscountCode(job.discountCode || "");
    setPrefsSaved(job.status === "awaiting_service_payment" || dispatchPaid);
    if (dispatchPaid) setStep("checkout");
    else if (job.status === "awaiting_service_payment") setStep("checkout");
  }, [job.id, job.status, job.visitFeeAuthorized]);

  useEffect(() => {
    if (step !== "checkout" && step !== "review") return;
    let cancelled = false;
    setPricingLoading(true);
    const code = dispatchCouponPreview?.code || discountCode.trim() || undefined;
    void fetchDispatchPricing(job.id, code).then((r) => {
      if (cancelled) return;
      setPricingLoading(false);
      if (r.ok && r.breakdown) setDispatchPricing(r.breakdown);
    });
    return () => {
      cancelled = true;
    };
  }, [step, job.id, dispatchCouponPreview?.code, discountCode, serviceTiming]);

  function formatLineAmount(cents: number) {
    const abs = Math.abs(cents) / 100;
    const formatted = formatMoney(abs);
    return cents < 0 ? `−${formatted}` : formatted;
  }

  function PricingBreakdownCard({ compact }: { compact?: boolean }) {
    const lines = dispatchPricing?.lines || [];
    return (
      <div className={`rounded-xl border border-[#FF4D1C]/25 bg-card space-y-2 text-sm ${compact ? "p-3" : "p-4"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Professional dispatch pricing
        </p>
        {pricingLoading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading current pricing…
          </p>
        ) : lines.length ? (
          <div className="space-y-1.5">
            {lines.map((line) => (
              <div key={line.key} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 text-muted-foreground">{line.label}</span>
                <span className="shrink-0 tabular-nums font-medium">{formatLineAmount(line.amount_cents)}</span>
              </div>
            ))}
            {dispatchPricing?.couponDiscount ? (
              <div className="flex justify-between gap-3 text-sm text-emerald-700 dark:text-emerald-300">
                <span>Coupon {dispatchPricing.couponCode}</span>
                <span className="tabular-nums">−{formatMoney(dispatchPricing.couponDiscount)}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pricing will be confirmed at authorization.</p>
        )}
        <div className="border-t border-border pt-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Authorized now</p>
          <p className="text-2xl font-black tabular-nums text-primary">{formatMoney(dispatchHoldAmount)}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed">
          <p className="font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Repair work</p>
          <p className="mt-1 font-bold text-foreground">NOT INCLUDED</p>
          <p className="mt-1 text-muted-foreground">
            Any repair or additional work will require a separate estimate/quote and your approval before work proceeds.
          </p>
        </div>
      </div>
    );
  }

  function selectServiceTiming(nextTiming: string) {
    setServiceTiming(nextTiming);
    const implied = dateForTiming(nextTiming);
    if (implied) setPreferredDate(implied);
    else if (nextTiming === "weekday" && preferredDate === addDaysFromToday(0)) {
      setPreferredDate("");
    }
  }

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

  function applyConsentMerge(extra?: Record<string, boolean>) {
    if (!extra) return;
    setDispatchConsents((state) => mergeConsentRecords(state, extra));
  }

  function combinedConsentState(extra?: Record<string, boolean>) {
    return mergeConsentRecords(dispatchConsents, extra);
  }

  async function savePreferences(extraConsents?: Record<string, boolean>) {
    setBusy(true);
    onError(null);
    try {
      const resolvedDate =
        preferredDate ||
        (serviceTiming === "same-day" ? addDaysFromToday(0) : undefined) ||
        (serviceTiming === "evening-weekend" ? nextWeekendDate() : undefined);
      const consentState = mergeConsentRecords(dispatchConsents, extraConsents);
      const r = await requestProfessionalDispatch(job.id, {
        serviceTiming,
        preferredDate: resolvedDate,
        preferredTimeSlot,
        propertyPurpose,
        transactionStage,
        discountCode: discountCode.trim() || undefined,
        consents: consentsFromState(consentState),
      });
      if (!r.ok || !r.job) {
        if (
          ackGate.promptFromResponse(r, {
            currentState: consentState,
            fallbackMissing: dispatchConsentKeys,
            onConfirm: async (consents) => {
              applyConsentMerge(consents);
              await savePreferences(consents);
            },
          })
        ) {
          return false;
        }
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

  function handleConfirm() {
    onError(null);
    setStep("checkout");
  }

  async function handlePay(extraConsents?: Record<string, boolean>) {
    const consentState = combinedConsentState(extraConsents);
    const missing = ackGate.missingConsentKeys(consentState, dispatchConsentKeys);
    if (missing.length) {
      ackGate.prompt({
        missing,
        currentState: consentState,
        description: "Review and accept the professional service request terms below to authorize your visit.",
        onConfirm: async (consents) => {
          applyConsentMerge(consents);
          await handlePay(consents);
        },
      });
      return;
    }
    setBusy(true);
    onError(null);
    try {
      if (!prefsSaved) {
        const ok = await savePreferences(extraConsents);
        if (!ok) return;
      }
      const code = dispatchCouponPreview?.code || job.discountCode || undefined;
      const prepared = await prepareCheckout(job.id, {
        discountCode: code || null,
        clearCoupon: !code,
      });
      if (!prepared.ok) {
        onError(prepared.message || "Could not prepare checkout.");
        return;
      }
      if (prepared.job) onJobUpdated(prepared.job);
      const r = await payDispatchFee(job.id, code, consentsFromState(consentState));
      if (!r.ok) {
        if (
          ackGate.promptFromResponse(r, {
            currentState: consentState,
            fallbackMissing: dispatchConsentKeys,
            onConfirm: async (consents) => {
              applyConsentMerge(consents);
              await handlePay(consents);
            },
          })
        ) {
          return;
        }
        onError(r.message || "Payment unsuccessful. Your request has not been submitted for dispatch.");
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
      onError("Secure payment could not be started. Check payment configuration.");
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
            <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Payment Successful</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Your request has been submitted to FixBridge. An admin will review and contact a qualified contractor and schedule your visit
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
          {step === "schedule" && (
            <div className="space-y-6">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">When do you need service?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {SERVICE_TIMING_OPTIONS.map((opt) => {
                    const selected = serviceTiming === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => selectServiceTiming(opt.value)}
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

              <fieldset className="space-y-3">
                <legend className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-[#FF4D1C]" /> Preferred arrival window
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

              {serviceTiming === "same-day" ? (
                <p className="rounded-xl border border-[#FF4D1C]/20 bg-[#FF4D1C]/5 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Date: </span>
                  Today ({formatDisplayDate(preferredDate || addDaysFromToday(0))}) — same-day dispatch when a pro is available.
                </p>
              ) : serviceTiming === "evening-weekend" ? (
                <div className="space-y-2">
                  <p className="rounded-xl border border-[#FF4D1C]/20 bg-[#FF4D1C]/5 px-4 py-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Target: </span>
                    {formatDisplayDate(preferredDate || nextWeekendDate())} (next available evening or weekend window).
                  </p>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground/80">Pick a different date</summary>
                    <input
                      type="date"
                      min={toDateInputValue(new Date())}
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm dark:bg-background/60"
                    />
                  </details>
                </div>
              ) : (
                <fieldset className="space-y-3">
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
                    {preferredDate ? (
                      <button
                        type="button"
                        onClick={() => setPreferredDate("")}
                        className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-[#FF4D1C]/40"
                      >
                        Flexible — any weekday
                      </button>
                    ) : null}
                  </div>
                  <input
                    type="date"
                    min={toDateInputValue(new Date())}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white/80 px-4 py-3 text-sm dark:bg-background/60"
                  />
                  <p className="text-xs text-muted-foreground">
                    {preferredDate
                      ? `Selected · ${formatDisplayDate(preferredDate)}`
                      : "No date selected — we'll use the next available weekday slot."}
                  </p>
                </fieldset>
              )}
            </div>
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

          {step === "checkout" && (
            <div className="space-y-4">
              <PricingBreakdownCard />
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
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-lg">Review & Confirm</h4>
                <p className="text-xs text-muted-foreground mt-1">Review Your Service Request</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Service</p>
                  <p className="font-medium">{job.title || job.category || "Service request"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Appointment</p>
                  <p className="font-medium">{summaryLine}</p>
                </div>
                {job.fullAddress || job.cityStateZip ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Property</p>
                    <p className="font-medium">{job.fullAddress || job.cityStateZip}</p>
                  </div>
                ) : null}
              </div>
              <PricingBreakdownCard />
              <AiEstimateDisclaimer compact />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Authorizing charges the amount shown under AUTHORIZED NOW. Your request is sent to FixBridge only after payment succeeds.
              </p>
              <ProfessionalServiceRequestBetaCard
                acknowledged={dispatchConsents.PROFESSIONAL_REQUEST_BETA_ACK === true}
                onAcknowledgedChange={(v) =>
                  setDispatchConsents((s) => ({ ...s, PROFESSIONAL_REQUEST_BETA_ACK: v }))
                }
                disabled={busy}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap gap-2 pt-2">
        {stepIndex > 0 && step !== "checkout" && step !== "review" && (
          <button
            type="button"
            onClick={goBack}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step === "checkout" && (
          <button
            type="button"
            onClick={() => setStep("info")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step === "review" && !dispatchPaid && (
          <button
            type="button"
            onClick={() => setStep("checkout")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step !== "info" && step !== "checkout" && step !== "review" && (
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-60"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === "info" && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to pricing <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === "checkout" && (
          <button
            type="button"
            onClick={() => {
              onError(null);
              setStep("review");
            }}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Continue to review <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {step === "review" && !dispatchPaid && (
          <div className="ml-auto flex flex-1 flex-col items-end gap-2 sm:flex-none">
            {!dispatchReady ? (
              <p className="text-xs text-muted-foreground">Preparing recommendation... You can review details now. Authorization stays locked until it finishes.</p>
            ) : job.assessmentStatus === "failed" ? (
              <p className="text-xs text-muted-foreground">Fixa could not finish the assessment. You can still request a professional with the saved job, property, and photo.</p>
            ) : null}
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={busy || !dispatchReady || !allChecked(dispatchConsents, dispatchConsentKeys)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {dispatchReady ? `Authorize & Request Professional — ${formatMoney(dispatchHoldAmount)}` : "Authorization waiting on recommendation"}
            </button>
          </div>
        )}
      </div>
      {ackGate.modal}
    </div>
  );
}
