import { useMemo, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import type { ContractorApplication } from "./contractorApplication";

function money(raw: string | number | undefined | null, suffix = "") {
  const n = Number(raw);
  if (!Number.isFinite(n) || String(raw ?? "").trim() === "") return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}${suffix}`;
}

function pct(raw: string | number | undefined | null) {
  const n = Number(raw);
  if (!Number.isFinite(n) || String(raw ?? "").trim() === "") return "—";
  return `${n}%`;
}

type TradeRate = { trade: string; standard: string; emergency: string };

export default function ContractorPricingPanel({
  application,
  afterHoursFee,
  busy,
  lastUpdated,
  onChangeApplication,
  onChangeAfterHours,
  onSave,
}: {
  application: ContractorApplication;
  afterHoursFee: string;
  busy: boolean;
  lastUpdated?: string | null;
  onChangeApplication: (next: ContractorApplication) => void;
  onChangeAfterHours: (v: string) => void;
  onSave: (
    next: ContractorApplication,
    afterHours: string
  ) => Promise<boolean | void> | boolean | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(application);
  const [draftAfter, setDraftAfter] = useState(afterHoursFee);
  const [tradeRates, setTradeRates] = useState<TradeRate[]>(() =>
    (application.primaryServices || []).slice(0, 6).map((trade, i) => {
      const base = Number(application.standardHourlyRate) || 95;
      const emerg = Number(application.emergencyHourlyRate) || 145;
      const bump = i * 5;
      return {
        trade,
        standard: String(base + bump),
        emergency: String(emerg + bump),
      };
    })
  );

  const updatedLabel = useMemo(() => {
    if (lastUpdated) {
      const d = new Date(lastUpdated);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      }
    }
    return new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }, [lastUpdated]);

  const startEdit = () => {
    setDraft(application);
    setDraftAfter(afterHoursFee);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(application);
    setDraftAfter(afterHoursFee);
  };

  const save = async () => {
    await onSave(draft, draftAfter);
    onChangeApplication(draft);
    onChangeAfterHours(draftAfter);
    setEditing(false);
  };

  const src = editing ? draft : application;
  const afterSrc = editing ? draftAfter : afterHoursFee;

  const Row = ({
    label,
    value,
    editKey,
    kind = "money",
  }: {
    label: string;
    value: string;
    editKey?: keyof ContractorApplication | "afterHours";
    kind?: "money" | "pct" | "moneyHr";
  }) => (
    <div className="flex items-center justify-between gap-3 py-3 text-sm border-b border-border/60 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      {editing && editKey ? (
        <div className="flex items-center gap-1">
          {kind !== "pct" && <span className="text-muted-foreground">$</span>}
          <input
            className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold tabular-nums"
            value={editKey === "afterHours" ? afterSrc : String(src[editKey] || "")}
            onChange={(e) => {
              if (editKey === "afterHours") setDraftAfter(e.target.value);
              else setDraft((d) => ({ ...d, [editKey]: e.target.value }));
            }}
            inputMode="decimal"
          />
          {kind === "moneyHr" && <span className="text-muted-foreground">/hr</span>}
          {kind === "pct" && <span className="text-muted-foreground">%</span>}
        </div>
      ) : (
        <span className="font-semibold tabular-nums">
          {kind === "pct" ? pct(value) : kind === "moneyHr" ? money(value, "/hr") : money(value)}
        </span>
      )}
    </div>
  );

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">
            Pricing & Rates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Published rates used on invitations and estimates.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Rates
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={cancel} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Standard labor</p>
        <div className="mt-1">
          <Row label="Hourly Rate" value={src.standardHourlyRate} editKey="standardHourlyRate" kind="moneyHr" />
          <Row label="Minimum Service Charge" value={src.minimumServiceCharge} editKey="minimumServiceCharge" />
          <Row label="Trip / Dispatch Fee" value={src.tripFee} editKey="tripFee" />
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Emergency</p>
        <div className="mt-1">
          <Row label="Emergency Hourly Rate" value={src.emergencyHourlyRate} editKey="emergencyHourlyRate" kind="moneyHr" />
          <Row label="After-Hours Fee" value={afterSrc} editKey="afterHours" />
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Materials</p>
        <div className="mt-1">
          <Row label="Material Markup" value={src.materialMarkup} editKey="materialMarkup" kind="pct" />
        </div>
      </div>

      {(application.primaryServices || []).length > 0 && (
        <div className="rounded-[1.5rem] border border-border bg-card p-5 sm:p-6 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">By trade</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional overrides — defaults follow your standard and emergency rates.
            </p>
          </div>
          {tradeRates.map((row, idx) => (
            <div key={row.trade} className="rounded-xl border border-border/70 px-4 py-3">
              <p className="font-semibold">{row.trade}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Standard</span>
                  {editing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">$</span>
                      <input
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold"
                        value={row.standard}
                        onChange={(e) => {
                          const next = [...tradeRates];
                          next[idx] = { ...row, standard: e.target.value };
                          setTradeRates(next);
                        }}
                      />
                      <span className="text-muted-foreground">/hr</span>
                    </div>
                  ) : (
                    <span className="font-semibold tabular-nums">{money(row.standard, "/hr")}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Emergency</span>
                  {editing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">$</span>
                      <input
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm font-semibold"
                        value={row.emergency}
                        onChange={(e) => {
                          const next = [...tradeRates];
                          next[idx] = { ...row, emergency: e.target.value };
                          setTradeRates(next);
                        }}
                      />
                      <span className="text-muted-foreground">/hr</span>
                    </div>
                  ) : (
                    <span className="font-semibold tabular-nums">{money(row.emergency, "/hr")}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Last updated <span className="font-medium text-foreground">{updatedLabel}</span>
      </p>
    </section>
  );
}
