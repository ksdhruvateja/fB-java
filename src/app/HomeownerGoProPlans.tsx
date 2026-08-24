import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  formatPlanPrice,
  listGoProPlans,
  type ManagedSubscriptionPlan,
} from "./subscriptionPlansApi";

export type GoProPlanCard = {
  id: string;
  planCode: string;
  name: string;
  priceLabel: string;
  interval: string;
  theme: "light" | "blue" | "plum" | string;
  features: { label: string; included: boolean }[];
  cta: string;
  highlight?: boolean;
  unlocksDiy?: boolean;
  trialDays?: number;
};

function toCard(plan: ManagedSubscriptionPlan): GoProPlanCard {
  const { label, suffix } = formatPlanPrice(Number(plan.amount) || 0, plan.interval);
  return {
    id: plan.code,
    planCode: plan.code,
    name: plan.name,
    priceLabel: label,
    interval: suffix,
    theme: plan.theme || "light",
    features: Array.isArray(plan.features) ? plan.features : [],
    cta: plan.ctaLabel || "Select",
    highlight: Boolean(plan.highlight),
    unlocksDiy: Boolean(plan.unlocksDiy),
    trialDays: Number(plan.trialDays) || 0,
  };
}

function PlanCard({
  plan,
  busy,
  currentPlanCode,
  onSelect,
}: {
  plan: GoProPlanCard;
  busy?: boolean;
  currentPlanCode?: string | null;
  onSelect: (plan: GoProPlanCard) => void;
}) {
  const isCurrent = Boolean(plan.planCode && currentPlanCode === plan.planCode);
  const isLight = plan.theme === "light";
  const isBlue = plan.theme === "blue";

  const shell = isLight
    ? "bg-white text-slate-900 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28)]"
    : isBlue
      ? "bg-[#4A90D9] text-white shadow-[0_22px_44px_-16px_rgba(74,144,217,0.55)]"
      : "bg-[#8B5A7C] text-white shadow-[0_22px_44px_-16px_rgba(139,90,124,0.5)]";

  const priceColor = isLight ? "text-[#FF6B2C]" : "text-white";
  const ruleColor = isLight ? "border-[#FF6B2C]/70" : "border-white/55";
  const mutedCheck = isLight ? "text-slate-300" : "text-white/35";
  const activeCheck = isLight ? "text-[#FF6B2C]" : "text-white";
  const mutedText = isLight ? "text-slate-400" : "text-white/45";
  const activeText = isLight ? "text-slate-700" : "text-white";

  const buttonClass = isLight
    ? "bg-[#FF6B2C] text-white shadow-[0_10px_22px_-8px_rgba(255,107,44,0.7)] hover:brightness-105"
    : isBlue
      ? "bg-white text-[#4A90D9] shadow-[0_10px_22px_-8px_rgba(15,23,42,0.25)] hover:bg-white/95"
      : "bg-white text-[#FF6B2C] shadow-[0_10px_22px_-8px_rgba(15,23,42,0.25)] hover:bg-white/95";

  return (
    <article
      className={`flex h-full min-h-[420px] flex-col rounded-[1.75rem] px-7 py-8 ${shell} ${
        plan.highlight ? "scale-[1.02] lg:scale-105" : ""
      }`}
    >
      <h3 className="text-[1.35rem] font-bold tracking-tight">{plan.name}</h3>
      <p className={`mt-3 flex items-baseline gap-0.5 ${priceColor}`}>
        <span className="text-5xl font-extrabold leading-none tracking-tight">{plan.priceLabel}</span>
        <span className={`text-sm font-medium ${isLight ? "text-slate-400" : "text-white/70"}`}>
          {plan.interval}
        </span>
      </p>
      {plan.trialDays && plan.trialDays > 0 ? (
        <p className={`mt-2 text-xs font-semibold ${isLight ? "text-[#FF6B2C]" : "text-white/90"}`}>
          {plan.trialDays}-day free trial
        </p>
      ) : null}
      <div className={`mt-5 border-t ${ruleColor}`} />

      <ul className="mt-7 flex flex-1 flex-col gap-4">
        {plan.features.map((f) => (
          <li key={f.label} className="flex items-start gap-3">
            <Check
              size={18}
              strokeWidth={2.75}
              className={`mt-0.5 shrink-0 ${f.included ? activeCheck : mutedCheck}`}
            />
            <span className={`text-[0.95rem] leading-snug ${f.included ? activeText : mutedText}`}>
              {f.label}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy || isCurrent || !plan.planCode}
        onClick={() => onSelect(plan)}
        className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-semibold transition active:scale-[0.98] disabled:cursor-default disabled:opacity-70 ${buttonClass}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isCurrent ? "Current plan" : plan.cta}
      </button>
    </article>
  );
}

export default function HomeownerGoProPlans({
  currentPlanCode,
  busy,
  compact,
  onSelectPlan,
  onPlansLoaded,
}: {
  currentPlanCode?: string | null;
  busy?: boolean;
  compact?: boolean;
  onSelectPlan: (plan: GoProPlanCard) => void;
  onPlansLoaded?: (plans: GoProPlanCard[]) => void;
}) {
  const [plans, setPlans] = useState<GoProPlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listGoProPlans()
      .then((r) => {
        if (cancelled) return;
        const cards = (r.plans || []).map(toCard);
        setPlans(cards);
        onPlansLoaded?.(cards);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load plans.");
        setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
      </p>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-red-600">{error}</p>;
  }

  if (plans.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No subscription plans are available yet. Check back soon.
      </p>
    );
  }

  return (
    <section className={compact ? "space-y-4" : "mx-auto max-w-5xl space-y-6"}>
      {!compact && (
        <div className="text-center sm:text-left">
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Go Pro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the plan that fits your home — unlock DIY plans, health insights, and priority support.
          </p>
        </div>
      )}

      <div
        className={`grid gap-5 ${
          compact
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-1 md:grid-cols-3 md:items-stretch md:gap-6"
        }`}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.planCode}
            plan={plan}
            busy={busy}
            currentPlanCode={currentPlanCode}
            onSelect={onSelectPlan}
          />
        ))}
      </div>

      {!compact && plans.some((p) => (p.trialDays || 0) > 0) && (
        <p className="text-center text-xs text-muted-foreground">
          Plans with a free trial activate immediately on first signup. Cancel anytime.
        </p>
      )}
    </section>
  );
}
