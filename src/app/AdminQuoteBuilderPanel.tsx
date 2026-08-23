import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Send, TrendingUp, AlertTriangle } from "lucide-react";
import {
  adminCreateProposal,
  adminQuoteBuilderPreview,
  formatMoney,
  retailRangeLabel,
  type Bid,
  type ManagedJob,
} from "./managedJobs";

export type PricingAdjustment = {
  id: string;
  type: string;
  label: string;
  amount: number;
  calculation: "fixed" | "percent";
  includeInDisplay?: boolean;
};

const ADJUSTMENT_TYPES = [
  "Service Adjustment",
  "Emergency",
  "Weekend",
  "Travel",
  "Diagnostic",
  "Trip",
  "Material Handling",
  "Equipment",
  "Custom",
];

const VALIDITY_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

type QuotePreview = {
  contractorNet: number;
  baseRetail: number;
  pricingAdjustment: number;
  serviceCharge: number;
  adminDiscount: number;
  couponAmount: number;
  customerQuote: number;
  processingCost: number;
  grossDifference: number;
  netContribution: number;
  expectedMarginPct: number;
};

function marketPositionLabel(pos: string) {
  if (pos === "within_range") return { text: "Within expected range", tone: "text-emerald-700 bg-emerald-500/10" };
  if (pos === "below_range") return { text: "Below AI estimate", tone: "text-amber-700 bg-amber-500/10" };
  if (pos === "above_range") return { text: "Above AI estimate", tone: "text-red-700 bg-red-500/10" };
  return { text: "No AI comparison", tone: "text-muted-foreground bg-muted/50" };
}

