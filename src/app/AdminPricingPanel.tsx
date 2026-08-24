import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Gauge,
  Loader2,
  Percent,
  RotateCcw,
  Save,
  Sparkles,
  Truck,
  Wrench,
  Calculator,
  Check,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { formatMoney } from "./managedJobs";

export type FeePair = { customer: number; contractor: number };
export type TradeBaseline = { trip: number; hourly: number; materials_allowance: number };
export type PricingRules = {
  dispatch_fees: Record<string, FeePair>;
  trade_baselines: Record<string, TradeBaseline>;
  fixed_platform_cost: number;
  risk_reserve: number;
  variable_payment_fee_rate: number;
  fixed_payment_fee: number;
  target_gross_margin: number;
  minimum_gross_profit: number;
  location_factor: number;
  urgency_surcharges: Record<string, number>;
  after_hours_surcharge: number;
  subscription_discount: number;
  assessment_credit: number;
  default_visit_fee?: number;
  default_emergency_visit_fee?: number;
  pro_subscription_price?: number;
  customer_display_adjustment?: {
    type?: string;
    value?: number;
    min_dollars?: number | null;
    max_dollars?: number | null;
  };
  pricing_overrides?: {
    by_trade?: Record<string, { type?: string; value?: number; min_dollars?: number; max_dollars?: number | null }>;
    by_zip_prefix?: Record<string, { type?: string; value?: number; min_dollars?: number; max_dollars?: number | null }>;
  };
  [key: string]: unknown;
};

const DISPATCH_LABELS: Record<string, string> = {
  weekday: "Scheduled weekday",
  same_day: "Same-day priority",
  evening_weekend: "Evening / weekend",
  commercial_scheduled: "Commercial scheduled",
  commercial_emergency: "Commercial emergency",
};

const TRADE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
  painting: "Painting",
  roofing: "Roofing",
  flooring: "Flooring",
  carpentry: "Carpentry",
  others: "Others",
};

const URGENCY_META: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "#0D9488" },
  medium: { label: "Medium", color: "#F59E0B" },
  high: { label: "High", color: "#FF4D1C" },
  emergency: { label: "Emergency", color: "#B91C1C" },
};

type PricingSection = "display" | "margins" | "urgency" | "dispatch" | "trades" | "preview";

const SECTIONS: { id: PricingSection; label: string; icon: React.ElementType }[] = [
  { id: "display", label: "Customer price", icon: Sparkles },
  { id: "margins", label: "Margins", icon: Percent },
  { id: "urgency", label: "Urgency", icon: Gauge },
  { id: "dispatch", label: "Dispatch fees", icon: Truck },
  { id: "trades", label: "Trade rates", icon: Wrench },
  { id: "preview", label: "Live preview", icon: Calculator },
];

function pctToDisplay(rate: number) {
  return Math.round(Number(rate || 0) * 1000) / 10;
}

