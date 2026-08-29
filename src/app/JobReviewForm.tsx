import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Star } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { repeatManagedService } from "./managedJobs";
import { StarRating } from "./StarRating";
import { submitJobReview, checkJobReviewExists, type ReviewCategoryRatings } from "./jobReviewsApi";
import { setPreferredProvider } from "./homeAssistantApi";
import { VerifiedFixBridgeJobBadge } from "./VerifiedJobBadge";
import { PREFERRED_PROVIDER_PRIORITY_COPY } from "./preferredProviderCopy";
import { useProFeature } from "./ProFeatureProvider";
import { saveRecurringHandoff } from "./recurringHandoff";

const CATEGORY_LABELS: { key: keyof ReviewCategoryRatings; label: string }[] = [
  { key: "quality", label: "Quality" },
  { key: "communication", label: "Communication" },
  { key: "punctuality", label: "Punctuality" },
  { key: "cleanliness", label: "Cleanliness" },
  { key: "value", label: "Value" },
];

function formatDate(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

export default function JobReviewForm({
  job,
  contractorName,
  onSubmitted,
  onRebook,
  onMakeRecurring,
  onError,
  onBusy,
  alsoConfirmCompletion,
}: {
  job: ManagedJob;
  contractorName?: string | null;
  onSubmitted?: (verified: boolean) => void;
  onRebook?: (newJobId: number) => void;
  onMakeRecurring?: () => void;
  onError?: (msg: string | null) => void;
  onBusy?: (busy: boolean) => void;
  alsoConfirmCompletion?: boolean;
}) {
  const { requestFeature } = useProFeature();
  const [overall, setOverall] = useState(5);
  const [categories, setCategories] = useState<ReviewCategoryRatings>({
    quality: 5,
    communication: 5,
    punctuality: 5,
    cleanliness: 5,
    value: 5,
  });
  const [comment, setComment] = useState("");
  const [location, setLocation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkJobReviewExists(job.id).then((exists) => {
      if (!cancelled && exists) setAlreadyReviewed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  const report = job.completionReport as Record<string, unknown> | null | undefined;
  const beforeUrl = report?.beforePhotoUrl ? String(report.beforePhotoUrl) : null;
  const afterUrl = report?.afterPhotoUrl ? String(report.afterPhotoUrl) : null;
  const completedAt = formatDate(job.updatedAt || job.createdAt);

  const isCleaningOrLandscaping = /clean|landscap/i.test(String(job.category || job.title || ""));

  async function handleSubmit() {
    setBusy(true);
    onBusy?.(true);
    onError?.(null);
    try {
      let isVerified = false;
      if (alsoConfirmCompletion) {
        const { confirmCompletion } = await import("./managedJobs");
        const r = await confirmCompletion(job.id, {
          rating: overall,
          review: comment.trim() || undefined,
          location: location.trim() || undefined,
          categories,
        });
        if (!r.ok) {
          onError?.((r as { message?: string }).message || "Could not confirm completion.");
          return;
        }
        isVerified = Boolean(r.review?.verifiedFixBridgeJob ?? r.review?.verified);
      } else {
        const r = await submitJobReview({
          jobId: job.id,
          rating: overall,
          text: comment.trim() || undefined,
          location: location.trim() || undefined,
          serviceType: job.category || undefined,
          categories,
        });
        if (!r.ok && r.code !== "DUPLICATE_REVIEW") {
          onError?.(r.message || "Could not submit review.");
          return;
        }
        isVerified = Boolean(r.review?.verifiedFixBridgeJob ?? r.review?.verified);
      }
      setVerified(isVerified);
      setSubmitted(true);
      onSubmitted?.(isVerified);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  if (alreadyReviewed && !submitted) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        You already submitted a review for this job. Thanks for your feedback.
      </p>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-semibold">Service complete. Thanks for your feedback.</p>
            {verified ? (
              <p className="mt-2">
                <VerifiedFixBridgeJobBadge />
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
            onClick={async () => {
              setBusy(true);
              const r = await repeatManagedService(job.id, true);
              setBusy(false);
              if (!r.ok) onError?.(r.message || "Could not rebook.");
              else if (r.job?.id) onRebook?.(r.job.id);
            }}
            disabled={busy}
          >
            Book This Provider Again
          </button>
          {job.assignedContractorUserId && job.propertyId ? (
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await setPreferredProvider(job.propertyId!, {
                  contractorUserId: job.assignedContractorUserId!,
                  serviceType: String(job.category || "general").toLowerCase(),
                  isFavorite: true,
                });
                setBusy(false);
                if (!r.ok) onError?.(r.message || "Could not save favorite.");
              }}
            >
              Add to Favorites
            </button>
          ) : null}
          {isCleaningOrLandscaping ? (
            <button
              type="button"
              className="rounded-xl border border-primary/40 px-4 py-2 text-xs font-semibold text-primary"
              onClick={() => {
                const feature = /landscap/i.test(String(job.category)) ? "recurring_landscaping" : "recurring_cleaning";
                if (!requestFeature(feature, "job-review")) return;
                saveRecurringHandoff({
                  propertyId: job.propertyId ?? null,
                  serviceType: /landscap/i.test(String(job.category)) ? "recurring_landscaping" : "recurring_cleaning",
                  openAdd: true,
                });
                onMakeRecurring?.();
              }}
            >
              Make This Recurring
            </button>
          ) : null}
        </div>
        <p className="text-[11px] italic text-muted-foreground">{PREFERRED_PROVIDER_PRIORITY_COPY}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm">
        <p className="font-semibold">{contractorName || "Your service provider"}</p>
        <p className="text-muted-foreground">{job.title || job.category}</p>
        {completedAt ? <p className="text-xs text-muted-foreground">Completed {completedAt}</p> : null}
      </div>

      {(beforeUrl || afterUrl) && (
        <div className="grid grid-cols-2 gap-2">
          {beforeUrl ? (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Before</p>
              <img src={beforeUrl} alt="" className="h-20 w-full rounded-lg border object-cover" />
            </div>
          ) : null}
          {afterUrl ? (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">After</p>
              <img src={afterUrl} alt="" className="h-20 w-full rounded-lg border object-cover" />
            </div>
          ) : null}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Overall rating</p>
        <StarRating value={overall} onChange={setOverall} size={26} interactive tone="coral" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORY_LABELS.map(({ key, label }) => (
          <div key={key}>
            <p className="mb-1 text-xs text-muted-foreground">{label}</p>
            <StarRating
              value={categories[key] ?? 5}
              onChange={(v) => setCategories((prev) => ({ ...prev, [key]: v }))}
              size={18}
              interactive
              tone="coral"
            />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={`review-comment-${job.id}`}>
          How did the service go? <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id={`review-comment-${job.id}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Share anything that would help other homeowners…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Neighborhood (optional)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSubmit()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
        {alsoConfirmCompletion ? "Submit Review & Confirm" : "Submit Review"}
      </button>
    </div>
  );
}
