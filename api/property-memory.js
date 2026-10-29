/**
 * Property memory trust/precedence — lower trust never overwrites higher trust.
 */

export const MEMORY_TRUST = {
  homeowner_confirmed: 5,
  contractor_structured: 4,
  verified_document: 3,
  ai_accepted: 2,
  ai_suggestion: 1,
};

export function trustLevelForRecord(record) {
  if (!record) return 0;
  const verification = String(record.verification || record.modelConfirmed ? 'confirmed' : '').toLowerCase();
  const source = String(record.source || '').toLowerCase();
  if (verification === 'confirmed' || source === 'confirmed' || source === 'homeowner') {
    return MEMORY_TRUST.homeowner_confirmed;
  }
  if (source === 'contractor' || source === 'completed_job' || source === 'admin') {
    return MEMORY_TRUST.contractor_structured;
  }
  if (source === 'ai_extraction' || source === 'ai_suggested' || source === 'ai') {
    return MEMORY_TRUST.ai_suggestion;
  }
  if (source === 'document' || source === 'verified_document') return MEMORY_TRUST.verified_document;
  if (source === 'ai_accepted') return MEMORY_TRUST.ai_accepted;
  return MEMORY_TRUST.ai_suggestion;
}

export function canOverwriteMemory(existing, incoming) {
  const existingTrust = trustLevelForRecord(existing);
  const incomingTrust = trustLevelForRecord(incoming);
  return incomingTrust >= existingTrust;
}

export function mergeEquipmentRecord(existing, incoming) {
  if (!existing) return { ...incoming, verification: incoming.verification || 'confirmed', source: incoming.source || 'homeowner' };
  if (!canOverwriteMemory(existing, incoming)) return existing;
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null && v !== '')),
    verification: incoming.verification || existing.verification,
    source: incoming.source || existing.source,
    updatedAt: new Date().toISOString(),
  };
}

export function appendMemoryAudit(healthProfile, entry) {
  const profile = healthProfile && typeof healthProfile === 'object' ? { ...healthProfile } : {};
  const audit = Array.isArray(profile.memoryAudit) ? [...profile.memoryAudit] : [];
  audit.unshift({
    ...entry,
    at: new Date().toISOString(),
  });
  profile.memoryAudit = audit.slice(0, 100);
  return profile;
}
