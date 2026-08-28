import { useMemo, useState } from "react";
import { formatMoney } from "./managedJobs";

export type TipPreset = "none" | "10" | "15" | "20" | "custom";

export function HomeownerTipCheckout({
  serviceTotal,
  busy,
  onPay,
}: {
  serviceTotal: number;
  busy?: boolean;
  onPay: (tipAmount: number) => void | Promise<void>;
}) {
  const [preset, setPreset] = useState<TipPreset>("none");
  const [customTip, setCustomTip] = useState("");

  const tipAmount = useMemo(() => {
    if (preset === "none") return 0;
    if (preset === "custom") {
      const n = Number(customTip);
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.round(n * 100) / 100;
    }
    const pct = Number(preset) / 100;
    return Math.round(serviceTotal * pct * 100) / 100;
  }, [preset, customTip, serviceTotal]);

  const maxTip = Math.max(500, serviceTotal * 2);
  const tipInvalid = preset === "custom" && customTip !== "" && (tipAmount < 0 || tipAmount > maxTip);
  const customerTotal = Math.round((serviceTotal + tipAmount) * 100) / 100;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Add a Tip (optional)</p>
        <p className="text-xs text-muted-foreground">100% of your tip goes to your contractor.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["none", "No Tip"],
            ["10", "10%"],
            ["15", "15%"],
            ["20", "20%"],
            ["custom", "Custom"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            onClick={() => setPreset(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              preset === id ? "bg-primary text-white" : "border border-border bg-card hover:bg-muted/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "custom" ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Custom tip amount</label>
          <input
            type="number"
            min={0}
            max={maxTip}
            step="0.01"
            value={customTip}
            disabled={busy}
            onChange={(e) => setCustomTip(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm tabular-nums"
            placeholder="0.00"
          />
          {tipInvalid ? (
            <p className="mt-1 text-xs text-red-600">Enter a valid tip between $0 and {formatMoney(maxTip)}.</p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <div className="flex justify-between tabular-nums">
          <span className="text-muted-foreground">Service Total</span>
          <span className="font-medium">{formatMoney(serviceTotal)}</span>
        </div>
        <div className="mt-2 flex justify-between tabular-nums">
          <span className="text-muted-foreground">Tip</span>
          <span className="font-medium">{formatMoney(tipAmount)}</span>
        </div>
        <div className="my-3 border-t border-border" />
        <div className="flex justify-between tabular-nums text-base font-semibold">
          <span>Total</span>
          <span>{formatMoney(customerTotal)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={busy || tipInvalid || serviceTotal <= 0}
        onClick={() => onPay(tipAmount)}
        className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        Continue to Secure Payment
      </button>
    </div>
  );
}
