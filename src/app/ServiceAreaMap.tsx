import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Scan, MousePointerClick } from "lucide-react";
import { reverseGeocode, scanZipsInRadius } from "./platformApi";
import { getGoogleMapsApiKey, loadGoogleMaps, type GoogleCircle, type GoogleMap, type GoogleMarker } from "./googleMapsLoader";
import { haversineMiles, lookupZipGeo, milesToMeters, type ZipGeo } from "./serviceAreaGeo";
import { isValidUsZip, normalizeZip } from "./zipCode";

export default function ServiceAreaMap({
  primaryCity,
  primaryState,
  primaryZip,
  radiusMiles,
  selectedZips,
  onToggleZip,
  onAddZips,
}: {
  primaryCity?: string;
  primaryState?: string;
  primaryZip?: string;
  radiusMiles: number;
  selectedZips: string[];
  onToggleZip: (zip: string) => void;
  onAddZips: (zips: string[]) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GoogleMap | null>(null);
  const circleRef = useRef<GoogleCircle | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const centerRef = useRef<ZipGeo | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapsKey = getGoogleMapsApiKey();

  useEffect(() => {
    if (!mapsKey) {
      setLoading(false);
      setError("Add VITE_GOOGLE_MAPS_API_KEY to enable the interactive map.");
      return;
    }

    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        const google = await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;

        const zip = normalizeZip(primaryZip || "");
        let center: ZipGeo | null = null;
        if (isValidUsZip(zip)) {
          center = await lookupZipGeo(zip);
        }
        if (!center && primaryCity && primaryState) {
          const r = await reverseGeocode(`${primaryCity}, ${primaryState}`);
          if (r.ok && r.lat != null && r.lng != null) {
            center = { zip: zip.slice(0, 5) || "00000", lat: r.lat, lng: r.lng, place: primaryCity, state: primaryState };
          }
        }
        if (!center) {
          center = { zip: "10001", lat: 40.7506, lng: -73.9971, place: "New York", state: "NY" };
          setError("Set your business ZIP in Compliance to center the map on your location.");
        }
        centerRef.current = center;

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom: 9,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        }) as GoogleMap;
        mapInstance.current = map;

        const circle = new google.maps.Circle({
          map,
          center: { lat: center.lat, lng: center.lng },
          radius: milesToMeters(radiusMiles),
          fillColor: "#FF4D1C",
          fillOpacity: 0.12,
          strokeColor: "#FF4D1C",
          strokeOpacity: 0.65,
          strokeWeight: 2,
          clickable: false,
        }) as GoogleCircle;
        circleRef.current = circle;

        new google.maps.Marker({
          map,
          position: { lat: center.lat, lng: center.lng },
          title: "Primary location",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: "#1e293b",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 3,
          },
          zIndex: 1000,
        });

        google.maps.event.addListener(map, "click", async (...args: unknown[]) => {
          const ev = args[0] as { latLng?: { lat: () => number; lng: () => number } };
          const latLng = ev?.latLng;
          if (!latLng || !centerRef.current) return;
          const point = { lat: latLng.lat(), lng: latLng.lng() };
          const dist = haversineMiles(centerRef.current, point);
          if (dist > radiusMiles + 0.5) return;

          const r = await reverseGeocode(undefined, point.lat, point.lng);
          if (r.ok && r.zip && isValidUsZip(r.zip)) {
            onToggleZip(normalizeZip(r.zip).slice(0, 5));
          }
        });

        setMapReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Map failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [mapsKey, primaryCity, primaryState, primaryZip, onToggleZip]);

  useEffect(() => {
    if (!circleRef.current || !centerRef.current) return;
    circleRef.current.setRadius(milesToMeters(radiusMiles));
    if (mapInstance.current && circleRef.current.getBounds) {
      const bounds = circleRef.current.getBounds();
      if (bounds) mapInstance.current.fitBounds(bounds);
    }
  }, [radiusMiles, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    let cancelled = false;

    async function plotMarkers() {
      const google = window.google;
      if (!google?.maps) return;

      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const unique = [...new Set(selectedZips.map((z) => normalizeZip(z).slice(0, 5)).filter(isValidUsZip))];
      for (const zip of unique) {
        if (cancelled) return;
        const geo = await lookupZipGeo(zip);
        if (!geo) continue;
        const selected = true;
        const marker = new google.maps.Marker({
          map: mapInstance.current,
          position: { lat: geo.lat, lng: geo.lng },
          title: `${zip}${geo.place ? ` · ${geo.place}` : ""}`,
          label: { text: zip.slice(-2), color: "#fff", fontSize: "10px", fontWeight: "700" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: selected ? "#FF4D1C" : "#64748b",
            fillOpacity: 0.95,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        }) as GoogleMarker;
        marker.addListener("click", () => onToggleZip(zip));
        markersRef.current.push(marker);
      }
    }

    void plotMarkers();
    return () => {
      cancelled = true;
    };
  }, [selectedZips, mapReady, onToggleZip]);

  async function handleScanRadius() {
    if (!centerRef.current) return;
    setScanning(true);
    try {
      const r = await scanZipsInRadius(centerRef.current.lat, centerRef.current.lng, radiusMiles);
      if (r.ok && r.zips?.length) {
        onAddZips(r.zips);
      }
    } finally {
      setScanning(false);
    }
  }

  if (!mapsKey) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        <MapPin className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <p className="font-medium text-foreground">Map preview unavailable</p>
        <p className="mt-1">Set <code className="text-xs">VITE_GOOGLE_MAPS_API_KEY</code> in your environment to enable Google Maps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/10">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div ref={mapRef} className="h-[min(420px,55vh)] w-full min-h-[280px]" />
      </div>

      {error && (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF4D1C]/80 ring-2 ring-[#FF4D1C]/30" /> Service radius
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1">
          <MousePointerClick className="h-3 w-3" /> Click map to add/remove ZIP
        </span>
        <button
          type="button"
          disabled={scanning || !mapReady}
          onClick={() => void handleScanRadius()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
          Scan ZIPs in radius
        </button>
      </div>
    </div>
  );
}
