/** Geocoding helpers for contractor service-area map (US ZIPs). */

export type ZipGeo = {
  zip: string;
  lat: number;
  lng: number;
  place?: string;
  state?: string;
};

export function milesToMeters(miles: number): number {
  return Math.max(0, Number(miles) || 0) * 1609.344;
}

const zipGeoCache = new Map<string, ZipGeo | null>();

/** Free US ZIP centroid lookup (no API key). */
export async function lookupZipGeo(zip: string): Promise<ZipGeo | null> {
  const key = zip.slice(0, 5);
  if (!/^\d{5}$/.test(key)) return null;
  if (zipGeoCache.has(key)) return zipGeoCache.get(key) ?? null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${key}`);
    if (!res.ok) {
      zipGeoCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as {
      places?: Array<{ latitude: string; longitude: string; "place name"?: string; "state abbreviation"?: string }>;
    };
    const place = data.places?.[0];
    if (!place) {
      zipGeoCache.set(key, null);
      return null;
    }
    const geo: ZipGeo = {
      zip: key,
      lat: Number(place.latitude),
      lng: Number(place.longitude),
      place: place["place name"],
      state: place["state abbreviation"],
    };
    zipGeoCache.set(key, geo);
    return geo;
  } catch {
    zipGeoCache.set(key, null);
    return null;
  }
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sample points inside a circle for ZIP discovery. */
export function samplePointsInRadius(
  center: { lat: number; lng: number },
  radiusMiles: number,
  rings = 2
): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = [{ ...center }];
  const latDeg = radiusMiles / 69;
  const lngScale = Math.cos((center.lat * Math.PI) / 180) || 1;
  const lngDeg = radiusMiles / (69 * lngScale);

  for (let ring = 1; ring <= rings; ring += 1) {
    const frac = ring / rings;
    const pointsOnRing = ring === 1 ? 6 : 8;
    for (let i = 0; i < pointsOnRing; i += 1) {
      const angle = (i / pointsOnRing) * 2 * Math.PI;
      out.push({
        lat: center.lat + latDeg * frac * Math.sin(angle),
        lng: center.lng + lngDeg * frac * Math.cos(angle),
      });
    }
  }
  return out;
}
