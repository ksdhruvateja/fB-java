import { useEffect, useMemo, useState } from "react";
import { ChevronRight, CreditCard, DollarSign, Loader2, Receipt } from "lucide-react";
import { formatMoney, type ManagedJob, type Property } from "./managedJobs";
import { getMyTransactions } from "./platformApi";

type PaymentFilter = "all" | "pending" | "holds" | "paid" | "failed";

const FILTERS: { id: PaymentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "pending", label: "Pending" },
  { id: "holds", label: "Holds" },
  { id: "failed", label: "Failed" },
];

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string): { label: string; className: string } {
  const s = String(status || "").toLowerCase();
  if (s === "succeeded" || s === "paid" || s === "captured") {
    return { label: "PAID", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" };
  }
  if (s === "authorized") {
    return { label: "HOLD", className: "bg-sky-500/15 text-sky-800 dark:text-sky-300" };
  }
  if (s === "pending") {
    return { label: "PENDING", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" };
  }
  if (s === "failed" || s === "cancelled" || s === "canceled") {
    return { label: s === "failed" ? "FAILED" : "CANCELLED", className: "bg-red-500/15 text-red-700 dark:text-red-300" };
  }
  if (s.includes("refund")) {
    return { label: "REFUNDED", className: "bg-muted text-muted-foreground" };
  }
  return { label: s.toUpperCase() || "—", className: "bg-muted text-muted-foreground" };
}

export default function HomeownerPaymentsPanel({
  jobs,
  properties,
  onOpenJob,
}: {
  jobs: ManagedJob[];
  properties: Property[];
  onOpenJob?: (jobId: number) => void;
}) {
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<
    Awaited<ReturnType<typeof getMyTransactions>>["transactions"]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await getMyTransactions();
      if (!cancelled && r.ok) setTransactions(r.transactions || []);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs.length]);

  const filtered = useMemo(() => {
    return (transactions || []).filter((t) => {
      const s = String(t.status || "").toLowerCase();
      if (filter === "all") return true;
      if (filter === "paid") return ["succeeded", "paid", "captured"].includes(s);
      if (filter === "pending") return s === "pending";
      if (filter === "holds") return s === "authorized";
      if (filter === "failed") return ["failed", "cancelled", "canceled"].includes(s);
      return true;
    });
  }, [transactions, filter]);

  const totalPaid = useMemo(
    () =>
      (transactions || [])
        .filter((t) => ["succeeded", "paid", "captured"].includes(String(t.status).toLowerCase()))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [transactions]
  );

  void properties;

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase tracking-tight">
          Transaction History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan payments, service charges, and receipts — updated when Stripe confirms payment.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transactions</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{transactions.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.id ? "bg-primary text-white" : "border border-border bg-card hover:bg-muted/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <CreditCard className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No transactions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Successful Stripe payments appear here automatically — no admin entry required.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => {
            const badge = statusBadge(t.status);
            return (
              <li key={t.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</p>
                    <p className="mt-1 text-sm font-semibold">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{t.typeLabel}</p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      Transaction: {t.transactionId}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-semibold tabular-nums">{formatMoney(t.amount)}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.jobId && onOpenJob ? (
                    <button
                      type="button"
                      onClick={() => onOpenJob(t.jobId!)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      View related job <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {["succeeded", "paid", "captured"].includes(String(t.status).toLowerCase()) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Receipt className="h-3.5 w-3.5" /> Receipt on file
                    </span>
                  ) : null}
                  {t.paymentType === "subscription" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="h-3.5 w-3.5" /> Plan payment
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
