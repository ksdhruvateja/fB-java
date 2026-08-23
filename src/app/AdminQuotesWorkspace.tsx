import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, FileText, ExternalLink } from "lucide-react";
import { formatMoney, type Proposal } from "./managedJobs";
import { getStoredToken } from "./auth";

const STATUS_FILTERS = [
  "all",
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "canceled",
] as const;

function statusTone(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "accepted") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s === "sent" || s === "viewed") return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
  if (s === "declined" || s === "canceled") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (s === "expired") return "bg-muted text-muted-foreground";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
}

export default function AdminQuotesWorkspace({
  onOpenJob,
  onMessage,
}: {
  onOpenJob: (jobId: number) => void;
  onMessage: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = async (search = q, st = status) => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (st && st !== "all") params.set("status", st);
      const res = await fetch(`/api/admin/quotes?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.ok) {
        onMessage(data.message || "Could not load quotes.");
        setQuotes([]);
        return;
      }
      setQuotes(data.quotes || []);
    } catch {
      onMessage("Network error loading quotes.");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => quotes.find((x) => x.id === selectedId) || null,
    [quotes, selectedId]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by quote number (FBQ-xxxxx), homeowner, contractor, ZIP, or amount. Homeowners only ever see the
          final FixBridge price — AI markup and contractor net stay internal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#FF4D1C] focus:ring-2 focus:ring-[#FF4D1C]/20"
            placeholder="FBQ-10482, name, ZIP, HVAC, $604.50…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </label>
        <select
          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(q, e.target.value);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Search
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : quotes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No quotes match that search.</p>
          ) : (
            <ul className="divide-y divide-border">
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(quote.id)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 ${
                      selectedId === quote.id ? "bg-muted/60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-[#FF4D1C]">
                        {quote.quoteNumber || `FBQ-${String(quote.id).padStart(5, "0")}`}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(quote.status)}`}>
                        {quote.status}
                      </span>
                    </div>
                    <span className="text-sm font-medium">
                      {(quote as Proposal & { homeownerName?: string }).homeownerName || "Homeowner"}
                      {(quote as Proposal & { jobCategory?: string }).jobCategory
                        ? ` · ${(quote as Proposal & { jobCategory?: string }).jobCategory}`
                        : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Customer quote {formatMoney(quote.retailAmount || 0)}
                      {quote.contractorNet != null ? ` · Contractor ${formatMoney(quote.contractorNet)}` : ""}
                      {(quote as Proposal & { jobZip?: string }).jobZip
                        ? ` · ZIP ${(quote as Proposal & { jobZip?: string }).jobZip}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          {!selected ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              Select a quote to open the workspace summary.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-lg font-bold text-[#FF4D1C]">
                    {selected.quoteNumber || `FBQ-${String(selected.id).padStart(5, "0")}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(selected as Proposal & { bookingId?: string }).bookingId || `Job #${selected.jobId}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone(selected.status)}`}>
                  {selected.status}
                </span>
              </div>

              <div className="grid gap-2 text-sm">
                <Row label="Homeowner" value={(selected as Proposal & { homeownerName?: string }).homeownerName} />
                <Row label="Email" value={(selected as Proposal & { homeownerEmail?: string }).homeownerEmail} />
                <Row label="Service" value={(selected as Proposal & { jobTitle?: string }).jobTitle || selected.scopeSummary} />
                <Row label="ZIP" value={(selected as Proposal & { jobZip?: string }).jobZip} />
                <Row label="Contractor" value={(selected as Proposal & { contractorName?: string }).contractorName} />
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Internal pricing</p>
                <Row
                  label="AI estimate (customer-facing range on job)"
                  value={
                    (selected as Proposal & { aiEstimateLow?: number }).aiEstimateLow != null
                      ? `${formatMoney((selected as Proposal & { aiEstimateLow?: number }).aiEstimateLow!)} – ${formatMoney((selected as Proposal & { aiEstimateHigh?: number }).aiEstimateHigh || 0)}`
                      : "—"
                  }
                />
                <Row label="Contractor quote" value={selected.contractorNet != null ? formatMoney(selected.contractorNet) : "—"} />
                <Row label="Final FixBridge quote" value={formatMoney(selected.retailAmount || 0)} strong />
                {selected.expectedMarginPct != null && (
                  <Row label="Expected contribution" value={`${selected.expectedMarginPct}%`} />
                )}
              </div>

              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/25">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Homeowner preview
                </p>
                <p className="mt-1 text-xs text-muted-foreground">They only see the final amount below.</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">{formatMoney(selected.retailAmount || 0)}</p>
              </div>

              {selected.warranty && (
                <div className="text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Warranty</p>
                  <p className="mt-1">{selected.warranty}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => onOpenJob(selected.jobId)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" />
                Open related job
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value?: string | number | null; strong?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${strong ? "font-bold tabular-nums" : "font-medium"}`}>{value}</span>
    </div>
  );
}
