import { useEffect, useMemo, useState } from "react";
import { Check, Clock, HardHat, Loader2, Shield, Sparkles, Wrench, X } from "lucide-react";
import { diyPlanSteps } from "./diyPlanSteps";
import { asGuideSteps } from "./diyGuideVisual";

type Risk = "green" | "yellow" | "red";

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return String(row.name || row.instruction || row.title || row.text || "").trim();
    })
    .filter(Boolean);
}

function difficultyLabel(value: unknown, risk: Risk) {
  if (risk === "red") return "Professional Recommended";
  const text = String(value || "").toLowerCase();
  if (text === "easy" || text === "beginner") return "Easy";
  if (text === "moderate" || text === "medium" || text === "intermediate") return "Moderate";
  if (text === "hard" || text === "advanced") return "Advanced";
  if (text === "blocked") return "Professional Recommended";
  return risk === "yellow" ? "Moderate" : "Easy";
}

function asFixture(value: unknown) {
  if (!value) return null;
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim(), type: "", specification: "", why: "", verify: "Match the failed part before buying." };
  }
  if (typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = String(row.name || row.title || "").trim();
  if (!name) return null;
  return {
    name,
    type: String(row.type || row.part_type || "").trim(),
    specification: String(row.specification || row.compatible_specification || row.spec || "").trim(),
    why: String(row.why || row.why_recommended || "").trim(),
    verify: String(row.verify_before_purchase || row.verify || "").trim(),
  };
}

