import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, BookOpen, ArrowDownLeft, ArrowUpRight, FileText } from "lucide-react";
import { adminOrderLedger, formatMoney } from "./managedJobs";

type LedgerEvent = {
  kind: "quote" | "payment" | "payout";
  date?: string | null;
  jobId?: number;
  bookingId?: string | null;
  quoteNumber?: string | null;
  quoteStatus?: string | null;
  jobStatus?: string | null;
  homeownerName?: string | null;
  contractorName?: string | null;
  createdByName?: string | null;
  aiEstimateLow?: number | null;
  aiEstimateHigh?: number | null;
  contractorQuote?: number | null;
  customerQuote?: number | null;
  platformMargin?: number | null;
  expectedMarginPct?: number | null;
  processingCost?: number | null;
  paymentType?: string;
  status?: string;
  amount?: number;
  simulated?: boolean;
  grossAmount?: number;
  feeAmount?: number;
  description?: string;
};

type OrderRow = {
  jobId: number;
  bookingId?: string | null;
  quoteNumber?: string | null;
  jobStatus?: string;
  quoteStatus?: string | null;
  homeownerName?: string | null;
  contractorName?: string | null;
  createdByName?: string | null;
  publishedAt?: string | null;
  approvedAt?: string | null;
  aiEstimateLow?: number | null;
  aiEstimateHigh?: number | null;
  contractorQuote?: number | null;
  customerQuote?: number | null;
  platformMargin?: number | null;
  expectedMarginPct?: number | null;
  moneyReceived?: number;
  moneyPending?: number;
  contractorPaidOut?: number;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function kindIcon(kind: string) {
  if (kind === "quote") return <FileText className="h-4 w-4 text-sky-600" />;
  if (kind === "payment") return <ArrowDownLeft className="h-4 w-4 text-emerald-600" />;
  return <ArrowUpRight className="h-4 w-4 text-violet-600" />;
}

export default function AdminOrderLedgerPanel({ onMessage }: { onMessage: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);

  const load = async (search = q) => {
    setLoading(true);
    const r = await adminOrderLedger(search);
    setLoading(false);
    if (!r.ok) {
      onMessage(r.message || "Could not load order ledger.");
      return;
    }
    setSummary(r.summary || null);
    setOrders(r.orders || []);
    setLedger(r.ledger || []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLedger = useMemo(() => {
    if (!selectedQuote) return ledger;
    return ledger.filter((e) => e.quoteNumber === selectedQuote);
  }, [ledger, selectedQuote]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Order ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every quote, payment, and payout in one place — with quote numbers, creator names, margins, and transaction
          dates.
        </p>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Money received", value: summary.totalIncoming, tone: "text-emerald-700" },
            { label: "Money pending", value: summary.totalPending, tone: "text-amber-700" },
            { label: "Contractor paid out", value: summary.totalPaidOut, tone: "text-violet-700" },
            { label: "Quoted profit (net contrib.)", value: summary.totalQuotedProfit, tone: "text-sky-700" },
            { label: "Net position", value: summary.netPosition, tone: "text-foreground" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${item.tone}`}>{formatMoney(item.value || 0)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
            placeholder="FBQ number, booking, homeowner, contractor, creator…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Search
        </button>
        {selectedQuote ? (
          <button
            type="button"
            onClick={() => setSelectedQuote(null)}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            Clear filter ({selectedQuote})
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Orders ({orders.length})</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {orders.map((o) => (
                <li key={o.jobId}>
                  <button
                    type="button"
                    onClick={() => setSelectedQuote(o.quoteNumber || null)}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${
                      selectedQuote === o.quoteNumber ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">
                        {o.quoteNumber || o.bookingId || `Job ${o.jobId}`}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground">{o.jobStatus}</span>
                    </div>
                    <p className="mt-1 text-sm">{o.homeownerName || "Homeowner"}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Contractor {o.contractorName || "—"}</span>
                      <span>Quote by {o.createdByName || "—"}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-muted-foreground">Customer</p>
                        <p className="font-semibold tabular-nums">{formatMoney(o.customerQuote || 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Contractor</p>
                        <p className="font-semibold tabular-nums">{formatMoney(o.contractorQuote || 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Received</p>
                        <p className="font-semibold tabular-nums text-emerald-700">{formatMoney(o.moneyReceived || 0)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Transaction ledger ({filteredLedger.length})</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredLedger.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No ledger events.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {filteredLedger.map((e, idx) => (
                <li key={`${e.kind}-${e.date}-${idx}`} className="px-4 py-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-muted/60 p-2">{kindIcon(e.kind)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium capitalize">{e.kind}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {e.quoteNumber ? (
                          <span className="font-mono font-semibold text-primary">{e.quoteNumber}</span>
                        ) : null}
                        {e.bookingId ? <span>{e.bookingId}</span> : null}
                        {e.createdByName ? <span>By {e.createdByName}</span> : null}
                        {e.contractorName ? <span>{e.contractorName}</span> : null}
                      </div>
                      {e.kind === "quote" && (
                        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2 text-[11px]">
                          <div>
                            <p className="text-muted-foreground">AI est.</p>
                            <p className="tabular-nums">
                              {e.aiEstimateLow != null ? `${formatMoney(e.aiEstimateLow)}–${formatMoney(e.aiEstimateHigh || 0)}` : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Contractor</p>
                            <p className="font-semibold tabular-nums">{formatMoney(e.contractorQuote || 0)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Customer</p>
                            <p className="font-semibold tabular-nums text-primary">{formatMoney(e.customerQuote || 0)}</p>
                          </div>
                        </div>
                      )}
                      {e.amount != null && (
                        <p className="mt-2 text-base font-bold tabular-nums">
                          {e.kind === "payout" ? "−" : e.kind === "payment" ? "+" : ""}
                          {formatMoney(Math.abs(e.amount))}
                          {e.status ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">({e.status})</span>
                          ) : null}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
