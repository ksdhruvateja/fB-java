import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getCommunicationPreferences,
  updateCommunicationPreferences,
  type MarketingPreferences,
} from "./marketingApi";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-[#FF4D1C]" : "bg-neutral-300"} disabled:opacity-50`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}

export default function HomeownerCommunicationPreferences() {
  const [prefs, setPrefs] = useState<MarketingPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getCommunicationPreferences().then((r) => {
      if (r.ok && r.preferences) setPrefs(r.preferences);
      else setError(r.message || "Could not load preferences.");
      setLoading(false);
    });
  }, []);

  async function save(channel: "email" | "sms", value: boolean) {
    if (!prefs) return;
    setBusy(true);
    setError("");
    const body = channel === "email" ? { emailOptIn: value } : { smsOptIn: value };
    const r = await updateCommunicationPreferences(body);
    setBusy(false);
    if (r.ok && r.preferences) {
      setPrefs(r.preferences);
    } else {
      setError(r.message || "Could not save preference.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  if (!prefs) {
    return <p className="text-sm text-red-600">{error || "Preferences unavailable."}</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Marketing Preferences</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control promotional offers only. Service, payment, and account messages are unaffected.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <p className="font-semibold">Email promotions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Offers, seasonal home-care tips, discounts, and FixBridge news.
          </p>
        </div>
        <Toggle
          label="Email promotions"
          checked={prefs.emailMarketing.subscribed}
          disabled={busy}
          onChange={(v) => void save("email", v)}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">SMS promotions</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Promotional texts, special offers, and relevant FixBridge updates.
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            By opting in, you agree to receive recurring promotional text messages from FixBridge. Message and data
            rates may apply. Message frequency varies. Reply STOP to unsubscribe.
          </p>
        </div>
        <Toggle
          label="SMS promotions"
          checked={prefs.smsMarketing.subscribed}
          disabled={busy}
          onChange={(v) => void save("sms", v)}
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
