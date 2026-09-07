import { useEffect, useId, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ConsentCheckbox } from "./ConsentCheckbox";
import {
  AI_ASSESSMENT_ACK_LABEL,
  AI_ASSESSMENT_DISCLAIMER_BODY,
  AI_ASSESSMENT_EMERGENCY_BODY,
  AI_ASSESSMENT_INTRO,
  AI_ASSESSMENT_MODAL_TITLE,
  AI_ASSESSMENT_SAFETY_BODY,
} from "./aiAssessmentCopy";

export default function AiAssessmentAckModal({
  open,
  busy,
  checked,
  error,
  onCheckedChange,
  onClose,
  onContinue,
}: {
  open: boolean;
  busy?: boolean;
  checked: boolean;
  error?: string | null;
  onCheckedChange: (v: boolean) => void;
  onClose: () => void;
  onContinue: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) continueRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="overflow-y-auto p-5 sm:p-6">
          <h2 id={titleId} className="text-lg font-semibold sm:text-xl">
            {AI_ASSESSMENT_MODAL_TITLE}
          </h2>
          <div id={descId} className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{AI_ASSESSMENT_INTRO}</p>
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">AI Assessment</p>
              <p className="mt-2">{AI_ASSESSMENT_DISCLAIMER_BODY}</p>
            </div>
            <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="text-xs font-semibold uppercase tracking-wide">Safety</p>
              <p className="mt-2">{AI_ASSESSMENT_SAFETY_BODY}</p>
              <p className="mt-2">{AI_ASSESSMENT_EMERGENCY_BODY}</p>
            </div>
          </div>
          <div className="mt-4">
            <ConsentCheckbox
              id="ai-assessment-ack"
              checked={checked}
              onChange={onCheckedChange}
              label={AI_ASSESSMENT_ACK_LABEL}
            />
          </div>
        </div>
        <div className="space-y-2 border-t border-border p-4">
          {error ? (
            <p className="text-sm text-red-700 dark:text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60 sm:w-auto"
            >
              Cancel
            </button>
            <button
              ref={continueRef}
              type="button"
              disabled={!checked || busy}
              onClick={onContinue}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Continuing..." : "Continue to AI assessment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
