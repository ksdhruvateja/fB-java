/** Structured property memory. Only homeowner- or system-confirmed fields are treated as facts. */

export function propertyMemoryFromRecord(property = {}) {
  return {
    propertyId: property.id || null,
    address: property.address || property.formattedAddress || null,
    source: 'USER_CONFIRMED',
    equipment: [],
    previousAssessments: [],
    recurringIssues: [],
    confirmedFacts: [],
  };
}
