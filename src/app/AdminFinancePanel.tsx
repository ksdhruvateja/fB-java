import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { formatMoney, adminPayments } from "./managedJobs";
import { getFinanceOverview } from "./platformApi";
import { api } from "./platformApi";
import AdminContractorPayoutsPanel from "./AdminContractorPayoutsPanel";
import AdminOrderLedgerPanel from "./AdminOrderLedgerPanel";

type FinanceTab = "overview" | "payments" | "payouts" | "profitability" | "invoices" | "refunds";
type DateRange = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

const TABS: { id: FinanceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "payouts", label: "Payouts" },
  { id: "profitability", label: "Profitability" },
  { id: "invoices", label: "Invoices" },
  { id: "refunds", label: "Refunds" },
];

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "custom", label: "Custom" },
];

const cardClass = "rounded-2xl border border-border/70 bg-card shadow-sm p-5";
const tabBtn = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
    active ? "bg-[#FF4D1C] text-white" : "hover:bg-muted/50 text-muted-foreground"
  }`;

function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s.includes("succeed") || s === "paid"
      ? "bg-emerald-500/15 text-emerald-700"
      : s.includes("fail") || s.includes("refund")
        ? "bg-red-500/15 text-red-700"
        : s.includes("pending")
          ? "bg-amber-500/15 text-amber-700"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{status}</span>;
}

export default function AdminFinancePanel({
  onMessage,
  initialPayoutId = null,
}: {
  onMessage: (msg: string) => void;
  initialPayoutId?: number | null;
}) {
  const [subTab, setSubTab] = useState<FinanceTab>(initialPayoutId ? "payouts" : "overview");
  const [range, setRange] = useState<DateRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    if (initialPayoutId) setSubTab("payouts");
  }, [initialPayoutId]);

  useEffect(() => {
    if (subTab !== "overview") return;
    let cancelled = false;
    (async () => {
      setLoadingOverview(true);
      const r = await getFinanceOverview(range, customFrom, customTo);
      if (!cancelled && r.ok) setOverview(r.summary || null);
      setLoadingOverview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subTab, range, customFrom, customTo]);

  useEffect(() => {
    if (subTab !== "invoices") return;
    let cancelled = false;
    (async () => {
      setLoadingInvoices(true);
      const r = await api<{ ok: boolean; invoices: Array<Record<string, unknown>> }>("/api/admin/finance/invoices");
      if (!cancelled && r.ok) setInvoices(r.invoices || []);
      setLoadingInvoices(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subTab]);

  useEffect(() => {
    if (subTab !== "payments" && subTab !== "refunds") return;
    let cancelled = false;
    (async () => {
      setLoadingPayments(true);
      const r = await adminPayments();
      if (!cancelled && r.ok) setPayments((r.payments || []) as Record<string, unknown>[]);
      setLoadingPayments(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subTab]);

  const filteredPayments = useMemo(() => {
    let rows = payments;
    if (subTab === "refunds") {
      rows = rows.filter((p) => Number(p.amount) < 0 || String(p.payment_type || "").includes("refund"));
    }
    if (paymentFilter === "paid") rows = rows.filter((p) => String(p.status) === "succeeded" && Number(p.amount) > 0);
    if (paymentFilter === "pending") rows = rows.filter((p) => String(p.status).includes("pending"));
    if (paymentFilter === "failed") rows = rows.filter((p) => String(p.status).includes("fail"));
    if (paymentFilter === "refunded") rows = rows.filter((p) => Number(p.amount) < 0);
    if (paymentFilter === "manual") rows = rows.filter((p) => String(p.provider) === "manual" || p.simulated);
    if (paymentFilter === "stripe") rows = rows.filter((p) => String(p.provider || "stripe") === "stripe" && !p.simulated);
    const q = paymentSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) =>
        JSON.stringify(p).toLowerCase().includes(q)
      );
    }
    return rows;
  }, [payments, paymentFilter, paymentSearch, subTab]);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer payments, contractor payouts, profitability, invoices, and refunds in one workspace.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setSubTab(t.id)} className={tabBtn(subTab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {(subTab === "overview" || subTab === "profitability") && (
        <div className="flex flex-wrap items-end gap-2">
          {RANGE_OPTIONS.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)} className={tabBtn(range === r.id)}>
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" className="rounded-lg border border-border px-2 py-1 text-xs" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input type="date" className="rounded-lg border border-border px-2 py-1 text-xs" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
        </div>
      )}

      {subTab === "overview" && (
        loadingOverview ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Customer Payments", value: overview?.customerPayments },
              { label: "Contractor Payables", value: overview?.contractorPayables },
              { label: "Contractor Payouts", value: overview?.contractorPayouts },
              { label: "Outstanding Invoices", value: overview?.outstandingInvoices },
              { label: "Refunds", value: overview?.refunds },
              { label: "Gross Revenue", value: overview?.grossRevenue },
              { label: "Direct Contractor Cost", value: overview?.directContractorCost },
              { label: "Platform Contribution", value: overview?.platformContribution },
              { label: "Estimated Net Profit", value: overview?.estimatedNetProfit },
            ].map((item) => (
              <div key={item.label} className={cardClass}>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(Number(item.value || 0))}</p>
              </div>
            ))}
          </div>
        )
      )}

      {(subTab === "payments" || subTab === "refunds") && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
              placeholder="Search homeowner, invoice #, job #, payment ID…"
              value={paymentSearch}
              onChange={(e) => setPaymentSearch(e.target.value)}
            />
          </div>
          {subTab === "payments" && (
            <div className="flex flex-wrap gap-2">
              {["all", "paid", "pending", "failed", "refunded", "manual", "stripe"].map((f) => (
                <button key={f} type="button" onClick={() => setPaymentFilter(f)} className={tabBtn(paymentFilter === f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {loadingPayments ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : filteredPayments.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payments found.</td></tr>
                ) : (
                  filteredPayments.map((p, idx) => (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="px-4 py-3 font-mono text-xs">{String(p.public_id || p.id)}</td>
                      <td className="px-4 py-3">{String((p.meta as Record<string, unknown>)?.invoiceNumber || "—")}</td>
                      <td className="px-4 py-3">{p.job_id != null ? `#${String(p.job_id)}` : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(Number(p.amount))}</td>
                      <td className="px-4 py-3 capitalize">{p.simulated ? "manual" : String(p.provider || "stripe")}</td>
                      <td className="px-4 py-3"><StatusBadge status={String(p.status)} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">{p.created_at ? new Date(String(p.created_at)).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "payouts" && <AdminContractorPayoutsPanel initialPayoutId={initialPayoutId} />}
      {subTab === "profitability" && <AdminOrderLedgerPanel onMessage={onMessage} />}
      {subTab === "invoices" && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Homeowner</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loadingInvoices ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No invoices.</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={String(inv.id)}>
                    <td className="px-4 py-3">{String(inv.invoiceNumber)}</td>
                    <td className="px-4 py-3">{String(inv.homeownerName || "—")}</td>
                    <td className="px-4 py-3">#{String(inv.jobId)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(Number(inv.total))}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(Number(inv.paid))}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(Number(inv.amountDue))}</td>
                    <td className="px-4 py-3 uppercase text-xs">{String(inv.status)}</td>
                    <td className="px-4 py-3">{inv.dueDate ? new Date(String(inv.dueDate)).toLocaleDateString() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
