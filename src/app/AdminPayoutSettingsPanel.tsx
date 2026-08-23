import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { adminGetPayoutSettings, adminUpdatePayoutSettings, formatCents, type PayoutSettings } from "./managedJobs";

export default function AdminPayoutSettingsPanel() {
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminGetPayoutSettings().then((r) => {
      if (r.ok) setSettings(r.settings);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    const r = await adminUpdatePayoutSettings(settings);
    setSaving(false);
    if (r.ok) {
      setSettings(r.settings);
      setMessage("Payout settings saved.");
    } else {
      setMessage("Could not save settings.");
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payout Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure instant payout fees and eligibility rules.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-semibold">Instant payout</h2>

        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Enable instant payouts</span>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, instantPayoutEnabled: !settings.instantPayoutEnabled })}
            className={`relative h-7 w-12 rounded-full transition ${settings.instantPayoutEnabled ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${settings.instantPayoutEnabled ? "left-5" : "left-0.5"}`}
            />
          </button>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Fee type</span>
          <select
            value={settings.instantFeeType}
            onChange={(e) => setSettings({ ...settings, instantFeeType: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed fee</option>
            <option value="percentage_plus_fixed">Percentage + fixed fee</option>
          </select>
        </label>

        {(settings.instantFeeType === "percentage" || settings.instantFeeType === "percentage_plus_fixed") && (
          <label className="block text-sm">
            <span className="font-medium">Percentage fee (%)</span>
            <input
              type="number"
              step="0.01"
              value={settings.instantFeePercentage}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  instantFeePercentage: Number(e.target.value),
                  instantFeePercentageBps: Math.round(Number(e.target.value) * 100),
                })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
        )}

        {(settings.instantFeeType === "fixed" || settings.instantFeeType === "percentage_plus_fixed") && (
          <label className="block text-sm">
            <span className="font-medium">Fixed fee ($)</span>
            <input
              type="number"
              step="0.01"
              value={(settings.instantFeeFixedCents / 100).toFixed(2)}
              onChange={(e) =>
                setSettings({ ...settings, instantFeeFixedCents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Minimum fee ($)</span>
            <input
              type="number"
              step="0.01"
              value={(settings.minimumInstantFeeCents / 100).toFixed(2)}
              onChange={(e) =>
                setSettings({ ...settings, minimumInstantFeeCents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Maximum fee ($)</span>
            <input
              type="number"
              step="0.01"
              value={(settings.maximumInstantFeeCents / 100).toFixed(2)}
              onChange={(e) =>
                setSettings({ ...settings, maximumInstantFeeCents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Min instant payout ($)</span>
            <input
              type="number"
              step="0.01"
              value={(settings.minimumInstantPayoutCents / 100).toFixed(2)}
              onChange={(e) =>
                setSettings({ ...settings, minimumInstantPayoutCents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Max instant payout ($)</span>
            <input
              type="number"
              step="0.01"
              value={(settings.maximumInstantPayoutCents / 100).toFixed(2)}
              onChange={(e) =>
                setSettings({ ...settings, maximumInstantPayoutCents: Math.round(Number(e.target.value) * 100) })
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.contractorAbsorbsFee}
            onChange={(e) => setSettings({ ...settings, contractorAbsorbsFee: e.target.checked })}
          />
          Contractor absorbs instant payout fee
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.fixbridgeAbsorbsFee}
            onChange={(e) => setSettings({ ...settings, fixbridgeAbsorbsFee: e.target.checked })}
          />
          FixBridge absorbs instant payout fee
        </label>

        <p className="text-xs text-muted-foreground">
          Example on {formatCents(42500)}: fee ≈{" "}
          {formatCents(
            Math.min(
              settings.maximumInstantFeeCents,
              Math.max(
                settings.minimumInstantFeeCents,
                (settings.instantFeeType.includes("percentage")
                  ? Math.round((42500 * settings.instantFeePercentageBps) / 10000)
                  : 0) +
                  (settings.instantFeeType.includes("fixed") ? settings.instantFeeFixedCents : 0)
              )
            )
          )}
        </p>

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </button>

        {message && <p className="text-sm text-emerald-700">{message}</p>}
      </div>
    </div>
  );
}