export default function DiyAnalysisPanel({
  open,
  onClose,
  title,
  summary,
  category,
  subcategory,
  assessment,
  risk = "green",
  photoUrl,
  loading = false,
  error = null,
  onRetry,
  onHire,
  stepIndex = 0,
  completed = {},
  onCompleteStep,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  summary?: string | null;
  category?: string;
  subcategory?: string;
  assessment: Record<string, unknown> | null | undefined;
  risk?: Risk;
  photoUrl?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onHire: () => void;
  stepIndex?: number;
  completed?: Record<number, boolean>;
  onCompleteStep?: () => void;
}) {
  const row = assessment && typeof assessment === "object" ? assessment : {};
  const steps = useMemo(
    () => diyPlanSteps(row, category || "", subcategory || "", summary || String(row.summary || "")),
    [row, category, subcategory, summary],
  );
  const guides = useMemo(() => asGuideSteps(row.diy_guide_steps, steps), [row.diy_guide_steps, steps]);
  const [localStep, setLocalStep] = useState(0);
  const currentIndex = Math.min(Math.max(onCompleteStep ? stepIndex : localStep, 0), Math.max(steps.length - 1, 0));
  const currentGuide = guides[currentIndex];
  const toolsRequired = asList(row.tools_required);
  const toolsRecommended = asList(row.tools_recommended);
  const toolsOptional = asList(row.tools_optional);
  const materials = asList(row.materials_needed);
  const safety = asList(row.immediate_safety_steps);
  const causes = asList(row.likely_causes);
  const evidence = asList(row.observed_evidence).length ? asList(row.observed_evidence) : asList(row.visual_findings);
  const verification = asList(row.completion_checks).length ? asList(row.completion_checks) : asList(row.verification);
  const troubleshooting = asList(row.troubleshooting).length ? asList(row.troubleshooting) : asList(row.stop_conditions);
  const fixture = asFixture(row.suggested_fixture || row.recommended_part);
  const time =
    String(row.estimated_time || "").trim() ||
    (row.estimated_labor_hours_min || row.estimated_labor_hours_max
      ? `${row.estimated_labor_hours_min || 1}–${row.estimated_labor_hours_max || 3} hours`
      : "");
  const blocked = risk === "red" || row.safe_diy_allowed === false || String(row.diy_difficulty || "").toLowerCase() === "blocked";
  const diagnosis = String(row.summary || summary || title || "").trim();
  const objective = String(row.problem_classification || row.service_subcategory || subcategory || "").trim();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  function markStepDone() {
    if (onCompleteStep) {
      onCompleteStep();
      return;
    }
    setLocalStep((idx) => Math.min(idx + 1, Math.max(steps.length - 1, 0)));
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="diy-analysis-title">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close DIY analysis" onClick={onClose} />
      <aside className="fixera-shell absolute inset-y-0 right-0 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden rounded-none bg-[#F8F7F4] sm:max-w-[560px] lg:max-w-[640px]">
        <header className="flex shrink-0 items-start gap-3 border-b border-[#eadfd4] bg-[#F8F7F4] px-4 py-3 sm:px-5">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF4D1C] text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FF4D1C]">Fixera DIY Analysis</p>
            <h2 id="diy-analysis-title" className="truncate text-base font-semibold text-[#2c2926]">{title}</h2>
            <p className="line-clamp-2 text-[12px] text-[#7a746c]">{diagnosis || "Detailed repair analysis"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#2c2926]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {loading ? (
            <div className="space-y-4 rounded-[22px] bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#2c2926]">
                <Loader2 className="h-4 w-4 animate-spin text-[#FF4D1C]" /> Analyzing your problem...
              </p>
              <div className="fixera-buffer" />
              <ul className="space-y-2 text-sm text-[#5c574f]">
                <li>✓ Your description</li>
                <li>✓ Images</li>
                <li>✓ Property information</li>
                <li>✓ Service history</li>
                <li>✓ Equipment information</li>
              </ul>
            </div>
          ) : error ? (
            <div className="space-y-3 rounded-[22px] border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-semibold">We couldn&apos;t complete the detailed analysis right now.</p>
              <p className="text-sm">Please try again.</p>
              {onRetry ? (
                <button type="button" onClick={onRetry} className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white">
                  Try again
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-36 w-full rounded-[22px] object-cover" />
              ) : null}

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Detailed Analysis</p>
                <h3 className="mt-1 text-lg font-semibold text-[#2c2926]">What is happening</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#5c574f]">{diagnosis || "Fixera is reviewing the issue you reported."}</p>
                {evidence.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                    {evidence.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Likely cause</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                  {(causes.length ? causes : ["Confirm the failed part against the photo before replacing anything."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {objective ? <p className="mt-3 text-sm text-[#5c574f]"><span className="font-semibold text-[#2c2926]">What needs to be fixed: </span>{objective}</p> : null}
              </section>

              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-[22px] bg-white p-4">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">
                    <Wrench className="h-3.5 w-3.5" /> Difficulty
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2c2926]">{difficultyLabel(row.diy_difficulty || row.complexity, risk)}</p>
                </section>
                <section className="rounded-[22px] bg-white p-4">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">
                    <Clock className="h-3.5 w-3.5" /> Estimated time
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2c2926]">{time || "About 30–60 minutes"}</p>
                </section>
              </div>

              {safety.length || blocked ? (
                <section className="rounded-[22px] border border-amber-300 bg-amber-50 p-4 text-amber-950">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="h-4 w-4" /> Safety
                  </p>
                  {blocked ? (
                    <p className="mt-2 text-sm">This repair may require a licensed professional. Read the safety notes before you start, and stop if anything looks unsafe.</p>
                  ) : null}
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {(safety.length ? safety : ["Make the area safe and stop if a new hazard appears."]).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Tools Required</p>
                {toolsRequired.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#5c574f]">
                    {toolsRequired.map((item) => <li key={item}><span className="font-semibold text-[#2c2926]">Required — </span>{item}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#5c574f]">Use only the tools named in the steps below.</p>
                )}
                {toolsRecommended.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#5c574f]">
                    {toolsRecommended.map((item) => <li key={item}><span className="font-semibold text-[#2c2926]">Recommended — </span>{item}</li>)}
                  </ul>
                ) : null}
                {toolsOptional.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#5c574f]">
                    {toolsOptional.map((item) => <li key={item}><span className="font-semibold text-[#2c2926]">Optional — </span>{item}</li>)}
                  </ul>
                ) : null}
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Materials / Parts</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                  {(materials.length ? materials : ["Match any replacement part to the failed piece in the photo before buying."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Recommended Part / Fixture</p>
                {fixture ? (
                  <dl className="mt-2 space-y-1 text-sm text-[#5c574f]">
                    <div><dt className="font-semibold text-[#2c2926]">Name</dt><dd>{fixture.name}</dd></div>
                    {fixture.type ? <div><dt className="font-semibold text-[#2c2926]">Type</dt><dd>{fixture.type}</dd></div> : null}
                    {fixture.specification ? <div><dt className="font-semibold text-[#2c2926]">Compatible specification</dt><dd>{fixture.specification}</dd></div> : null}
                    {fixture.why ? <div><dt className="font-semibold text-[#2c2926]">Why this is recommended</dt><dd>{fixture.why}</dd></div> : null}
                    <div><dt className="font-semibold text-[#2c2926]">What to verify before purchasing</dt><dd>{fixture.verify || "Match size, thread, and finish to the failed part."}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-[#5c574f]">
                    An exact model is not safe to name from this photo alone. Take the failed part with you and match the size, thread, and finish before you buy.
                  </p>
                )}
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Step-by-Step</p>
                <ol className="mt-3 space-y-3">
                  {steps.map((step, index) => (
                    <li key={`${index}-${step.slice(0, 20)}`} className="flex gap-3 text-sm leading-relaxed text-[#5c574f]">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF4D1C] text-xs font-semibold text-white">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {steps.length ? (
                <section className="rounded-[22px] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Guided Instructions</p>
                  <p className="mt-1 text-sm font-semibold text-[#2c2926]">Step {currentIndex + 1} of {steps.length}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[#2c2926]">{currentGuide?.title || steps[currentIndex]}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#5c574f]">{currentGuide?.instruction || steps[currentIndex]}</p>
                  {currentGuide?.explanation || currentGuide?.goal ? (
                    <p className="mt-3 text-sm text-[#5c574f]"><span className="font-semibold text-[#2c2926]">Why: </span>{currentGuide.explanation || currentGuide.goal}</p>
                  ) : null}
                  {currentGuide?.what_to_look_for ? (
                    <p className="mt-2 text-sm text-[#5c574f]"><span className="font-semibold text-[#2c2926]">What to look for: </span>{currentGuide.what_to_look_for}</p>
                  ) : null}
                  {currentGuide?.expected_result ? (
                    <p className="mt-2 text-sm text-[#5c574f]"><span className="font-semibold text-[#2c2926]">How to know this step is complete: </span>{currentGuide.expected_result}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={markStepDone}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Check className="h-4 w-4" /> I&apos;ve completed this step
                  </button>
                  {completed[currentIndex] ? <p className="mt-2 text-xs font-medium text-emerald-700">This step is marked complete.</p> : null}
                </section>
              ) : null}

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Verify the Repair</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                  {(verification.length ? verification : ["Restore the system the way it normally runs and confirm the original problem is gone."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a847b]">If the problem continues</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                  {(troubleshooting.length ? troubleshooting : ["Stop, do not force the part, and hire a professional with this step noted."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-[22px] bg-white p-4">
                <p className="text-sm font-semibold text-[#2c2926]">Need help completing this?</p>
                {row.professional_recommendation ? (
                  <p className="mt-1 text-sm text-[#5c574f]">{String(row.professional_recommendation)}</p>
                ) : (
                  <p className="mt-1 text-sm text-[#5c574f]">Your request, photo, and Fixera assessment stay attached.</p>
                )}
                <button
                  type="button"
                  onClick={onHire}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-[#2c2926]"
                >
                  <HardHat className="h-4 w-4" /> Hire a Professional
                </button>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
