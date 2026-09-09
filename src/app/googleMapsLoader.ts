type GoogleMapsNamespace = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
    Circle: new (opts: Record<string, unknown>) => GoogleCircle;
    Marker: new (opts: Record<string, unknown>) => GoogleMarker;
    event: { addListener: (target: unknown, event: string, fn: (...args: unknown[]) => void) => void };
    SymbolPath: { CIRCLE: unknown };
  };
};

type GoogleMap = {
  setCenter: (c: { lat: number; lng: number }) => void;
  fitBounds: (b: unknown) => void;
};

type GoogleCircle = {
  setMap: (map: GoogleMap | null) => void;
  setCenter: (c: { lat: number; lng: number }) => void;
  setRadius: (r: number) => void;
  getBounds: () => unknown;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
  addListener: (event: string, fn: () => void) => void;
};

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __fixbridgeMapsInit?: () => void;
  }
}

let loadPromise: Promise<GoogleMapsNamespace> | null = null;

export function getGoogleMapsApiKey(): string | undefined {
  const raw = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (typeof raw === "string" && raw.trim().length > 8) return raw.trim();
  return undefined;
}

export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  const key = getGoogleMapsApiKey();
  if (!key) return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not configured"));

  if (window.google?.maps) return Promise.resolve(window.google);

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    window.__fixbridgeMapsInit = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps failed to initialize"));
    };

    const existing = document.querySelector('script[data-fixbridge-maps="1"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google);
      });
      return;
    }

    const script = document.createElement("script");
    script.dataset.fixbridgeMaps = "1";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&callback=__fixbridgeMapsInit`;
    script.onerror = () => reject(new Error("Could not load Google Maps script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export type { GoogleMapsNamespace, GoogleMap, GoogleCircle, GoogleMarker };
