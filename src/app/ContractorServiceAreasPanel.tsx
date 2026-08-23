import { useMemo, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

export default function ContractorServiceAreasPanel({
  primaryCity,
  primaryState,
  primaryZip,
  radiusMiles,
  zips,
  emergencySameAsNormal,
  onSaveRadius,
  onSaveZips,
  onToggleEmergencySame,
}: {
  primaryCity?: string;
  primaryState?: string;
  primaryZip?: string;
  radiusMiles: number;
  zips: string[];
  emergencySameAsNormal: boolean;
  onSaveRadius: (miles: number) => void;
  onSaveZips: (zips: string[]) => void;
  onToggleEmergencySame: (v: boolean) => void;
}) {
  const [radius, setRadius] = useState(String(radiusMiles || 35));
  const [zipInput, setZipInput] = useState("");
  const location = [primaryCity, primaryState, primaryZip].filter(Boolean).join(", ") || "Set in compliance profile";

  const ring = useMemo(() => {
    const r = Math.min(80, Math.max(12, Number(radius) || 35));
    return r;
  }, [radius]);

  const addZip = () => {
    const z = zipInput.trim().replace(/\D/g, "").slice(0, 5);
    if (z.length < 5) return;
    if (zips.includes(z)) {
      setZipInput("");
      return;
    }
    onSaveZips([...zips, z]);
    setZipInput("");
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Service area</h1>
        <p className="mt-1 text-sm text-muted-foreground">Primary location, travel radius, and ZIP coverage.</p>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Primary location</p>
          <p className="mt-2 flex items-center gap-2 text-base font-semibold">
            <MapPin className="h-4 w-4 text-primary" /> {location}
          </p>
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Maximum travel radius
          </span>
          <div className="flex gap-2">
            <input
              className="w-32 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              inputMode="numeric"
            />
            <span className="self-center text-sm text-muted-foreground">miles</span>
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              onClick={() => onSaveRadius(Number(radius) || 35)}
            >
              Save
            </button>
          </div>
        </label>

        {/* Simple radius map visualization */}
        <div className="relative mx-auto aspect-square max-w-sm overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_center,#e8f0fe_0%,#f8fafc_55%,#e2e8f0_100%)] dark:bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_60%,#020617_100%)]">
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/50 bg-primary/10"
            style={{ width: `${ring}%`, height: `${ring}%` }}
          />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow" />
          <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-semibold text-muted-foreground">
            {Number(radius) || 35} mile service radius
          </p>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Service ZIP codes</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {zips.map((z) => (
            <span
              key={z}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-sm font-medium"
            >
              {z}
              <button
                type="button"
                aria-label={`Remove ${z}`}
                onClick={() => onSaveZips(zips.filter((x) => x !== z))}
                className="text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {zips.length === 0 && <p className="text-sm text-muted-foreground">No ZIP codes yet.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="w-36 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            placeholder="ZIP"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZip())}
          />
          <button
            type="button"
            onClick={addZip}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Add ZIP Code
          </button>
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-[1.5rem] border border-border bg-card p-5 text-sm">
        <input
          type="checkbox"
          checked={emergencySameAsNormal}
          onChange={(e) => onToggleEmergencySame(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span>
          <span className="font-semibold">Emergency service area</span>
          <span className="mt-0.5 block text-muted-foreground">Same as normal service area</span>
        </span>
      </label>
    </section>
  );
}
