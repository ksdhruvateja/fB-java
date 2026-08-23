import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BadgeCheck, ImagePlus, Loader2, Quote, Star, X } from "lucide-react";
import { ScrollReveal } from "./shared";
import { getStoredToken, getStoredUser } from "./auth";
import { brand } from "../config/brand";
import { StarRating, fileToReviewImage, MAX_REVIEW_IMAGES } from "./StarRating";

export type SiteReview = {
  id: number;
  name: string;
  location: string;
  serviceType: string;
  rating: number;
  text: string;
  verified: boolean;
  images?: string[];
  createdAt?: string;
};

type ReviewsResponse = {
  ok?: boolean;
  reviews?: SiteReview[];
  stats?: { count: number; average: number };
  message?: string;
};

const SERVICE_OPTIONS = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Roofing",
  "Painting",
  "Flooring",
  "Carpentry",
  "General",
];

const TRUST_MARKS = ["Licensed Pros", "AI Assessment", "NYC & LI", "Background Checks", "Real Bids", "Free to Post"];

/** Soft job textures for photo-style cards (no person portraits). */
const CARD_PHOTOS = [
  "/hero-homeowner.png",
  "/hero-homeowner.png",
  "/hero-homeowner.png",
];

type CardVariant = "cream" | "plain" | "photo" | "accent";

function cardVariant(index: number): CardVariant {
  return (["cream", "plain", "photo", "accent"] as const)[index % 4];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function reviewTitle(text: string, serviceType: string) {
  const first = text.split(/[.!?]/)[0]?.trim();
  if (first && first.length >= 12 && first.length <= 48) return first;
  return `${serviceType} done right`;
}

function QuoteMark({ invert = false }: { invert?: boolean }) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
        invert ? "bg-white text-primary" : "bg-primary text-white"
      }`}
      aria-hidden
    >
      <Quote size={16} fill="currentColor" className="opacity-95" />
    </span>
  );
}

function Avatar({ name, light = false }: { name: string; light?: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tracking-wide ring-2 ring-white/80 ${
        light ? "bg-white/20 text-white" : "bg-foreground text-background"
      }`}
    >
      {initials(name)}
    </span>
  );
}

function RatingBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2.5 py-1 text-xs font-bold text-black shadow-sm">
      {value.toFixed(1)}
      <Star size={11} fill="currentColor" />
    </span>
  );
}

