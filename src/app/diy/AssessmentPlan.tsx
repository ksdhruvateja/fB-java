import { useEffect, useState, type ReactNode } from "react";
import {
  AlertOctagon,
  Camera,
  CheckCircle2,
  ClipboardList,
  HardHat,
  HelpCircle,
  ImagePlus,
  ListChecks,
  Loader2,
  Package,
  ShieldAlert,
  Sparkles,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import { humanize } from "./AssessmentInsightCards";

/* Loose view of the assessment fields this screen reads. */
type GuideStep = {
  step_number?: number;
  title?: string;
  instruction?: string;
  explanation?: string;
  tools?: unknown;
  expected_result?: string;
  if_not?: string;
  when_to_stop?: string;
  what_to_look_for?: string;
};
type Resource = { name?: string; reason?: string; required?: boolean; quantity?: number; estimated_cost_low_usd?: number; estimated_cost_high_usd?: number };
export type PlanAssessment = {
  summary?: string;
  recommended_fix?: { approach?: string; summary?: string; why?: string } | null;
  do_not_attempt?: string[];
  immediate_safety_steps?: unknown;
  likely_causes?: unknown;
  diy_guide_steps?: GuideStep[];
  tools_required?: unknown;
  materials_needed?: unknown;
  stop_conditions?: unknown;
  completion_checks?: unknown;
  estimated_time?: string;
  diy_difficulty?: string;
  confidence?: number;
  needs_confirmation?: unknown;
  questions_needed?: unknown;
  assessment_stage?: string;
  withheld_step_count?: number;
  evidence_check?: { message?: string | null; photo_requests?: unknown; photo_issue_text?: unknown } | null;
  diy_safety?: { reasons?: string[] } | null;
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : (x as { name?: string; text?: string })?.name || (x as { text?: string })?.text || "")).filter(Boolean) : [];
const resources = (v: unknown): Resource[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? { name: x } : (x as Resource))).filter((r) => r?.name) : [];

/**
 * "Recommended fix": the first thing the homeowner sees after an assessment. Emergency and
 * professional-only cases lead with what to do now; DIY cases show the whole plan inline —
 * tools, parts and every step — so nothing important sits at the bottom of the page.
 */
