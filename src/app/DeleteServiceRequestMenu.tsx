import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical } from "lucide-react";
import type { ManagedJob } from "./managedJobs";
import { cancelHomeownerJob, canHomeownerCancelJob } from "./jobCancellation";

function requestName(job: ManagedJob) {
  return job.title?.trim() || job.category || "this service request";
}

export default function DeleteServiceRequestMenu({
  job,
  busy,
  onBusy,
  onDeleted,
}: {
  job: ManagedJob;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onDeleted: (job: ManagedJob) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const allowed = canHomeownerCancelJob(job);
  const name = requestName(job);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!allowed) return null;

  async function confirmDelete() {
    setError(null);
    onBusy(true);
    const result = await cancelHomeownerJob(job.id, {
      reasonCode: "other",
      notes: "Deleted from the service request details menu. Related records are kept.",
    });
    onBusy(false);
    if (!result.ok || !result.job) {
      setError(result.message || "Could not delete this service request.");
      return;
    }
    setConfirmOpen(false);
    onDeleted(result.job);
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Service request actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted/50"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-[0_8px_30px_rgba(30,40,50,0.08)]"
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-4 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-500/5 dark:text-red-300"
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setConfirmOpen(true);
              }}
            >
              Delete Service Request
            </button>
          </div>
        ) : null}
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-service-request-title"
        >
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-xl sm:rounded-3xl">
            <h2 id="delete-service-request-title" className="text-lg font-semibold">
              Delete Service Request?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Are you sure you want to delete “{name}”?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This hides the request from the homeowner view. Quotes, messages, payments, and Property Passport history are kept. This is not a permanent erasure of accounting records.
            </p>
            <p className="mt-2 text-sm font-medium">This action cannot be undone from this screen.</p>
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="h-12 rounded-full border border-border px-4 text-sm font-semibold"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Delete Request
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
