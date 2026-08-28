import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Pencil } from "lucide-react";
import { checkServiceAreaCoverage } from "./addressApi";
import { placesAutocomplete, reverseGeocode } from "./platformApi";
import { isValidUsZip, normalizeZip } from "./zipCode";

type Props = {
  idPrefix?: string;
  requireAuth?: boolean;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  onStreetAddressChange: (v: string) => void;
  onUnitChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;
  onGeoChange?: (geo: { lat: number | null; lng: number | null; county: string }) => void;
  onCoverageChange?: (covered: boolean | null, message?: string) => void;
};

export default function AddressAutocompleteField({
  idPrefix = "addr",
  requireAuth = true,
  streetAddress,
  unit,
  city,
  state,
  zip,
  onStreetAddressChange,
  onUnitChange,
  onCityChange,
  onStateChange,
  onZipChange,
  onGeoChange,
  onCoverageChange,
}: Props) {
  const [query, setQuery] = useState(streetAddress);
  const [suggestions, setSuggestions] = useState<Array<{ description: string; place_id?: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [coverageMsg, setCoverageMsg] = useState<string | null>(null);
  const [coverageOk, setCoverageOk] = useState<boolean | null>(null);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(streetAddress);
  }, [streetAddress]);

  const runCoverageCheck = useCallback(
    async (zipCode: string) => {
      if (!isValidUsZip(zipCode)) {
        setCoverageOk(null);
        setCoverageMsg(null);
        onCoverageChange?.(null);
        return;
      }
      const r = await checkServiceAreaCoverage(normalizeZip(zipCode));
      setCoverageOk(r.covered ?? null);
      setCoverageMsg(r.message || r.market || null);
      onCoverageChange?.(r.covered ?? null, r.message || r.market);
    },
    [onCoverageChange]
  );

  useEffect(() => {
    if (zip && isValidUsZip(zip)) void runCoverageCheck(zip);
  }, [zip, runCoverageCheck]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function pickSuggestion(description: string) {
    setOpen(false);
    setQuery(description);
    setLoading(true);
    try {
      const geo = await reverseGeocode(description, undefined, undefined, { public: !requireAuth });
      if (!geo.ok) {
        onStreetAddressChange(description);
        setManualMode(true);
        return;
      }
      const street = geo.streetAddress || description.split(",")[0]?.trim() || description;
      onStreetAddressChange(street);
      if (geo.city) onCityChange(geo.city);
      if (geo.state) onStateChange(geo.state);
      if (geo.zip) onZipChange(normalizeZip(geo.zip));
      onGeoChange?.({ lat: geo.lat ?? null, lng: geo.lng ?? null, county: geo.county || "" });
      if (geo.zip) await runCoverageCheck(geo.zip);
    } finally {
      setLoading(false);
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    onStreetAddressChange(value);
    if (manualMode) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      const r = await placesAutocomplete(value.trim(), { public: !requireAuth });
      if (r.ok && r.predictions?.length) {
        setSuggestions(r.predictions);
        setOpen(true);
      } else {
        setSuggestions([]);
      }
    }, 280);
  }

  return (
    <div className="space-y-3" ref={wrapRef}>
      <div>
        <label htmlFor={`${idPrefix}-street`} className="text-xs font-semibold text-muted-foreground">
          Start typing your address
        </label>
        <div className="relative mt-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={`${idPrefix}-street`}
            type="text"
            autoComplete="street-address"
            placeholder="123 Main St, Brooklyn"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
          />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          {open && suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
              {suggestions.map((s) => (
                <li key={s.place_id || s.description}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => void pickSuggestion(s.description)}
                  >
                    {s.description}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setManualMode((m) => !m)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Pencil className="h-3 w-3" />
          {manualMode ? "Use address suggestions" : "Enter address manually"}
        </button>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-semibold text-muted-foreground">Unit / Apartment</span>
        <input
          type="text"
          autoComplete="address-line2"
          placeholder="Apt 4B, Suite 200…"
          value={unit}
          onChange={(e) => onUnitChange(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
        />
      </label>

      {manualMode ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm sm:col-span-1">
            <span className="text-xs font-semibold text-muted-foreground">City</span>
            <input
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">State</span>
            <input
              value={state}
              onChange={(e) => onStateChange(e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">ZIP</span>
            <input
              value={zip}
              onChange={(e) => {
                const v = normalizeZip(e.target.value);
                onZipChange(v);
                if (isValidUsZip(v)) void runCoverageCheck(v);
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : null}

      {coverageOk === true ? (
        <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          ✓ Service available{coverageMsg ? ` · ${coverageMsg}` : ""}
        </p>
      ) : null}
      {coverageOk === false ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {coverageMsg ||
            "This ZIP may be outside our current service area. You can still submit — we'll confirm coverage."}
        </p>
      ) : null}
    </div>
  );
}
