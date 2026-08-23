import { useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  type PayoutAccount,
  connectPayoutAccount,
  managePayoutAccount,
  addPayoutBankAccount,
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

export default function ContractorPayoutAccountPanel({
  account,
  onRefresh,
  stripeReturnMessage,
}: {
  account: PayoutAccount | null;
  onRefresh: () => Promise<void>;
  stripeReturnMessage?: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const message = stripeReturnMessage || localMessage;
  const ready = account?.readyToReceivePayouts === true;

  const run = async (key: string, fn: () => Promise<{ ok: boolean; url?: string; message?: string; simulated?: boolean }>) => {
    setBusy(key);
    setLocalMessage(null);
    try {
      const r = await fn();
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      if (r.message) setLocalMessage(r.message);
      await onRefresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {message}
        </div>
      )}

      {!ready && (
        <div className="rounded-[1.5rem] border border-amber-200/80 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-950 dark:text-amber-200">Set up where you get paid</p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-300/80">
                Add your bank account or debit card through Stripe so job payouts can be deposited when approved.
                FixBridge never stores your full account numbers.
              </p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run("setup", connectPayoutAccount)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-primary"
              >
                {busy === "setup" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
                {account?.connected ? "Complete payout setup" : "Set up payout account"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Payout account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage deposit accounts securely through Stripe Connect.
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Instant payouts</p>
            <div className="mt-2">
              {statusPill(Boolean(account?.instantPayoutsEligible), "Available", "Standard only")}
            </div>
          </div>
        </div>

        {account?.requirementsDue && account.requirementsDue.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Stripe needs additional information</p>
            <ul className="mt-2 list-inside list-disc text-amber-800/90 dark:text-amber-300/90">
              {account.requirementsDue.slice(0, 5).map((req) => (
                <li key={req} className="text-xs capitalize">
                  {req.replace(/\./g, " · ")}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("setup", connectPayoutAccount)}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              Complete verification in Stripe →
            </button>
          </div>
        )}
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Deposit accounts</h3>
            <p className="text-sm text-muted-foreground">Where your job payouts are sent. Only last 4 digits are shown.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("add", addPayoutBankAccount)}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"
            >
              {busy === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add bank account
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || !account?.connected}
              onClick={() => run("manage", managePayoutAccount)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === "manage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Manage in Stripe
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {!account?.bankAccounts?.length ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No deposit account on file</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Add a bank account or eligible debit card to receive payouts when jobs are approved.
              </p>
            </div>
          ) : (
            account.bankAccounts.map((bank) => (
              <div
                key={bank.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3.5 ${
                  bank.defaultForCurrency ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
                    {bank.objectType === "card" ? <CreditCard className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {bank.bankName} ·••• {bank.last4}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {bank.objectType === "card" ? "Debit card" : "Bank account"} · {bank.currency?.toUpperCase()} ·{" "}
                      {bank.status}
                    </p>
                  </div>
                </div>
                {bank.defaultForCurrency && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    Default payout
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          To change your default payout account or add another bank, use Manage in Stripe — hosted by Stripe, not FixBridge.
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How payouts reach you</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
          <li>Complete a job → payout is created as pending admin approval</li>
          <li>Admin approves → funds transfer to your Stripe balance</li>
          <li>Stripe deposits to your default bank account (standard or instant)</li>
        </ol>
      </div>
    </div>
  );
}
