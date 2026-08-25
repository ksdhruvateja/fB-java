import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { US_STATES } from "./contractorApplication";

export { US_STATES };

/** Resolve "New York" or "NY" → "NY" */
export function normalizeUsStateCode(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.length === 2 && US_STATES.some((s) => s.code === upper)) return upper;
  const byName = US_STATES.find((s) => s.name.toLowerCase() === raw.toLowerCase());
  if (byName) return byName.code;
  const partial = US_STATES.find((s) => s.name.toLowerCase().startsWith(raw.toLowerCase()));
  return partial?.code || upper.slice(0, 2);
}

export function stateLabel(code: string) {
  const hit = US_STATES.find((s) => s.code === code);
  return hit ? `${hit.name} (${hit.code})` : code;
}

/** Major US cities by state — searchable; free-text still allowed. */
export const US_CITIES_BY_STATE: Record<string, string[]> = {
  AL: ["Birmingham", "Montgomery", "Mobile", "Huntsville", "Tuscaloosa"],
  AK: ["Anchorage", "Fairbanks", "Juneau", "Sitka", "Ketchikan"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale", "Glendale", "Tempe"],
  AR: ["Little Rock", "Fort Smith", "Fayetteville", "Springdale", "Jonesboro"],
  CA: [
    "Los Angeles", "San Diego", "San Jose", "San Francisco", "Fresno", "Sacramento",
    "Long Beach", "Oakland", "Bakersfield", "Anaheim", "Santa Ana", "Riverside",
    "Stockton", "Irvine", "Chula Vista", "Fremont", "San Bernardino", "Modesto",
  ],
  CO: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Lakewood", "Boulder"],
  CT: ["Bridgeport", "New Haven", "Stamford", "Hartford", "Waterbury", "Norwalk"],
  DE: ["Wilmington", "Dover", "Newark", "Middletown", "Smyrna"],
  DC: ["Washington"],
  FL: [
    "Jacksonville", "Miami", "Tampa", "Orlando", "St. Petersburg", "Hialeah",
    "Tallahassee", "Fort Lauderdale", "Port St. Lucie", "Cape Coral", "Pembroke Pines",
  ],
  GA: ["Atlanta", "Augusta", "Columbus", "Macon", "Savannah", "Athens", "Sandy Springs"],
  HI: ["Honolulu", "Pearl City", "Hilo", "Kailua", "Waipahu"],
  ID: ["Boise", "Meridian", "Nampa", "Idaho Falls", "Pocatello"],
  IL: ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield", "Peoria"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Carmel", "Bloomington"],
  IA: ["Des Moines", "Cedar Rapids", "Davenport", "Sioux City", "Iowa City"],
  KS: ["Wichita", "Overland Park", "Kansas City", "Olathe", "Topeka", "Lawrence"],
  KY: ["Louisville", "Lexington", "Bowling Green", "Owensboro", "Covington"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport", "Metairie", "Lafayette", "Lake Charles"],
  ME: ["Portland", "Lewiston", "Bangor", "South Portland", "Auburn"],
  MD: ["Baltimore", "Columbia", "Germantown", "Silver Spring", "Frederick", "Rockville"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell", "Brockton", "Quincy"],
  MI: ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing"],
  MN: ["Minneapolis", "St. Paul", "Rochester", "Duluth", "Bloomington", "Brooklyn Park"],
  MS: ["Jackson", "Gulfport", "Southaven", "Hattiesburg", "Biloxi"],
  MO: ["Kansas City", "St. Louis", "Springfield", "Columbia", "Independence", "Lee's Summit"],
  MT: ["Billings", "Missoula", "Great Falls", "Bozeman", "Helena"],
  NE: ["Omaha", "Lincoln", "Bellevue", "Grand Island", "Kearney"],
  NV: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Sparks"],
  NH: ["Manchester", "Nashua", "Concord", "Derry", "Dover"],
  NJ: [
    "Newark", "Jersey City", "Paterson", "Elizabeth", "Edison", "Woodbridge",
    "Lakewood", "Toms River", "Hamilton", "Trenton", "Camden", "Cherry Hill",
  ],
  NM: ["Albuquerque", "Las Cruces", "Rio Rancho", "Santa Fe", "Roswell"],
  NY: [
    "New York", "Buffalo", "Rochester", "Yonkers", "Syracuse", "Albany", "New Rochelle",
    "Mount Vernon", "Schenectady", "Utica", "White Plains", "Hempstead", "Brooklyn",
    "Queens", "Bronx", "Staten Island", "Manhattan", "Garden City", "Long Beach",
  ],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem", "Fayetteville", "Cary"],
  ND: ["Fargo", "Bismarck", "Grand Forks", "Minot", "West Fargo"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton", "Parma"],
  OK: ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow", "Edmond", "Lawton"],
  OR: ["Portland", "Salem", "Eugene", "Gresham", "Hillsboro", "Beaverton"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Reading", "Scranton", "Bethlehem"],
  PR: ["San Juan", "Bayamón", "Carolina", "Ponce", "Caguas"],
  RI: ["Providence", "Warwick", "Cranston", "Pawtucket", "East Providence"],
  SC: ["Charleston", "Columbia", "North Charleston", "Mount Pleasant", "Greenville", "Myrtle Beach"],
  SD: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings", "Watertown"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville", "Murfreesboro"],
  TX: [
    "Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington",
    "Corpus Christi", "Plano", "Laredo", "Lubbock", "Garland", "Irving", "Frisco",
  ],
  UT: ["Salt Lake City", "West Valley City", "Provo", "West Jordan", "Orem", "Sandy"],
  VT: ["Burlington", "South Burlington", "Rutland", "Barre", "Montpelier"],
  VA: ["Virginia Beach", "Norfolk", "Chesapeake", "Richmond", "Newport News", "Alexandria", "Arlington"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Kent", "Everett"],
  WV: ["Charleston", "Huntington", "Morgantown", "Parkersburg", "Wheeling"],
  WI: ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine", "Appleton"],
  WY: ["Cheyenne", "Casper", "Laramie", "Gillette", "Rock Springs"],
};

export function citiesForState(stateCode: string, query = "") {
  const code = normalizeUsStateCode(stateCode);
  const list = US_CITIES_BY_STATE[code] || [];
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.toLowerCase().includes(q));
}

export async function lookupZipUs(zip: string): Promise<{ city: string; state: string } | null> {
  const key = zip.replace(/\D/g, "").slice(0, 5);
  if (key.length !== 5) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;
    return {
      city: place["place name"] || "",
      state: place["state abbreviation"] || "",
    };
  } catch {
    return null;
  }
}

type Option = { value: string; label: string };

export function SearchableSelect({
  label,
  required,
  placeholder,
  value,
  options,
  onChange,
  allowCustom,
  disabled,
}: {
  label: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label || value;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm outline-none focus:border-[#FF4D1C] disabled:opacity-60"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value ? selectedLabel : placeholder || "Select…"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {open ? (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full bg-transparent py-1 text-sm outline-none"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <ul className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                allowCustom && query.trim() ? (
                  <li>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        onChange(query.trim());
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      Use &quot;{query.trim()}&quot;
                    </button>
                  </li>
                ) : (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>
                )
              ) : (
                filtered.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                        o.value === value ? "bg-muted/70 font-semibold" : ""
                      }`}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function UsLocationFields({
  city,
  state,
  zip,
  onCityChange,
  onStateChange,
  onZipChange,
  disabled,
  zipRequired = true,
}: {
  city: string;
  state: string;
  zip: string;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onZipChange: (v: string) => void;
  disabled?: boolean;
  zipRequired?: boolean;
}) {
  const stateOptions = useMemo(
    () => US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` })),
    []
  );

  const cityOptions = useMemo(() => {
    const list = citiesForState(state, city);
    const uniq = Array.from(new Set([...list, city].filter(Boolean)));
    return uniq.map((c) => ({ value: c, label: c }));
  }, [state, city]);

  async function onZipBlur() {
    const normalized = zip.replace(/\D/g, "").slice(0, 5);
    if (normalized.length !== 5) return;
    const hit = await lookupZipUs(normalized);
    if (!hit) return;
    if (hit.state) onStateChange(hit.state);
    if (hit.city) onCityChange(hit.city);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SearchableSelect
          label="State (US)"
          required
          placeholder="Search state…"
          value={normalizeUsStateCode(state)}
          options={stateOptions}
          onChange={onStateChange}
          disabled={disabled}
        />
        <SearchableSelect
          label="City"
          required
          placeholder={state ? "Search city…" : "Select state first"}
          value={city}
          options={cityOptions}
          onChange={onCityChange}
          allowCustom
          disabled={disabled || !normalizeUsStateCode(state)}
        />
      </div>
      <label className="grid gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          ZIP Code {zipRequired ? <span className="text-red-500">*</span> : null}
        </span>
        <input
          type="text"
          required={zipRequired}
          disabled={disabled}
          placeholder="5-digit ZIP — auto-fills city & state"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#FF4D1C] text-foreground"
          value={zip}
          onChange={(e) => onZipChange(e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
          onBlur={() => void onZipBlur()}
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </label>
    </>
  );
}
