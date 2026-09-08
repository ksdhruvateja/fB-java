import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

const STAGES = [
  { title: "Photos received", detail: "Your photos are ready for Fixera." },
  { title: "First look", detail: "Fixera is identifying fixtures, damage, and visible symptoms." },
  { title: "Similar scenarios", detail: "Comparing similar repair scenarios. This is not model retraining." },
  { title: "Safety check", detail: "Checking whether this looks appropriate for DIY guidance." },
  { title: "Local pricing", detail: "Reviewing repair pricing patterns for your ZIP code." },
  { title: "Repair plan", detail: "Preparing likely causes and recommended next steps." },
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
  "Learning system improvements are based on validated outcomes, not this photo.",
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
  const zipLabel = zip ? String(zip).slice(0, 5) : null;
  const stageIndex = Math.min(Math.max(activeStep, 0), STAGES.length - 1);
  const isVideo = String(mediaType || "").startsWith("video");

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setNote((n) => (n + 1) % NOTES.length), 4200);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      className="fixera-shell space-y-4 p-3 sm:p-5"
      onPointerDown={() => setPaused(true)}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--fixbridge-orange)]">Fixera DIY</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Fixera is checking your photos</h2>
          <p className="mt-1 text-sm text-[var(--fixbridge-muted-text)]">
            A first look appears now. Safety, local pricing, and the detailed recommendation fill in as they are ready.
          </p>
        </div>
        <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[var(--fixbridge-orange)] text-white sm:flex" aria-hidden>
          <Sparkles className="h-6 w-6" />
        </div>
      </div>

      <div className="fixera-card overflow-hidden">
        <div className="relative aspect-[16/10] max-h-72 bg-[#f4efe8]">
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--fixbridge-muted-text)]">Reviewing your description</div>
          )}
          <div className="fixera-scan pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-white/70 to-transparent" />
        </div>
      </div>

      <div className="fixera-card p-4">
        <p className="text-sm font-semibold">Here&apos;s the first look</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--fixbridge-muted-text)]">{firstLook(category, description)}</p>
        <p className="mt-2 text-xs text-[var(--fixbridge-muted-text)]">The full diagnosis, safety result, and estimate appear next. Customer photos are not used to retrain the model.</p>
      </div>

      <ol className="space-y-2">
        {STAGES.map((stage, idx) => {
          const done = idx < stageIndex;
          const current = idx === stageIndex;
          return (
            <li key={stage.title} className={`fixera-card flex items-start gap-3 px-3 py-3 ${current ? "ring-1 ring-[var(--fixbridge-orange)]" : ""}`}>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--fixbridge-cream)] text-[11px] font-semibold">
                {done ? <Check className="h-3.5 w-3 text-emerald-700" /> : idx + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{stage.title}</p>
                <p className="text-xs leading-relaxed text-[var(--fixbridge-muted-text)]">
                  {idx === 4 && zipLabel ? `Reviewing repair pricing patterns for ZIP ${zipLabel}.` : stage.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <p className="mb-2 text-sm font-semibold">Explore while Fixera analyzes</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {EXPLORE.map((card) => (
            <article key={card.title} className="min-w-[220px] shrink-0 rounded-[22px] p-4" style={{ background: card.tone }}>
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--fixbridge-muted-text)]">{card.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="fixera-card p-4" onMouseEnter={() => setPaused(true)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fixbridge-muted-text)]">Using Fixera repair intelligence</p>
        <p className="mt-1 text-sm">{NOTES[note]}</p>
      </div>
    </section>
  );
}
