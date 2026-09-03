import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Landmark,
  Loader2,
  Wallet,
  Zap,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import ContractorPayoutAccountPanel from "./ContractorPayoutAccountPanel";
import {
  formatCents,
  type ContractorPayout,
  type PayoutAccount,
  type PayoutSummary,
  previewInstantPayout,
  requestInstantPayout,
} from "./managedJobs";
import { fetchMyReferrals } from "./referralsApi";
import StaleItemNotice from "./StaleItemNotice";

function statusBadge(status: string) {
  const label =
    {
      pending_job_completion: "Pending completion",
      pending_approval: "Pending approval",
      approved: "Approved",
      processing: "Processing",
      paid: "Paid",
      failed: "Failed",
      refunded: "Adjusted",
    }[status] || status;

  const tone =
    status === "paid" || status === "approved"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "failed"
        ? "bg-red-500/10 text-red-700 dark:text-red-400"
        : status === "processing"
          ? "bg-sky-500/10 text-sky-700"
          : "bg-amber-500/10 text-amber-800";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
  );
}

function InstantPayoutModal({
  payout,
  onClose,
  onDone,
}: {
  payout: ContractorPayout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<{
    availableCents: number;
    instantFeeCents: number;
    youReceiveCents: number;
    formatted: { available: string; instantFee: string; youReceive: string };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    previewInstantPayout(payout.id).then((r) => {
      setLoading(false);
      if (r.ok && r.availableCents != null) {
        setPreview({
          availableCents: r.availableCents,
          instantFeeCents: r.instantFeeCents,
          youReceiveCents: r.youReceiveCents,
          formatted: r.formatted,
        });
      } else {
        setError("Could not load instant payout preview.");
      }
    });
  }, [payout.id]);

  const confirm = async () => {
    setConfirming(true);
    setError("");
    const r = await requestInstantPayout(payout.id);
    setConfirming(false);
    if (!r.ok) {
      setError("Instant payout failed. Check your Stripe account and try again.");
      return;
    }
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[1.5rem] border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold">Instant payout</h3>
        <p className="mt-1 text-sm text-muted-foreground">{payout.jobRef}</p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : preview ? (
          <div className="mt-5 space-y-3 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Available payout</span>
              <span className="font-semibold tabular-nums">{preview.formatted.available}</span>
            </div>
            <div className="flex justify-between gap-3 text-red-600 dark:text-red-400">
              <span>Instant payout fee</span>
              <span className="font-semibold tabular-nums">-{preview.formatted.instantFee}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-3 text-base">
              <span className="font-semibold">You receive</span>
              <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {preview.formatted.youReceive}
              </span>
            </div>
          </div>
        ) : null}

        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            disabled={confirming || !preview}
            onClick={confirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-primary"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Get {preview?.formatted.youReceive || "paid"} now
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-border py-3 text-sm font-semibold">
            Use standard payout
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContractorPayoutsPanel({
  payouts,
  summary,
  account,
  onRefresh,
  initialSubTab = "earnings",
  stripeReturnMessage,
  initialPayoutId = null,
}: {
  payouts: ContractorPayout[];
  summary: PayoutSummary | null;
  account: PayoutAccount | null;
  onRefresh: () => Promise<void>;
  initialSubTab?: "earnings" | "account";
  stripeReturnMessage?: string | null;
  initialPayoutId?: number | null;
}) {
  const [subTab, setSubTab] = useState<"earnings" | "account">(initialSubTab);
  const [instantPayout, setInstantPayout] = useState<ContractorPayout | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(initialPayoutId);
  const [dismissedStale, setDismissedStale] = useState(false);

  useEffect(() => {
    if (initialPayoutId) {
      setSelectedId(initialPayoutId);
      setDismissedStale(false);
    }
  }, [initialPayoutId]);
  const [referralBonusCents, setReferralBonusCents] = useState(0);

  useEffect(() => {
    void fetchMyReferrals().then((r) => {
      if (r.ok && r.bonuses) setReferralBonusCents(Number(r.bonuses.pendingCents || 0) + Number(r.bonuses.paidCents || 0));
    });
  }, []);

  const selected = payouts.find((p) => p.id === selectedId) || null;
  const requestedPayoutMissing =
    !dismissedStale &&
    Boolean(initialPayoutId) &&
    payouts.length > 0 &&
    !payouts.some((p) => p.id === initialPayoutId);

  const nextPayoutDate = useMemo(() => {
    const approved = payouts.find((p) => p.status === "approved" && p.estimatedPayoutAt);
    if (approved?.estimatedPayoutAt) {
      return new Date(approved.estimatedPayoutAt).toLocaleDateString(undefined, { month: "long", day: "numeric" });
    }
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }, [payouts]);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Earnings / Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track job earnings, set up your payout account, and get paid.
        </p>
        {referralBonusCents > 0 ? (
          <p className="mt-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs">
            <span className="font-semibold">Homeowner Referral Bonus</span> ledger ·{" "}
            {formatCents(referralBonusCents)} tracked in Refer & Earn (separate from job earnings).
          </p>
        ) : null}
      </div>

      {requestedPayoutMissing ? (
        <StaleItemNotice
          onBack={() => {
            setDismissedStale(true);
            setSelectedId(null);
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          { id: "earnings" as const, label: "Earnings" },
          { id: "account" as const, label: "Payout account" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              subTab === t.id ? "bg-primary text-white" : "border border-border bg-card hover:border-primary/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "account" ? (
        <ContractorPayoutAccountPanel
          account={account}
          onRefresh={onRefresh}
          stripeReturnMessage={stripeReturnMessage}
        />
      ) : (
        <>
      {!account?.readyToReceivePayouts && (
        <div className="rounded-[1.5rem] border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
            Set up your payout account to receive job payments
          </p>
          <button
            type="button"
            onClick={() => setSubTab("account")}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            Go to Payout account →
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Available balance", value: formatCents(summary?.availableBalanceCents), icon: Wallet },
          { label: "Pending balance", value: formatCents(summary?.pendingBalanceCents), icon: Loader2 },
          { label: "Total earnings", value: formatCents(summary?.totalEarningsCents), icon: CheckCircle2 },
          { label: "Paid this month", value: formatCents(summary?.paidThisMonthCents), icon: Landmark },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-[1.5rem] border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
            </div>
            <p className="mt-2 [font-family:'Barlow_Condensed',sans-serif] text-3xl font-black tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {(summary?.availableBalanceCents || 0) > 0 && (
        <div className="rounded-[1.5rem] border border-emerald-200/80 bg-emerald-50/50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
            {formatCents(summary?.availableBalanceCents)} available for payout
          </p>
          <p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-400/80">
            Estimated arrival: <strong>{nextPayoutDate}</strong> (standard payout)
          </p>
        </div>
      )}

      <div className="rounded-[1.5rem] border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Payout history</h2>
        </div>
        {payouts.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No payouts yet. Completed jobs appear here after admin approval.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Job</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Completed</th>
                  <th className="px-4 py-3 font-semibold text-right">Job total</th>
                  <th className="px-4 py-3 font-semibold text-right">Platform fee</th>
                  <th className="px-4 py-3 font-semibold text-right">Instant fee</th>
                  <th className="px-4 py-3 font-semibold text-right">Net payout</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Payout date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{p.jobRef}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.customerLabel || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.completionDate ? new Date(p.completionDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(p.grossAmountCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                      -{formatCents(p.platformFeeCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                      {p.instantPayoutFeeCents ? `-${formatCents(p.instantPayoutFeeCents)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCents(p.netAmountCents)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.paidAt
                        ? new Date(p.paidAt).toLocaleDateString()
                        : p.estimatedPayoutAt
                          ? new Date(p.estimatedPayoutAt).toLocaleDateString()
                          : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Details <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payout details</p>
              <h3 className="text-xl font-semibold">{selected.jobRef}</h3>
              {statusBadge(selected.status)}
            </div>
            {selected.status === "approved" && account?.instantPayoutsEligible && (
              <button
                type="button"
                onClick={() => setInstantPayout(selected)}
                className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary"
              >
                <Zap className="h-4 w-4" /> Get paid instantly
              </button>
            )}
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex justify-between rounded-xl bg-muted/20 px-3 py-2.5">
              <dt className="text-muted-foreground">Job total</dt>
              <dd className="font-semibold tabular-nums">{formatCents(selected.grossAmountCents)}</dd>
            </div>
            <div className="flex justify-between rounded-xl bg-muted/20 px-3 py-2.5">
              <dt className="text-muted-foreground">FixBridge fee</dt>
              <dd className="font-semibold tabular-nums text-red-600">-{formatCents(selected.platformFeeCents)}</dd>
            </div>
            {selected.adjustmentsCents !== 0 && (
              <div className="flex justify-between rounded-xl bg-muted/20 px-3 py-2.5">
                <dt className="text-muted-foreground">Adjustments</dt>
                <dd className="font-semibold tabular-nums">{formatCents(selected.adjustmentsCents)}</dd>
              </div>
            )}
            <div className="flex justify-between rounded-xl bg-emerald-500/10 px-3 py-2.5 sm:col-span-2">
              <dt className="font-semibold">Your payout</dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-700">{formatCents(selected.netAmountCents)}</dd>
            </div>
          </dl>
          {selected.failureReason && (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {selected.failureReason}
            </p>
          )}
        </div>
      )}

        </>
      )}

      {subTab === "earnings" && instantPayout && (
        <InstantPayoutModal payout={instantPayout} onClose={() => setInstantPayout(null)} onDone={onRefresh} />
      )}
    </section>
  );
}

export function JobEarningsCard({
  payout,
  account,
  onViewPayouts,
  onInstant,
}: {
  payout: ContractorPayout | null;
  account: PayoutAccount | null;
  onViewPayouts: () => void;
  onInstant?: () => void;
}) {
  if (!payout) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your earnings</p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Job total</dt>
          <dd className="font-semibold tabular-nums">{formatCents(payout.grossAmountCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">FixBridge service fee</dt>
          <dd className="font-semibold tabular-nums text-red-600">-{formatCents(payout.platformFeeCents)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-border pt-2">
          <dt className="font-semibold">Your payout</dt>
          <dd className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCents(payout.netAmountCents)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 items-center">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{statusBadge(payout.status)}</dd>
        </div>
      </dl>
      {!account?.readyToReceivePayouts && (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Add a payout account in <button type="button" onClick={onViewPayouts} className="font-semibold underline">Payouts → Payout account</button> to receive this payment.
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onViewPayouts} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold">
          View payout
        </button>
        {payout.status === "approved" && account?.instantPayoutsEligible && onInstant && (
          <button
            type="button"
            onClick={onInstant}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
          >
            <Zap className="h-3.5 w-3.5" /> Get paid instantly
          </button>
        )}
      </div>
    </div>
  );
}
