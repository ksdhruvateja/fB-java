import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { adminGetPayoutSettings, adminUpdatePayoutSettings, formatCents, type PayoutSettings } from "./managedJobs";

type MoneyDrafts = {
  instantFeePercentage: string;
  instantFeeFixed: string;
  minimumInstantFee: string;
  maximumInstantFee: string;
  minimumInstantPayout: string;
  maximumInstantPayout: string;
};

function centsToDraft(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "";
  return (Number(cents) / 100).toFixed(2);
}

function draftToCents(raw: string): number {
  const cleaned = String(raw ?? "").trim().replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function draftToPercentage(raw: string): number {
  const cleaned = String(raw ?? "").trim().replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function draftsFromSettings(s: PayoutSettings): MoneyDrafts {
  return {
    instantFeePercentage: String(s.instantFeePercentage ?? s.instantFeePercentageBps / 100 ?? 0),
    instantFeeFixed: centsToDraft(s.instantFeeFixedCents),
    minimumInstantFee: centsToDraft(s.minimumInstantFeeCents),
    maximumInstantFee: centsToDraft(s.maximumInstantFeeCents),
    minimumInstantPayout: centsToDraft(s.minimumInstantPayoutCents),
    maximumInstantPayout: centsToDraft(s.maximumInstantPayoutCents),
  };
}

function settingsFromDrafts(settings: PayoutSettings, drafts: MoneyDrafts): PayoutSettings {
  const pct = draftToPercentage(drafts.instantFeePercentage);
  return {
    ...settings,
    instantFeePercentage: pct,
    instantFeePercentageBps: Math.round(pct * 100),
    instantFeeFixedCents: draftToCents(drafts.instantFeeFixed),
    minimumInstantFeeCents: draftToCents(drafts.minimumInstantFee),
    maximumInstantFeeCents: draftToCents(drafts.maximumInstantFee),
    minimumInstantPayoutCents: draftToCents(drafts.minimumInstantPayout),
    maximumInstantPayoutCents: draftToCents(drafts.maximumInstantPayout),
  };
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "" || /^-?\d*\.?\d*$/.test(next)) onChange(next);
        }}
        onBlur={() => {
          if (value.trim() === "") return;
          const n = Number(value.replace(/,/g, ""));
          if (Number.isFinite(n)) onChange(n.toFixed(2));
        }}
        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

export default function AdminPayoutSettingsPanel() {
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [drafts, setDrafts] = useState<MoneyDrafts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminGetPayoutSettings().then((r) => {
      if (r.ok) {
        setSettings(r.settings);
        setDrafts(draftsFromSettings(r.settings));
      }
      setLoading(false);
    });
  }, []);

  const setDraft = (key: keyof MoneyDrafts, value: string) => {
    setDrafts((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!settings || !drafts) return;
    setSaving(true);
    setMessage("");
    const payload = settingsFromDrafts(settings, drafts);
    const r = await adminUpdatePayoutSettings(payload);
    setSaving(false);
    if (r.ok) {
      setSettings(r.settings);
      setDrafts(draftsFromSettings(r.settings));
      setMessage("Payout settings saved.");
    } else {
      setMessage(r.message || "Could not save settings.");
    }
  };

  if (loading || !settings || !drafts) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const preview = settingsFromDrafts(settings, drafts);
  const exampleFee = Math.min(
    preview.maximumInstantFeeCents,
    Math.max(
      preview.minimumInstantFeeCents,
      (preview.instantFeeType.includes("percentage")
        ? Math.round((42500 * preview.instantFeePercentageBps) / 10000)
        : 0) + (preview.instantFeeType.includes("fixed") ? preview.instantFeeFixedCents : 0)
    )
  );

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
            aria-pressed={settings.instantPayoutEnabled}
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

        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyInput
            label="Percentage fee (%)"
            value={drafts.instantFeePercentage}
            onChange={(v) => setDraft("instantFeePercentage", v)}
          />
          <MoneyInput
            label="Fixed fee ($)"
            value={drafts.instantFeeFixed}
            onChange={(v) => setDraft("instantFeeFixed", v)}
          />
          <MoneyInput
            label="Minimum fee ($)"
            value={drafts.minimumInstantFee}
            onChange={(v) => setDraft("minimumInstantFee", v)}
          />
          <MoneyInput
            label="Maximum fee ($)"
            value={drafts.maximumInstantFee}
            onChange={(v) => setDraft("maximumInstantFee", v)}
          />
          <MoneyInput
            label="Min instant payout ($)"
            value={drafts.minimumInstantPayout}
            onChange={(v) => setDraft("minimumInstantPayout", v)}
          />
          <MoneyInput
            label="Max instant payout ($)"
            value={drafts.maximumInstantPayout}
            onChange={(v) => setDraft("maximumInstantPayout", v)}
          />
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
          Example on {formatCents(42500)}: fee ≈ {formatCents(exampleFee)}
          {settings.instantFeeType === "percentage" && " (percentage only applies)"}
          {settings.instantFeeType === "fixed" && " (fixed only applies)"}
          {settings.instantFeeType === "percentage_plus_fixed" && " (percentage + fixed)"}
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

        {message && (
          <p className={`text-sm ${message.includes("saved") ? "text-emerald-700" : "text-red-600"}`}>{message}</p>
        )}
      </div>
    </div>
  );
}
