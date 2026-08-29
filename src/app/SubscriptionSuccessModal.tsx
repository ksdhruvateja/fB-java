import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { GoProPlanCard } from "./HomeownerGoProPlans";

export default function SubscriptionSuccessModal({
  open,
  plan,
  activating = false,
  onClose,
  onViewFeatures,
}: {
  open: boolean;
  plan?: GoProPlanCard | null;
  /** True while waiting for Stripe webhook to activate the plan. */
  activating?: boolean;
  onClose: () => void;
  onViewFeatures?: () => void;
}) {
  if (!open) return null;

  const included = plan?.features.filter((f) => f.included) || [];
  const planName = plan?.name || "HomeCare Pro";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          {activating ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-600">
                <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2.5} />
              </div>
              <h2 className="mt-4 text-xl font-bold">Payment Successful</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Confirming your HomeCare Pro membership… This uses verified Stripe billing, not the return URL
                alone.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <Check className="h-8 w-8" strokeWidth={2.5} />
              </div>
              <h2 className="mt-4 text-xl font-bold">Payment Successful</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {planName} is now active.
              </p>
            </>
          )}
        </div>

        {!activating ? (
          <>
            <ul className="mt-5 space-y-2 rounded-xl border border-border bg-muted/30 p-4">
              {(included.length
                ? included
                : [
                    { label: "Property-aware AI", included: true },
                    { label: "Maintenance calendar", included: true },
                    { label: "Warranty & document vault", included: true },
                    { label: "Priority request routing", included: true },
                    { label: "Annual AI Home Health Report", included: true },
                  ]
              ).map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#FF4D1C]" />
                  {f.label}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => {
                onViewFeatures?.();
                onClose();
              }}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#FF4D1C] px-4 py-3 text-sm font-semibold text-white"
            >
              Start using HomeCare Pro
            </button>
          </>
        ) : (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Do not refresh — activation uses the verified payment webhook as the source of truth.
          </p>
        )}
      </div>
    </div>
  );
}
