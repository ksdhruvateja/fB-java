import { useCallback, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import ServiceAreaMap from "./ServiceAreaMap";
import { isValidUsZip, normalizeZip, zipInputProps } from "./zipCode";

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
  const [zipError, setZipError] = useState<string | null>(null);
  const location = [primaryCity, primaryState, primaryZip].filter(Boolean).join(", ") || "Set in compliance profile";

  const previewRadius = Math.min(100, Math.max(5, Number(radius) || radiusMiles || 35));

  const toggleZip = useCallback(
    (zip: string) => {
      const key = normalizeZip(zip).slice(0, 5);
      if (!isValidUsZip(key)) return;
      if (zips.some((z) => z.slice(0, 5) === key)) {
        onSaveZips(zips.filter((z) => z.slice(0, 5) !== key));
      } else {
        onSaveZips([...zips, key]);
      }
    },
    [zips, onSaveZips]
  );

  const addZips = useCallback(
    (incoming: string[]) => {
      const seen = new Set(zips.map((z) => z.slice(0, 5)));
      const merged = [...zips];
      for (const raw of incoming) {
        const key = normalizeZip(raw).slice(0, 5);
        if (!isValidUsZip(key) || seen.has(key)) continue;
        seen.add(key);
        merged.push(key);
      }
      onSaveZips(merged);
    },
    [zips, onSaveZips]
  );

  const addZip = () => {
    const z = normalizeZip(zipInput);
    if (!isValidUsZip(z)) {
      setZipError("Enter a valid 5-digit US ZIP code.");
      return;
    }
    const key = z.slice(0, 5);
    if (zips.some((existing) => existing.slice(0, 5) === key)) {
      setZipInput("");
      setZipError(null);
      return;
    }
    onSaveZips([...zips, key]);
    setZipInput("");
    setZipError(null);
  };

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="[font-family:'Barlow_Condensed',sans-serif] text-3xl font-black uppercase">Service area</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set your travel radius on the map, click to select ZIPs, or scan the circle for nearby coverage.
        </p>
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Primary location</p>
            <p className="mt-2 flex items-center gap-2 text-base font-semibold">
              <MapPin className="h-4 w-4 text-primary" /> {location}
            </p>
          </div>
          <label className="grid gap-1.5 text-sm min-w-[200px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Travel radius (miles)
            </span>
            <div className="flex gap-2">
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={previewRadius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full accent-primary"
              />
              <input
                className="w-16 rounded-xl border border-border bg-background px-2 py-1.5 text-sm text-center"
                value={radius}
                onChange={(e) => setRadius(e.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
              />
            </div>
            <button
              type="button"
              className="mt-1 self-start rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
              onClick={() => onSaveRadius(previewRadius)}
            >
              Save radius
            </button>
          </label>
        </div>

        <ServiceAreaMap
          primaryCity={primaryCity}
          primaryState={primaryState}
          primaryZip={primaryZip}
          radiusMiles={previewRadius}
          selectedZips={zips}
          onToggleZip={toggleZip}
          onAddZips={addZips}
        />
      </div>

      <div className="rounded-[1.5rem] border border-border bg-card p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Selected ZIP codes</p>
        <p className="mt-1 text-sm text-muted-foreground">{zips.length} area{zips.length === 1 ? "" : "s"} selected for job matching.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {zips.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => toggleZip(z)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground"
            >
              {z}
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
          {zips.length === 0 && <p className="text-sm text-muted-foreground">Click the map or scan the radius to add ZIP codes.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="w-36 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
            {...zipInputProps()}
            value={zipInput}
            onChange={(e) => {
              setZipInput(normalizeZip(e.target.value));
              setZipError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZip())}
          />
          <button
            type="button"
            onClick={addZip}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> Add ZIP
          </button>
        </div>
        {zipError && <p className="mt-2 text-xs text-red-600">{zipError}</p>}
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
