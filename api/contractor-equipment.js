/**
 * Trade-aware structured equipment validation for contractor job completion.
 */

const FIELD_LIMITS = {
  manufacturer: 80,
  model: 80,
  serial: 80,
  filterSize: 40,
  capacity: 40,
  fuelType: 40,
  equipmentType: 60,
  applianceType: 60,
  roofMaterial: 60,
  notes: 400,
};

function cleanStr(v, max) {
  if (v == null) return undefined;
  const s = String(v).trim().slice(0, max);
  return s || undefined;
}

function cleanYear(v) {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).slice(0, 4));
  if (!Number.isFinite(n) || n < 1950 || n > new Date().getFullYear() + 1) return undefined;
  return n;
}

function tradeKeyFromJob(job, bodyTrade) {
  const cat = String(bodyTrade || job?.category || job?.service_subcategory || '').toLowerCase();
  if (/hvac|furnace|ac\b|air condition|heat pump/.test(cat)) return 'hvac';
  if (/water.?heater/.test(cat)) return 'water_heater';
  if (/appliance|refrigerat|dishwasher|washer|dryer|oven|range/.test(cat)) return 'appliance';
  if (/roof|gutter/.test(cat)) return 'roof';
  if (/plumb|pipe|drain/.test(cat)) return 'plumbing';
  if (/electric|panel|breaker/.test(cat)) return 'electrical';
  return 'general';
}

const TRADE_SYSTEM_KEY = {
  hvac: 'hvac',
  water_heater: 'water_heater',
  appliance: 'refrigerator',
  roof: 'roof',
  plumbing: 'plumbing',
  electrical: 'electrical',
  general: 'other_system',
};

export function normalizeStructuredEquipment(job, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const trade = tradeKeyFromJob(job, raw.trade);
  const key = TRADE_SYSTEM_KEY[trade] || 'other_system';

  const base = {
    trade,
    key,
    name: cleanStr(raw.name || raw.systemLabel || trade.replace(/_/g, ' '), 80),
    source: 'contractor',
    verification: 'pending',
  };

  if (trade === 'hvac') {
    return {
      ...base,
      manufacturer: cleanStr(raw.manufacturer || raw.brand, FIELD_LIMITS.manufacturer),
      model: cleanStr(raw.model, FIELD_LIMITS.model),
      serial: cleanStr(raw.serial || raw.serialNumber, FIELD_LIMITS.serial),
      filterSize: cleanStr(raw.filterSize, FIELD_LIMITS.filterSize),
      installationYear: cleanYear(raw.installationYear || raw.installedYear),
      equipmentType: cleanStr(raw.equipmentType, FIELD_LIMITS.equipmentType),
      notes: cleanStr(raw.notes, FIELD_LIMITS.notes),
    };
  }

  if (trade === 'water_heater') {
    return {
      ...base,
      manufacturer: cleanStr(raw.manufacturer || raw.brand, FIELD_LIMITS.manufacturer),
      model: cleanStr(raw.model, FIELD_LIMITS.model),
      serial: cleanStr(raw.serial || raw.serialNumber, FIELD_LIMITS.serial),
      capacity: cleanStr(raw.capacity, FIELD_LIMITS.capacity),
      fuelType: cleanStr(raw.fuelType || raw.type, FIELD_LIMITS.fuelType),
      installationYear: cleanYear(raw.installationYear || raw.installedYear),
      notes: cleanStr(raw.notes, FIELD_LIMITS.notes),
    };
  }

  if (trade === 'appliance') {
    return {
      ...base,
      applianceType: cleanStr(raw.applianceType || raw.equipmentType, FIELD_LIMITS.applianceType),
      manufacturer: cleanStr(raw.manufacturer || raw.brand, FIELD_LIMITS.manufacturer),
      model: cleanStr(raw.model, FIELD_LIMITS.model),
      serial: cleanStr(raw.serial || raw.serialNumber, FIELD_LIMITS.serial),
      notes: cleanStr(raw.notes, FIELD_LIMITS.notes),
    };
  }

  if (trade === 'roof') {
    return {
      ...base,
      roofMaterial: cleanStr(raw.roofMaterial || raw.material || raw.roofType, FIELD_LIMITS.roofMaterial),
      installationYear: cleanYear(raw.approximateAge ? new Date().getFullYear() - Number(raw.approximateAge) : raw.installationYear),
      notes: cleanStr(raw.notes || raw.conditionNotes, FIELD_LIMITS.notes),
    };
  }

  return {
    ...base,
    manufacturer: cleanStr(raw.manufacturer || raw.brand, FIELD_LIMITS.manufacturer),
    model: cleanStr(raw.model, FIELD_LIMITS.model),
    serial: cleanStr(raw.serial || raw.serialNumber, FIELD_LIMITS.serial),
    notes: cleanStr(raw.notes, FIELD_LIMITS.notes),
  };
}

export function hasStructuredEquipmentData(eq) {
  if (!eq) return false;
  return Boolean(
    eq.manufacturer ||
      eq.model ||
      eq.serial ||
      eq.filterSize ||
      eq.capacity ||
      eq.installationYear ||
      eq.equipmentType ||
      eq.applianceType ||
      eq.roofMaterial
  );
}

export function equipmentFromExtraction(extraction, trade) {
  if (!extraction || typeof extraction !== 'object') return null;
  return normalizeStructuredEquipment({ category: trade || extraction.systemKey }, {
    manufacturer: extraction.manufacturer || extraction.brand,
    model: extraction.model,
    serial: extraction.serial || extraction.serialNumber,
    filterSize: extraction.filterSize,
    installationYear: extraction.installationDate || extraction.installationYear,
    equipmentType: extraction.equipmentType || extraction.systemLabel,
    notes: extraction.summary,
    trade: trade || extraction.systemKey,
  });
}
