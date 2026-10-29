import { CalendarClock, ShieldCheck, Wallet } from "lucide-react";
import type { DiyPartsCostEstimate, DiySafetyResult } from "../managedJobs";

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low risk",
  medium: "Moderate risk",
  high: "High risk",
  critical: "Active hazard",
};

/** Why Fixera reached its DIY decision: the risk factors and the guardrails that apply. */
export function DiySafetyRationaleCard({
  safety,
  doNotAttempt,
}: {
  safety: DiySafetyResult | null | undefined;
  /** Work on this specific repair to leave to a professional (from Fixera), shown instead of generic lists. */
  doNotAttempt?: string[];
}) {
  if (!safety || (!safety.factors?.length && !safety.reasons?.length)) return null;
  const specific = (doNotAttempt || []).filter(Boolean);
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Safety assessment</p>
      </div>
      {safety.summary ? <p className="mt-2 font-medium">{safety.summary}</p> : null}
      {safety.factors?.length ? (
        <ul className="mt-2 space-y-1">
          {safety.factors.map((factor) => (
            <li key={factor.code} className="flex flex-wrap items-baseline gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                {SEVERITY_LABEL[factor.severity] || factor.severity}
              </span>
              {factor.label && factor.label.toLowerCase() !== "other" ? <span>{humanize(factor.label)}</span> : null}
              {factor.evidence ? <span className="text-xs text-muted-foreground">— {factor.evidence}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {specific.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-foreground">Leave these to a professional</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {specific.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** "pipe_burst_repair" -> "Pipe burst repair". */
export function humanize(value: string) {
  const text = String(value || "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function usd(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Approximate parts cost for doing the repair yourself. Clearly a rough estimate. */
export function DiyPartsCostCard({ estimate }: { estimate: DiyPartsCostEstimate | null | undefined }) {
  if (!estimate || !(estimate.high > 0)) return null;
  const range = estimate.low === estimate.high ? `about ${usd(estimate.low)}` : `about ${usd(estimate.low)}–${usd(estimate.high)}`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approximate DIY parts cost</p>
      </div>
      <p className="mt-2 text-xl font-semibold">{range}</p>
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Rough estimate — not a quote</p>
      {estimate.items?.length ? (
        <ul className="mt-2 space-y-1 text-xs">
          {estimate.items.map((item) => (
            <li key={item.name} className="flex justify-between gap-3">
              <span>
                {item.name}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                {!item.required ? " (optional)" : ""}
              </span>
              <span className="text-muted-foreground">
                {item.low === item.high ? usd(item.low) : `${usd(item.low)}–${usd(item.high)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {estimate.unpriced_items?.length ? (
        <p className="mt-2 text-xs text-muted-foreground">Not priced: {estimate.unpriced_items.join(", ")}.</p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{estimate.disclaimer}</p>
    </div>
  );
}

/** Follow-up maintenance Fixera will add to the calendar once the repair is done. */
export function FollowUpMaintenanceCard({
  items,
}: {
  items: Array<{ task: string; interval_days: number; reason?: string }> | null | undefined;
}) {
  if (!items?.length) return null;
  const every = (days: number) =>
    days % 365 === 0 ? `every ${days / 365 === 1 ? "year" : `${days / 365} years`}` : days % 30 === 0 ? `every ${days / 30 === 1 ? "month" : `${days / 30} months`}` : `every ${days} days`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keep it from coming back</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        When you mark this repair done, Fixera adds these reminders to your maintenance calendar, plus a check that the repair is holding.
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.task}>
            <span className="font-medium">{item.task}</span>
            <span className="text-xs text-muted-foreground"> — {every(item.interval_days)}</span>
            {item.reason ? <p className="text-xs text-muted-foreground">{item.reason}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