export default function AdminQuoteBuilderPanel({
  job,
  bid,
  busy,
  onPublished,
  onMessage,
}: {
  job: ManagedJob;
  bid: Bid;
  busy?: boolean;
  onPublished: () => void | Promise<void>;
  onMessage: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [aiEstimate, setAiEstimate] = useState<{ low: number | null; high: number | null; confidence: string } | null>(
    null,
  );
  const [marketPosition, setMarketPosition] = useState("unknown");
  const [scopeSummary, setScopeSummary] = useState(job.description || job.title || "");
  const [serviceCharge, setServiceCharge] = useState(25);
  const [adjustments, setAdjustments] = useState<PricingAdjustment[]>([]);
  const [adminDiscount, setAdminDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [validHours, setValidHours] = useState(48);
  const [timeline, setTimeline] = useState("");

  const reloadPreview = async (nextAdjustments = adjustments, nextServiceCharge = serviceCharge, nextDiscount = adminDiscount) => {
    setLoading(true);
    const hasCustom =
      nextAdjustments.length > 0 || nextServiceCharge !== 25 || nextDiscount > 0;
    const r = await adminQuoteBuilderPreview(
      job.id,
      bid.id,
      hasCustom
        ? {
            pricingAdjustments: nextAdjustments,
            serviceCharge: nextServiceCharge,
            adminDiscount: nextDiscount > 0 ? { type: "fixed", amount: nextDiscount, reason: discountReason } : undefined,
          }
        : undefined,
    );
    setLoading(false);
    if (!r.ok || !r.quotePreview) {
      onMessage(r.message || "Could not load quote preview.");
      return;
    }
    setPreview(r.quotePreview as QuotePreview);
    setAiEstimate(r.aiEstimate || null);
    setMarketPosition(String(r.marketPosition || "unknown"));
  };

  useEffect(() => {
    void reloadPreview([], serviceCharge, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, bid.id]);

  const pos = marketPositionLabel(marketPosition);

  const customerTotal = useMemo(() => {
    if (!preview) return 0;
    return Math.max(0, preview.customerQuote - (adminDiscount > preview.adminDiscount ? adminDiscount - preview.adminDiscount : 0));
  }, [preview, adminDiscount]);

  const addAdjustment = () => {
    const next: PricingAdjustment = {
      id: crypto.randomUUID(),
      type: "Service Adjustment",
      label: "Pricing adjustment",
      amount: 0,
      calculation: "fixed",
      includeInDisplay: true,
    };
    const updated = [...adjustments, next];
    setAdjustments(updated);
    void reloadPreview(updated, serviceCharge, adminDiscount);
  };

  const updateAdjustment = (id: string, patch: Partial<PricingAdjustment>) => {
    const updated = adjustments.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setAdjustments(updated);
    void reloadPreview(updated, serviceCharge, adminDiscount);
  };

  const removeAdjustment = (id: string) => {
    const updated = adjustments.filter((a) => a.id !== id);
    setAdjustments(updated);
    void reloadPreview(updated, serviceCharge, adminDiscount);
  };

  const publish = async () => {
    setPublishing(true);
    const r = await adminCreateProposal(job.id, bid.id, {
      scopeSummary,
      timeline: timeline || undefined,
      quoteValidHours: validHours,
      serviceCharge,
      pricingAdjustments: adjustments.map(({ id: _id, ...rest }) => rest),
      adminDiscount: adminDiscount > 0 ? { type: "fixed", amount: adminDiscount, reason: discountReason } : undefined,
    });
    setPublishing(false);
    if (!r.ok) {
      onMessage(r.message || "Could not publish quote.");
      return;
    }
    onMessage(`Quote sent to homeowner at ${formatMoney(r.proposal?.retailAmount)}`);
    await onPublished();
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quote builder</p>
          <p className="mt-1 text-lg font-semibold">Build FixBridge quote from contractor bid</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pos.tone}`}>{pos.text}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contractor quote</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatMoney(bid.netTotal)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Labor</p><p className="font-medium tabular-nums">{formatMoney(bid.labor)}</p></div>
            <div><p className="text-xs text-muted-foreground">Materials</p><p className="font-medium tabular-nums">{formatMoney(bid.materials)}</p></div>
            <div><p className="text-xs text-muted-foreground">Trip</p><p className="font-medium tabular-nums">{formatMoney(bid.travelDiagnostic)}</p></div>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">AI market estimate</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {aiEstimate?.low != null && aiEstimate?.high != null
              ? retailRangeLabel(aiEstimate.low, aiEstimate.high)
              : "—"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Confidence: <span className="font-semibold text-foreground">{aiEstimate?.confidence || "MEDIUM"}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Recommended service scope</label>
        <textarea
          className="min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={scopeSummary}
          onChange={(e) => setScopeSummary(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Service charge</label>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums"
            value={serviceCharge}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setServiceCharge(v);
              void reloadPreview(adjustments, v, adminDiscount);
            }}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Quote validity</label>
          <select
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={validHours}
            onChange={(e) => setValidHours(Number(e.target.value))}
          >
            {VALIDITY_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Pricing adjustments</p>
          <button type="button" onClick={addAdjustment} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted">
            <Plus className="h-3.5 w-3.5" /> Add adjustment
          </button>
        </div>
        {adjustments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            No adjustments yet. Base retail is calculated from contractor net + margin rules.
          </p>
        ) : (
          adjustments.map((adj) => (
            <div key={adj.id} className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_100px_90px_auto]">
              <select
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={adj.type}
                onChange={(e) => updateAdjustment(adj.id, { type: e.target.value, label: e.target.value })}
              >
                {ADJUSTMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="Label"
                value={adj.label}
                onChange={(e) => updateAdjustment(adj.id, { label: e.target.value })}
              />
              <input
                type="number"
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                value={adj.amount}
                onChange={(e) => updateAdjustment(adj.id, { amount: Number(e.target.value) || 0 })}
              />
              <select
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                value={adj.calculation}
                onChange={(e) => updateAdjustment(adj.id, { calculation: e.target.value as "fixed" | "percent" })}
              >
                <option value="fixed">Fixed $</option>
                <option value="percent">%</option>
              </select>
              <button type="button" onClick={() => removeAdjustment(adj.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Admin discount ($)</label>
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums"
            value={adminDiscount}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setAdminDiscount(v);
              void reloadPreview(adjustments, serviceCharge, v);
            }}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Discount reason</label>
          <input
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Customer retention, promotion…"
            value={discountReason}
            onChange={(e) => setDiscountReason(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Customer quote</span>
          <span className="text-2xl font-bold tabular-nums">
            {loading ? "…" : formatMoney(preview?.customerQuote ?? 0)}
          </span>
        </div>
        {preview && (
          <div className="mt-3 space-y-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>Base retail from bid</span><span className="tabular-nums">{formatMoney(preview.baseRetail)}</span></div>
            <div className="flex justify-between"><span>Adjustments</span><span className="tabular-nums">+{formatMoney(preview.pricingAdjustment)}</span></div>
            <div className="flex justify-between"><span>Service charge</span><span className="tabular-nums">+{formatMoney(preview.serviceCharge)}</span></div>
            {preview.adminDiscount > 0 && (
              <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">-{formatMoney(preview.adminDiscount)}</span></div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Internal — not customer visible
        </p>
        {preview ? (
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Contractor quote</span><span className="font-medium tabular-nums">{formatMoney(preview.contractorNet)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Customer quote</span><span className="font-medium tabular-nums">{formatMoney(customerTotal)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Pricing difference</span><span className="font-medium tabular-nums">{formatMoney(preview.grossDifference)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Est. payment cost</span><span className="font-medium tabular-nums">{formatMoney(preview.processingCost)}</span></div>
            <div className="flex justify-between gap-2 sm:col-span-2">
              <span className="inline-flex items-center gap-1 text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Expected contribution</span>
              <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatMoney(preview.netContribution)} ({preview.expectedMarginPct}%)
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Loading economics…</p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium">Estimated duration / timeline</label>
        <input
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="3–4 hours"
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
        />
      </div>

      <button
        type="button"
        disabled={busy || publishing || loading}
        onClick={() => void publish()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send quote to homeowner
      </button>
    </div>
  );
}
