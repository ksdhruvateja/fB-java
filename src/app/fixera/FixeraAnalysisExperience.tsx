import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Sparkles } from "lucide-react";

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

const BUFFER_LINES = [
  "Please wait — this step is still buffering.",
  "Fixera is reading what you uploaded.",
  "Checking visible symptoms before the next step.",
  "This can take a moment. Stay on this screen.",
  "The full safety result and estimate appear after this.",
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
  const activeBox = useRef<HTMLDivElement>(null);
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
    const box = activeBox.current;
    if (!box) return;
    const timer = window.setInterval(() => {
      const max = box.scrollHeight - box.clientHeight;
      if (max <= 4) return;
      const next = box.scrollTop + 28;
      box.scrollTo({ top: next >= max - 4 ? 0 : next, behavior: "smooth" });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [paused, stageIndex]);

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

  function scrollActiveBox(dir: -1 | 1) {
    setPaused(true);
    activeBox.current?.scrollBy({ top: dir * 36, behavior: "smooth" });
  }

  return (
    <section className="fixera-shell space-y-3 p-3 sm:p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--fixbridge-orange)] text-white" aria-hidden>
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fixbridge-orange)]">Please wait</p>
          <h2 className="truncate text-base font-semibold tracking-tight">Fixera is buffering this step</h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--fixbridge-orange)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Buffering
        </span>
      </div>
      <div className="fixera-buffer" role="progressbar" aria-label="Fixera is still analyzing" />

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
        <div className="fixera-card flex min-w-0 flex-col p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Here&apos;s the first look</p>
            <span className="text-[10px] font-semibold text-[var(--fixbridge-orange)]">Buffering</span>
          </div>
          <div className="fixera-buffer mt-2" />
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--fixbridge-muted-text)]">{firstLook(category, description)}</p>
          <p className="mt-1 text-[11px] text-[var(--fixbridge-muted-text)]">Please wait. Safety, local pricing, and the repair plan appear next.</p>
        </div>
      </div>

      <p className="text-xs font-semibold">Analysis steps</p>

      <div className="-mx-1 flex snap-x snap-mandatory items-stretch gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={stageRow}>
        {STAGES.map((stage, idx) => {
          const done = idx < stageIndex;
          const current = idx === stageIndex;
          const detail = idx === 4 && zipLabel ? `Reviewing pricing patterns for ZIP ${zipLabel}.` : stage.detail;
          return (
            <article
              key={stage.title}
              className={`fixera-card flex w-[168px] shrink-0 snap-start flex-col p-2.5 sm:w-[188px] ${current ? "ring-1 ring-[var(--fixbridge-orange)]" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--fixbridge-cream)] text-[10px] font-semibold">
                  {done ? <Check className="h-3 w-3 text-emerald-700" /> : current ? <Loader2 className="h-3 w-3 animate-spin text-[var(--fixbridge-orange)]" /> : idx + 1}
                </span>
                {current ? <span className="text-[10px] font-semibold text-[var(--fixbridge-orange)]">Buffering</span> : done ? <span className="text-[10px] font-semibold text-emerald-700">Done</span> : <span className="text-[10px] text-[var(--fixbridge-muted-text)]">Waiting</span>}
              </div>
              <p className="mt-2 text-xs font-semibold leading-tight">{stage.title}</p>
              {current ? (
                <>
                  <div className="fixera-buffer mt-2" />
                  <div
                    ref={activeBox}
                    className="mt-2 max-h-[72px] space-y-1.5 overflow-y-auto pr-1 text-[11px] leading-snug text-[var(--fixbridge-muted-text)] [scrollbar-width:thin]"
                    onMouseEnter={() => setPaused(true)}
                    onTouchStart={() => setPaused(true)}
                  >
                    <p>{detail}</p>
                    {BUFFER_LINES.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <button type="button" aria-label="Scroll buffering details up" onClick={() => scrollActiveBox(-1)} className="inline-flex h-7 w-8 items-center justify-center rounded-full border border-border bg-white">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Scroll buffering details down" onClick={() => scrollActiveBox(1)} className="inline-flex h-7 w-8 items-center justify-center rounded-full border border-border bg-white">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--fixbridge-muted-text)]">{detail}</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--fixbridge-muted-text)]">The highlighted box is buffering. Scroll it if you want to read ahead.</p>
        <div className="flex gap-1.5">
          <button type="button" aria-label="Scroll analysis steps left" onClick={() => scrollByCard(stageRow, -1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Scroll analysis steps right" onClick={() => scrollByCard(stageRow, 1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold">Explore while Fixera analyzes</p>

      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={exploreRow}>
        {EXPLORE.map((card) => (
          <article key={card.title} className="w-[168px] shrink-0 snap-start rounded-[18px] p-3" style={{ background: card.tone }}>
            <p className="text-xs font-semibold leading-tight">{card.title}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--fixbridge-muted-text)]">{card.body}</p>
          </article>
        ))}
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" aria-label="Scroll explore cards left" onClick={() => scrollByCard(exploreRow, -1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Scroll explore cards right" onClick={() => scrollByCard(exploreRow, 1)} className="inline-flex h-9 w-11 items-center justify-center rounded-full border border-border bg-white">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="fixera-card px-3 py-2.5" onMouseEnter={() => setPaused(true)} onTouchStart={() => setPaused(true)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fixbridge-muted-text)]">Using Fixera repair intelligence</p>
        <p className="mt-0.5 text-xs">{NOTES[note]}</p>
      </div>
    </section>
  );
}