function pctFromDisplay(pct: number) {
  return Number(pct || 0) / 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Client mirror of server retailFromNet for live preview only. */
function previewRetail(net: number, rules: PricingRules, urgency: string, afterHours: boolean) {
  const fixedPlatform = Number(rules.fixed_platform_cost) || 0;
  const risk = Number(rules.risk_reserve) || 0;
  const fixedPay = Number(rules.fixed_payment_fee) || 0;
  const margin = clamp(Number(rules.target_gross_margin) || 0.25, 0.05, 0.6);
  const feeRate = clamp(Number(rules.variable_payment_fee_rate) || 0.029, 0, 0.15);
  const locationFactor = Number(rules.location_factor) || 1;
  const urgencyPct = Number(rules.urgency_surcharges?.[urgency] || 0);
  const afterHoursPct = afterHours ? Number(rules.after_hours_surcharge) || 0 : 0;
  const discount = Number(rules.subscription_discount) || 0;
  const assessmentCredit = Number(rules.assessment_credit) || 0;
  const minProfit = Number(rules.minimum_gross_profit) || 0;

  const subtotal = (net + fixedPlatform + risk + fixedPay) * locationFactor;
  const denom = 1 - margin - feeRate;
  let retail = denom > 0.2 ? subtotal / denom : subtotal * 1.4;
  retail *= 1 + urgencyPct + afterHoursPct;
  retail -= discount + assessmentCredit;

  const profitAtRetail = retail - net - fixedPlatform - risk - fixedPay - retail * feeRate;
  if (profitAtRetail < minProfit) {
    retail = (net + fixedPlatform + risk + fixedPay + minProfit) / (1 - feeRate);
    retail *= locationFactor * (1 + urgencyPct + afterHoursPct);
  }

  retail = Math.max(0, Math.round(retail));
  const processing = Math.round(retail * feeRate + fixedPay);
  const gross = Math.round(retail - net - processing - fixedPlatform - risk);
  return { retail, processing, gross, margin, feeRate, urgencyPct, afterHoursPct };
}

function estimateNet(rules: PricingRules, trade: string, hoursMin: number, hoursMax: number) {
  const baseline = rules.trade_baselines?.[trade] || { trip: 85, hourly: 100, materials_allowance: 70 };
  const low = Math.round(baseline.trip + hoursMin * baseline.hourly + baseline.materials_allowance * 0.6);
  const high = Math.round(baseline.trip + hoursMax * baseline.hourly + baseline.materials_allowance * 1.2);
  return { low, high };
}

const fieldClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition focus:border-[#FF4D1C] focus:outline-none focus:ring-2 focus:ring-[#FF4D1C]/20";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = "1",
  hint,
  dirty,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: string;
  hint?: string;
  dirty?: boolean;
}) {
  return (
    <label className={`grid gap-1 text-sm ${dirty ? "rounded-xl ring-1 ring-[#FF4D1C]/35 p-2 -m-2" : ""}`}>
      <span className="flex items-center gap-2 font-medium">
        {label}
        {dirty && <span className="rounded-full bg-[#FF4D1C]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#FF4D1C]">edited</span>}
      </span>
      <div className="relative">
        <input
          type="number"
          step={step}
          className={`${fieldClass} pr-10 tabular-nums`}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function SliderPct({
  label,
  valuePct,
  onChangePct,
  min = 0,
  max = 50,
  step = 0.5,
  hint,
  dirty,
  accent = "#FF4D1C",
}: {
  label: string;
  valuePct: number;
  onChangePct: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  dirty?: boolean;
  accent?: string;
}) {
  return (
    <div className={`space-y-2 ${dirty ? "rounded-xl ring-1 ring-[#FF4D1C]/35 p-3 -m-1" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {label}
          {dirty && <span className="ml-2 rounded-full bg-[#FF4D1C]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#FF4D1C]">edited</span>}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={step}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
            value={valuePct}
            onChange={(e) => onChangePct(Number(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valuePct}
        onChange={(e) => onChangePct(Number(e.target.value))}
        className="w-full accent-[#FF4D1C]"
        style={{ accentColor: accent }}
      />
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: accent }}
          animate={{ width: `${clamp((valuePct - min) / (max - min), 0, 1) * 100}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function deepEqualish(a: PricingRules | null, b: PricingRules | null) {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function AdminPricingPanel({
  pricingRules,
  setPricingRules,
  busy,
  onSave,
  onReload,
  disabled,
}: {
  pricingRules: PricingRules | null;
  setPricingRules: (rules: PricingRules) => void;
  busy: boolean;
  onSave: () => Promise<PricingRules | null>;
  onReload: () => Promise<PricingRules | null>;
  disabled?: boolean;
}) {
  const [section, setSection] = useState<PricingSection>("display");
  const [savedSnapshot, setSavedSnapshot] = useState<PricingRules | null>(null);
  const [expandedTrade, setExpandedTrade] = useState<string>("plumbing");
  const [previewTrade, setPreviewTrade] = useState("plumbing");
  const [previewUrgency, setPreviewUrgency] = useState("high");
  const [previewHoursMin, setPreviewHoursMin] = useState(1.5);
  const [previewHoursMax, setPreviewHoursMax] = useState(3);
  const [previewAfterHours, setPreviewAfterHours] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (pricingRules && !savedSnapshot) {
      setSavedSnapshot(structuredClone(pricingRules));
    }
  }, [pricingRules, savedSnapshot]);

  const dirty = useMemo(
    () => !deepEqualish(pricingRules, savedSnapshot),
    [pricingRules, savedSnapshot]
  );

  const preview = useMemo(() => {
    if (!pricingRules) return null;
    const net = estimateNet(pricingRules, previewTrade, previewHoursMin, Math.max(previewHoursMin, previewHoursMax));
    const low = previewRetail(net.low, pricingRules, previewUrgency, previewAfterHours);
    const high = previewRetail(net.high, pricingRules, previewUrgency, previewAfterHours);
    return {
      netLow: net.low,
      netHigh: Math.max(net.low, net.high),
      retailLow: Math.round(low.retail * 0.92),
      retailHigh: Math.round(Math.max(low.retail * 0.92, high.retail * 1.08)),
      grossLow: low.gross,
      grossHigh: high.gross,
      fee: low.feeRate,
      margin: low.margin,
    };
  }, [pricingRules, previewTrade, previewHoursMin, previewHoursMax, previewUrgency, previewAfterHours]);

  function isDirtyPath(path: string) {
    if (!pricingRules || !savedSnapshot) return false;
    const get = (obj: PricingRules, p: string) => {
      const parts = p.split(".");
      let cur: unknown = obj;
      for (const part of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[part];
      }
      return cur;
    };
    return JSON.stringify(get(pricingRules, path)) !== JSON.stringify(get(savedSnapshot, path));
  }

  function applyMarginPreset(kind: "conservative" | "balanced" | "premium") {
    if (!pricingRules) return;
    const map = {
      conservative: { margin: 0.18, minProfit: 50 },
      balanced: { margin: 0.25, minProfit: 75 },
      premium: { margin: 0.32, minProfit: 110 },
    }[kind];
    setPricingRules({
      ...pricingRules,
      target_gross_margin: map.margin,
      minimum_gross_profit: map.minProfit,
    });
  }

  if (!pricingRules) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-10 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading pricing rules…
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing rules</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tune margins, urgency, dispatch fees, and trade baselines. Use Live preview to see customer retail update
            instantly — AI never invents prices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-800">
              <Check className="h-3.5 w-3.5" />
              Synced
            </span>
          )}
        </div>
      </div>

      {/* Sticky section nav */}
      <div className="sticky top-2 z-20 -mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-border/70 bg-card/95 p-1.5 shadow-sm backdrop-blur sm:min-w-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${
                section === s.id
                  ? "bg-[#FF4D1C] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <s.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mini live strip always visible */}
      {preview && (
        <motion.div
          layout
          className="grid gap-3 rounded-2xl border border-[#FF4D1C]/20 bg-gradient-to-r from-[#FF4D1C]/10 via-card to-teal-500/10 p-4 sm:grid-cols-4"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview retail</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(preview.retailLow)}–{formatMoney(preview.retailHigh)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Contractor net</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(preview.netLow)}–{formatMoney(preview.netHigh)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target margin</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{pctToDisplay(pricingRules.target_gross_margin)}%</p>
          </div>
          <button
            type="button"
            className="self-center rounded-xl border border-border bg-background/80 px-3 py-2 text-xs font-medium transition hover:bg-muted sm:justify-self-end"
            onClick={() => setSection("preview")}
          >
            Adjust preview scenario →
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {section === "display" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#FF4D1C]/25 bg-[#FF4D1C]/5 p-5 shadow-sm">
                <h2 className="font-semibold">Default customer pricing rule</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Applied to the <strong>AI-generated recommended value</strong> (Stage A) before the homeowner sees an
                  estimate. Later, Stage B uses the contractor&apos;s actual quote as the base instead. Homeowners never
                  see AI raw amount or this markup.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Adjustment type</span>
                    <select
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      value={pricingRules.customer_display_adjustment?.type || "percentage"}
                      onChange={(e) =>
                        setPricingRules({
                          ...pricingRules,
                          customer_display_adjustment: {
                            ...(pricingRules.customer_display_adjustment || {}),
                            type: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed dollars</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">
                      Value {(pricingRules.customer_display_adjustment?.type || "percentage") === "fixed" ? "($)" : "(%)"}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      value={pricingRules.customer_display_adjustment?.value ?? 15}
                      onChange={(e) =>
                        setPricingRules({
                          ...pricingRules,
                          customer_display_adjustment: {
                            ...(pricingRules.customer_display_adjustment || {}),
                            value: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Minimum adjustment ($)</span>
                    <input
                      type="number"
                      step="1"
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      value={pricingRules.customer_display_adjustment?.min_dollars ?? 25}
                      onChange={(e) =>
                        setPricingRules({
                          ...pricingRules,
                          customer_display_adjustment: {
                            ...(pricingRules.customer_display_adjustment || {}),
                            min_dollars: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Maximum adjustment ($)</span>
                    <input
                      type="number"
                      step="1"
                      className="rounded-xl border border-border bg-background px-3 py-2.5"
                      placeholder="Optional"
                      value={pricingRules.customer_display_adjustment?.max_dollars ?? ""}
                      onChange={(e) =>
                        setPricingRules({
                          ...pricingRules,
                          customer_display_adjustment: {
                            ...(pricingRules.customer_display_adjustment || {}),
                            max_dollars: e.target.value === "" ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 rounded-xl border border-border/70 bg-background/80 p-3 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Example</p>
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    AI recommended $485 → customer sees{" "}
                    <span className="font-semibold text-foreground">
                      {formatMoney(
                        (() => {
                          const raw = 485;
                          const adj = pricingRules.customer_display_adjustment || { type: "percentage", value: 15, min_dollars: 25 };
                          let delta =
                            String(adj.type) === "fixed"
                              ? Number(adj.value || 0)
                              : Math.round(raw * (Number(adj.value || 0) / 100));
                          delta = Math.max(delta, Number(adj.min_dollars || 0));
                          if (adj.max_dollars != null) delta = Math.min(delta, Number(adj.max_dollars));
                          return raw + delta;
                        })()
                      )}
                    </span>
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Hierarchy (coming into full use)</p>
                <p className="mt-1">
                  Overrides resolve as ZIP prefix → trade → global. Configure trade/ZIP overrides under saved rules JSON
                  via <code className="text-xs">pricing_overrides</code> — UI editors for those layers can expand next.
                </p>
              </div>
            </div>
          )}

          {section === "margins" && (
            <>
              <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Quick presets</h2>
                    <p className="text-xs text-muted-foreground">One-click margin posture — fine-tune below.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["conservative", "Conservative"],
                        ["balanced", "Balanced"],
                        ["premium", "Premium"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => applyMarginPreset(id)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-[#FF4D1C]/50 hover:bg-[#FF4D1C]/08 active:scale-95"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <SliderPct
                    label="Target gross margin"
                    valuePct={pctToDisplay(pricingRules.target_gross_margin)}
                    onChangePct={(n) =>
                      setPricingRules({ ...pricingRules, target_gross_margin: pctFromDisplay(n) })
                    }
                    min={5}
                    max={45}
                    step={0.5}
                    dirty={isDirtyPath("target_gross_margin")}
                    hint="Used after AI labor hours to build the retail range"
                  />
                  <SliderPct
                    label="Payment fee rate"
                    valuePct={pctToDisplay(pricingRules.variable_payment_fee_rate)}
                    onChangePct={(n) =>
                      setPricingRules({ ...pricingRules, variable_payment_fee_rate: pctFromDisplay(n) })
                    }
                    min={0}
                    max={8}
                    step={0.1}
                    dirty={isDirtyPath("variable_payment_fee_rate")}
                    accent="#0D9488"
                  />
                  <SliderPct
                    label="After-hours surcharge"
                    valuePct={pctToDisplay(pricingRules.after_hours_surcharge)}
                    onChangePct={(n) =>
                      setPricingRules({ ...pricingRules, after_hours_surcharge: pctFromDisplay(n) })
                    }
                    min={0}
                    max={40}
                    step={1}
                    dirty={isDirtyPath("after_hours_surcharge")}
                    accent="#F59E0B"
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Location factor</span>
                      <span className="text-sm tabular-nums font-semibold">
                        {Number(pricingRules.location_factor).toFixed(2)}×
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({Math.round((pricingRules.location_factor - 1) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={1.35}
                      step={0.01}
                      value={pricingRules.location_factor}
                      onChange={(e) =>
                        setPricingRules({ ...pricingRules, location_factor: Number(e.target.value) })
                      }
                      className="w-full accent-[#FF4D1C]"
                    />
                    <p className="text-xs text-muted-foreground">e.g. 1.08 = +8% for NYC/LI</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
                <NumField
                  label="Minimum gross profit"
                  value={pricingRules.minimum_gross_profit}
                  onChange={(n) => setPricingRules({ ...pricingRules, minimum_gross_profit: n })}
                  suffix="$"
                  dirty={isDirtyPath("minimum_gross_profit")}
                />
                <NumField
                  label="Fixed platform cost"
                  value={pricingRules.fixed_platform_cost}
                  onChange={(n) => setPricingRules({ ...pricingRules, fixed_platform_cost: n })}
                  suffix="$"
                  dirty={isDirtyPath("fixed_platform_cost")}
                />
                <NumField
                  label="Risk / warranty reserve"
                  value={pricingRules.risk_reserve}
                  onChange={(n) => setPricingRules({ ...pricingRules, risk_reserve: n })}
                  suffix="$"
                  dirty={isDirtyPath("risk_reserve")}
                />
                <NumField
                  label="Fixed payment fee"
                  value={pricingRules.fixed_payment_fee}
                  onChange={(n) => setPricingRules({ ...pricingRules, fixed_payment_fee: n })}
                  suffix="$"
                  step="0.01"
                  dirty={isDirtyPath("fixed_payment_fee")}
                />
                <NumField
                  label="Subscription discount"
                  value={pricingRules.subscription_discount}
                  onChange={(n) => setPricingRules({ ...pricingRules, subscription_discount: n })}
                  suffix="$"
                  dirty={isDirtyPath("subscription_discount")}
                />
                <NumField
                  label="Assessment credit"
                  value={pricingRules.assessment_credit}
                  onChange={(n) => setPricingRules({ ...pricingRules, assessment_credit: n })}
                  suffix="$"
                  dirty={isDirtyPath("assessment_credit")}
                />
              </div>
            </>
          )}

          {section === "urgency" && (
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-5">
              <div>
                <h2 className="font-semibold">Urgency surcharges</h2>
                <p className="text-xs text-muted-foreground">
                  Applied from the AI urgency label. Drag to compare impact visually.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {(["low", "medium", "high", "emergency"] as const).map((key) => {
                  const meta = URGENCY_META[key];
                  const pct = pctToDisplay(Number(pricingRules.urgency_surcharges?.[key] || 0));
                  return (
                    <motion.div
                      key={key}
                      layout
                      className="rounded-2xl border border-border/80 bg-muted/20 p-4 transition hover:bg-muted/35"
                      whileHover={{ scale: 1.01 }}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="text-lg font-semibold tabular-nums" style={{ color: meta.color }}>
                          +{pct}%
                        </span>
                      </div>
                      <SliderPct
                        label="Surcharge"
                        valuePct={pct}
                        onChangePct={(n) =>
                          setPricingRules({
                            ...pricingRules,
                            urgency_surcharges: {
                              ...pricingRules.urgency_surcharges,
                              [key]: pctFromDisplay(n),
                            },
                          })
                        }
                        min={0}
                        max={40}
                        step={1}
                        dirty={isDirtyPath(`urgency_surcharges.${key}`)}
                        accent={meta.color}
                      />
                    </motion.div>
                  );
                })}
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Relative urgency stack</p>
                <div className="flex h-8 overflow-hidden rounded-lg">
                  {(["low", "medium", "high", "emergency"] as const).map((key) => {
                    const pct = pctToDisplay(Number(pricingRules.urgency_surcharges?.[key] || 0));
                    const total =
                      (["low", "medium", "high", "emergency"] as const).reduce(
                        (s, k) => s + pctToDisplay(Number(pricingRules.urgency_surcharges?.[k] || 0)),
                        0
                      ) || 1;
                    return (
                      <motion.div
                        key={key}
                        title={`${URGENCY_META[key].label}: ${pct}%`}
                        className="flex items-center justify-center text-[10px] font-semibold text-white"
                        style={{ background: URGENCY_META[key].color }}
                        animate={{ flexGrow: Math.max(pct, 2) / total }}
                      >
                        {pct > 0 ? `${pct}%` : ""}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {section === "dispatch" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <h2 className="font-semibold">Dispatch / assessment fees</h2>
                <p className="text-xs text-muted-foreground">
                  Customer pays the fee; contractor visit payout is tracked separately.
                </p>
              </div>
              {Object.keys(DISPATCH_LABELS).map((key, i) => {
                const fee = pricingRules.dispatch_fees?.[key] || { customer: 0, contractor: 0 };
                const spread = Number(fee.customer) - Number(fee.contractor);
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition hover:shadow-md"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{DISPATCH_LABELS[key]}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          spread >= 0 ? "bg-teal-500/15 text-teal-800" : "bg-red-500/15 text-red-700"
                        }`}
                      >
                        Platform keep {formatMoney(spread)}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumField
                        label="Customer fee"
                        value={Number(fee.customer)}
                        onChange={(n) =>
                          setPricingRules({
                            ...pricingRules,
                            dispatch_fees: {
                              ...pricingRules.dispatch_fees,
                              [key]: { ...fee, customer: n },
                            },
                          })
                        }
                        suffix="$"
                        dirty={isDirtyPath(`dispatch_fees.${key}.customer`)}
                      />
                      <NumField
                        label="Contractor visit payout"
                        value={Number(fee.contractor)}
                        onChange={(n) =>
                          setPricingRules({
                            ...pricingRules,
                            dispatch_fees: {
                              ...pricingRules.dispatch_fees,
                              [key]: { ...fee, contractor: n },
                            },
                          })
                        }
                        suffix="$"
                        dirty={isDirtyPath(`dispatch_fees.${key}.contractor`)}
                      />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#FF4D1C] transition-all"
                        style={{
                          width: `${clamp(Number(fee.customer) / 400, 0, 1) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Bar scaled to $400 max for comparison</p>
                  </motion.div>
                );
              })}
            </div>
          )}

          {section === "trades" && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <h2 className="font-semibold">Trade baselines</h2>
                <p className="text-xs text-muted-foreground">
                  Combined with AI estimated labor hours to estimate contractor net before margin is applied. Expand a
                  trade to edit.
                </p>
              </div>
              {Object.keys(TRADE_LABELS).map((key) => {
                const t = pricingRules.trade_baselines?.[key] || {
                  trip: 0,
                  hourly: 0,
                  materials_allowance: 0,
                };
                const open = expandedTrade === key;
                const sampleNet = Math.round(t.trip + 2 * t.hourly + t.materials_allowance);
                return (
                  <div
                    key={key}
                    className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${
                      open ? "border-[#FF4D1C]/40 shadow-md" : "border-border/70 hover:border-[#FF4D1C]/25"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                      onClick={() => setExpandedTrade(open ? "" : key)}
                    >
                      <div>
                        <p className="font-medium">{TRADE_LABELS[key]}</p>
                        <p className="text-xs text-muted-foreground">
                          Trip {formatMoney(t.trip)} · {formatMoney(t.hourly)}/hr · Materials{" "}
                          {formatMoney(t.materials_allowance)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          ~{formatMoney(sampleNet)} net @ 2 hrs
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden border-t border-border"
                        >
                          <div className="grid gap-3 p-4 sm:grid-cols-3">
                            <NumField
                              label="Trip charge"
                              value={Number(t.trip)}
                              onChange={(n) =>
                                setPricingRules({
                                  ...pricingRules,
                                  trade_baselines: {
                                    ...pricingRules.trade_baselines,
                                    [key]: { ...t, trip: n },
                                  },
                                })
                              }
                              suffix="$"
                              dirty={isDirtyPath(`trade_baselines.${key}.trip`)}
                            />
                            <NumField
                              label="Hourly rate"
                              value={Number(t.hourly)}
                              onChange={(n) =>
                                setPricingRules({
                                  ...pricingRules,
                                  trade_baselines: {
                                    ...pricingRules.trade_baselines,
                                    [key]: { ...t, hourly: n },
                                  },
                                })
                              }
                              suffix="$"
                              dirty={isDirtyPath(`trade_baselines.${key}.hourly`)}
                            />
                            <NumField
                              label="Materials allowance"
                              value={Number(t.materials_allowance)}
                              onChange={(n) =>
                                setPricingRules({
                                  ...pricingRules,
                                  trade_baselines: {
                                    ...pricingRules.trade_baselines,
                                    [key]: { ...t, materials_allowance: n },
                                  },
                                })
                              }
                              suffix="$"
                              dirty={isDirtyPath(`trade_baselines.${key}.materials_allowance`)}
                            />
                          </div>
                          <div className="border-t border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                            Sample 2-hour job net ≈{" "}
                            <span className="font-semibold text-foreground">{formatMoney(sampleNet)}</span>
                            <button
                              type="button"
                              className="ml-3 font-medium text-[#FF4D1C] hover:underline"
                              onClick={() => {
                                setPreviewTrade(key);
                                setSection("preview");
                              }}
                            >
                              Open in live preview →
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {section === "preview" && preview && (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-[#FF4D1C]" />
                  <h2 className="font-semibold">Scenario builder</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Change the scenario — retail updates from your current (unsaved) rules in real time.
                </p>

                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Trade</span>
                  <select className={fieldClass} value={previewTrade} onChange={(e) => setPreviewTrade(e.target.value)}>
                    {Object.entries(TRADE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <p className="mb-2 text-sm font-medium">Urgency</p>
                  <div className="flex flex-wrap gap-2">
                    {(["low", "medium", "high", "emergency"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setPreviewUrgency(u)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          previewUrgency === u
                            ? "text-white shadow-sm"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                        style={
                          previewUrgency === u
                            ? { backgroundColor: URGENCY_META[u].color }
                            : undefined
                        }
                      >
                        {URGENCY_META[u].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">Hours (min)</span>
                      <span className="tabular-nums">{previewHoursMin}</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={12}
                      step={0.5}
                      value={previewHoursMin}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPreviewHoursMin(v);
                        if (previewHoursMax < v) setPreviewHoursMax(v);
                      }}
                      className="w-full accent-[#FF4D1C]"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">Hours (max)</span>
                      <span className="tabular-nums">{previewHoursMax}</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={16}
                      step={0.5}
                      value={previewHoursMax}
                      onChange={(e) => setPreviewHoursMax(Math.max(previewHoursMin, Number(e.target.value)))}
                      className="w-full accent-[#0D9488]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewAfterHours((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                    previewAfterHours
                      ? "border-[#FF4D1C]/40 bg-[#FF4D1C]/08"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">After-hours / evening job</span>
                  <span
                    className={`relative h-6 w-11 rounded-full transition ${
                      previewAfterHours ? "bg-[#FF4D1C]" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        previewAfterHours ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div className="flex flex-col justify-between overflow-hidden rounded-2xl bg-[#FF4D1C] p-5 text-white shadow-sm">
                <div>
                  <p className="text-sm text-white/80">Estimated customer retail</p>
                  <motion.p
                    key={`${preview.retailLow}-${preview.retailHigh}`}
                    initial={{ opacity: 0.4, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-3xl font-semibold tabular-nums tracking-tight"
                  >
                    {formatMoney(preview.retailLow)}–{formatMoney(preview.retailHigh)}
                  </motion.p>
                  <p className="mt-2 text-sm text-white/80">
                    Contractor net {formatMoney(preview.netLow)}–{formatMoney(preview.netHigh)}
                  </p>
                </div>
                <div className="mt-6 space-y-2 rounded-xl bg-white/15 p-3 text-sm backdrop-blur-sm">
                  <div className="flex justify-between">
                    <span className="text-white/80">Target margin</span>
                    <span className="font-semibold tabular-nums">{pctToDisplay(preview.margin)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/80">Est. platform gross</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(preview.grossLow)}–{formatMoney(preview.grossHigh)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/80">Payment fee rate</span>
                    <span className="font-semibold tabular-nums">{pctToDisplay(preview.fee)}%</span>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-white/75">
                  Preliminary range uses the same widen (~8%) as production assessments. Not a binding quote.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Sticky save bar */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <button
          type="button"
          disabled={busy || !dirty || disabled}
          className={btnPrimary}
          onClick={async () => {
            const saved = await onSave();
            if (saved) {
              setSavedSnapshot(structuredClone(saved));
              setJustSaved(true);
              window.setTimeout(() => setJustSaved(false), 1600);
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : justSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {busy ? "Saving…" : justSaved ? "Saved" : dirty ? "Save pricing rules" : "No changes to save"}
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          className={btnSecondary}
          onClick={async () => {
            if (savedSnapshot) setPricingRules(structuredClone(savedSnapshot));
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Discard edits
        </button>
        <button
          type="button"
          disabled={busy}
          className={btnSecondary}
          onClick={async () => {
            const next = await onReload();
            if (next) {
              setSavedSnapshot(structuredClone(next));
            }
          }}
        >
          <Sparkles className="h-4 w-4" />
          Reload from server
        </button>
        {dirty && (
          <p className="ml-auto text-xs text-amber-800">Save before leaving — edits are local until saved.</p>
        )}
      </div>
    </section>
  );
}
