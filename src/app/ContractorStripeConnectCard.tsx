import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  type PayoutAccount,
  connectPayoutAccount,
  managePayoutAccount,
  refreshPayoutAccount,
} from "./managedJobs";

function statusPill(ok: boolean, yes: string, no: string) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {ok ? yes : no}
    </span>
  );
}

export default function ContractorStripeConnectCard({
  account,
  onRefresh,
  stripeReturnMessage,
  compact = false,
}: {
  account: PayoutAccount | null;
  onRefresh: () => Promise<void>;
  stripeReturnMessage?: string | null;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const message = stripeReturnMessage || localMessage;
  const ready = account?.readyToReceivePayouts === true;
  const needsOnboarding = !ready;

  const primaryLabel = !account?.connected
    ? "Complete Stripe Account Link"
    : needsOnboarding
      ? "Complete Stripe Account Link"
      : "Update payout details in Stripe";

  const run = async (key: string, fn: () => Promise<{ ok: boolean; url?: string; message?: string }>) => {
    setBusy(key);
    setLocalMessage(null);
    try {
      const r = await fn();
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      if (!r.ok && r.message) {
        setLocalMessage(r.message);
      } else if (r.message) {
        setLocalMessage(r.message);
      }
      await onRefresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`rounded-[1.5rem] border border-border bg-card ${compact ? "p-4" : "p-5 sm:p-6"} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Stripe payout account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete Stripe-hosted onboarding to receive job payouts. FixBridge never stores your full bank details.
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => run("refresh", refreshPayoutAccount)}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/50"
        >
          {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh status
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {message}
        </div>
      )}

      {needsOnboarding && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-950 dark:text-amber-200">
                {account?.connectStatus?.blockedReason === "TOS_NOT_ACCEPTED"
                  ? "Complete Stripe onboarding"
                  : "Action required"}
              </p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">
                {account?.connectStatus?.blockedReason === "TOS_NOT_ACCEPTED"
                  ? "Accept Stripe Terms of Service and finish identity verification to receive payouts."
                  : "Use the Stripe Account Link below to verify your identity and add a deposit account. This is required before FixBridge can transfer your earnings."}
              </p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run("link", connectPayoutAccount)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-primary"
              >
                {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                {primaryLabel}
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stripe connected</p>
          <div className="mt-2">{statusPill(Boolean(account?.connected), "Connected", "Not connected")}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Verification</p>
          <div className="mt-2">
            {statusPill(account?.verificationStatus === "verified", "Verified", "Action required")}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payout eligibility</p>
          <div className="mt-2">{statusPill(Boolean(account?.payoutsEnabled), "Eligible", "Not eligible yet")}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ready for transfers</p>
          <div className="mt-2">{statusPill(ready, "Ready", "Setup required")}</div>
        </div>
      </div>

      {(account?.connectStatus?.currentlyDue?.length || account?.requirementsDue?.length) ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-900 dark:text-amber-200">Stripe needs additional information</p>
          {account.connectStatus?.blockedReason && (
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
              Status: {account.connectStatus.blockedReason.replace(/_/g, " ")}
            </p>
          )}
          <ul className="mt-2 list-inside list-disc text-amber-800/90 dark:text-amber-300/90">
            {(account.connectStatus?.currentlyDue || account.requirementsDue || []).slice(0, 5).map((req) => (
              <li key={req} className="text-xs capitalize">
                {req.replace(/\./g, " · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {account?.connected && (
        <div className="flex flex-wrap gap-2">
          {!ready ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("link", connectPayoutAccount)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Complete Stripe Account Link
            </button>
          ) : (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("manage", managePayoutAccount)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted/40 disabled:opacity-60"
            >
              {busy === "manage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage in Stripe
            </button>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        You will be redirected to Stripe to securely add or update your payout account. Return here and click Refresh
        status when finished.
      </p>
    </div>
  );
}
