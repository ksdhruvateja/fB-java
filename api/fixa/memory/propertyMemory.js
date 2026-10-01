/** Structured property memory. Only homeowner- or system-confirmed fields are treated as facts. */

function parseObject(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function propertyMemoryFromRecord(property = {}) {
  const propertyId = property.id || property.propertyId || null;
  const health = parseObject(property.healthProfile || property.health_profile);
  const passport = parseObject(property.passport || health.passport);
  const homeSystems = parseArray(property.homeSystems || property.home_systems || property.equipment || passport.homeSystems);
  const serviceHistory = parseArray(
    property.previousServices || property.serviceHistory || health.previousServices || passport.previousServices
  );
  const equipment = homeSystems
    .filter((item) => item && typeof item === 'object')
    .slice(0, 20)
    .map((item) => {
      const key = String(item.key || item.name || 'equipment').trim();
      return {
        equipmentId: String(item.equipmentId || item.id || `${propertyId || 'property'}:${key}`),
        key,
        name: item.name || key,
        brand: item.brand || item.manufacturer || null,
        model: item.model || null,
        serialNumber: item.serialNumber || item.serial || null,
        installedYear: item.installedYear || item.installationYear || null,
        lastService: item.lastService || null,
        notes: item.notes || null,
        source: item.source || 'USER_REPORTED',
        verification: item.verification || 'USER_REPORTED',
      };
    });
  const previousServices = serviceHistory
    .filter((item) => item && typeof item === 'object')
    .slice(0, 12)
    .map((item) => ({
      caseId: item.caseId || item.jobId || item.id || null,
      title: item.title || item.category || 'Repair or service',
      category: item.category || null,
      diagnosis: item.diagnosis || item.actualDiagnosis || null,
      repair: item.repair || item.actualRepair || item.repairPerformed || null,
      partsUsed: parseArray(item.partsUsed).slice(0, 12),
      date: item.date || item.completedAt || null,
      source: item.source || 'SERVICE_HISTORY',
      verification: item.verification || item.source || 'UNVERIFIED_SERVICE_HISTORY',
    }));
  const confirmedFacts = [
    ...(Array.isArray(property.confirmedFacts) ? property.confirmedFacts : []),
    ...(Array.isArray(passport.confirmedFacts) ? passport.confirmedFacts : []),
  ].filter((fact) => {
    const verification = String(fact?.verification || fact?.status || '').toUpperCase();
    return verification === 'VERIFIED' || verification === 'CUSTOMER_CONFIRMED';
  });

  return {
    propertyId,
    label: property.label || null,
    locality: [property.city, property.state, property.zip].filter(Boolean).join(', ') || null,
    source: 'PROPERTY_PASSPORT',
    equipment,
    previousAssessments: previousServices,
    recurringIssues: Array.isArray(property.recurringIssues) ? property.recurringIssues.slice(0, 12) : [],
    confirmedFacts,
  };
}
