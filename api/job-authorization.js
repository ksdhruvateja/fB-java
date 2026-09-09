/**
 * Immutable job authorization records — agreement/compliance snapshot at provider acceptance.
 */

import {
  getContractorAgreementStatus,
  resolveJobPricingMode,
  resolveProviderLevel,
} from './contractor-agreement.js';
import { getJobComplianceTier } from './contractor-compliance-matrix.js';
import { getContractorComplianceSummary } from './contractor-compliance.js';

export async function createJobAuthorization(pool, { job, providerUser, req = null }) {
  if (!job?.id || !providerUser?.id) return null;

  const agreement = await getContractorAgreementStatus(pool, providerUser.id);
  const compliance = await getContractorComplianceSummary(pool, providerUser.id, { job });
  const pricingMode = resolveJobPricingMode(job);
  const providerLevel = resolveProviderLevel(providerUser);
  const jobTier = getJobComplianceTier(job);

  const providerCompLow =
    job.estimated_contractor_net_low != null ? Number(job.estimated_contractor_net_low) : null;
  const providerCompHigh =
    job.estimated_contractor_net_high != null ? Number(job.estimated_contractor_net_high) : null;
  const customerLow =
    job.customer_retail_estimate_low != null ? Number(job.customer_retail_estimate_low) : null;
  const customerHigh =
    job.customer_retail_estimate_high != null ? Number(job.customer_retail_estimate_high) : null;
  const nteCents =
    job.nte_limit != null
      ? Math.round(Number(job.nte_limit) * 100)
      : job.nte_cents != null
        ? Number(job.nte_cents)
        : null;

  const complianceSnapshot = {
    overallComplianceStatus: compliance?.overallComplianceStatus || null,
    level1Eligible: compliance?.level1Eligible === true,
    level2Eligible: compliance?.level2Eligible === true,
    dispatchEligible: compliance?.dispatchEligible === true,
    missingRequirements: compliance?.missingRequirements || [],
    jobTier,
    capturedAt: new Date().toISOString(),
  };

  const { rows } = await pool.query(
    `INSERT INTO job_authorizations (
       job_id, provider_id, provider_level, pricing_mode, trade, location, job_level, scope,
       nte_cents, provider_compensation_low_cents, provider_compensation_high_cents,
       customer_amount_low_cents, customer_amount_high_cents,
       contractor_agreement_version, managed_addendum_version, compliance_snapshot,
       ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      Number(job.id),
      Number(providerUser.id),
      providerLevel,
      pricingMode,
      job.category || job.trade || null,
      job.city_state_zip || job.full_address || null,
      jobTier,
      job.description || job.title || null,
      nteCents,
      providerCompLow != null ? Math.round(providerCompLow * 100) : null,
      providerCompHigh != null ? Math.round(providerCompHigh * 100) : null,
      customerLow != null ? Math.round(customerLow * 100) : null,
      customerHigh != null ? Math.round(customerHigh * 100) : null,
      agreement.acceptedVersion || agreement.currentVersion,
      agreement.managedAddendum?.acceptedVersion || null,
      JSON.stringify(complianceSnapshot),
      req
        ? (typeof req.headers?.['x-forwarded-for'] === 'string'
            ? req.headers['x-forwarded-for'].split(',')[0].trim()
            : req.socket?.remoteAddress) || null
        : null,
      req?.headers?.['user-agent'] || null,
    ]
  );
  return rows[0];
}

export async function loadJobAuthorization(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT * FROM job_authorizations WHERE job_id=$1 ORDER BY accepted_at DESC LIMIT 1`,
    [Number(jobId)]
  );
  return rows[0] || null;
}
