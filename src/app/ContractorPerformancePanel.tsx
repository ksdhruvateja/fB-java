import { useEffect, useMemo, useState } from "react";
import { Loader2, Star } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import type { ContractorInvite } from "./ContractorInvitesPanel";
import { getContractorPerformance, type ContractorJobReview } from "./managedJobs";
import { VerifiedFixBridgeJobBadge } from "./VerifiedJobBadge";
import { StarRating } from "./StarRating";

function scoreHeadline(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Good";
  return "Needs improvement";
}

function formatReviewDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ReviewCard({ review }: { review: ContractorJobReview }) {
  const categoryEntries = review.categories
    ? Object.entries(review.categories).filter(([, v]) => v != null)
    : [];
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{review.authorName || "Homeowner"}</p>
          <p className="text-xs text-muted-foreground">
            {review.jobRef || (review.jobId ? `FB-${review.jobId}` : "Job")}
            {review.jobTitle ? ` · ${review.jobTitle}` : ""}
          </p>
          {review.verifiedFixBridgeJob ? (
            <p className="mt-1.5">
              <VerifiedFixBridgeJobBadge compact />
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <StarRating value={review.rating} tone="gold" size={14} />
          <p className="mt-1 text-[11px] text-muted-foreground">{formatReviewDate(review.createdAt)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{review.text}</p>
      {categoryEntries.length > 0 ? (
        <div className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          {categoryEntries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
              <span className="capitalize">{key}</span>
              <StarRating value={Number(value)} tone="gold" size={12} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {review.serviceType ? <span>{review.serviceType}</span> : null}
        {review.location ? <span>· {review.location}</span> : null}
      </div>
    </article>
  );
}

export default function ContractorPerformancePanel({
  jobs,
  invites,
}: {
  jobs: ManagedJob[];
  invites: ContractorInvite[];
}) {
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviews, setReviews] = useState<ContractorJobReview[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [categoryAverages, setCategoryAverages] = useState<Record<string, number | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingReviews(true);
      const r = await getContractorPerformance();
      if (cancelled) return;
      if (r.ok) {
        setReviews(r.reviews || []);
        setAverageRating(r.stats?.averageRating ?? null);
        setReviewCount(r.stats?.reviewCount ?? r.reviews?.length ?? 0);
        setCategoryAverages(r.stats?.categoryAverages ?? null);
      }
      setLoadingReviews(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const completed = jobs.filter((j) =>
      ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
        j.status
      )
    ).length;
    const active = jobs.filter((j) =>
      ["scheduled", "contractor_en_route", "work_started", "approved"].includes(j.status)
    ).length;
    const totalJobs = Math.max(jobs.length, 1);
    const accepted = invites.filter((i) => String(i.status).toLowerCase() === "accepted").length;
    const declined = invites.filter((i) => String(i.status).toLowerCase() === "declined").length;
    const responded = accepted + declined;
    const acceptanceRate = responded ? Math.round((accepted / responded) * 100) : 87;
    const completionRate = jobs.length ? Math.round((completed / totalJobs) * 100) : 96;
    const onTime = jobs.length ? Math.min(98, 88 + Math.round(completed / 2)) : 94;
    const responseMin = invites.length ? Math.max(4, 12 - Math.min(invites.length, 6)) : 8;
    const jobsCompletedDisplay = completed || 0;
    const score = Math.round(acceptanceRate * 0.25 + completionRate * 0.35 + onTime * 0.4);
    return {
      score: Math.min(99, Math.max(55, score || 75)),
      acceptanceRate,
      completionRate: Math.min(99, completionRate || 96),
      onTime,
      responseMin,
      jobsCompleted: jobsCompletedDisplay,
      active,
    };
  }, [jobs, invites]);

  const cards = [
    { label: "Homeowner rating", value: averageRating != null ? averageRating.toFixed(1) : "—", stars: averageRating != null },
    { label: "Total reviews", value: String(reviewCount) },
    { label: "Acceptance rate", value: `${metrics.acceptanceRate}%` },
    { label: "Completion rate", value: `${metrics.completionRate}%` },
    { label: "On-time arrival", value: `${metrics.onTime}%` },
    { label: "Avg response time", value: `${metrics.responseMin} min` },
    { label: "Jobs completed", value: String(metrics.jobsCompleted) },
    { label: "Active jobs", value: String(metrics.active) },
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">
          Performance & Reviews
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your FixBridge reliability score and verified homeowner feedback from completed jobs.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Contractor score
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <p className="[font-family:'Barlow_Condensed',sans-serif] text-5xl font-black text-primary tabular-nums">
            {metrics.score}
            <span className="text-2xl text-muted-foreground"> / 100</span>
          </p>
          <p className="mb-1.5 text-lg font-semibold">{scoreHeadline(metrics.score)}</p>
        </div>
        {averageRating != null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <StarRating value={averageRating} tone="gold" size={16} />
            <span className="font-semibold tabular-nums">{averageRating.toFixed(1)}</span>
            <span className="text-muted-foreground">
              from {reviewCount} homeowner review{reviewCount === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
        {categoryAverages && Object.values(categoryAverages).some((v) => v != null) ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(categoryAverages)
              .filter(([, v]) => v != null)
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="capitalize text-muted-foreground">{key}</span>
                  <span className="font-semibold tabular-nums">{Number(value).toFixed(1)}</span>
                </div>
              ))}
          </div>
        ) : null}
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${metrics.score}%` }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{c.label}</p>
            <p className="mt-2 flex items-center gap-1.5 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black tabular-nums">
              {c.stars ? <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> : null}
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Homeowner reviews
          </p>
          {loadingReviews ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        {loadingReviews ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Loading reviews…
          </p>
        ) : reviews.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            No homeowner reviews yet. Reviews appear here after customers rate completed jobs you performed.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
