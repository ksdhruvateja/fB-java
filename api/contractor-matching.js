/**
 * Contractor eligibility and ranking for job matching.
 * Uses real service area data — no fabricated ratings.
 */

import { contractorTradesMatchCategory } from './service-catalog.js';

function normalizeZip(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

function parseServiceZips(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeZip).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseServiceZips(parsed);
    } catch {
      return String(raw)
        .split(/[,;\s]+/)
        .map(normalizeZip)
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * ZIP-list coverage only. Radius/city/state/nationwide require dedicated geo logic —
 * return false when not explicitly configured to avoid fake geographic behavior.
 */
export function contractorCoversJobZip(contractor, jobZip) {
  const zip = normalizeZip(jobZip);
  if (!zip) return true;
  const zips = parseServiceZips(contractor.service_zips);
  if (!zips.length) return false;
  return zips.includes(zip);
}

export function isContractorEligibleForJob(contractor, job, { requireCompliance = true } = {}) {
  if (!contractor || contractor.role !== 'contractor') return false;
  if (contractor.is_blocked) return false;
  if (requireCompliance) {
    const compliance = String(contractor.compliance_status || '').toLowerCase();
    if (compliance && compliance !== 'approved') return false;
  }
  if (!contractorTradesMatchCategory(job.category, contractor.trade)) return false;
  return contractorCoversJobZip(contractor, job.zip || job.city_state_zip);
}

export function rankEligibleContractors(contractors, job) {
  return contractors
    .map((c) => {
      let score = 0;
      if (contractorTradesMatchCategory(job.category, c.trade)) score += 40;
      if (contractorCoversJobZip(c, job.zip || job.city_state_zip)) score += 40;
      const compliance = String(c.compliance_status || '').toLowerCase();
      if (compliance === 'approved') score += 20;
      return { contractor: c, score };
    })
    .sort((a, b) => b.score - a.score);
}

export function filterEligibleContractors(contractors, job, options) {
  return contractors.filter((c) => isContractorEligibleForJob(c, job, options));
}