export function RecommendedFixPanel({
  assessment,
  risk,
  safetyPending,
  onStartGuided,
  onReviewSafety,
  onHire,
  onAddPhotos,
}: {
  assessment: PlanAssessment;
  risk: "green" | "yellow" | "red";
  safetyPending: boolean;
  onStartGuided: () => void;
  onReviewSafety: () => void;
  onHire: () => void;
  onAddPhotos: () => void;
}) {
  const needsMore = assessment.assessment_stage === "needs_more_info";
  const fix = assessment.recommended_fix;
  const approach = needsMore ? "needs_more_info" : risk === "red" ? (fix?.approach === "emergency" ? "emergency" : "professional") : fix?.approach || "diy";
  const steps = (assessment.diy_guide_steps || []).filter((s) => s && (s.title || s.instruction));
  const tools = resources(assessment.tools_required);
  const parts = resources(assessment.materials_needed);
  const safetySteps = strings(assessment.immediate_safety_steps);
  const stops = strings(assessment.stop_conditions);
  const checks = strings(assessment.completion_checks);
  const headline =
    fix?.summary ||
    (needsMore
      ? "Fixera needs a closer look before recommending a fix."
      : assessment.summary || strings(assessment.likely_causes)[0] || "");

  const badge: Record<string, { label: string; className: string; icon: ReactNode }> = {
    emergency: { label: "Act now", className: "bg-red-600 text-white", icon: <AlertOctagon className="h-3.5 w-3.5" /> },
    professional: { label: "Professional repair", className: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200", icon: <HardHat className="h-3.5 w-3.5" /> },
    needs_more_info: { label: "Needs more photos", className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200", icon: <Camera className="h-3.5 w-3.5" /> },
    diy: { label: risk === "yellow" ? "DIY with care" : "DIY friendly", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200", icon: <Wrench className="h-3.5 w-3.5" /> },
  };
  const b = badge[approach] || badge.diy;

  return (
    <section aria-label="Recommended fix" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-gradient-to-br from-[#FFF4EE] to-transparent p-5 dark:from-[#2a1812]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FF4D1C]">Recommended fix</p>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${b.className}`}>
            {b.icon}
            {b.label}
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold leading-snug text-foreground">{headline}</p>
        {fix?.why ? <p className="mt-1.5 text-sm text-muted-foreground">{fix.why}</p> : null}
        {!needsMore && (assessment.estimated_time || assessment.diy_difficulty) && approach === "diy" ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {assessment.estimated_time ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1"><Timer className="h-3.5 w-3.5" /> {assessment.estimated_time}</span>
            ) : null}
            {assessment.diy_difficulty ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">Difficulty: {humanize(assessment.diy_difficulty)}</span>
            ) : null}
            {steps.length ? <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1"><ListChecks className="h-3.5 w-3.5" /> {steps.length} steps</span> : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        {(approach === "emergency" || approach === "professional") && safetySteps.length ? (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
              <ShieldAlert className="h-4 w-4" /> {approach === "emergency" ? "Do this now" : "Safe things you can do now"}
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-red-950 dark:text-red-100">
              {safetySteps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        ) : null}

        {(approach === "professional" || approach === "emergency") && strings(assessment.do_not_attempt).length ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leave these to a professional</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
              {strings(assessment.do_not_attempt).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}

        {approach === "professional" || approach === "emergency" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {assessment.diy_safety?.reasons?.[0] || "This repair needs a professional. Your photos and this assessment go with the request."}
            </p>
            <button type="button" onClick={onHire} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-3 text-sm font-semibold text-white">
              <HardHat className="h-4 w-4" /> Request a professional
            </button>
          </div>
        ) : null}

        {approach === "needs_more_info" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {assessment.evidence_check?.message || "Fixera will not guess a repair. Add the photos it asks for, or answer its questions below."}
            </p>
            <button type="button" onClick={onAddPhotos} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-3 text-sm font-semibold text-white">
              <ImagePlus className="h-4 w-4" /> Add photos
            </button>
          </div>
        ) : null}

        {approach === "diy" && safetyPending ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm text-amber-950 dark:text-amber-100">
              Review the safety notice to see the {assessment.withheld_step_count || ""} repair steps.
            </p>
            <button type="button" onClick={onReviewSafety} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white">
              Review safety notice
            </button>
          </div>
        ) : null}

        {approach === "diy" && !safetyPending && steps.length ? (
          <>
            {tools.length || parts.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {tools.length ? (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Tools</p>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {tools.map((t) => (
                        <li key={t.name} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <span>
                            <span className="font-medium text-foreground">{t.name}</span>
                            {t.reason ? <span className="block text-xs text-muted-foreground">{t.reason}</span> : null}
                          </span>
                          {t.required === false ? <span className="shrink-0 text-[11px] text-muted-foreground">Optional</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {parts.length ? (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Package className="h-3.5 w-3.5" /> Parts & materials</p>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {parts.map((p) => (
                        <li key={p.name} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <span>
                            <span className="font-medium text-foreground">{p.quantity && p.quantity > 1 ? `${p.quantity} × ` : ""}{p.name}</span>
                            {p.reason ? <span className="block text-xs text-muted-foreground">{p.reason}</span> : null}
                          </span>
                          {p.estimated_cost_high_usd ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              ${Math.round(p.estimated_cost_low_usd || 0)}–${Math.round(p.estimated_cost_high_usd)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" /> Step by step</p>
              <ol className="space-y-3">
                {steps.map((step, i) => {
                  const stepTools = strings(step.tools);
                  return (
                    <li key={`${i}-${step.title}`} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF4D1C] text-xs font-bold text-white">{i + 1}</span>
                        <div className="min-w-0 space-y-1.5 text-sm">
                          <p className="font-semibold text-foreground">{step.title || `Step ${i + 1}`}</p>
                          {step.instruction ? <p className="leading-relaxed text-foreground/90">{step.instruction}</p> : null}
                          {step.explanation ? <p className="text-xs text-muted-foreground">{step.explanation}</p> : null}
                          {stepTools.length ? <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Use:</span> {stepTools.join(", ")}</p> : null}
                          {step.expected_result ? (
                            <p className="flex items-start gap-1.5 text-xs text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {step.expected_result}</p>
                          ) : null}
                          {step.if_not ? <p className="text-xs text-amber-800 dark:text-amber-300"><span className="font-semibold">If not:</span> {step.if_not}</p> : null}
                          {step.when_to_stop ? <p className="text-xs text-red-800 dark:text-red-300"><span className="font-semibold">Stop if:</span> {step.when_to_stop}</p> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {stops.length || checks.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {stops.length ? (
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-900 dark:text-red-200">Stop and call a professional if</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">{stops.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                ) : null}
                {checks.length ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">How to know it's fixed</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">{checks.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onStartGuided} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-3 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4" /> Start guided repair
              </button>
              <button type="button" onClick={onHire} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold">
                <HardHat className="h-4 w-4" /> Hire a professional instead
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Fixera's open questions, each with its own answer box. Answers (and any new photos) go back
 * to Fixera, which updates the assessment.
 */
export function ConfirmQuestionsCard({
  questions,
  busy,
  photoCount,
  onAddPhotos,
  onSubmit,
}: {
  questions: string[];
  busy: boolean;
  photoCount: number;
  onAddPhotos: () => void;
  onSubmit: (text: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  useEffect(() => setAnswers({}), [questions.join("|")]);
  if (!questions.length) return null;
  const answered = questions.filter((_, i) => (answers[i] || "").trim()).length;
  const submit = () => {
    const text = questions
      .map((q, i) => ((answers[i] || "").trim() ? `Q: ${q}\nA: ${answers[i].trim()}` : ""))
      .filter(Boolean)
      .join("\n\n");
    onSubmit(text);
  };
  return (
    <section aria-label="Help Fixera narrow it down" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF4D1C]/10 text-[#FF4D1C]"><HelpCircle className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold text-foreground">Help Fixera narrow it down</p>
          <p className="text-xs text-muted-foreground">Answer what you can. Fixera updates the diagnosis and the plan with your answers.</p>
        </div>
      </div>
      <ol className="mt-4 space-y-3">
        {questions.map((q, i) => (
          <li key={q} className="space-y-1.5">
            <label htmlFor={`fixera-q-${i}`} className="block text-sm font-medium text-foreground">{i + 1}. {q}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`fixera-q-${i}`}
                value={answers[i] || ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                maxLength={500}
                placeholder="Your answer"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C]"
              />
              <button type="button" onClick={() => setAnswers((a) => ({ ...a, [i]: "Not sure" }))} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                Not sure
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={busy || (!answered && !photoCount)}
          onClick={submit}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Update my assessment
        </button>
        <button type="button" onClick={onAddPhotos} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">
          <ImagePlus className="h-4 w-4" /> {photoCount ? `${photoCount} photo${photoCount === 1 ? "" : "s"} added` : "Add photos"}
        </button>
      </div>
    </section>
  );
}

/** Pop-up asking for the specific photos Fixera needs before it gives a repair plan. */
export function MorePhotosModal({
  open,
  requests,
  issues,
  onUpload,
  onTakePhoto,
  onClose,
  onHire,
}: {
  open: boolean;
  requests: string[];
  issues: string[];
  onUpload: () => void;
  onTakePhoto: () => void;
  onClose: () => void;
  onHire: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="more-photos-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF4D1C]/10 text-[#FF4D1C]"><Camera className="h-5 w-5" /></span>
            <div>
              <h2 id="more-photos-title" className="text-base font-semibold">A few more photos for an accurate answer</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fixera won't guess at a repair. To see the real situation and give you exact steps, it needs:
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {requests.length ? (
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm">{requests.map((r) => <li key={r}>{r}</li>)}</ol>
        ) : null}
        {issues.length ? <p className="mt-3 text-xs text-muted-foreground">Current photos: {issues.join(" ")}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onTakePhoto} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"><Camera className="h-4 w-4" /> Take photo</button>
          <button type="button" onClick={onUpload} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-3 py-2.5 text-sm font-semibold text-white"><ImagePlus className="h-4 w-4" /> Upload photos</button>
        </div>
        <button type="button" onClick={onHire} className="mt-3 w-full text-center text-sm font-medium text-muted-foreground underline-offset-2 hover:underline">Hire a professional instead</button>
      </div>
    </div>
  );
}

/** Fixera's questions and things to confirm, de-duplicated, as one list. */
export function fixeraQuestions(needsConfirmation: unknown, questionsNeeded: unknown): string[] {
  const seen = new Set<string>();
  return [...strings(questionsNeeded), ...strings(needsConfirmation)].filter((q) => {
    const key = q.toLowerCase().replace(/\W+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
