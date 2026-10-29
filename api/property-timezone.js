/**
 * Property IANA timezone resolution and local→UTC scheduling helpers.
 * Uses Google Time Zone API when coordinates are available; never maps state→TZ.
 */

const FALLBACK_TZ = String(process.env.DEFAULT_PROPERTY_TIMEZONE || '').trim();

function mapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

export function isValidIanaTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const value = tz.trim();
  if (!value.includes('/') || value.length > 64) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezoneInput(tz) {
  if (!tz) return null;
  const value = String(tz).trim();
  return isValidIanaTimezone(value) ? value : null;
}

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Convert a local calendar date + hour/minute in an IANA timezone to UTC.
 */
export function localDateTimeToUtc(isoDate, hour, minute, timeZone) {
  if (!isValidIanaTimezone(timeZone)) return null;
  const [y, m, d] = String(isoDate)
    .slice(0, 10)
    .split('-')
    .map((n) => Number(n));
  if (!y || !m || !d) return null;
  const h = Number(hour);
  const mi = Number(minute);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;

  let utcMs = Date.UTC(y, m - 1, d, h, mi, 0);
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    if (
      parts.year === y &&
      parts.month === m &&
      parts.day === d &&
      parts.hour === h &&
      parts.minute === mi
    ) {
      return new Date(utcMs);
    }
    const desired = Date.UTC(y, m - 1, d, h, mi, 0);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    utcMs += desired - actual;
  }
  return new Date(utcMs);
}

export function timeWindowStartHour(slot) {
  const s = String(slot || '9-11');
  if (s.startsWith('11')) return 11;
  if (s.startsWith('2')) return 14;
  if (s.startsWith('5')) return 17;
  return 9;
}

export function serviceAtFromLocalSlot(isoDate, timeSlot, timeZone) {
  const hour = timeWindowStartHour(timeSlot);
  return localDateTimeToUtc(isoDate, hour, 0, timeZone);
}

/** Legacy UTC-on-calendar-date behavior for jobs without property timezone. */
export function serviceAtLegacyUtc(isoDate, timeSlot) {
  const dateStr = isoDate ? String(isoDate).slice(0, 10) : null;
  if (!dateStr) return null;
  const hour = timeWindowStartHour(timeSlot);
  const d = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatServiceWhenInTimezone(serviceAt, timeSlot, timeZone) {
  const d = new Date(serviceAt);
  const tz = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  });
  const window = timeSlot ? String(timeSlot).replace('-', '–') : null;
  return window ? `${date} between ${window}` : date;
}

export async function lookupTimezoneFromCoordinates(lat, lng) {
  const key = mapsApiKey();
  if (!key || lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  try {
    const ts = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${la},${ln}&timestamp=${ts}&key=${key}`;
    const data = await fetch(url).then((r) => r.json());
    const tz = data?.timeZoneId;
    return isValidIanaTimezone(tz) ? tz : null;
  } catch (e) {
    console.warn('[property-timezone] lookup failed', e.message);
    return null;
  }
}

export async function geocodeUsAddress({ addressLine1, city, state, zip }) {
  const key = mapsApiKey();
  const address = [addressLine1, city, state, zip].filter(Boolean).join(', ');
  if (!key || !address) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}&components=country:US`;
    const data = await fetch(url).then((r) => r.json());
    const result = data.results?.[0];
    const loc = result?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng, formattedAddress: result.formatted_address || null };
  } catch {
    return null;
  }
}

export async function resolveTimezoneForProperty({
  timezone: explicit,
  latitude,
  longitude,
  addressLine1,
  city,
  state,
  zip,
}) {
  const direct = normalizeTimezoneInput(explicit);
  if (direct) return { timezone: direct, latitude: latitude ?? null, longitude: longitude ?? null };

  let lat = latitude != null ? Number(latitude) : null;
  let lng = longitude != null ? Number(longitude) : null;

  if ((!lat || !lng) && addressLine1) {
    const geo = await geocodeUsAddress({ addressLine1, city, state, zip });
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  if (lat != null && lng != null) {
    const tz = await lookupTimezoneFromCoordinates(lat, lng);
    if (tz) return { timezone: tz, latitude: lat, longitude: lng };
  }

  if (isValidIanaTimezone(FALLBACK_TZ)) {
    return { timezone: FALLBACK_TZ, latitude: lat, longitude: lng, fallback: true };
  }

  return { timezone: null, latitude: lat, longitude: lng };
}

export async function loadPropertyTimezone(pool, propertyId) {
  if (!propertyId) return null;
  const { rows } = await pool.query(
    `SELECT timezone, latitude, longitude FROM properties WHERE id=$1`,
    [propertyId]
  );
  const tz = rows[0]?.timezone;
  return isValidIanaTimezone(tz) ? tz : null;
}

export async function resolveServiceAtUtc(pool, job) {
  const dateStr = job?.preferred_date ? String(job.preferred_date).slice(0, 10) : null;
  if (!dateStr) return { serviceAt: null, timezone: null, mode: 'missing_date' };

  const tz =
    normalizeTimezoneInput(job.property_timezone) ||
    (job.property_id ? await loadPropertyTimezone(pool, job.property_id) : null);

  if (tz) {
    const serviceAt = serviceAtFromLocalSlot(dateStr, job.preferred_time_slot, tz);
    return { serviceAt, timezone: tz, mode: 'property_timezone' };
  }

  const serviceAt = serviceAtLegacyUtc(dateStr, job.preferred_time_slot);
  return { serviceAt, timezone: null, mode: 'legacy_utc' };
}

export async function resolveAndPersistPropertyTimezone(pool, propertyId, fields) {
  const resolved = await resolveTimezoneForProperty(fields);
  if (resolved.timezone) {
    await pool.query(
      `UPDATE properties SET timezone=$2, latitude=$3, longitude=$4 WHERE id=$1`,
      [propertyId, resolved.timezone, resolved.latitude, resolved.longitude]
    );
    if (resolved.fallback) {
      console.warn('[property-timezone] using DEFAULT_PROPERTY_TIMEZONE fallback', { propertyId });
    }
  } else {
    console.warn('[property-timezone] could not resolve timezone', { propertyId });
  }
  return resolved;
}
