/**
 * ZIP → city/state lookup via zippopotam.us (free, no API key).
 * Cached in-memory for the process lifetime.
 */

const zipPlaceCache = new Map();

export async function lookupZipPlace(zip) {
  const key = String(zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(key)) return null;
  if (zipPlaceCache.has(key)) return zipPlaceCache.get(key);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://api.zippopotam.us/us/${key}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      zipPlaceCache.set(key, null);
      return null;
    }
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) {
      zipPlaceCache.set(key, null);
      return null;
    }
    const out = {
      zip: key,
      place: place['place name'] || null,
      state: place['state abbreviation'] || null,
      lat: Number(place.latitude) || null,
      lng: Number(place.longitude) || null,
    };
    zipPlaceCache.set(key, out);
    return out;
  } catch {
    zipPlaceCache.set(key, null);
    return null;
  }
}

export function formatLocationContext({
  zip,
  city,
  state,
  zipPlace,
  marketLabel,
  locationFactor,
  marketProfile,
  property,
  serviceTiming,
}) {
  const lines = [];
  if (zip) lines.push(`ZIP code: ${zip}`);
  const cityName = city || zipPlace?.place;
  const stateCode = state || zipPlace?.state;
  if (cityName && stateCode) lines.push(`Location: ${cityName}, ${stateCode}`);
  else if (cityName) lines.push(`Location: ${cityName}`);
  if (marketLabel) {
    lines.push(
      `Regional market: ${marketLabel} (cost index ~${Number(locationFactor || 1).toFixed(2)}× US baseline)`
    );
  }
  if (zipPlace?.place && !city) {
    lines.push(`Verified location (US postal data): ${zipPlace.place}, ${zipPlace.state}`);
  }
  if (marketProfile?.jobsAnalyzed >= 1) {
    lines.push(`Local FixBridge history: ${marketProfile.basedOn}`);
    if (marketProfile.typicalRange?.low != null) {
      lines.push(
        `Typical local repair band (internal reference only — do NOT quote prices): $${marketProfile.typicalRange.low}–$${marketProfile.typicalRange.high}`
      );
    }
  }
  if (property) {
    if (property.property_type) lines.push(`Property type: ${property.property_type}`);
    if (property.year_built) lines.push(`Year built: ${property.year_built}`);
    if (property.beds) lines.push(`Bedrooms: ${property.beds}`);
    if (property.baths) lines.push(`Bathrooms: ${property.baths}`);
    if (property.sqft) lines.push(`Approx. sqft: ${property.sqft}`);
    if (property.label) lines.push(`Property label: ${property.label}`);
  }
  if (serviceTiming) lines.push(`Requested service timing: ${serviceTiming}`);
  return lines.join('\n');
}
