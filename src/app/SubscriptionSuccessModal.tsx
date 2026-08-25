import { Check, Sparkles, X } from "lucide-react";
import type { GoProPlanCard } from "./HomeownerGoProPlans";

export default function SubscriptionSuccessModal({
  open,
  plan,
  onClose,
  onViewFeatures,
}: {
  open: boolean;
  plan?: GoProPlanCard | null;
  onClose: () => void;
  onViewFeatures?: () => void;
}) {
  if (!open) return null;

  const included = plan?.features.filter((f) => f.included) || [];

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
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <h2 className="mt-4 text-xl font-bold">Payment successful!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {plan
              ? `Your ${plan.name} subscription is active. These features are now unlocked:`
              : "Your subscription is active. These features are now unlocked:"}
          </p>
        </div>

        <ul className="mt-5 space-y-2 rounded-xl border border-border bg-muted/30 p-4">
          {(included.length ? included : [
            { label: "Service request tracking", included: true },
            { label: "Property health score", included: true },
            { label: "Live chat & support", included: true },
            { label: "AI DIY Action Plans", included: true },
          ]).map((f) => (
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
          Start using your Pro features
        </button>
      </div>
    </div>
  );
}
