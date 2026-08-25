import { useRef, useState, type ReactNode } from "react";
import { CheckCircle, HardHat, ImagePlus, Loader2, X } from "lucide-react";
import HomeownerAccordion from "./HomeownerAccordion";
import { StarRating, fileToReviewImage, MAX_REVIEW_IMAGES } from "./StarRating";
import { useIsMobile } from "./components/ui/use-mobile";
import { arrivalWindowLabel } from "./ServiceTrackingCard";
import {
  approveProposal,
  confirmCompletion,
  formatMoney,
  payDispatchFee,
  payRetail,
  type ManagedJob,
  type Property,
  type Proposal,
} from "./managedJobs";
import DispatchCouponField, { type DispatchCouponPreview } from "./DispatchCouponField";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";

function DetailSection({
  mobile,
  title,
  defaultOpen,
  badge,
  children,
}: {
  mobile: boolean;
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <HomeownerAccordion title={title} defaultOpen={defaultOpen} badge={badge}>
        {children}
      </HomeownerAccordion>
    );
  }
  return (
    <div className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
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
}) {
  const isMobile = useIsMobile();
  const completionFileRef = useRef<HTMLInputElement>(null);

  const [completionRating, setCompletionRating] = useState(5);
  const [completionReview, setCompletionReview] = useState("");
  const [completionLocation, setCompletionLocation] = useState("");
  const [completionImages, setCompletionImages] = useState<string[]>([]);
  const [completionImageBusy, setCompletionImageBusy] = useState(false);
  const [dispatchCouponPreview, setDispatchCouponPreview] = useState<DispatchCouponPreview | null>(null);

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
  const showCompletionReport = Boolean(job.completionReport);
  const showReviewForm = job.status === "customer_review_pending";
  const showLegacyComplete = job.status === "completed";

  const showAcceptQuoteFooter =
    isMobile && showQuote && proposal != null && proposal.status !== "approved";

  const handleApproveProposal = async () => {
    onBusy(true);
    const r = await approveProposal(job.id);
    if (r.ok) await onRefresh();
    onBusy(false);
  };

  const quoteBadge =
    proposal?.retailAmount != null ? (
      <span className="text-xs font-semibold tabular-nums text-primary">{formatMoney(proposal.retailAmount)}</span>
    ) : null;

  const inner = (
    <>
      <DetailSection mobile={isMobile} title="Service details" defaultOpen>
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
            Category: <span className="font-medium text-foreground">{job.category}</span>
          </p>
        ) : null}
      </DetailSection>

      <DetailSection mobile={isMobile} title="Appointment">
        {arrival ? (
          <p className="text-sm font-medium">{arrival}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Not scheduled yet.</p>
        )}
        {job.fullAddress || job.cityStateZip ? (
          <p className="mt-2 text-sm text-muted-foreground">{job.fullAddress || job.cityStateZip}</p>
        ) : null}
        {job.contactPhone ? (
          <p className="mt-1 text-sm text-muted-foreground">Contact: {job.contactPhone}</p>
        ) : null}
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
            <button
              type="button"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              disabled={busy}
              onClick={async () => {
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
                const r = await payDispatchFee(
                  job.id,
                  dispatchCouponPreview?.code || job.discountCode || undefined
                );
                if (!r.ok) {
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
              }}
            >
              Authorize Dispatch & Hold Card
            </button>
          </div>
        </DetailSection>
      ) : null}

      {showQuote && proposal ? (
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
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                disabled={busy}
                onClick={handleApproveProposal}
              >
                Approve proposal
              </button>
            )}
            {proposal.status === "approved" && job.status === "approved" && (
              <p className="text-sm text-muted-foreground">
                Quote approved. FixBridge will schedule your contractor and notify you when dispatch is confirmed.
              </p>
            )}
          </div>
        </DetailSection>
      ) : null}

      {showPayAfterWork && proposal ? (
        <DetailSection mobile={isMobile} title="Payment" defaultOpen>
          <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm text-muted-foreground">
              Your contractor has finished the work. Pay FixBridge directly to finalize this job.
            </p>
            <p className="tabular-nums text-2xl font-semibold">{formatMoney(proposal.retailAmount)}</p>
            <button
              type="button"
              className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              disabled={busy}
              onClick={async () => {
                onBusy(true);
                onError(null);
                try {
                  const r = await payRetail(job.id);
                  if (r.ok) {
                    if (r.url) {
                      window.location.href = r.url;
                      return;
                    }
                    onError("Stripe checkout could not be started.");
                  } else {
                    onError(r.message || "Payment failed.");
                  }
                } catch (err: unknown) {
                  onError(err instanceof Error ? err.message : "Payment request failed.");
                } finally {
                  onBusy(false);
                }
              }}
            >
              Pay FixBridge
            </button>
          </div>
        </DetailSection>
      ) : null}

      {(job.status === "ai_review_complete" || job.status === "awaiting_service_payment") && !showQuote ? (
        <DetailSection mobile={isMobile} title="Next steps" defaultOpen>
          <p className="text-sm text-muted-foreground">
            FixBridge is reviewing your request and will contact a contractor using your photos and AI assessment.
            You will receive a final quote to approve before any work begins. Payment is only due after the job is complete.
          </p>
        </DetailSection>
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
          </div>
        </DetailSection>
      ) : null}

      {showReviewForm ? (
        <DetailSection mobile={isMobile} title="Review & confirm" defaultOpen>
          <p className="text-xs text-muted-foreground">
            Your rating publishes on the public Customer Trust page as soon as you submit.
          </p>
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Your rating</p>
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
            className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={completionReview}
            onChange={(e) => setCompletionReview(e.target.value)}
            placeholder="How did the job go? (optional but publishes live if 20+ characters)"
            rows={3}
            className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Photos (optional)</p>
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
                onError(null);
                try {
                  const next = [...completionImages];
                  for (const file of Array.from(files)) {
                    if (next.length >= MAX_REVIEW_IMAGES) break;
                    next.push(await fileToReviewImage(file));
                  }
                  setCompletionImages(next.slice(0, MAX_REVIEW_IMAGES));
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Could not add image.");
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
                  className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/40 disabled:opacity-60"
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
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={async () => {
              onBusy(true);
              onError(null);
              const payload =
                completionReview.trim().length >= 20
                  ? {
                      rating: Math.round(completionRating),
                      review: completionReview.trim(),
                      location: completionLocation.trim() || undefined,
                      images: completionImages.length ? completionImages : undefined,
                    }
                  : undefined;
              const r = await confirmCompletion(job.id, payload);
              if (r.ok) {
                setCompletionReview("");
                setCompletionLocation("");
                setCompletionRating(5);
                setCompletionImages([]);
                await onRefresh();
              } else {
                onError((r as { message?: string }).message || "Could not confirm completion.");
              }
              onBusy(false);
            }}
          >
            <CheckCircle className="h-4 w-4" /> Confirm completion
          </button>
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
    </>
  );

  const acceptQuoteFooter =
    showAcceptQuoteFooter && proposal ? (
      <div
        className="fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Quote ready</p>
            <p className="truncate text-lg font-semibold tabular-nums">{formatMoney(proposal.retailAmount)}</p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,77,28,0.28)] disabled:opacity-60"
            disabled={busy}
            onClick={handleApproveProposal}
          >
            Accept Quote
          </button>
        </div>
      </div>
    ) : null;

  if (isMobile) {
    return (
      <>
        <div className={`space-y-2 ${showAcceptQuoteFooter ? "pb-28" : "pb-2"}`}>{inner}</div>
        {acceptQuoteFooter}
      </>
    );
  }

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Request details</h2>
      {inner}
    </div>
  );
}