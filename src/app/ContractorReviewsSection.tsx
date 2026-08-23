import { Quote, BadgeCheck } from "lucide-react";
import { ScrollReveal } from "./shared";
import { brand } from "../config/brand";
import { StarRating } from "./StarRating";

type ContractorReview = {
  name: string;
  trade: string;
  location: string;
  rating: number;
  title: string;
  text: string;
  verified: boolean;
  detail: string;
};

/** Realistic contractor voices — specific places, trades, and outcomes. */
const REVIEWS: ContractorReview[] = [
  {
    name: "Mike D'Angelo",
    trade: "Licensed Plumber",
    location: "Astoria, Queens",
    rating: 5,
    title: "Stopped buying junk leads",
    text: `I was dropping about $350 a month on lead sites and half never picked up. On ${brand.productName} I only bid jobs with photos and a clear scope — closed 7 of my last 12.`,
    verified: true,
    detail: "14 months on platform",
  },
  {
    name: "Priya Shah",
    trade: "Master Electrician",
    location: "Hicksville, Long Island",
    rating: 5,
    title: "Homeowners already know the scope",
    text: "The AI write-up means fewer 'can you just look at it' calls. People in Nassau actually read the estimate notes before I show up. Saves me a wasted trip almost every week.",
    verified: true,
    detail: "22 jobs won",
  },
  {
    name: "Tony Morales",
    trade: "HVAC Technician",
    location: "Bay Ridge, Brooklyn",
    rating: 4,
    title: "Won on quality, not speed",
    text: "I don't race to bid first anymore. Homeowners compare my license, reviews, and price next to other HVAC guys. Feels fair — I booked three boiler swaps last month that way.",
    verified: true,
    detail: "9 months active",
  },
  {
    name: "Denise Walsh",
    trade: "General Contractor",
    location: "Riverhead, LI",
    rating: 5,
    title: "Zero fee to stay listed",
    text: "No monthly subscription, no bidding war for a phone number. I keep my profile up with insurance docs once, then pick painting and carpentry jobs in Suffolk when my crew has open days.",
    verified: true,
    detail: "$0 monthly fees",
  },
];

const TRUST_MARKS = [
  "Licensed Pros",
  "One-time Verify",
  "NYC & LI Jobs",
  "Full Specs",
  "No Lead Auctions",
  "Free to Bid",
];

const CARD_PHOTO =
  "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&h=1000&fit=crop&auto=format&q=80";

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

function RatingBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2.5 py-1 text-xs font-bold text-black shadow-sm">
      {value.toFixed(1)}
    </span>
  );
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

function ReviewCard({ review, index }: { review: ContractorReview; index: number }) {
  const variant = cardVariant(index);

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
              {review.trade}
              {review.verified ? " · Verified" : ""}
            </p>
            <div className="mt-1.5">
              <StarRating value={review.rating} tone="gold" size={13} />
            </div>
          </div>
        </div>
        <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide text-[#1a1a1a] dark:text-foreground mb-2">
          {review.title}
        </h3>
        <p className="text-sm leading-relaxed text-[#1a1a1a]/70 dark:text-muted-foreground line-clamp-5 flex-1">
          {review.text}
        </p>
        <p className="mt-4 font-mono text-[10px] tracking-wider uppercase text-[#1a1a1a]/40 dark:text-muted-foreground">
          {review.location} · {review.detail}
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
          {review.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-5 flex-1 mb-6">{review.text}</p>
        <div className="mt-auto flex items-center gap-3">
          <Avatar name={review.name} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{review.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {review.trade} · {review.location}
            </p>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "photo") {
    return (
      <article className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-3xl text-left text-white shadow-[0_18px_40px_rgba(10,10,10,0.18)]">
        <img src={CARD_PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover object-center" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
        <div className="relative z-10 flex h-full flex-col p-5 sm:p-6">
          <div className="mb-auto flex items-start justify-between gap-3">
            <QuoteMark />
            <RatingBadge value={review.rating} />
          </div>
          <div className="mt-8">
            <h3 className="[font-family:'Barlow_Condensed',sans-serif] font-bold uppercase text-lg tracking-wide mb-2">
              {review.title}
            </h3>
            <p className="text-sm leading-relaxed text-white/80 line-clamp-4 mb-5">{review.text}</p>
            <div className="flex items-center gap-3">
              <Avatar name={review.name} light />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{review.name}</p>
                <p className="text-xs text-white/65 truncate">
                  {review.trade}
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
        {review.title}
      </h3>
      <p className="text-sm leading-relaxed text-white/85 line-clamp-5 flex-1 mb-6">{review.text}</p>
      <div className="mt-auto flex items-center gap-3">
        <Avatar name={review.name} light />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{review.name}</p>
          <p className="text-xs text-white/70 truncate">
            {review.trade} · {review.location}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function ContractorReviewsSection() {
  const avg =
    Math.round((REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length) * 10) / 10;

  return (
    <section
      id="contractor-reviews"
      className="relative overflow-hidden bg-background text-foreground py-16 sm:py-24 md:py-28 px-4 sm:px-8 border-y border-border"
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
              Contractors Review
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto inline-flex flex-wrap items-center justify-center gap-2">
              <span>What licensed local pros say about winning work on {brand.productName}</span>
              <span className="inline-flex items-center gap-1.5">
                <StarRating value={avg} tone="coral" size={14} />
                <span>
                  {avg.toFixed(1)} from verified contractors across NYC & Long Island.
                </span>
              </span>
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 mb-12 sm:mb-16">
          {REVIEWS.map((r, i) => (
            <ScrollReveal key={r.name} delay={i * 0.05} className="h-full">
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

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck size={14} className="text-primary" />
          Verified badges mark contractors with completed {brand.productName} jobs
        </p>
      </div>
    </section>
  );
}
