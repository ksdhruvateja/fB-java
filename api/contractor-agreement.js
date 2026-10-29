/**
 * Contractor Agreement Package v4 — acceptance records, version checks, dispatch gate.
 */

import { getCurrentLegalDocument } from './legal-document-store.js';
import {
  AGREEMENT_V4_TITLE,
  AGREEMENT_V4_VERSION,
  CONTRACTOR_AGREEMENT_KEY,
  MANAGED_ADDENDUM_KEY,
} from './contractor-agreement-content.js';

export function clientIp(req) {
  return (
    (typeof req?.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : null) ||
    req?.socket?.remoteAddress ||
    null
  );
}

export async function loadContractorAgreementAcceptances(pool, contractorUserId) {
  const { rows } = await pool.query(
    `SELECT id, document_key, document_version, document_title, accepted_at, ip_address, user_agent, source_route
     FROM contractor_agreement_acceptances
     WHERE contractor_user_id=$1
     ORDER BY accepted_at DESC`,
    [contractorUserId]
  );
  return rows;
}

export async function getCurrentAgreementVersion(pool) {
  const doc = await getCurrentLegalDocument(pool, CONTRACTOR_AGREEMENT_KEY);
  return doc?.version || AGREEMENT_V4_VERSION;
}

export async function getContractorAgreementStatus(pool, contractorUserId) {
  const currentVersion = await getCurrentAgreementVersion(pool);
  const acceptances = await loadContractorAgreementAcceptances(pool, contractorUserId);
  const contractorAcceptances = acceptances.filter((a) => a.document_key === CONTRACTOR_AGREEMENT_KEY);
  const latest = contractorAcceptances[0] || null;
  const acceptedCurrent = Boolean(
    latest && String(latest.document_version) === String(currentVersion)
  );
  const historical = contractorAcceptances.map((a) => ({
    version: a.document_version,
    title: a.document_title,
    acceptedAt: a.accepted_at,
    ipAddress: a.ip_address,
    sourceRoute: a.source_route,
    archived: String(a.document_version) !== String(currentVersion),
  }));

  const managedRows = acceptances.filter((a) => a.document_key === MANAGED_ADDENDUM_KEY);
  const managedLatest = managedRows[0] || null;
  const managedDoc = await getCurrentLegalDocument(pool, MANAGED_ADDENDUM_KEY);
  const managedCurrentVersion = managedDoc?.version || '4';
  const managedAddendumAccepted = Boolean(
    managedLatest && String(managedLatest.document_version) === String(managedCurrentVersion)
  );

  return {
    currentVersion,
    currentTitle: AGREEMENT_V4_TITLE,
    accepted: Boolean(latest),
    acceptedCurrent,
    acceptedAt: latest?.accepted_at || null,
    acceptedVersion: latest?.document_version || null,
    historical,
    managedAddendum: {
      required: false,
      accepted: managedAddendumAccepted,
      acceptedAt: managedLatest?.accepted_at || null,
      acceptedVersion: managedLatest?.document_version || null,
      currentVersion: managedCurrentVersion,
    },
  };
}

export async function recordContractorAgreementAcceptance(
  pool,
  {
    contractorUserId,
    documentKey = CONTRACTOR_AGREEMENT_KEY,
    documentVersion = null,
    documentTitle = null,
    req = null,
    sourceRoute = '/api/auth/signup',
    ipAddress = null,
    userAgent = null,
  }
) {
  const key = String(documentKey).toUpperCase();
  let version = documentVersion;
  let title = documentTitle;
  if (!version || !title) {
    const doc = await getCurrentLegalDocument(pool, key);
    version = version || doc?.version || AGREEMENT_V4_VERSION;
    title = title || doc?.title || AGREEMENT_V4_TITLE;
  }

  const ip = ipAddress ?? (req ? clientIp(req) : null);
  const ua = userAgent ?? req?.headers?.['user-agent'] ?? null;

  const { rows } = await pool.query(
    `INSERT INTO contractor_agreement_acceptances (
       contractor_user_id, document_key, document_version, document_title, ip_address, user_agent, source_route
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [contractorUserId, key, String(version), title, ip, ua, sourceRoute]
  );
  return rows[0];
}

export async function assertCurrentContractorAgreement(pool, contractorUserId) {
  const status = await getContractorAgreementStatus(pool, contractorUserId);
  if (status.acceptedCurrent) {
    return { ok: true, status };
  }
  return {
    ok: false,
    code: 'CONTRACTOR_AGREEMENT_REQUIRED',
    message: status.accepted
      ? `FixBridge Contractor Agreement Package v${status.currentVersion} acceptance required before dispatch.`
      : 'FixBridge Contractor Agreement Package v4 acceptance required before dispatch.',
    status,
  };
}

export function resolveJobPricingMode(job = {}) {
  const explicit = String(job.pricing_mode || job.pricingMode || '').toUpperCase();
  if (explicit === 'PROVIDER_DIRECT' || explicit === 'FIXBRIDGE_MANAGED') return explicit;
  const mode = String(job.job_mode || job.jobMode || 'managed').toLowerCase();
  if (mode === 'direct' || mode === 'provider_direct') return 'PROVIDER_DIRECT';
  return 'FIXBRIDGE_MANAGED';
}

export function resolveProviderLevel(user = {}) {
  const raw = String(user.provider_level || user.providerLevel || '').toLowerCase();
  if (raw === 'level_2' || raw === 'level2' || raw === '2') return 'level_2';
  if (user.level2_eligible === true && user.level1_eligible !== true) return 'level_2';
  return 'level_1';
}
