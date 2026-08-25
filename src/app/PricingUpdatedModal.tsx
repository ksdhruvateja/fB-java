import { Info, X } from "lucide-react";

export default function PricingUpdatedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-amber-300/50 bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">We&apos;ve updated our pricing</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Our Go Pro plan prices have changed. Review the updated plans below before you subscribe.
              Existing subscribers keep their current rate until renewal.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex rounded-lg bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
            >
              View updated plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
