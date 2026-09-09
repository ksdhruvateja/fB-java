import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import HomeownerGoProPlans, { type GoProPlanCard } from "./HomeownerGoProPlans";
import SubscriptionSuccessModal from "./SubscriptionSuccessModal";
import { startSubscription } from "./platformApi";
import type { AuthUser } from "./auth";

export default function GoProPublicPage({
  onBack,
  onLoginSuccess,
  currentUser,
}: {
  onBack: () => void;
  onLoginSuccess?: (user: AuthUser) => void;
  currentUser?: AuthUser | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPlan, setSuccessPlan] = useState<GoProPlanCard | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loadedPlans, setLoadedPlans] = useState<GoProPlanCard[]>([]);

  const isAuthenticated = Boolean(currentUser?.role === "homeowner");

  const handleAuthenticatedCheckout = useCallback(async (planCode: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await startSubscription(planCode);
      if (!r.ok) {
        setError(r.message || "Could not start checkout.");
        return;
      }
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setError("Stripe checkout could not be started. Check payment configuration.");
    } finally {
      setBusy(false);
    }
  }, [currentUser, loadedPlans, onLoginSuccess]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <HomeownerGoProPlans
          currentPlanCode={currentUser?.planCode}
          busy={busy}
          isAuthenticated={isAuthenticated}
          onAuthenticatedCheckout={handleAuthenticatedCheckout}
          onPlansLoaded={setLoadedPlans}
          onSubscribeSuccess={(user) => {
            onLoginSuccess?.(user);
          }}
          checkPricingUpdates
          showFeatureMatrix
        />
      </div>

      <SubscriptionSuccessModal
        open={showSuccess}
        plan={successPlan}
        onClose={() => setShowSuccess(false)}
        onViewFeatures={() => onLoginSuccess?.(currentUser!)}
      />
    </div>
  );
}