function ReviewImages({ images, light = false }: { images?: string[]; light?: boolean }) {
  if (!images?.length) return null;
  return (
    <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5">
      {images.slice(0, 4).map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className={`h-14 w-14 shrink-0 rounded-lg object-cover ${light ? "ring-1 ring-white/30" : "ring-1 ring-black/10"}`}
          loading="lazy"
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, index }: { review: SiteReview; index: number }) {
  const variant = cardVariant(index);
  const title = reviewTitle(review.text, review.serviceType);
  const cover = review.images?.[0] || CARD_PHOTOS[index % CARD_PHOTOS.length];

  if (variant === "cream") {
    return (
      <article className="relative flex h-full flex-col rounded-3xl bg-[#F3EDE2] p-5 sm:p-6 text-left shadow-[0_18px_40px_rgba(10,10,10,0.08)] dark:bg-[#2A2620] dark:text-foreground">
        <div className="mb-5 flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar name={review.name} />
            <span className="absolute -bottom-1 -right-1">
              <QuoteMark />
            </span>
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="font-semibold text-sm truncate text-[#1a1a1a] dark:text-foreground">{review.name}</p>
            <p className="text-xs text-[#1a1a1a]/55 dark:text-muted-foreground truncate">
              {review.serviceType}
              {review.verified ? " · Verified" : ""}
            </p>
            <div className="mt-1.5">
              <StarRating value={review.rating} tone="gold" size={13} />
            </div>
          </div>
        </div>
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide text-[#1a1a1a] dark:text-foreground mb-2">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-[#1a1a1a]/70 dark:text-muted-foreground line-clamp-4 flex-1">
          {review.text}
        </p>
        <ReviewImages images={review.images} />
        <p className="mt-4 font-mono text-[10px] tracking-wider uppercase text-[#1a1a1a]/40 dark:text-muted-foreground">
          {review.location}
        </p>
      </article>
    );
  }

  if (variant === "plain") {
    return (
      <article className="relative flex h-full flex-col rounded-3xl bg-card border border-border p-5 sm:p-6 text-left shadow-[0_18px_40px_rgba(10,10,10,0.06)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <QuoteMark />
          <StarRating value={review.rating} tone="coral" size={13} />
        </div>
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide mb-2">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4 flex-1 mb-4">{review.text}</p>
        <ReviewImages images={review.images} />
        <div className="mt-auto flex items-center gap-3 pt-2">
          <Avatar name={review.name} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{review.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {review.serviceType}
              {review.verified ? " · Verified" : ""}
            </p>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "photo") {
    return (
      <article className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-3xl text-left text-white shadow-[0_18px_40px_rgba(10,10,10,0.18)]">
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
        <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
          <div className="mb-auto flex items-start justify-between gap-3">
            <QuoteMark />
            <RatingBadge value={review.rating} />
          </div>
          <div className="mt-8">
            <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide mb-2">
              {title}
            </h3>
            <p className="text-sm leading-relaxed text-white/80 line-clamp-3 mb-3">{review.text}</p>
            <ReviewImages images={review.images?.slice(1)} light />
            <div className="flex items-center gap-3 mt-4">
              <Avatar name={review.name} light />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{review.name}</p>
                <p className="text-xs text-white/65 truncate">
                  {review.serviceType}
                  {review.verified ? " · Verified" : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="relative flex h-full flex-col rounded-3xl bg-primary p-5 sm:p-6 text-left text-white shadow-[0_18px_40px_rgba(255,77,28,0.28)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <QuoteMark invert />
        <StarRating value={review.rating} tone="white" size={14} />
      </div>
      <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide mb-2">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-white/85 line-clamp-4 flex-1 mb-4">{review.text}</p>
      <ReviewImages images={review.images} light />
      <div className="mt-auto flex items-center gap-3 pt-2">
        <Avatar name={review.name} light />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{review.name}</p>
          <p className="text-xs text-white/70 truncate">
            {review.serviceType}
            {review.verified ? " · Verified" : ""}
          </p>
        </div>
      </div>
    </article>
  );
}

const fieldClass =
  "w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 rounded-xl";
const labelClass = "font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-1.5 block";

export default function CustomerTrustSection() {
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [stats, setStats] = useState({ count: 0, average: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const user = getStoredUser();

  const [name, setName] = useState(user?.name || "");
  const [location, setLocation] = useState("");
  const [serviceType, setServiceType] = useState("Plumbing");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadReviews() {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews");
      const data = (await res.json()) as ReviewsResponse;
      const list = Array.isArray(data.reviews) ? data.reviews : [];
      setReviews(list);
      setStats({
        count: data.stats?.count ?? list.length,
        average: data.stats?.average ?? 0,
      });
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviews();
  }, []);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setError("Please choose a star rating from 1 to 5.");
      return;
    }
    setSubmitting(true);
    try {
      const token = getStoredToken();
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          location,
          serviceType,
          rating: Math.round(rating),
          text,
          images,
        }),
      });
      const data = (await res.json()) as ReviewsResponse & { review?: SiteReview };
      if (!res.ok || !data.ok || !data.review) {
        setError(data.message || "Could not publish your review.");
        return;
      }
      setReviews((prev) => [data.review!, ...prev.filter((r) => r.id !== data.review!.id)]);
      setStats((prev) => {
        const count = prev.count + 1;
        const average = Math.round(((prev.average * prev.count + data.review!.rating) / count) * 10) / 10;
        return { count, average };
      });
      setSuccess("Published — your review is live on the site.");
      setText("");
      setImages([]);
      setRating(5);
      setFormOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onPickImages(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setImageBusy(true);
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_REVIEW_IMAGES) break;
        next.push(await fileToReviewImage(file));
      }
      setImages(next.slice(0, MAX_REVIEW_IMAGES));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that image.");
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const shown = reviews.slice(0, 8);

  return (
    <section
      id="customer-trust"
      className="relative overflow-hidden bg-background text-foreground py-16 sm:py-24 md:py-28 px-4 sm:px-8 border-b border-border"
    >
      <div
        className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-500/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-10 sm:mb-14">
            <span className="mx-auto mb-4 block h-8 w-1 rounded-full bg-primary" aria-hidden />
            <h2
              className="[font-family:'Barlow_Condensed',sans-serif] font-black uppercase tracking-tight leading-[0.95] mb-3"
              style={{ fontSize: "clamp(2.25rem,5vw,3.5rem)" }}
            >
              Customers Review
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
              What homeowners say about {brand.productName}
              {stats.count > 0 ? (
                <>
                  {" — "}
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    <StarRating value={stats.average} tone="coral" size={14} />
                    <span>
                      {stats.average.toFixed(1)} from {stats.count} review{stats.count === 1 ? "" : "s"}
                    </span>
                  </span>
                </>
              ) : null}
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setFormOpen((v) => !v);
                setError("");
                setSuccess("");
              }}
              className="mt-5 inline-flex [font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-primary text-white px-5 py-2.5 rounded-full hover:bg-primary/90 transition-colors"
            >
              {formOpen ? "Close form" : "Write a review"}
            </button>
          </div>
        </ScrollReveal>

        <AnimatePresence initial={false}>
          {formOpen && (
            <motion.form
              key="review-form"
              initial={{ opacity: 0, y: 12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              onSubmit={submitReview}
              className="mb-10 overflow-hidden rounded-3xl border border-border bg-muted/80 p-4 sm:p-6"
            >
              <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
                Share a real {brand.productName} experience. Reviews publish on this page as soon as you submit.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                <label className="block text-sm">
                  <span className={labelClass}>Your name</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                    placeholder="Alex Rivera"
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelClass}>City / neighborhood</span>
                  <input
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={fieldClass}
                    placeholder="Astoria, Queens"
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelClass}>Service</span>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className={fieldClass}
                  >
                    {SERVICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="block text-sm sm:col-span-2">
                  <span className={labelClass}>Your rating</span>
                  <div className="min-h-[48px] flex items-center border border-border bg-background px-3 rounded-xl">
                    <StarRating
                      value={rating}
                      onChange={setRating}
                      size={26}
                      interactive
                      tone="coral"
                      label="Your rating"
                    />
                  </div>
                </div>
              </div>
              <label className="block text-sm mb-4">
                <span className={labelClass}>Your experience</span>
                <textarea
                  required
                  minLength={20}
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className={`${fieldClass} resize-y min-h-[110px]`}
                  placeholder="What needed fixing, how bids compared, and how the job went…"
                />
              </label>

              <div className="mb-4">
                <span className={labelClass}>Photos (optional)</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(e) => void onPickImages(e.target.files)}
                />
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-xl overflow-hidden border border-border">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-0.5"
                        aria-label="Remove photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {images.length < MAX_REVIEW_IMAGES && (
                    <button
                      type="button"
                      disabled={imageBusy}
                      onClick={() => fileRef.current?.click()}
                      className="h-20 w-20 rounded-xl border border-dashed border-border bg-background flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-60"
                    >
                      {imageBusy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                      <span className="font-mono text-[9px] tracking-wide uppercase">Add</span>
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Up to {MAX_REVIEW_IMAGES} photos of the repair or finished work.
                </p>
              </div>

              {error && <p className="text-sm text-destructive mb-3">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 [font-family:'Barlow_Condensed',sans-serif] font-bold uppercase tracking-wider text-sm bg-primary text-white px-6 py-3 rounded-full hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                Publish review
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {success && (
          <p className="mb-6 text-sm text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-xl">
            {success}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="animate-spin" size={18} />
            <span className="font-mono text-xs tracking-wider uppercase">Loading reviews…</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-16 px-6 text-center">
            <p className="text-muted-foreground mb-4">No published reviews yet — be the first.</p>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="text-sm font-medium underline underline-offset-4 text-foreground"
            >
              Write a review
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 mb-12 sm:mb-16">
              {shown.map((r, i) => (
                <ScrollReveal key={r.id} delay={i * 0.05} className="h-full">
                  <ReviewCard review={r} index={i} />
                </ScrollReveal>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12 border-t border-border pt-8 sm:pt-10">
              {TRUST_MARKS.map((mark) => (
                <span
                  key={mark}
                  className="font-mono text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-muted-foreground/70"
                >
                  {mark}
                </span>
              ))}
            </div>

            {reviews.some((r) => r.verified) && (
              <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <BadgeCheck size={14} className="text-primary" />
                Verified badges mark completed {brand.productName} jobs
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
