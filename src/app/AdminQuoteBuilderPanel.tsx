import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Send, Eye, Pencil, ChevronRight, User } from "lucide-react";
import {
  adminCreateProposal,
  adminQuoteBuilderPreview,
  formatMoney,
  type Bid,
  type ManagedJob,
} from "./managedJobs";
import { getStoredUser } from "./auth";
import { emptyLineItem, lineAmount, QUOTE_UNITS, type QuoteLineItem } from "./quoteDocument";

export type PricingAdjustment = {
  id: string;
  type: string;
  label: string;
  amount: number;
  calculation: "fixed" | "percent";
  includeInDisplay?: boolean;
};

export type CustomerLineItem = {
  id: string;
  label: string;
  amount: number;
  visible: boolean;
  name?: string;
  description?: string;
  qty?: number;
  unit?: string;
  unitPrice?: number;
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

type TabId = "build" | "preview" | "send";

function Section({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-background p-4 shadow-sm ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function sumContractorLines(lines: Record<string, number>) {
  return (
    Number(lines.labor || 0) +
    Number(lines.materials || 0) +
    Number(lines.equipment || 0) +
    Number(lines.travelDiagnostic || 0) +
    Number(lines.permitCost || 0) +
    Number(lines.disposal || 0)
  );
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
  const adminUser = getStoredUser();
  const [tab, setTab] = useState<TabId>("build");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<QuotePreview | null>(null);

  const [contractorLines, setContractorLines] = useState({
    labor: bid.labor,
    materials: bid.materials,
    equipment: bid.equipment || 0,
    travelDiagnostic: bid.travelDiagnostic,
    permitCost: bid.permitCost || 0,
    disposal: bid.disposal || 0,
  });

  const [scopeSummary, setScopeSummary] = useState(job.description || job.title || "");
  const [warranty, setWarranty] = useState(bid.warranty || "90-day workmanship");
  const [exclusions, setExclusions] = useState(bid.exclusions || "");
  const [serviceCharge, setServiceCharge] = useState(25);
  const [adjustments, setAdjustments] = useState<PricingAdjustment[]>([]);
  const [adminDiscount, setAdminDiscount] = useState(() =>
    job.discountValue != null && Number(job.discountValue) > 0 ? Number(job.discountValue) : 0,
  );
  const [discountReason, setDiscountReason] = useState(() =>
    job.discountCode
      ? job.discountLabel
        ? `Coupon ${job.discountCode} — ${job.discountLabel}`
        : `Coupon ${job.discountCode}`
      : "",
  );
  const [discountType, setDiscountType] = useState<"fixed" | "percent">(() =>
    String(job.discountType || "").toLowerCase() === "amount" ||
    String(job.discountType || "").toLowerCase() === "fixed"
      ? "fixed"
      : job.discountCode
        ? "percent"
        : "fixed",
  );
  const [validHours, setValidHours] = useState(48);
  const [timeline, setTimeline] = useState(bid.durationHours ? `${bid.durationHours} hours` : "3–4 hours");
  const [customerLineItems, setCustomerLineItems] = useState<QuoteLineItem[]>([]);
  const [lineItemsTouched, setLineItemsTouched] = useState(false);
  const [customerNotes, setCustomerNotes] = useState(
    "Thank you for choosing FixBridge.\nThis quote includes labor and materials listed above.",
  );
  const [termsConditions, setTermsConditions] = useState(
    "Quote valid for 7 days.\nAdditional work requires separate approval.",
  );

  const contractorNet = useMemo(() => sumContractorLines(contractorLines), [contractorLines]);

  const buildPreviewBody = useCallback(
    () => ({
      contractorLines,
      contractorNetOverride: contractorNet,
      pricingAdjustments: adjustments.map(({ id: _id, ...rest }) => rest),
      serviceCharge,
      adminDiscount:
        adminDiscount > 0
          ? { type: discountType, amount: adminDiscount, reason: discountReason }
          : undefined,
    }),
    [contractorLines, contractorNet, adjustments, serviceCharge, adminDiscount, discountReason, discountType],
  );

  const reloadPreview = useCallback(async () => {
    setLoading(true);
    const r = await adminQuoteBuilderPreview(job.id, bid.id, buildPreviewBody());
    setLoading(false);
    if (!r.ok || !r.quotePreview) {
      onMessage(r.message || "Could not load quote preview.");
      return;
    }
    const qp = r.quotePreview as QuotePreview;
    setPreview(qp);

    if (!lineItemsTouched) {
      const auto: QuoteLineItem[] = [
        {
          id: "base",
          name: "Service & Labor",
          description: scopeSummary || job.title || "",
          qty: 1,
          unit: "Service",
          unitPrice: qp.baseRetail,
          amount: qp.baseRetail,
          visible: true,
        },
        ...adjustments
          .filter((a) => a.includeInDisplay !== false)
          .map((a) => {
            const amt =
              a.calculation === "percent" ? Math.round(qp.baseRetail * (a.amount / 100)) : a.amount;
            return {
              id: a.id,
              name: a.label || a.type,
              description: "",
              qty: 1,
              unit: "Flat Rate",
              unitPrice: amt,
              amount: amt,
              visible: true,
            };
          }),
        ...(serviceCharge > 0
          ? [
              {
                id: "svc",
                name: "Service charge",
                description: "",
                qty: 1,
                unit: "Flat Rate",
                unitPrice: serviceCharge,
                amount: serviceCharge,
                visible: true,
              },
            ]
          : []),
        ...(qp.adminDiscount > 0
          ? [
              {
                id: "disc",
                name: discountReason || "Discount",
                description: "",
                qty: 1,
                unit: "Flat Rate",
                unitPrice: -qp.adminDiscount,
                amount: -qp.adminDiscount,
                visible: true,
              },
            ]
          : []),
      ];
      setCustomerLineItems(auto);
    }
  }, [
    job.id,
    job.title,
    bid.id,
    buildPreviewBody,
    adjustments,
    serviceCharge,
    discountReason,
    lineItemsTouched,
    onMessage,
    scopeSummary,
  ]);

  useEffect(() => {
    void reloadPreview();
  }, [reloadPreview]);

  const customerTotal =
    customerLineItems.length > 0
      ? customerLineItems.reduce((s, l) => s + lineAmount(l.qty, l.unitPrice), 0)
      : preview?.customerQuote ?? 0;

  const addAdjustment = () => {
    setAdjustments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "Service Adjustment",
        label: "Pricing adjustment",
        amount: 0,
        calculation: "fixed",
        includeInDisplay: true,
      },
    ]);
    setLineItemsTouched(false);
  };

  const updateAdjustment = (id: string, patch: Partial<PricingAdjustment>) => {
    setAdjustments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setLineItemsTouched(false);
  };

  const publish = async () => {
    setPublishing(true);
    const r = await adminCreateProposal(job.id, bid.id, {
      scopeSummary,
      timeline: timeline || undefined,
      warranty: warranty || undefined,
      exclusions: exclusions || undefined,
      quoteValidHours: validHours,
      serviceCharge,
      contractorLines,
      contractorNetOverride: contractorNet,
      pricingAdjustments: adjustments.map(({ id: _id, ...rest }) => rest),
      adminDiscount:
        adminDiscount > 0 ? { type: discountType, amount: adminDiscount, reason: discountReason } : undefined,
      customerLineItems: customerLineItems.map((l) => ({
        id: l.id,
        name: l.name,
        label: l.name,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        amount: lineAmount(l.qty, l.unitPrice),
        visible: true,
      })),
      retailAmount: customerTotal,
      customerNotes,
      termsConditions,
      couponCode: job.discountCode || undefined,
    });
    setPublishing(false);
    if (!r.ok) {
      onMessage(r.message || "Could not publish quote.");
      return;
    }
    onMessage(
      `Quote ${r.proposal?.quoteNumber || ""} sent to homeowner at ${formatMoney(r.proposal?.retailAmount)}`.trim(),
    );
    await onPublished();
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "build", label: "Build", icon: Pencil },
    { id: "preview", label: "Preview", icon: Eye },
    { id: "send", label: "Send", icon: Send },
  ];

  const inputClass = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm tabular-nums";

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stage B · Professional quotation
          </p>
          <p className="mt-1 text-lg font-semibold">Build FixBridge quote</p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Build a professional line-item quote from the contractor bid. Homeowners see only the final FixBridge
            quotation — never AI estimates or internal economics.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3" />
            Prepared by {adminUser?.name || adminUser?.email || "Admin"}
          </p>
        </div>
        <div className="rounded-xl bg-primary/10 px-4 py-2 text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Customer total</p>
          <p className="text-xl font-bold tabular-nums text-primary">{loading ? "…" : formatMoney(customerTotal)}</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Contractor quote" hint="Admin-only — edit contractor cost buckets.">
            <p className="text-2xl font-bold tabular-nums">{formatMoney(contractorNet)}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  ["labor", "Labor"],
                  ["materials", "Materials"],
                  ["equipment", "Equipment"],
                  ["travelDiagnostic", "Trip / diagnostic"],
                  ["permitCost", "Permits"],
                  ["disposal", "Disposal"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={inputClass}
                    value={contractorLines[key]}
                    onChange={(e) => {
                      setContractorLines((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }));
                      setLineItemsTouched(false);
                    }}
                    onBlur={() => void reloadPreview()}
                  />
                </Field>
              ))}
            </div>
          </Section>

          <Section title="Service scope" hint="What the homeowner reads on the quote.">
            <Field label="Recommended service scope">
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={scopeSummary}
                onChange={(e) => setScopeSummary(e.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Warranty">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                />
              </Field>
              <Field label="Timeline / duration">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Exclusions (optional)">
              <textarea
                className="min-h-[56px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Pricing" hint="Service charge, validity, and discount." className="lg:col-span-2">
            {job.discountCode ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="text-[11px] font-bold uppercase tracking-wider">Coupon on this job</p>
                <p className="mt-1">
                  <span className="font-mono font-semibold">{job.discountCode}</span>
                  {job.discountLabel ? ` — ${job.discountLabel}` : ""}
                  {job.discountValue != null
                    ? ` · ${
                        String(job.discountType).toLowerCase() === "amount"
                          ? formatMoney(Number(job.discountValue))
                          : `${job.discountValue}%`
                      } off`
                    : ""}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[#FF4D1C] hover:underline"
                  onClick={() => {
                    setDiscountType(
                      String(job.discountType || "").toLowerCase() === "amount" ? "fixed" : "percent",
                    );
                    setAdminDiscount(Number(job.discountValue) || 0);
                    setDiscountReason(
                      job.discountLabel
                        ? `Coupon ${job.discountCode} — ${job.discountLabel}`
                        : `Coupon ${job.discountCode}`,
                    );
                    setLineItemsTouched(false);
                    onMessage(`Coupon ${job.discountCode} applied to quote discount.`);
                  }}
                >
                  Apply as discount
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Service charge ($)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={serviceCharge}
                  onChange={(e) => {
                    setServiceCharge(Number(e.target.value) || 0);
                    setLineItemsTouched(false);
                  }}
                  onBlur={() => void reloadPreview()}
                />
              </Field>
              <Field label="Quote validity">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={validHours}
                  onChange={(e) => setValidHours(Number(e.target.value))}
                >
                  {VALIDITY_OPTIONS.map((o) => (
                    <option key={o.hours} value={o.hours}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Discount type">
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value as "fixed" | "percent");
                    setLineItemsTouched(false);
                  }}
                >
                  <option value="fixed">Fixed $</option>
                  <option value="percent">Percentage %</option>
                </select>
              </Field>
              <Field label={discountType === "percent" ? "Discount %" : "Discount ($)"}>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={adminDiscount}
                  onChange={(e) => {
                    setAdminDiscount(Number(e.target.value) || 0);
                    setLineItemsTouched(false);
                  }}
                  onBlur={() => void reloadPreview()}
                />
              </Field>
            </div>
          </Section>

          <Section title="Pricing adjustments" hint="Add fees or modifiers.">
            <button
              type="button"
              onClick={addAdjustment}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Add adjustment
            </button>
            {adjustments.map((adj) => (
              <div
                key={adj.id}
                className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_90px_80px_auto]"
              >
                <select
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={adj.type}
                  onChange={(e) => updateAdjustment(adj.id, { type: e.target.value, label: e.target.value })}
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={adj.label}
                  onChange={(e) => updateAdjustment(adj.id, { label: e.target.value })}
                />
                <input
                  type="number"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                  value={adj.amount}
                  onChange={(e) => updateAdjustment(adj.id, { amount: Number(e.target.value) || 0 })}
                  onBlur={() => void reloadPreview()}
                />
                <select
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={adj.calculation}
                  onChange={(e) =>
                    updateAdjustment(adj.id, { calculation: e.target.value as "fixed" | "percent" })
                  }
                >
                  <option value="fixed">$</option>
                  <option value="percent">%</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustments((prev) => prev.filter((a) => a.id !== adj.id));
                    setLineItemsTouched(false);
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Section>

          <Section
            title="Quote line items"
            hint="Professional qty × unit price rows shown to the homeowner."
            className="lg:col-span-2"
          >
            <button
              type="button"
              onClick={() => {
                setLineItemsTouched(true);
                setCustomerLineItems((prev) => [...prev, emptyLineItem()]);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
            <div className="space-y-2">
              {customerLineItems.map((line) => (
                <div
                  key={line.id}
                  className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-2 md:grid-cols-[1.2fr_1.2fr_70px_100px_90px_auto]"
                >
                  <input
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="Item / Service"
                    value={line.name}
                    onChange={(e) => {
                      setLineItemsTouched(true);
                      setCustomerLineItems((prev) =>
                        prev.map((l) => (l.id === line.id ? { ...l, name: e.target.value } : l)),
                      );
                    }}
                  />
                  <input
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => {
                      setLineItemsTouched(true);
                      setCustomerLineItems((prev) =>
                        prev.map((l) => (l.id === line.id ? { ...l, description: e.target.value } : l)),
                      );
                    }}
                  />
                  <input
                    type="number"
                    className={inputClass}
                    value={line.qty}
                    onChange={(e) => {
                      setLineItemsTouched(true);
                      const qty = Number(e.target.value) || 0;
                      setCustomerLineItems((prev) =>
                        prev.map((l) =>
                          l.id === line.id ? { ...l, qty, amount: lineAmount(qty, l.unitPrice) } : l,
                        ),
                      );
                    }}
                  />
                  <select
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    value={line.unit}
                    onChange={(e) => {
                      setLineItemsTouched(true);
                      setCustomerLineItems((prev) =>
                        prev.map((l) => (l.id === line.id ? { ...l, unit: e.target.value } : l)),
                      );
                    }}
                  >
                    {QUOTE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className={inputClass}
                    value={line.unitPrice}
                    onChange={(e) => {
                      setLineItemsTouched(true);
                      const unitPrice = Number(e.target.value) || 0;
                      setCustomerLineItems((prev) =>
                        prev.map((l) =>
                          l.id === line.id ? { ...l, unitPrice, amount: lineAmount(l.qty, unitPrice) } : l,
                        ),
                      );
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setLineItemsTouched(true);
                      setCustomerLineItems((prev) => prev.filter((l) => l.id !== line.id));
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Customer notes" hint="Visible on the quote.">
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
            />
          </Section>
          <Section title="Terms & conditions" hint="Visible to homeowner.">
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={termsConditions}
              onChange={(e) => setTermsConditions(e.target.value)}
            />
          </Section>

          <button
            type="button"
            onClick={() => setTab("preview")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-muted lg:col-span-2"
          >
            Continue to preview
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {tab === "preview" && (
        <div className="grid gap-4">
          <div className="rounded-xl border-2 border-emerald-200/80 bg-emerald-50/60 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200">
              Homeowner preview
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Exactly what the customer receives — no AI or contractor cost data.
            </p>
            <p className="mt-4 text-3xl font-bold tabular-nums">{formatMoney(customerTotal)}</p>
            <div className="mt-4 space-y-2 border-t border-emerald-200/60 pt-4 text-sm dark:border-emerald-900/40">
              <p className="font-medium">{scopeSummary || job.title}</p>
              {customerLineItems.map((line) => (
                <div key={line.id} className="flex justify-between gap-3 tabular-nums">
                  <span>
                    <span className="font-medium">{line.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {line.qty} {line.unit} × {formatMoney(line.unitPrice)}
                    </span>
                  </span>
                  <span>{formatMoney(lineAmount(line.qty, line.unitPrice))}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-emerald-200/60 pt-2 font-bold dark:border-emerald-900/40">
                <span>Total</span>
                <span>{formatMoney(customerTotal)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("build")}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              Back to edit
            </button>
            <button
              type="button"
              onClick={() => setTab("send")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Looks good — continue to send
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tab === "send" && (
        <div className="space-y-4">
          <Section title="Confirm & publish" hint="Assigns a permanent FBQ number and emails the homeowner.">
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <p className="text-xs text-muted-foreground">Customer pays</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatMoney(customerTotal)}</p>
            </div>
          </Section>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab("preview")}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              Review preview
            </button>
            <button
              type="button"
              disabled={busy || publishing || loading}
              onClick={() => void publish()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send quote to homeowner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
