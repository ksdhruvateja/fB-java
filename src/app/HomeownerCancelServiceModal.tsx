import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import {
  CANCELLATION_REASONS,
  cancelHomeownerJob,
  cancelServiceLabel,
  type CancellationReasonCode,
} from "./jobCancellation";

type Props = {
  open: boolean;
  job: ManagedJob;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onClose: () => void;
  onCancelled: (job: ManagedJob) => void;
  onReschedule: () => void;
  onEditRequest: () => void;
  onReviewQuote?: () => void;
  canEditRequest: boolean;
  hasQuote: boolean;
};

const RESOLVED_FOLLOW_UP = [
  { value: "on_own", label: "Resolved on its own" },
  { value: "someone_else", label: "Someone else fixed it" },
  { value: "other", label: "Other" },
] as const;

export default function HomeownerCancelServiceModal({
  open,
  job,
  busy,
  onBusy,
  onClose,
  onCancelled,
  onReschedule,
  onEditRequest,
  onReviewQuote,
  canEditRequest,
  hasQuote,
}: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [resolvedFollowUp, setResolvedFollowUp] = useState("");
  const [hiredOther, setHiredOther] = useState<"" | "yes" | "no">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setReasonCode("");
    setResolvedFollowUp("");
    setHiredOther("");
    setNotes("");
    setError(null);
    setSuccess(false);
    const t = window.setTimeout(() => firstFocusRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, job.id]);

  if (!open) return null;

  const reason = CANCELLATION_REASONS.find((r) => r.code === reasonCode);
  const assigned = Boolean(job.assignedContractorUserId || job.technician?.id);

  async function submitCancellation() {
    if (!reasonCode) {
      setError("Please choose a reason.");
      return;
    }
    setError(null);
    onBusy(true);
    const details: Record<string, unknown> = {};
    if (reasonCode === "resolved" && resolvedFollowUp) details.resolvedHow = resolvedFollowUp;
    if (reasonCode === "other_provider" && hiredOther) details.hiredOtherProvider = hiredOther === "yes";
    const r = await cancelHomeownerJob(job.id, {
      reasonCode,
      notes: notes.trim() || undefined,
      details,
    });
    onBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not cancel service.");
      return;
    }
    setSuccess(true);
    if (r.job) onCancelled(r.job);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-service-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h2 id="cancel-service-title" className="text-lg font-semibold">
              {success ? "Service cancelled" : "Cancel this service request?"}
            </h2>
            {!success ? (
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll notify FixBridge{assigned ? " and the service provider if one has already been assigned" : ""}.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {assigned
                  ? "We've notified FixBridge and your assigned provider."
                  : "Your service request has been cancelled."}
              </p>
            )}
          </div>
          <button
            type="button"
            ref={firstFocusRef}
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {success ? null : (
            <>
              <p className="text-sm font-semibold">Why are you cancelling?</p>
              <div className="mt-3 space-y-2">
                {CANCELLATION_REASONS.map((opt) => (
                  <label
                    key={opt.code}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                      reasonCode === opt.code
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancel-reason"
                      className="mt-1"
                      checked={reasonCode === opt.code}
                      onChange={() => setReasonCode(opt.code)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              {reasonCode === "resolved" ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Was the issue resolved on its own or did someone else fix it? (optional)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {RESOLVED_FOLLOW_UP.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setResolvedFollowUp(opt.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          resolvedFollowUp === opt.value
                            ? "bg-primary text-white"
                            : "border border-border"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {reasonCode === "schedule_conflict" ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Would you rather reschedule instead?</p>
                  <button
                    type="button"
                    className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      onClose();
                      onReschedule();
                    }}
                  >
                    Reschedule Instead
                  </button>
                </div>
              ) : null}

              {reasonCode === "other_provider" ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">Did you already hire another provider? (optional)</p>
                  <div className="flex gap-2">
                    {(["yes", "no"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHiredOther(v)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${
                          hiredOther === v ? "bg-primary text-white" : "border border-border"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {reasonCode === "price" && hasQuote ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Would you like FixBridge to review the quote before you cancel?</p>
                  <button
                    type="button"
                    className="mt-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold"
                    onClick={() => {
                      onClose();
                      onReviewQuote?.();
                    }}
                  >
                    Review Quote
                  </button>
                </div>
              ) : null}

              {reasonCode === "change_request" && canEditRequest ? (
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">You can update your request instead of cancelling.</p>
                  <button
                    type="button"
                    className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      onClose();
                      onEditRequest();
                    }}
                  >
                    Edit Request Instead
                  </button>
                </div>
              ) : null}

              {reasonCode === "provider_issue" || reasonCode === "other" ? (
                <div className="mt-4">
                  <label className="text-sm text-muted-foreground">
                    {reasonCode === "provider_issue" ? "Tell us what happened (optional)" : "Tell us why you're cancelling (optional)"}
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {job.sourceRecurringServiceId ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  This only cancels this visit. Your recurring plan stays active unless you cancel it separately.
                </p>
              ) : null}

              {error ? (
                <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          {success ? (
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              onClick={onClose}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
                onClick={onClose}
                disabled={busy}
              >
                Keep Service
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                disabled={busy || !reason}
                onClick={() => void submitCancellation()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {cancelServiceLabel(job)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
