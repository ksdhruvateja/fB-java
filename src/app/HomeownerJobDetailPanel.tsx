import {
  approveProposal,
  confirmCompletion,
  formatMoney,
  payDispatchFee,
  payRetail,
  prepareCheckout,
  homeownerInvoiceCheckout,
  repeatManagedService,
  updateHomeownerJob,
  type ManagedJob,
  type Property,
  type Proposal,
} from "./managedJobs";
import DispatchCouponField, { type DispatchCouponPreview } from "./DispatchCouponField";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";
import { ConsentCheckbox, ConsentSection, allChecked, consentsFromState } from "./ConsentCheckbox";
import type { ConsentState } from "./ConsentCheckbox";
import type { AcceptanceType } from "./legalDocuments";
import { mergeConsentRecords, useAcknowledgmentGate } from "./useAcknowledgmentGate";
import { HomeownerTipCheckout } from "./HomeownerTipCheckout";
import ChangeOrderPanel from "./ChangeOrderPanel";
import HomeownerAccordion from "./HomeownerAccordion";
import JobReviewForm from "./JobReviewForm";
import HomeownerJobCompletionPanel from "./HomeownerJobCompletionPanel";
import HomeownerQuoteOptionsPanel from "./HomeownerQuoteOptionsPanel";
import { fetchJobDispute } from "./disputesApi";
import HomeownerCancelServiceModal from "./HomeownerCancelServiceModal";
import { canHomeownerCancelJob, cancelServiceLabel, homeownerCancelledLabel } from "./jobCancellation";
import { useProFeature } from "./ProFeatureProvider";
import { requestQuoteSecondOpinion, type QuoteSecondOpinion } from "./homecareProApi";
import { setPreferredProvider } from "./homeAssistantApi";
import {
  arrivalWindowLabel,
  canEditHomeownerJob,
  SERVICE_TIMING_LABELS,
  TIME_SLOT_LABELS,
} from "./ServiceTrackingCard";
import { useIsMobile } from "./components/ui/use-mobile";
import { CalendarDays, Clock, HardHat, Loader2, MapPin, Pencil, Phone, Save, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const TIME_WINDOW_OPTIONS = [
  { value: "9-11", label: "9–11 AM", period: "Morning" },
  { value: "11-2", label: "11 AM–2 PM", period: "Midday" },
  { value: "2-5", label: "2–5 PM", period: "Afternoon" },
  { value: "5-7", label: "5–7 PM", period: "Evening" },
] as const;

const SERVICE_TIMING_OPTIONS = [
  { value: "weekday", label: "Scheduled weekday", hint: "Best availability" },
  { value: "same-day", label: "Same-day priority", hint: "Faster when slots open" },
  { value: "evening-weekend", label: "Evening / weekend", hint: "After-hours & weekends" },
] as const;

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

function formatDisplayDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function DetailSection({
  mobile,
  title,
  defaultOpen,
  badge,
  actions,
  children,
}: {
  mobile: boolean;
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <HomeownerAccordion title={title} defaultOpen={defaultOpen} badge={badge}>
        {actions ? <div className="mb-3 flex flex-wrap justify-end gap-2">{actions}</div> : null}
        {children}
      </HomeownerAccordion>
    );
  }
  return (
    <div className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {actions}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function HomeownerJobDetailPanel({
  job,
  proposal,
  properties,
  busy,
  estimateLabel,
  onBusy,
  onError,
  onRefresh,
  onNeedAddress,
  forceEditSchedule = false,
  onEditScheduleConsumed,
  focus,
}: {
  job: ManagedJob;
  proposal: Proposal | null;
  properties: Property[];
  busy: boolean;
  estimateLabel: string;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onRefresh: () => Promise<void>;
  onNeedAddress: (payload: {
    propertyId: number;
    jobId: number;
    line1: string;
    line2: string;
    city: string;
    state: string;
    zip: string;
  }) => void;
  forceEditSchedule?: boolean;
  onEditScheduleConsumed?: () => void;
  focus?: "quote" | "invoice" | "tracking" | "completion" | "dispute" | null;
}) {
  const isMobile = useIsMobile();
  const editable = canEditHomeownerJob(job.status);

  useEffect(() => {
    if (!focus) return;
    const id =
      focus === "quote"
        ? `job-quote-section-${job.id}`
        : focus === "invoice"
          ? `job-invoice-section-${job.id}`
          : focus === "completion" || focus === "dispute"
            ? `job-completion-section-${job.id}`
            : `job-tracking-section-${job.id}`;
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, job.id]);

  const [dispatchCouponPreview, setDispatchCouponPreview] = useState<DispatchCouponPreview | null>(null);

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [serviceTiming, setServiceTiming] = useState(job.serviceTiming || "weekday");
  const [preferredDate, setPreferredDate] = useState(job.preferredDate || "");
  const [preferredTimeSlot, setPreferredTimeSlot] = useState(job.preferredTimeSlot || "9-11");
  const [description, setDescription] = useState(job.description || "");
  const [contactPhone, setContactPhone] = useState(job.contactPhone || "");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const { isPro, requestFeature } = useProFeature();
  const [secondOpinion, setSecondOpinion] = useState<QuoteSecondOpinion | null>(null);
  const [secondOpinionBusy, setSecondOpinionBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [quoteConsents, setQuoteConsents] = useState<ConsentState>({
    HOMEOWNER_SERVICE_AGREEMENT: false,
    VISIT_CANCELLATION_POLICY: false,
    QUOTE_SCOPE_APPROVAL: false,
  });
  const [dispatchPaymentConsents, setDispatchPaymentConsents] = useState<ConsentState>({
    PAYMENT_AUTHORIZATION: false,
    PAYMENT_VISIT_POLICY: false,
  });
  const [retailPaymentConsents, setRetailPaymentConsents] = useState<ConsentState>({
    PAYMENT_AUTHORIZATION: false,
    PAYMENT_VISIT_POLICY: false,
  });
  const [hasOpenDispute, setHasOpenDispute] = useState(false);

  const quoteConsentKeys: AcceptanceType[] = [
    "HOMEOWNER_SERVICE_AGREEMENT",
    "VISIT_CANCELLATION_POLICY",
    "QUOTE_SCOPE_APPROVAL",
  ];
  const paymentConsentKeys: AcceptanceType[] = ["PAYMENT_AUTHORIZATION", "PAYMENT_VISIT_POLICY"];
  const ackGate = useAcknowledgmentGate();

  useEffect(() => {
    let cancelled = false;
    if (
      ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed", "disputed"].includes(
        String(job.status),
      )
    ) {
      void fetchJobDispute(job.id)
        .then((r) => {
          if (!cancelled) {
            setHasOpenDispute(
              Boolean(r.dispute && !["resolved", "closed"].includes(String(r.dispute.status))),
            );
          }
        })
        .catch(() => {
          if (!cancelled) setHasOpenDispute(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [job.id, job.status, job.updatedAt]);

  useEffect(() => {
    setServiceTiming(job.serviceTiming || "weekday");
    setPreferredDate(job.preferredDate || "");
    setPreferredTimeSlot(job.preferredTimeSlot || "9-11");
    setDescription(job.description || "");
    setContactPhone(job.contactPhone || "");
    setEditingSchedule(false);
    setEditingDetails(false);
    setSaveMsg(null);
  }, [job.id, job.updatedAt, job.preferredDate, job.preferredTimeSlot, job.serviceTiming, job.description, job.contactPhone]);

  useEffect(() => {
    if (forceEditSchedule && editable) {
      setEditingSchedule(true);
      onEditScheduleConsumed?.();
    }
  }, [forceEditSchedule, editable, onEditScheduleConsumed]);

  const baseDispatchFee = job.visitFeeAmount ?? job.pricing?.contractor_visit_fee ?? 125;
  const dispatchHoldAmount = dispatchCouponPreview?.discountedAmount ?? baseDispatchFee;

  const arrival = arrivalWindowLabel(job);
  const showDispatch = job.status === "awaiting_service_payment";
  const showPayAfterWork =
    (job.status === "customer_review_pending" || job.status === "work_completed") &&
    proposal != null &&
    proposal.status === "approved";
  const showQuote =
    proposal != null &&
    ["proposal_sent", "awaiting_customer_approval", "approved"].includes(String(job.status));
  const showInvoicePay =
    job.invoiceId != null &&
    String(job.invoiceStatus || "").toLowerCase() === "due" &&
    Number(job.invoiceAmountDue || 0) > 0;
  const showCompletionReport = Boolean(job.completionReport);
  const showReviewForm = job.status === "customer_review_pending";
  const showLegacyComplete = job.status === "completed";

  const showAcceptQuoteFooter =
    isMobile && showQuote && proposal != null && proposal.status !== "approved";

  const cancelledLabel = homeownerCancelledLabel(job);
  const showCancelAction = canHomeownerCancelJob(job);

  const dateChips = [
    { label: "Today", value: addDaysFromToday(0) },
    { label: "Tomorrow", value: addDaysFromToday(1) },
    { label: "In 2 days", value: addDaysFromToday(2) },
    { label: "This weekend", value: addDaysFromToday(((6 - new Date().getDay()) + 7) % 7 || 7) },
  ];

  async function saveSchedule() {
    onBusy(true);
    onError(null);
    setSaveMsg(null);
    try {
      const r = await updateHomeownerJob(job.id, {
        serviceTiming,
        preferredDate: preferredDate || null,
        preferredTimeSlot,
      });
      if (!r.ok) {
        onError(r.message || "Could not update schedule.");
        return;
      }
      setEditingSchedule(false);
      setSaveMsg("Schedule updated.");
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  async function saveDetails() {
    onBusy(true);
    onError(null);
    setSaveMsg(null);
    try {
      const r = await updateHomeownerJob(job.id, {
        description: description.trim(),
        contactPhone: contactPhone.trim(),
      });
      if (!r.ok) {
        onError(r.message || "Could not update request details.");
        return;
      }
      setEditingDetails(false);
      setSaveMsg("Request details updated.");
      await onRefresh();
    } finally {
      onBusy(false);
    }
  }

  const handleApproveProposal = async (extraConsents?: Record<string, boolean>) => {
    const consentState = mergeConsentRecords(quoteConsents, extraConsents);
    const missing = ackGate.missingConsentKeys(consentState, quoteConsentKeys);
    if (missing.length) {
      ackGate.prompt({
        missing,
        currentState: consentState,
        description: "Review and accept the quote acknowledgments below to approve this repair.",
        onConfirm: async (consents) => {
          setQuoteConsents((state) => mergeConsentRecords(state, consents));
          await handleApproveProposal(consents);
        },
      });
      return;
    }
    onBusy(true);
    const r = await approveProposal(job.id, consentsFromState(consentState));
    if (!r.ok) {
      if (
        ackGate.promptFromResponse(r, {
          currentState: consentState,
          fallbackMissing: quoteConsentKeys,
          onConfirm: async (consents) => {
            setQuoteConsents((state) => mergeConsentRecords(state, consents));
            await handleApproveProposal(consents);
          },
        })
      ) {
        onBusy(false);
        return;
      }
    }
    if (r.ok) await onRefresh();
    onBusy(false);
  };

  const quoteBadge =
    proposal?.retailAmount != null ? (
      <span className="text-xs font-semibold tabular-nums text-primary">{formatMoney(proposal.retailAmount)}</span>
    ) : null;

  const scheduleActions =
    editable && !editingSchedule ? (
      <button
        type="button"
        onClick={() => setEditingSchedule(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-primary/40 hover:bg-primary/5"
      >
        <Pencil className="h-3 w-3" /> {arrival ? "Change" : "Set schedule"}
      </button>
    ) : null;

  const detailsActions =
    editable && !editingDetails ? (
      <button
        type="button"
        onClick={() => setEditingDetails(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-primary/40 hover:bg-primary/5"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    ) : null;

  const inner = (
    <>
      {saveMsg ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          {saveMsg}
        </p>
      ) : null}

      {cancelledLabel ? (
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="font-semibold">{cancelledLabel}</p>
          {job.cancellationReason ? (
            <p className="mt-1 text-muted-foreground">Reason: {job.cancellationReason}</p>
          ) : null}
        </div>
      ) : null}

      <DetailSection mobile={isMobile} title="Service details" defaultOpen actions={detailsActions}>
        {editingDetails ? (
          <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.03] p-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What&apos;s going on
              </span>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Describe the issue…"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contact phone
              </span>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="(555) 555-5555"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveDetails()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDescription(job.description || "");
                  setContactPhone(job.contactPhone || "");
                  setEditingDetails(false);
                }}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{job.description || "No description provided."}</p>
            <p className="mt-2 text-sm tabular-nums">
              <span className="text-muted-foreground">Estimate: </span>
              <span className="font-semibold">{estimateLabel}</span>
            </p>
            {!proposal && estimateLabel !== "Pending estimate" && !estimateLabel.includes("On-site assessment") ? (
              <div className="mt-2 rounded-lg border border-amber-200/60 bg-amber-50/80 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/25">
                <AiEstimateDisclaimer compact />
              </div>
            ) : null}
            {job.category ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Category: <span className="font-medium capitalize text-foreground">{job.category}</span>
              </p>
            ) : null}
          </>
        )}
      </DetailSection>

      <DetailSection mobile={isMobile} title="Appointment" defaultOpen actions={scheduleActions}>
        {editingSchedule ? (
          <div className="space-y-4 rounded-2xl border border-primary/25 bg-primary/[0.03] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timing preference</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {SERVICE_TIMING_OPTIONS.map((opt) => {
                  const selected = serviceTiming === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setServiceTiming(opt.value)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/35"
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{opt.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arrival window</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TIME_WINDOW_OPTIONS.map((opt) => {
                  const selected = preferredTimeSlot === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPreferredTimeSlot(opt.value)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/35"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {opt.period}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{opt.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preferred date</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {dateChips.map((chip) => {
                  const selected = preferredDate === chip.value;
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setPreferredDate(chip.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "bg-primary text-white"
                          : "border border-border hover:border-primary/40"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPreferredDate("")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    !preferredDate ? "bg-primary text-white" : "border border-border hover:border-primary/40"
                  }`}
                >
                  Flexible
                </button>
              </div>
              <input
                type="date"
                min={addDaysFromToday(0)}
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              {preferredDate ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Selected · {formatDisplayDate(preferredDate)} ·{" "}
                  {TIME_SLOT_LABELS[preferredTimeSlot] || preferredTimeSlot}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Date flexible — we&apos;ll confirm when assigned.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveSchedule()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save schedule
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setServiceTiming(job.serviceTiming || "weekday");
                  setPreferredDate(job.preferredDate || "");
                  setPreferredTimeSlot(job.preferredTimeSlot || "9-11");
                  setEditingSchedule(false);
                }}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{arrival || "Not scheduled yet"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {job.serviceTiming
                      ? SERVICE_TIMING_LABELS[job.serviceTiming] || job.serviceTiming
                      : "No timing preference set"}
                  </p>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setEditingSchedule(true)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {arrival ? "Reschedule preferred window" : "Choose a preferred date & time"}
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Schedule is locked while work is in progress.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {(job.fullAddress || job.cityStateZip) && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{job.fullAddress || job.cityStateZip}</span>
              </p>
            )}
            {job.contactPhone ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                {job.contactPhone}
              </p>
            ) : null}
          </div>
        )}
      </DetailSection>

      {job.mediaDataUrl ? (
        <DetailSection mobile={isMobile} title="Photos & videos">
          {String(job.mediaType || "").startsWith("video") ? (
            <video src={job.mediaDataUrl} controls className="max-h-64 w-full rounded-xl border border-border" />
          ) : (
            <img
              src={job.mediaDataUrl}
              alt="Issue photo"
              className="max-h-64 w-full rounded-xl border border-border object-cover"
            />
          )}
        </DetailSection>
      ) : null}

      {showDispatch ? (
        <DetailSection mobile={isMobile} title="Payment" defaultOpen>
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contractor Visit Fee:</span>
                <span className="font-semibold text-foreground">${baseDispatchFee}</span>
              </div>
              {dispatchCouponPreview ? (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                  <span>Coupon ({dispatchCouponPreview.code}):</span>
                  <span className="font-semibold tabular-nums">−${dispatchCouponPreview.discountAmount}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">FixBridge Beta Fee:</span>
                <span className="font-semibold text-emerald-600">$0.00 (Waived)</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1 font-bold">
                <span className="text-foreground">Authorization Hold:</span>
                <span className="text-primary tabular-nums">
                  {dispatchCouponPreview ? (
                    <>
                      <span className="mr-1 line-through text-muted-foreground font-normal">${baseDispatchFee}</span>
                      ${dispatchHoldAmount}
                    </>
                  ) : (
                    `$${dispatchHoldAmount}`
                  )}
                </span>
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
            <p className="text-[10px] leading-normal text-muted-foreground">
              Card hold placed now. Only charged when the contractor checks in on-site. Released if cancelled.
            </p>
            <ConsentSection title="Payment authorization">
              <p className="text-sm font-semibold tabular-nums">
                Amount authorized: {formatMoney(dispatchHoldAmount)}
              </p>
              <ConsentCheckbox
                id={`dispatch-payment-${job.id}`}
                checked={dispatchPaymentConsents.PAYMENT_AUTHORIZATION === true}
                onChange={(v) =>
                  setDispatchPaymentConsents((s) => ({
                    ...s,
                    PAYMENT_AUTHORIZATION: v,
                    PAYMENT_VISIT_POLICY: v,
                  }))
                }
                label="I authorize the amount shown under the stated cancellation/refund rules."
                documentKey="PAYMENT_VISIT_POLICY"
                documentLabel="Payment / Visit Policy"
              />
            </ConsentSection>
            <button
              type="button"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              disabled={busy || !allChecked(dispatchPaymentConsents, paymentConsentKeys)}
              onClick={async () => {
                const runPayment = async (extraConsents?: Record<string, boolean>) => {
                  const consentState = mergeConsentRecords(dispatchPaymentConsents, extraConsents);
                  const missing = ackGate.missingConsentKeys(consentState, paymentConsentKeys);
                  if (missing.length) {
                    ackGate.prompt({
                      missing,
                      currentState: consentState,
                      description: "Authorize payment by accepting the required acknowledgments below.",
                      onConfirm: async (consents) => {
                        setDispatchPaymentConsents((state) => mergeConsentRecords(state, consents));
                        await runPayment(consents);
                      },
                    });
                    return;
                  }
                  const prop = properties.find((p) => p.id === job.propertyId);
                  if (prop) {
                    const isMissingAddress =
                      !prop.addressLine1?.trim() ||
                      !prop.city?.trim() ||
                      !prop.state?.trim() ||
                      !prop.zip?.trim();
                    if (isMissingAddress) {
                      onNeedAddress({
                        propertyId: prop.id,
                        jobId: job.id,
                        line1: prop.addressLine1 || "",
                        line2: prop.addressLine2 || "",
                        city: prop.city || "",
                        state: prop.state || "",
                        zip: prop.zip || "",
                      });
                      return;
                    }
                  }
                  onBusy(true);
                  const code = dispatchCouponPreview?.code || job.discountCode || undefined;
                  const prepared = await prepareCheckout(job.id, {
                    discountCode: code || null,
                    clearCoupon: !code,
                  });
                  if (!prepared.ok) {
                    onError(prepared.message || "Could not prepare checkout.");
                    onBusy(false);
                    return;
                  }
                  const r = await payDispatchFee(job.id, code, consentsFromState(consentState));
                  if (!r.ok) {
                    if (
                      ackGate.promptFromResponse(r, {
                        currentState: consentState,
                        fallbackMissing: paymentConsentKeys,
                        onConfirm: async (consents) => {
                          setDispatchPaymentConsents((state) => mergeConsentRecords(state, consents));
                          await runPayment(consents);
                        },
                      })
                    ) {
                      onBusy(false);
                      return;
                    }
                    onError(r.message || "Payment failed.");
                    onBusy(false);
                    return;
                  }
                  if (r.url) {
                    window.location.href = r.url;
                    return;
                  }
                  onError("Stripe checkout could not be started.");
                  onBusy(false);
                };
                await runPayment();
              }}
            >
              Authorize Dispatch & Hold Card
            </button>
          </div>
        </DetailSection>
      ) : null}

      {showQuote && proposal ? (
        <div id={`job-quote-section-${job.id}`}>
        <DetailSection mobile={isMobile} title="Quote options" defaultOpen badge={quoteBadge}>
          <HomeownerQuoteOptionsPanel job={job} onRefresh={onRefresh} onError={onError} onBusy={onBusy} />
        </DetailSection>
        <DetailSection mobile={isMobile} title="Quote" defaultOpen badge={quoteBadge}>
          {proposal.quoteNumber ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {proposal.quoteNumber}
            </p>
          ) : null}
          <p className="mt-1 tabular-nums text-2xl font-semibold">{formatMoney(proposal.retailAmount)}</p>
          {(proposal.customerLineItems || []).length > 0 ? (
            <ul className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/20 p-3 text-sm">
              {proposal.customerLineItems!.map((line, i) => (
                <li key={i} className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-medium">
                    {line.amount < 0 ? "−" : ""}
                    {formatMoney(Math.abs(line.amount))}
                  </span>
                </li>
              ))}
              <li className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span>{formatMoney(proposal.retailAmount)}</span>
              </li>
            </ul>
          ) : null}
          {proposal.scopeSummary ? (
            <p className="mt-2 text-sm text-muted-foreground">{proposal.scopeSummary}</p>
          ) : null}
          {proposal.warranty ? (
            <p className="mt-3 text-sm">
              <span className="font-medium">Warranty: </span>
              {proposal.warranty}
            </p>
          ) : null}
          {proposal.exclusions ? (
            <p className="mt-2 text-xs text-muted-foreground">{proposal.exclusions}</p>
          ) : null}
          <div className={`mt-4 flex flex-wrap gap-2 ${showAcceptQuoteFooter ? "hidden" : ""}`}>
            {proposal.status !== "approved" && (
              <>
                <ConsentSection title="Quote approval">
                  <ConsentCheckbox
                    id={`quote-agreement-${job.id}`}
                    checked={quoteConsents.HOMEOWNER_SERVICE_AGREEMENT === true}
                    onChange={(v) => setQuoteConsents((s) => ({ ...s, HOMEOWNER_SERVICE_AGREEMENT: v }))}
                    label="I agree to the Homeowner Service Agreement and Visit/Cancellation Policy."
                    documentKey="HOMEOWNER_SERVICE_AGREEMENT"
                    documentLabel="Homeowner Agreement"
                  />
                  <ConsentCheckbox
                    id={`quote-cancel-${job.id}`}
                    checked={quoteConsents.VISIT_CANCELLATION_POLICY === true}
                    onChange={(v) => setQuoteConsents((s) => ({ ...s, VISIT_CANCELLATION_POLICY: v }))}
                    label="I agree to the Visit/Cancellation Policy."
                    documentKey="VISIT_CANCELLATION_POLICY"
                    documentLabel="Visit/Cancellation Policy"
                  />
                  <ConsentCheckbox
                    id={`quote-scope-${job.id}`}
                    checked={quoteConsents.QUOTE_SCOPE_APPROVAL === true}
                    onChange={(v) => setQuoteConsents((s) => ({ ...s, QUOTE_SCOPE_APPROVAL: v }))}
                    label="I approve this scope and TOTAL price. No extra work is approved unless I approve a change order."
                  />
                </ConsentSection>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={busy || !allChecked(quoteConsents, quoteConsentKeys)}
                  onClick={handleApproveProposal}
                >
                  Approve proposal
                </button>
              </>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
              disabled={secondOpinionBusy || busy}
              onClick={() => {
                if (!requestFeature("quote_second_opinion", "job-quote")) return;
                setSecondOpinionBusy(true);
                void requestQuoteSecondOpinion(job.id).then((r) => {
                  setSecondOpinionBusy(false);
                  if (!r.ok) onError(r.message || "Could not get AI second opinion.");
                  else if (r.opinion) setSecondOpinion(r.opinion);
                });
              }}
            >
              {secondOpinionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Get AI Second Opinion
            </button>
            {secondOpinion ? (
              <div className="mt-3 w-full space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                {secondOpinion.summary ? <p><span className="font-semibold">Summary: </span>{secondOpinion.summary}</p> : null}
                {secondOpinion.scopeReview ? <p><span className="font-semibold">Scope review: </span>{secondOpinion.scopeReview}</p> : null}
                {secondOpinion.pricingContext ? <p><span className="font-semibold">Pricing context: </span>{secondOpinion.pricingContext}</p> : null}
                {secondOpinion.recommendation ? <p><span className="font-semibold">Recommendation: </span>{secondOpinion.recommendation}</p> : null}
                <p className="text-xs text-muted-foreground">{secondOpinion.disclaimer}</p>
              </div>
            ) : null}
            {proposal.status === "approved" && job.status === "approved" && (
              <p className="text-sm text-muted-foreground">
                Quote approved. FixBridge will schedule your contractor and notify you when dispatch is confirmed.
              </p>
            )}
          </div>
        </DetailSection>
        </div>
      ) : null}

      {showPayAfterWork && proposal ? (
        <DetailSection mobile={isMobile} title="Payment" defaultOpen>
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm text-muted-foreground">
              Your contractor has finished the work. Pay FixBridge directly to finalize this job.
            </p>
            <p className="tabular-nums text-2xl font-semibold">{formatMoney(proposal.retailAmount)}</p>
            <ConsentSection title="Payment authorization">
              <p className="text-sm font-semibold tabular-nums">
                Amount authorized: {formatMoney(proposal.retailAmount)}
              </p>
              <ConsentCheckbox
                id={`retail-payment-${job.id}`}
                checked={retailPaymentConsents.PAYMENT_AUTHORIZATION === true}
                onChange={(v) =>
                  setRetailPaymentConsents((s) => ({
                    ...s,
                    PAYMENT_AUTHORIZATION: v,
                    PAYMENT_VISIT_POLICY: v,
                  }))
                }
                label="I authorize the amount shown under the stated cancellation/refund rules."
                documentKey="PAYMENT_VISIT_POLICY"
                documentLabel="Payment / Visit Policy"
              />
            </ConsentSection>
            <button
              type="button"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              disabled={busy || !allChecked(retailPaymentConsents, paymentConsentKeys)}
              onClick={async () => {
                const runRetailPayment = async (extraConsents?: Record<string, boolean>) => {
                  const consentState = mergeConsentRecords(retailPaymentConsents, extraConsents);
                  const missing = ackGate.missingConsentKeys(consentState, paymentConsentKeys);
                  if (missing.length) {
                    ackGate.prompt({
                      missing,
                      currentState: consentState,
                      description: "Authorize payment by accepting the required acknowledgments below.",
                      onConfirm: async (consents) => {
                        setRetailPaymentConsents((state) => mergeConsentRecords(state, consents));
                        await runRetailPayment(consents);
                      },
                    });
                    return;
                  }
                  onBusy(true);
                  onError(null);
                  try {
                    const r = await payRetail(job.id, consentsFromState(consentState));
                    if (r.ok) {
                      if (r.url) {
                        window.location.href = r.url;
                        return;
                      }
                      onError("Stripe checkout could not be started.");
                    } else if (
                      ackGate.promptFromResponse(r, {
                        currentState: consentState,
                        fallbackMissing: paymentConsentKeys,
                        onConfirm: async (consents) => {
                          setRetailPaymentConsents((state) => mergeConsentRecords(state, consents));
                          await runRetailPayment(consents);
                        },
                      })
                    ) {
                      return;
                    } else {
                      onError(r.message || "Payment failed.");
                    }
                  } catch (err: unknown) {
                    onError(err instanceof Error ? err.message : "Payment request failed.");
                  } finally {
                    onBusy(false);
                  }
                };
                await runRetailPayment();
              }}
            >
              Pay FixBridge
            </button>
          </div>
        </DetailSection>
      ) : null}

      {(job.status === "ai_review_complete" || job.status === "awaiting_service_payment") && !showQuote ? (
        <DetailSection mobile={isMobile} title="Next steps" defaultOpen>
          <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              FixBridge is reviewing your request and will contact a contractor using your photos and AI assessment.
              You will receive a final quote to approve before any work begins.
            </p>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-primary/40"
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Update schedule
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDetails(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-primary/40"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit issue details
                </button>
              </div>
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      {["work_started", "change_order_pending", "work_completed", "customer_review_pending", "admin_review_pending", "payout_pending"].includes(
        job.status
      ) ? (
        <DetailSection mobile={isMobile} title="Change orders" defaultOpen={false}>
          <ChangeOrderPanel
            jobId={job.id}
            role="homeowner"
            originalApprovedTotal={proposal?.status === "approved" ? proposal.retailAmount : undefined}
          />
        </DetailSection>
      ) : null}

      {showInvoicePay ? (
        <div id={`job-invoice-section-${job.id}`}>
        <DetailSection mobile={isMobile} title="Invoice payment" defaultOpen badge="Due">
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            {job.invoiceNumber ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {job.invoiceNumber}
              </p>
            ) : null}
            <HomeownerTipCheckout
              serviceTotal={Number(job.invoiceAmountDue || 0)}
              busy={busy}
              onPay={async (tipAmount) => {
                onBusy(true);
                onError(null);
                try {
                  const r = await homeownerInvoiceCheckout(Number(job.invoiceId), tipAmount);
                  if (r.ok && r.checkoutUrl) {
                    window.location.href = r.checkoutUrl;
                    return;
                  }
                  onError(r.message || "Stripe checkout could not be started.");
                } catch (err: unknown) {
                  onError(err instanceof Error ? err.message : "Payment request failed.");
                } finally {
                  onBusy(false);
                }
              }}
            />
          </div>
        </DetailSection>
        </div>
      ) : null}

      {showCompletionReport && job.completionReport ? (
        <DetailSection mobile={isMobile} title="Documents">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <HardHat className="h-4 w-4 text-primary" /> Completion report
            </p>
            {(job.completionReport as Record<string, unknown>).summary ? (
              <p className="text-sm text-muted-foreground">
                {String((job.completionReport as Record<string, unknown>).summary)}
              </p>
            ) : null}
            {((job.completionReport as Record<string, unknown>).beforePhotoUrl ||
              (job.completionReport as Record<string, unknown>).afterPhotoUrl) && (
              <div className="grid grid-cols-2 gap-3">
                {(job.completionReport as Record<string, unknown>).beforePhotoUrl && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Before</p>
                    <img
                      src={String((job.completionReport as Record<string, unknown>).beforePhotoUrl)}
                      alt="Before work"
                      className="h-32 w-full rounded-lg border border-border object-cover"
                    />
                  </div>
                )}
                {(job.completionReport as Record<string, unknown>).afterPhotoUrl && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">After</p>
                    <img
                      src={String((job.completionReport as Record<string, unknown>).afterPhotoUrl)}
                      alt="After work"
                      className="h-32 w-full rounded-lg border border-border object-cover"
                    />
                  </div>
                )}
              </div>
            )}
            {["completed", "closed", "customer_review_pending", "work_completed", "payout_pending"].includes(
              String(job.status).toLowerCase()
            ) ? (
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary"
                  disabled={busy}
                  onClick={async () => {
                    onBusy(true);
                    const r = await repeatManagedService(job.id, true);
                    onBusy(false);
                    if (!r.ok) onError(r.message || "Could not repeat service.");
                    else await onRefresh();
                  }}
                >
                  Repeat this service
                </button>
                {job.assignedContractorUserId && job.propertyId ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                    disabled={busy}
                    onClick={async () => {
                      onBusy(true);
                      const r = await setPreferredProvider(job.propertyId!, {
                        contractorUserId: job.assignedContractorUserId!,
                        serviceType: String(job.category || "general").toLowerCase(),
                        isFavorite: true,
                      });
                      onBusy(false);
                      if (!r.ok) onError(r.message || "Could not save preferred provider.");
                    }}
                  >
                    Save as preferred provider
                  </button>
                ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground italic">
                  We&apos;ll prioritize your preferred provider when available. New pricing applies for repeated services.
                </p>
              </div>
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      {showReviewForm ? (
        <div id={`job-completion-section-${job.id}`}>
        <DetailSection mobile={isMobile} title="Confirm your service" defaultOpen>
          <HomeownerJobCompletionPanel
            job={job}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
            existingDispute={hasOpenDispute || job.status === "disputed"}
          />
        </DetailSection>
        </div>
      ) : null}

      {showReviewForm ? (
        <DetailSection mobile={isMobile} title="Rate your service" defaultOpen>
          <JobReviewForm
            job={job}
            contractorName={job.contractorName || job.technician?.name || undefined}
            alsoConfirmCompletion
            onError={onError}
            onBusy={onBusy}
            onRebook={() => void onRefresh()}
            onMakeRecurring={() => void onRefresh()}
            onSubmitted={() => void onRefresh()}
          />
        </DetailSection>
      ) : null}

      {["work_completed", "payout_pending", "closed", "paid_out"].includes(String(job.status)) && !showReviewForm ? (
        <DetailSection mobile={isMobile} title="Confirm your service" defaultOpen>
          <HomeownerJobCompletionPanel
            job={job}
            onRefresh={onRefresh}
            onError={onError}
            onBusy={onBusy}
            existingDispute={hasOpenDispute || job.status === "disputed"}
          />
        </DetailSection>
      ) : null}

      {["work_completed", "payout_pending", "closed", "paid_out"].includes(String(job.status)) && !showReviewForm ? (
        <DetailSection mobile={isMobile} title="Rate your service" defaultOpen={false}>
          <JobReviewForm
            job={job}
            contractorName={job.contractorName || job.technician?.name || undefined}
            onError={onError}
            onBusy={onBusy}
            onRebook={() => void onRefresh()}
            onMakeRecurring={() => void onRefresh()}
            onSubmitted={() => void onRefresh()}
          />
        </DetailSection>
      ) : null}

      {showLegacyComplete ? (
        <DetailSection mobile={isMobile} title="Payment">
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={async () => {
              onBusy(true);
              const r = await confirmCompletion(job.id);
              if (r.ok) await onRefresh();
              onBusy(false);
            }}
          >
            Confirm completion & pay balance
          </button>
        </DetailSection>
      ) : null}

      {showCancelAction ? (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setMoreActionsOpen((v) => !v)}
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            More actions
          </button>
          {moreActionsOpen ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setMoreActionsOpen(false);
                  setCancelOpen(true);
                }}
                className="rounded-xl border border-red-500/30 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-500/5 dark:text-red-300"
              >
                {cancelServiceLabel(job)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {ackGate.modal}
    </>
  );

  const acceptQuoteFooter =
    showAcceptQuoteFooter && proposal ? (
      <div
        className="fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto max-w-lg space-y-2 max-h-[45vh] overflow-y-auto">
          <ConsentSection title="Quote approval">
            <ConsentCheckbox
              id={`mobile-quote-agreement-${job.id}`}
              checked={quoteConsents.HOMEOWNER_SERVICE_AGREEMENT === true}
              onChange={(v) => setQuoteConsents((s) => ({ ...s, HOMEOWNER_SERVICE_AGREEMENT: v }))}
              label="I agree to the Homeowner Service Agreement and Visit/Cancellation Policy."
              documentKey="HOMEOWNER_SERVICE_AGREEMENT"
              documentLabel="Homeowner Agreement"
            />
            <ConsentCheckbox
              id={`mobile-quote-cancel-${job.id}`}
              checked={quoteConsents.VISIT_CANCELLATION_POLICY === true}
              onChange={(v) => setQuoteConsents((s) => ({ ...s, VISIT_CANCELLATION_POLICY: v }))}
              label="I agree to the Visit/Cancellation Policy."
              documentKey="VISIT_CANCELLATION_POLICY"
              documentLabel="Visit/Cancellation Policy"
            />
            <ConsentCheckbox
              id={`mobile-quote-scope-${job.id}`}
              checked={quoteConsents.QUOTE_SCOPE_APPROVAL === true}
              onChange={(v) => setQuoteConsents((s) => ({ ...s, QUOTE_SCOPE_APPROVAL: v }))}
              label="I approve this scope and TOTAL price. No extra work is approved unless I approve a change order."
            />
          </ConsentSection>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Quote ready</p>
              <p className="truncate text-lg font-semibold tabular-nums">{formatMoney(proposal.retailAmount)}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,77,28,0.28)] disabled:opacity-60"
              disabled={busy || !allChecked(quoteConsents, quoteConsentKeys)}
              onClick={handleApproveProposal}
            >
              Accept Quote
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (isMobile) {
    return (
      <>
        <div className={`space-y-2 ${showAcceptQuoteFooter ? "pb-28" : "pb-2"}`}>{inner}</div>
        {acceptQuoteFooter}
        <HomeownerCancelServiceModal
          open={cancelOpen}
          job={job}
          busy={busy}
          onBusy={onBusy}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => void onRefresh()}
          onReschedule={() => {
            setEditingSchedule(true);
            onEditScheduleConsumed?.();
          }}
          onEditRequest={() => setEditingDetails(true)}
          onReviewQuote={() => {
            document.getElementById(`job-quote-section-${job.id}`)?.scrollIntoView({ behavior: "smooth" });
          }}
          canEditRequest={editable}
          hasQuote={showQuote}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-[1.5rem] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Request details</h2>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingSchedule(true);
                setEditingDetails(false);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/40"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Schedule
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDetails(true);
                setEditingSchedule(false);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted/40"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </button>
          </div>
        ) : null}
      </div>
      {inner}
    </div>
      <HomeownerCancelServiceModal
        open={cancelOpen}
        job={job}
        busy={busy}
        onBusy={onBusy}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => void onRefresh()}
        onReschedule={() => {
          setEditingSchedule(true);
          onEditScheduleConsumed?.();
        }}
        onEditRequest={() => setEditingDetails(true)}
        onReviewQuote={() => {
          document.getElementById(`job-quote-section-${job.id}`)?.scrollIntoView({ behavior: "smooth" });
        }}
        canEditRequest={editable}
        hasQuote={showQuote}
      />
    </>
  );
}
