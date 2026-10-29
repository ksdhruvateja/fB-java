import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { DiySafetyResult } from "../managedJobs";

/**
 * Shown when Fixera's safety evaluation finds a concern that still allows limited DIY.
 * Continuing unlocks only the guidance the safety guardrails permit; it never unlocks the
 * prohibited actions listed here.
 */
export default function SafetyConcernModal({
  open,
  safety,
  stepCount,
  busy,
  onContinue,
  onHireProfessional,
  onClose,
}: {
  open: boolean;
  safety: DiySafetyResult | null | undefined;
  stepCount?: number;
  busy?: boolean;
  onContinue: () => void;
  onHireProfessional: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const [understood, setUnderstood] = useState(false);
  const hireRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setUnderstood(false);
    hireRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !safety) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div>
              <h2 id={titleId} className="text-lg font-semibold sm:text-xl">
                Safety concern detected
              </h2>
              <p id={descId} className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {safety.summary || "Fixera found a safety concern with this repair."} You can continue with the limited
                DIY steps below, or hire a professional.
              </p>
            </div>
          </div>

          {safety.reasons?.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Why</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {safety.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {safety.allowed_actions?.length ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                What you can do safely
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {safety.allowed_actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {safety.prohibited_actions?.length ? (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-200">
                Fixera will not guide this (a professional must do it)
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {safety.prohibited_actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Continuing does not change these limits.
                {safety.removed_steps_count
                  ? ` ${safety.removed_steps_count} suggested step${safety.removed_steps_count === 1 ? " was" : "s were"} removed for this reason.`
                  : ""}
              </p>
            </div>
          ) : null}

          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              I understand the safety concern. I will follow only the permitted steps
              {stepCount ? ` (${stepCount})` : ""} and stop and hire a professional if anything is different or feels unsafe.
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-card/95 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy || !understood}
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue with limited DIY
          </button>
          <button
            ref={hireRef}
            type="button"
            disabled={busy}
            onClick={onHireProfessional}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Hire a Professional
          </button>
        </div>
      </div>
    </div>
  );
}
