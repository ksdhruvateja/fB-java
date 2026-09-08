import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import AiEstimateDisclaimer from "./AiEstimateDisclaimer";
import { ManagedJob, retailRangeLabel } from "./managedJobs";

const STEPS = [
  "Uploading your photo/video",
  "Inspecting visible components",
  "Identifying likely issue",
  "Checking safety conditions",
  "Building your DIY plan",
] as const;

export function EstimateLoadingSteps({
  zip,
  activeStep,
  mediaUrl,
  mediaType,
}: {
  zip?: string | null;
  activeStep: number;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const zipLabel = zip ? String(zip).slice(0, 5) : "your area";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  const stage = STEPS[Math.min(Math.max(activeStep, 0), STEPS.length - 1)];
  const isVideo = String(mediaType || "").startsWith("video");
  return (
    <div className="space-y-4 py-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-[16/10] max-h-64 bg-[#F4EFE8]">
          {mediaUrl ? (
            isVideo ? (
              <video src={mediaUrl} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Reviewing your description</div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 to-transparent motion-reduce:hidden" />
          <div className="pointer-events-none absolute inset-x-6 top-1/3 h-px bg-[#FF4D1C]/70 motion-safe:animate-pulse motion-reduce:hidden" />
        </div>
        <div className="space-y-1 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Fixa is analyzing your repair</p>
          <p className="text-xs text-muted-foreground">{stage}</p>
        </div>
      </div>
      {slow ? (
        <p className="text-xs text-muted-foreground">
          Still analyzing — you can stay on this screen or continue browsing.
        </p>
      ) : null}
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
            Estimated price for your area
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
