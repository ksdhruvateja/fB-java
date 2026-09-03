import { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Paperclip } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { confirmCompletion } from "./managedJobs";
import { DISPUTE_CATEGORIES, reportJobProblem } from "./disputesApi";
import { readFileAsAttachment } from "./messagingApi";

export default function HomeownerJobCompletionPanel({
  job,
  onRefresh,
  onError,
  onBusy,
  existingDispute,
}: {
  job: ManagedJob;
  onRefresh: () => void | Promise<void>;
  onError: (msg: string | null) => void;
  onBusy: (busy: boolean) => void;
  existingDispute?: boolean;
}) {
  const [mode, setMode] = useState<"choose" | "report">("choose");
  const [category, setCategory] = useState("work_incomplete");
  const [description, setDescription] = useState("");
  const [preferredResolution, setPreferredResolution] = useState("");
  const [attachments, setAttachments] = useState<Array<{ fileName: string; mimeType: string; data: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(Boolean(job.customerConfirmedAt));

  const canAct =
    ["work_completed", "customer_review_pending", "admin_review_pending", "payout_pending", "paid_out", "closed"].includes(
      String(job.status),
    ) && !existingDispute;

  if (!canAct) return null;

  async function handleConfirm() {
    onBusy(true);
    setBusy(true);
    onError(null);
    try {
      const r = await confirmCompletion(job.id);
      if (!r.ok) {
        onError("Could not confirm completion.");
        return;
      }
      setConfirmed(true);
      await onRefresh();
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      onError("Please describe the problem.");
      return;
    }
    onBusy(true);
    setBusy(true);
    onError(null);
    try {
      await reportJobProblem(job.id, {
        category,
        description: description.trim(),
        preferredResolution: preferredResolution.trim() || undefined,
        attachments,
      });
      setMode("choose");
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit report.");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  if (existingDispute) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-semibold text-amber-800 dark:text-amber-200">Service concern under review</p>
        <p className="mt-1 text-muted-foreground">Our team is reviewing your report. We&apos;ll follow up soon.</p>
      </div>
    );
  }

  if (mode === "report") {
    return (
      <form onSubmit={handleReport} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Report a problem</p>
        <label className="block text-xs font-medium text-muted-foreground">
          What went wrong?
          <select
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {DISPUTE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Description
          <textarea
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell us what happened…"
            required
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Preferred resolution (optional)
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={preferredResolution}
            onChange={(e) => setPreferredResolution(e.target.value)}
            placeholder="e.g. return visit, partial refund, rework"
          />
        </label>
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            Add photos or files
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).slice(0, 5);
                const next = [...attachments];
                for (const f of files) {
                  const att = await readFileAsAttachment(f);
                  next.push(att);
                }
                setAttachments(next.slice(0, 5));
              }}
            />
          </label>
          {attachments.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{attachments.length} file(s) attached</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-border px-4 py-2 text-sm"
            onClick={() => setMode("choose")}
            disabled={busy}
          >
            Back
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
            Submit report
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">Service completed</p>
      <p className="text-sm text-muted-foreground">
        Please confirm the work met your expectations, or let us know if something needs attention.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy || confirmed}
          onClick={() => void handleConfirm()}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          {confirmed ? "Completion confirmed" : "Confirm service completed"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode("report")}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="h-4 w-4" />
          Report a problem
        </button>
      </div>
    </div>
  );
}
