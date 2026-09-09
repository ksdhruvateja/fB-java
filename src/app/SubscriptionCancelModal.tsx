import { AlertCircle, X } from "lucide-react";

export default function SubscriptionCancelModal({
  open,
  onClose,
  onTryAgain,
}: {
  open: boolean;
  onClose: () => void;
  onTryAgain?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
            <AlertCircle className="h-8 w-8" strokeWidth={2} />
          </div>
          <h2 className="mt-4 text-xl font-bold">Payment Not Completed</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your plan has not been activated. No successful transaction was recorded.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onTryAgain?.();
              onClose();
            }}
            className="inline-flex w-full items-center justify-center rounded-xl bg-[#FF4D1C] px-4 py-3 text-sm font-semibold text-white"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
