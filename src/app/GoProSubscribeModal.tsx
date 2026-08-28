import { useState, type FormEvent } from "react";
import { Loader2, X, CreditCard } from "lucide-react";
import { guestSubscriptionCheckout } from "./platformApi";
import { saveSession, type AuthUser } from "./auth";
import type { GoProPlanCard } from "./HomeownerGoProPlans";

export default function GoProSubscribeModal({
  plan,
  open,
  busy,
  isAuthenticated,
  onClose,
  onAuthenticatedCheckout,
  onSuccess,
}: {
  plan: GoProPlanCard | null;
  open: boolean;
  busy?: boolean;
  isAuthenticated?: boolean;
  onClose: () => void;
  onAuthenticatedCheckout: (planCode: string) => Promise<void>;
  onSuccess?: (user: AuthUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !plan) return null;

  const isFreePlan = plan.amount <= 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan?.planCode || isFreePlan) return;
    setError(null);

    if (isAuthenticated) {
      setLoading(true);
      try {
        await onAuthenticatedCheckout(plan.planCode);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start checkout.");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const r = await guestSubscriptionCheckout({
        planCode: plan.planCode,
        email: email.trim(),
        name: name.trim(),
        password,
      });
      if (!r.ok) {
        setError(r.message || "Could not start checkout.");
        return;
      }
      if (r.token && r.user) {
        saveSession(r.token, r.user);
        onSuccess?.(r.user);
      }
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setError("Stripe checkout could not be started. Check payment configuration.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || busy;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-[#FF4D1C]">
          <CreditCard className="h-5 w-5" />
          <h2 className="text-lg font-semibold text-foreground">Subscribe to {plan.name}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.priceLabel}
          {plan.interval} — secure payment via Stripe
        </p>

        <ul className="mt-4 space-y-1.5 rounded-lg bg-muted/40 p-3 text-sm">
          {plan.features.filter((f) => f.included).map((f) => (
            <li key={f.label} className="flex items-center gap-2">
              <span className="text-emerald-600">✓</span>
              {f.label}
            </li>
          ))}
        </ul>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-3">
          {!isAuthenticated && (
            <>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Full name</span>
                <input
                  className="rounded-md border border-border bg-background px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Email</span>
                <input
                  type="email"
                  className="rounded-md border border-border bg-background px-3 py-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Password</span>
                <input
                  type="password"
                  className="rounded-md border border-border bg-background px-3 py-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={email ? "current-password" : "new-password"}
                  placeholder="Min. 6 characters"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                New here? We&apos;ll create your account, then redirect you to Stripe to complete payment.
              </p>
            </>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Continue to Stripe
          </button>
        </form>
      </div>
    </div>
  );
}
