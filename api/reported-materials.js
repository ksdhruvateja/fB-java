/** Reported names only: never infer quantities, prices, diagnosis or verification. */
export function reportedMaterials(report = {}) {
  const explicit = Array.isArray(report.partsUsed) ? report.partsUsed : [];
  const values = explicit.length ? explicit : String(report.materialsUsed || '').split(/[,;\n]/);
  return [...new Set(values.map(value => String(typeof value === 'object' ? value?.name || '' : value || '').trim().slice(0, 120)).filter(Boolean))].slice(0, 12);
}
