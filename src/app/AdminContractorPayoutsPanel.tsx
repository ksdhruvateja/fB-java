import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import {
  adminApprovePayout,
  adminAdjustPayout,
  adminListPayouts,
  adminPayoutsSummary,
  formatCents,
  type ContractorPayout,
} from "./managedJobs";

const TABS = [
  { id: "pending_approval", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "processing", label: "Processing" },
  { id: "paid", label: "Paid" },
  { id: "failed", label: "Failed" },
] as const;

function payoutStatusBadge(status: string) {
  const tone =
    status === "paid" || status === "approved"
      ? "bg-teal-500/10 text-teal-800"
      : status === "failed"
        ? "bg-red-500/10 text-red-700"
        : "bg-amber-500/10 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminContractorPayoutsPanel() {
  const [tab, setTab] = useState<string>("pending_approval");
  const [payouts, setPayouts] = useState<ContractorPayout[]>([]);
  const [summary, setSummary] = useState<{
    pendingApproval: { count: number; totalCents: number };
    approved: { count: number; totalCents: number };
    processing: { count: number; totalCents: number };
    paidThisMonth: number;
    failed: { count: number; totalCents: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContractorPayout | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    const [s, list] = await Promise.all([adminPayoutsSummary(), adminListPayouts(tab)]);
    if (s.ok) setSummary(s.summary);
    if (list.ok) setPayouts(list.payouts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tab]);

  const approve = async (id: number) => {
    setBusy(true);
    setMessage("");
    const adj = adjustment.trim() ? Math.round(Number(adjustment) * 100) : undefined;
    const r = await adminApprovePayout(id, adj);
    setBusy(false);
    if (!r.ok) {
      setMessage("Could not approve payout.");
      return;
    }
    setMessage("Payout approved and transfer initiated.");
    setSelected(null);
    setAdjustment("");
    await load();
  };

  const adjustOnly = async (id: number) => {
    setBusy(true);
    const cents = Math.round(Number(adjustment || 0) * 100);
    const r = await adminAdjustPayout(id, cents);
    setBusy(false);
    if (r.ok) {
      setMessage("Payout adjusted.");
      setSelected(r.payout);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contractor Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review, approve, and track contractor earnings.</p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Pending approval", value: formatCents(summary.pendingApproval.totalCents), sub: `${summary.pendingApproval.count} payouts` },
            { label: "Approved", value: formatCents(summary.approved.totalCents), sub: `${summary.approved.count} payouts` },
            { label: "Processing", value: formatCents(summary.processing.totalCents), sub: `${summary.processing.count} payouts` },
            { label: "Paid this month", value: formatCents(summary.paidThisMonth), sub: "Month to date" },
            { label: "Failed", value: formatCents(summary.failed.totalCents), sub: `${summary.failed.count} payouts` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold ${
              tab === t.id ? "bg-primary text-white" : "border border-border bg-card"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : payouts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No payouts in this tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Contractor</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3 text-right">Job amount</th>
                  <th className="px-4 py-3 text-right">Platform fee</th>
                  <th className="px-4 py-3 text-right">Contractor payout</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/15">
                    <td className="px-4 py-3">{p.contractorName || `#${p.contractorId}`}</td>
                    <td className="px-4 py-3 font-medium">{p.jobRef}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(p.grossAmountCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">-{formatCents(p.platformFeeCents)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCents(p.netAmountCents)}</td>
                    <td className="px-4 py-3 capitalize">{p.payoutMethod}</td>
                    <td className="px-4 py-3">{payoutStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Open
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
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-lg font-semibold">
            Payout · {selected.jobRef} · {selected.contractorName}
          </h3>
          <dl className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <dt>Customer payment</dt>
              <dd className="font-semibold tabular-nums">{formatCents(selected.grossAmountCents)}</dd>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2">
              <dt>Platform fee</dt>
              <dd className="font-semibold tabular-nums text-red-600">-{formatCents(selected.platformFeeCents)}</dd>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/20 px-3 py-2 sm:col-span-2">
              <dt>Contractor net earnings</dt>
              <dd className="font-bold tabular-nums text-emerald-700">{formatCents(selected.netAmountCents)}</dd>
            </div>
          </dl>

          {["pending_approval", "pending_job_completion"].includes(selected.status) && (
            <div className="space-y-3 border-t border-border pt-4">
              <label className="block text-sm">
                <span className="font-medium">Adjustment ($)</span>
                <input
                  type="number"
                  step="0.01"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full max-w-xs rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => adjustOnly(selected.id)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
                >
                  Adjust payout
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => approve(selected.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Approve payout
                </button>
              </div>
            </div>
          )}

          {selected.failureReason && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {selected.failureReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
