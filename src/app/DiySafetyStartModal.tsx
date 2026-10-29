import { useEffect, useId, useRef } from "react";
import { Loader2 } from "lucide-react";
import AcceptAllConsents from "./AcceptAllConsents";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { DIY_SAFETY_ACKNOWLEDGMENT_KEYS } from "./consentAcceptAll";
import {
  DIY_SAFETY_ABILITY_LABEL,
  DIY_SAFETY_INTRO,
  DIY_SAFETY_JUDGMENT_LABEL,
  DIY_SAFETY_MODAL_TITLE,
  DIY_SAFETY_STOP_IF,
} from "./diySafetyCopy";
import { LEGAL_ROUTES } from "./legalDocuments";

export default function DiySafetyStartModal({
  open,
  busy,
  judgmentChecked,
  abilityChecked,
  onJudgmentChange,
  onAbilityChange,
  onClose,
  onRequestProfessional,
  onStartGuidedDiy,
}: {
  open: boolean;
  busy?: boolean;
  judgmentChecked: boolean;
  abilityChecked: boolean;
  onJudgmentChange: (checked: boolean) => void;
  onAbilityChange: (checked: boolean) => void;
  onClose: () => void;
  onRequestProfessional: () => void;
  onStartGuidedDiy: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const startRef = useRef<HTMLButtonElement>(null);
  const canStart = judgmentChecked && abilityChecked && !busy;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) startRef.current?.focus();
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
        className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="overflow-y-auto p-5 sm:p-6">
          <h2 id={titleId} className="text-lg font-semibold sm:text-xl">
            {DIY_SAFETY_MODAL_TITLE}
          </h2>
          <div id={descId} className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              AI / DIY Safety Acknowledgment
            </p>
            {DIY_SAFETY_INTRO.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
            <p>Stop immediately if:</p>
            <ul className="list-disc space-y-1 pl-5">
              {DIY_SAFETY_STOP_IF.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>Then stop the DIY process. FixBridge can help you request a qualified service professional instead.</p>
          </div>

          <div className="mt-5 space-y-3">
            <ConsentCheckbox
              id="diy-safety-judgment-ack"
              checked={judgmentChecked}
              onChange={onJudgmentChange}
              label={DIY_SAFETY_JUDGMENT_LABEL}
            />
            <ConsentCheckbox
              id="diy-safety-ability-ack"
              checked={abilityChecked}
              onChange={onAbilityChange}
              label={DIY_SAFETY_ABILITY_LABEL}
            />
            <AcceptAllConsents
              id="diy-safety-accept-all"
              keys={DIY_SAFETY_ACKNOWLEDGMENT_KEYS}
              state={{
                DIY_SAFETY: judgmentChecked,
                DIY_SAFETY_ABILITY_ACK: abilityChecked,
              }}
              onChange={(next) => {
                onJudgmentChange(next.DIY_SAFETY === true);
                onAbilityChange(next.DIY_SAFETY_ABILITY_ACK === true);
              }}
            />
          </div>

          <a
            href={LEGAL_ROUTES.DIY_SAFETY_DISCLAIMER}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Read AI / DIY Safety Disclaimer
          </a>

          <div className="mt-5 rounded-xl border border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-semibold text-foreground">Not comfortable doing this yourself?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              If you are unsure, do not feel safe, do not have the proper tools or experience, or simply prefer not
              to perform the task yourself, FixBridge can help you request a professional.
            </p>
            <button
              type="button"
              onClick={onRequestProfessional}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 sm:w-auto"
            >
              Request a Professional
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-card/95 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={startRef}
            type="button"
            disabled={!canStart}
            onClick={onStartGuidedDiy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start Guided DIY
          </button>
        </div>
      </div>
    </div>
  );
}
