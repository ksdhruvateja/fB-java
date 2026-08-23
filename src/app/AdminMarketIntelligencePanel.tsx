import { useState } from "react";
import { Loader2, MapPin, Search, TrendingUp } from "lucide-react";
import { formatMoney } from "./managedJobs";

const TRADES = [
  "hvac",
  "plumbing",
  "electrical",
  "roofing",
  "appliance",
  "handyman",
  "painting",
  "flooring",
  "carpentry",
  "others",
] as const;

type MarketProfile = {
  zip: string | null;
  market: string;
  trade: string;
  locationFactor: number;
  jobsAnalyzed: number;
  quotesAnalyzed: number;
  typicalRange: { low: number; high: number };
  medianContractorQuote: number | null;
  medianCustomerEstimate: number | null;
  averageLaborHourly: number | null;
  averageTripFee: number | null;
  recentQuotes: number[];
  aiRecommendedRaw: number;
  customerDisplayedEstimate: number;
  displayAdjustmentAmount: number;
  basedOn: string;
};

function getStoredTokenSafeCompat() {
  try {
    return localStorage.getItem("fixbridge-token");
  } catch {
    return null;
  }
}

export default function AdminMarketIntelligencePanel() {
  const [zip, setZip] = useState("");
  const [trade, setTrade] = useState<string>("hvac");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<MarketProfile | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError("");
    try {
      const token = getStoredTokenSafeCompat();
      const params = new URLSearchParams({ zip: zip.trim(), trade });
      const res = await fetch(`/api/admin/market-intelligence?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "Analysis failed.");
        setProfile(null);
        return;
      }
      setProfile(data.profile);
    } catch {
      setError("Network error.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Market Intelligence</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ZIP-first pricing context for AI estimates. Homeowners never see this panel — only the final FixBridge
          estimate after pricing rules.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
        <label className="grid min-w-[10rem] flex-1 gap-1 text-sm">
          <span className="font-medium">ZIP code</span>
          <input
            className="rounded-xl border border-border bg-background px-3 py-2.5"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="75201"
            onKeyDown={(e) => {
              if (e.key === "Enter") void analyze();
            }}
          />
        </label>
        <label className="grid min-w-[10rem] gap-1 text-sm">
          <span className="font-medium">Trade</span>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2.5"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
          >
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={loading || zip.trim().length < 3}
            onClick={() => void analyze()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF4D1C] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Analyze
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {profile && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <MapPin className="h-5 w-5 text-[#FF4D1C]" />
                  {profile.zip} · {profile.market}
                </p>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{profile.trade}</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-right text-sm">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Location factor</p>
                <p className="font-semibold tabular-nums">{profile.locationFactor.toFixed(2)}×</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{profile.basedOn}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Typical range" value={`${formatMoney(profile.typicalRange.low)} – ${formatMoney(profile.typicalRange.high)}`} />
            <Stat label="Jobs analyzed" value={String(profile.jobsAnalyzed)} />
            <Stat label="Quotes analyzed" value={String(profile.quotesAnalyzed)} />
            <Stat
              label="Median contractor quote"
              value={profile.medianContractorQuote != null ? formatMoney(profile.medianContractorQuote) : "—"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                AI market estimate (internal)
              </p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(profile.aiRecommendedRaw)}</p>
              <p className="text-xs text-muted-foreground">
                Avg labor {profile.averageLaborHourly != null ? formatMoney(profile.averageLaborHourly) + "/hr" : "—"} ·
                Trip {profile.averageTripFee != null ? formatMoney(profile.averageTripFee) : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-[#FF4D1C]/30 bg-[#FF4D1C]/5 p-4 space-y-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#FF4D1C]">
                <TrendingUp className="h-3.5 w-3.5" />
                Homeowner displayed estimate
              </p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(profile.customerDisplayedEstimate)}</p>
              <p className="text-xs text-muted-foreground">
                After pricing rule (+{formatMoney(profile.displayAdjustmentAmount)}). Customer never sees the AI raw
                amount or markup.
              </p>
            </div>
          </div>

          {profile.recentQuotes.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Recent contractor quotes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.recentQuotes.map((amt, i) => (
                  <span key={`${amt}-${i}`} className="rounded-lg bg-muted px-2.5 py-1 text-sm tabular-nums">
                    {formatMoney(amt)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
