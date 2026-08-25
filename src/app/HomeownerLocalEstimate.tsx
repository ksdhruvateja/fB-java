import { Check, Loader2 } from "lucide-react";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";
import { ManagedJob, retailRangeLabel } from "./managedJobs";

const STEPS = [
  "Identifying the service",
  "Reviewing pricing near your ZIP",
  "Comparing similar local services",
  "Preparing your estimate",
] as const;

export function EstimateLoadingSteps({
  zip,
  activeStep,
}: {
  zip?: string | null;
  activeStep: number;
}) {
  const zipLabel = zip ? String(zip).slice(0, 5) : "your area";
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-[#FF4D1C]" />
        <p className="text-sm font-semibold text-foreground">Analyzing your request…</p>
      </div>
      <ul className="space-y-2 text-sm">
        {STEPS.map((label, idx) => {
          const done = idx < activeStep;
          const current = idx === activeStep;
          const text =
            idx === 1 ? label.replace("your ZIP", zipLabel) : label;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 ${
                done
                  ? "text-emerald-700 dark:text-emerald-400"
                  : current
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {done ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : current ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#FF4D1C]" />
              ) : (
                <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-border" />
              )}
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HomeownerLocalEstimate({
  job,
  compact,
}: {
  job: ManagedJob;
  compact?: boolean;
}) {
  const zip =
    job.estimateContext ||
    (job.cityStateZip?.match(/\b\d{5}\b/)?.[0] ?? null);
  const confidence = String(job.estimateConfidence || "").toUpperCase();
  const showConfidence = confidence === "HIGH";

  if (job.showRetailPrice === false) {
    return (
      <div className={`rounded-xl border border-border bg-card ${compact ? "p-3" : "p-4"} space-y-2`}>
        <p className="text-sm font-medium">On-site assessment required</p>
        <p className="text-xs text-muted-foreground">
          We need a professional visit before we can provide pricing for this request.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-card shadow-sm ${compact ? "p-3 space-y-2" : "p-4 space-y-3"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Estimated local price
          </p>
          <p className={`font-semibold tabular-nums text-foreground ${compact ? "text-lg" : "text-2xl"}`}>
            {retailRangeLabel(job)}
          </p>
        </div>
        {showConfidence ? (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            High confidence
          </span>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Based on similar services and current pricing in your area.
        {zip ? (
          <>
            {" "}
            <span className="font-medium text-foreground/80">{zip}</span>
          </>
        ) : null}
      </p>
      <AiEstimateDisclaimer compact={compact} />
    </div>
  );
}

export default HomeownerLocalEstimate;
