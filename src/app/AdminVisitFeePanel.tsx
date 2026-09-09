import { useEffect, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import type { PricingRules } from "./AdminPricingPanel";

export default function AdminVisitFeePanel({
  pricingRules,
  busy,
  readOnly,
  onSave,
}: {
  pricingRules: PricingRules | null;
  busy?: boolean;
  readOnly?: boolean;
  onSave: (patch: Partial<PricingRules>) => Promise<boolean>;
}) {
  const [visitFee, setVisitFee] = useState("125");
  const [emergencyFee, setEmergencyFee] = useState("125");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricingRules) return;
    const v = Number(pricingRules.default_visit_fee);
    const e = Number(pricingRules.default_emergency_visit_fee ?? pricingRules.default_visit_fee);
    setVisitFee(String(Number.isFinite(v) && v >= 0 ? v : 125));
    setEmergencyFee(String(Number.isFinite(e) && e >= 0 ? e : 125));
  }, [pricingRules]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const amount = Number(visitFee);
    const emergency = Number(emergencyFee);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid visit fee (0 or greater).");
      return;
    }
    if (!Number.isFinite(emergency) || emergency < 0) {
      setError("Enter a valid emergency visit fee (0 or greater).");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const ok = await onSave({
        default_visit_fee: amount,
        default_emergency_visit_fee: emergency,
      });
      if (ok) {
        setMessage(
          `Visit fee saved at $${amount.toFixed(2)}. Homeowners will be charged this amount, and it will be credited automatically on the final bill.`
        );
      } else {
        setError("Could not save visit fee.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save visit fee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Homeowner Visit Fee</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Set the amount homeowners authorize before a pro is dispatched. When the final repair bill is issued,
          this paid visit fee is deducted automatically from the amount due.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={(e) => void handleSave(e)}
          className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF4D1C]/10 text-[#FF4D1C]">
              <Receipt size={20} />
            </span>
            <div>
              <p className="font-semibold">Platform visit fee</p>
              <p className="text-xs text-muted-foreground">Applies to new dispatch authorizations</p>
            </div>
          </div>

          <label className="grid gap-1.5 text-sm max-w-xs">
            <span className="font-medium">Standard visit fee ($)</span>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-7 pr-3"
                value={visitFee}
                onChange={(e) => setVisitFee(e.target.value)}
                disabled={readOnly || saving || busy}
                required
              />
            </div>
          </label>

          <label className="grid gap-1.5 text-sm max-w-xs">
            <span className="font-medium">Emergency visit fee ($)</span>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-7 pr-3"
                value={emergencyFee}
                onChange={(e) => setEmergencyFee(e.target.value)}
                disabled={readOnly || saving || busy}
                required
              />
            </div>
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-teal-700 dark:text-teal-400">{message}</p> : null}

          {!readOnly && (
            <button
              type="submit"
              disabled={saving || busy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save visit fee
            </button>
          )}
        </form>

        <div className="rounded-2xl border border-border bg-muted/20 p-6 space-y-4 text-sm">
          <p className="font-semibold">How the credit works</p>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>Homeowner authorizes the visit fee (currently ${Number(visitFee || 0).toFixed(2)}).</li>
            <li>Admin sends a repair quote / final bill for the full service amount.</li>
            <li>
              FixBridge automatically subtracts the paid visit fee from the amount charged on the final bill
              and shows a “Visit fee credit” line.
            </li>
            <li>Invoice amount due = service total − visit fee already paid − other payments.</li>
          </ol>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            Changes apply to new visit authorizations. Jobs that already authorized a visit fee keep their
            recorded amount for credit calculations.
          </p>
        </div>
      </div>
    </section>
  );
}
