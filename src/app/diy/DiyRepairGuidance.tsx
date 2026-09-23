import { AlertTriangle, Clock, HardHat, Shield, Wrench } from "lucide-react";
import { diyPlanSteps } from "./diyPlanSteps";

type Assessment = Record<string, unknown> | null | undefined;

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return String(row.instruction || row.title || row.text || "").trim();
    })
    .filter(Boolean);
}

function difficultyLabel(value: unknown, risk: string) {
  if (risk === "red") return "Requires a licensed professional";
  const text = String(value || "").toLowerCase();
  if (text === "easy" || text === "beginner") return "Beginner-friendly";
  if (text === "moderate" || text === "medium" || text === "intermediate") return "Intermediate";
  if (text === "hard" || text === "advanced") return "Advanced";
  if (text === "blocked") return "Requires a licensed professional";
  return risk === "yellow" ? "Intermediate" : "Beginner-friendly";
}

export default function DiyRepairGuidance({
  assessment,
  category = "",
  subcategory = "",
  summary = "",
  risk = "green",
  onHire,
}: {
  assessment: Assessment;
  category?: string;
  subcategory?: string;
  summary?: string;
  risk?: "green" | "yellow" | "red";
  onHire: () => void;
}) {
  const row = assessment && typeof assessment === "object" ? assessment : {};
  const steps = diyPlanSteps(row, category, subcategory, summary || String(row.summary || ""));
  const tools = asList(row.tools_required);
  const materials = asList(row.materials_needed);
  const safety = asList(row.immediate_safety_steps);
  const stop = asList(row.stop_conditions);
  const time =
    String(row.estimated_time || "").trim() ||
    (row.estimated_labor_hours_min || row.estimated_labor_hours_max
      ? `${row.estimated_labor_hours_min || 1}–${row.estimated_labor_hours_max || 3} hours`
      : "About 30–60 minutes");
  const blocked = risk === "red" || row.safe_diy_allowed === false || String(row.diy_difficulty || "").toLowerCase() === "blocked";

  return (
    <section id="diy-repair-guidance" className="space-y-4 rounded-[22px] border border-border bg-[#F8F7F4] p-4 text-[#2c2926] sm:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E07A4A]">DIY repair guidance</p>
        <h3 className="mt-1 text-xl font-semibold">How to fix this</h3>
        <p className="mt-1 text-sm text-[#5c574f]">
          These instructions come from this Fixera assessment{summary ? `: ${summary}` : "."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a847b]">
            <Clock className="h-3.5 w-3.5" /> Estimated time
          </p>
          <p className="mt-1 text-sm font-medium">{time}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a847b]">
            <Wrench className="h-3.5 w-3.5" /> DIY difficulty
          </p>
          <p className="mt-1 text-sm font-medium">{difficultyLabel(row.diy_difficulty || row.complexity, risk)}</p>
        </div>
      </div>

      {safety.length ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" /> Safety precautions
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {safety.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {blocked ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Stop DIY
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Fixera identified a hazard in this request. Do not continue with homeowner repair steps. Hire a licensed professional and keep your existing request, photos, and assessment.
          </p>
          <button
            type="button"
            onClick={onHire}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#2c2926] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <HardHat className="h-4 w-4" /> Hire a Professional
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Step-by-step repair</p>
            <ol className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <li key={`${index}-${step.slice(0, 24)}`} className="flex gap-3 text-sm leading-relaxed text-[#5c574f]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E07A4A] text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Required tools</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                {(tools.length ? tools : ["Use only the tools named in the steps above."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a847b]">Materials and parts</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c574f]">
                {(materials.length ? materials : ["Use only the materials or parts named in this assessment."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" /> Stop DIY if
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {(stop.length
                ? stop
                : ["Water sprays or you cannot shut it off", "You see exposed wiring, gas, or structural damage", "The original problem returns after the repair"]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onHire}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold"
      >
        <HardHat className="h-4 w-4" /> Hire a Professional
      </button>
    </section>
  );
}
