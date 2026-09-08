import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

const STAGES = [
  { title: "Photos received", detail: "Your photos are ready for Fixera." },
  { title: "First look", detail: "Identifying fixtures, damage, and visible symptoms." },
  { title: "Similar scenarios", detail: "Comparing similar repair scenarios." },
  { title: "Safety check", detail: "Checking if this looks safe to DIY." },
  { title: "Local pricing", detail: "Reviewing local repair pricing patterns." },
  { title: "Repair plan", detail: "Preparing likely causes and next steps." },
] as const;

const EXPLORE = [
  { title: "Common plumbing fixes", tone: "var(--fixbridge-blue)", body: "Leaks, faucets, and shutoff checks." },
  { title: "Electrical safety", tone: "var(--fixbridge-yellow)", body: "When to stop and call a professional." },
  { title: "HVAC care", tone: "var(--fixbridge-sage)", body: "Filters and airflow, not live electrical work." },
  { title: "Safety first", tone: "var(--fixbridge-purple)", body: "Fixera checks safety before suggesting DIY." },
];

const NOTES = [
  "Comparing similar repair scenarios.",
  "Using Fixera repair intelligence.",
  "Learning improvements use validated outcomes, not this photo.",
  "Repair estimates can vary by ZIP code.",
];

function firstLook(category?: string | null, description?: string | null) {
  const cat = String(category || "").trim();
  const text = String(description || "").trim();
  if (cat) return `Fixera is starting with a ${cat.toLowerCase()} issue from what you described.`;
  if (text) return "Fixera is reviewing the issue you described and the photo you uploaded.";
  return "Fixera is reviewing the photo you uploaded.";
}

export default function FixeraAnalysisExperience({
  zip,
  activeStep,
  mediaUrl,
  mediaType,
  category,
  description,
}: {
  zip?: string | null;
  activeStep: number;
  mediaUrl?: string | null;
  mediaType?: string | null;
  category?: string | null;
  description?: string | null;
}) {
  const [note, setNote] = useState(0);
  const [paused, setPaused] = useState(false);
  const stageRow = useRef<HTMLDivElement>(null);
  const exploreRow = useRef<HTMLDivElement>(null);
  const zipLabel = zip ? String(zip).slice(0, 5) : null;
  const stageIndex = Math.min(Math.max(activeStep, 0), STAGES.length - 1);
  const isVideo = String(mediaType || "").startsWith("video");

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setNote((n) => (n + 1) % NOTES.length), 3800);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const row = stageRow.current;
    if (!row) return;
    const card = row.children[stageIndex] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [stageIndex]);

  useEffect(() => {
    if (paused) return;
    const row = exploreRow.current;
    if (!row) return;
    const timer = window.setInterval(() => {
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 8) return;
      const next = row.scrollLeft + 168;
      row.scrollTo({ left: next >= max - 8 ? 0 : next, behavior: "smooth" });
    }, 2800);
    return () => window.clearInterval(timer);
  }, [paused]);

  function scrollByCard(ref: RefObject<HTMLDivElement | null>, dir: -1 | 1) {
    setPaused(true);
    ref.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  }

  return (
    <section className="fixera-shell space-y-3 p-3 sm:p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--fixbridge-orange)] text-white" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fixbridge-orange)]">Fixera is analyzing</p>
          <h2 className="truncate text-base font-semibold tracking-tight">Fixera is checking your photos</h2>
        </div>
      </div>

      <div className="grid grid-cols-[88px_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
        <div className="fixera-card relative overflow-hidden">
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} className="h-full min-h-[88px] w-full object-cover" muted playsInline />
            ) : (
              <img src={mediaUrl} alt="" className="h-full min-h-[88px] w-full object-cover" />
            )
          ) : (
            <div className="flex h-full min-h-[88px] items-center justify-center px-2 text-center text-[10px] text-[var(--fixbridge-muted-text)]">Photo</div>
          )}
          <div className="fixera-scan pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-white/80 to-transparent" />
        </div>
        <div className="fixera-card min-w-0 p-3">
          <p className="text-xs font-semibold">Here&apos;s the first look</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--fixbridge-muted-text)]">{firstLook(category, description)}</p>
          <p className="mt-1 text-[11px] text-[var(--fixbridge-muted-text)]">Safety, local pricing, and the repair plan appear next.</p>
        </div>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={stageRow}>
        {STAGES.map((stage, idx) => {
          const done = idx < stageIndex;
          const current = idx === stageIndex;
          return (
            <article
              key={stage.title}
              className={`fixera-card flex w-[148px] shrink-0 snap-start flex-col justify-between p-2.5 sm:w-[160px] ${current ? "ring-1 ring-[var(--fixbridge-orange)]" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--fixbridge-cream)] text-[10px] font-semibold">
                  {done ? <Check className="h-3 w-3 text-emerald-700" /> : idx + 1}
                </span>
                {current ? <span className="text-[10px] font-semibold text-[var(--fixbridge-orange)]">Now</span> : null}
              </div>
              <div className="mt-2 min-w-0">
                <p className="text-xs font-semibold leading-tight">{stage.title}</p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--fixbridge-muted-text)]">
                  {idx === 4 && zipLabel ? `Reviewing pricing patterns for ZIP ${zipLabel}.` : stage.detail}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Explore while Fixera analyzes</p>
        <div className="flex gap-1.5">
          <button type="button" aria-label="Scroll explore cards left" onClick={() => scrollByCard(exploreRow, -1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Scroll explore cards right" onClick={() => scrollByCard(exploreRow, 1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={exploreRow}>
        {EXPLORE.map((card) => (
          <article key={card.title} className="w-[168px] shrink-0 snap-start rounded-[18px] p-3" style={{ background: card.tone }}>
            <p className="text-xs font-semibold leading-tight">{card.title}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--fixbridge-muted-text)]">{card.body}</p>
          </article>
        ))}
      </div>

      <div className="fixera-card px-3 py-2.5" onMouseEnter={() => setPaused(true)} onTouchStart={() => setPaused(true)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fixbridge-muted-text)]">Using Fixera repair intelligence</p>
        <p className="mt-0.5 text-xs">{NOTES[note]}</p>
      </div>
    </section>
  );
}
