/**
 * Versioned legal document store — current + archived, DB-backed with static fallback.
 */

import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_CONTENT,
  listLegalDocumentsForClient,
  STANDALONE_ACCEPTANCE_TYPES,
} from './legal-documents.js';
import { HOMEOWNER_LEGAL_EFFECTIVE_DATE } from './legal-homeowner-content.js';
import {
  INSURANCE_REQUIREMENTS_CONTENT,
  INSURANCE_REQUIREMENTS_META,
} from './insurance-requirements-content.js';
import {
  AGREEMENT_V3_META,
  AGREEMENT_V4_CONTENT,
  AGREEMENT_V4_META,
  MANAGED_ADDENDUM_V4_META,
} from './contractor-agreement-content.js';

const ALL_KEYS = [
  ...Object.keys(LEGAL_DOCUMENTS),
  'CONTRACTOR_AGREEMENT',
  'MANAGED_ADDENDUM',
  'INSURANCE_REQUIREMENTS',
  'SOLO_OWNER_ACKNOWLEDGMENT',
];

const EXTRA_DOCS = {
  CONTRACTOR_AGREEMENT: {
    key: AGREEMENT_V4_META.key,
    title: AGREEMENT_V4_META.title,
    version: AGREEMENT_V4_META.version,
    route: AGREEMENT_V4_META.route,
    acceptanceType: AGREEMENT_V4_META.acceptanceType,
    audience: AGREEMENT_V4_META.audience,
  },
  MANAGED_ADDENDUM: {
    key: MANAGED_ADDENDUM_V4_META.key,
    title: MANAGED_ADDENDUM_V4_META.title,
    version: MANAGED_ADDENDUM_V4_META.version,
    route: MANAGED_ADDENDUM_V4_META.route,
    acceptanceType: MANAGED_ADDENDUM_V4_META.acceptanceType,
    audience: MANAGED_ADDENDUM_V4_META.audience,
  },
  INSURANCE_REQUIREMENTS: {
    key: 'INSURANCE_REQUIREMENTS',
    title: INSURANCE_REQUIREMENTS_META.title,
    version: INSURANCE_REQUIREMENTS_META.version,
    route: INSURANCE_REQUIREMENTS_META.route,
    acceptanceType: null,
    audience: 'contractor',
  },
  SOLO_OWNER_ACKNOWLEDGMENT: {
    key: 'SOLO_OWNER_ACKNOWLEDGMENT',
    title: 'Solo Owner / No Employees Acknowledgment',
    version: '1.0',
    route: '/legal/solo-owner-acknowledgment',
    acceptanceType: 'SOLO_OWNER_ACK',
    audience: 'contractor',
  },
};

const EXTRA_CONTENT = {
  CONTRACTOR_AGREEMENT: AGREEMENT_V4_CONTENT,
  MANAGED_ADDENDUM: {
    heading: MANAGED_ADDENDUM_V4_META.title,
    sections: [
      {
        title: 'Managed services',
        body: 'For Level 2 / FixBridge-Managed jobs, providers discuss work scope; FixBridge controls customer pricing, approvals, and payment.',
      },
      {
        title: 'Pricing firewall',
        body: 'Providers must not quote, negotiate, or collect customer-facing pricing on managed jobs. Provider compensation and NTE are shown separately.',
      },
      {
        title: 'Change orders',
        body: 'Additional scope requires a FixBridge change request, homeowner approval, and approved change order before work proceeds.',
      },
    ],
  },
  INSURANCE_REQUIREMENTS: INSURANCE_REQUIREMENTS_CONTENT,
  SOLO_OWNER_ACKNOWLEDGMENT: {
    heading: 'Solo Owner Acknowledgment',
    sections: [
      { title: 'No employees', body: 'You acknowledge you have no employees and perform work personally or through approved subs per policy.' },
    ],
  },
};

const HOMEOWNER_AUTO_PUBLISH_KEYS = [
  'HOMEOWNER_TERMS',
  'PRIVACY_POLICY',
  'DIY_SAFETY_DISCLAIMER',
  'HOMEOWNER_SERVICE_AGREEMENT',
];

function effectiveDateForMeta(meta) {
  if (meta.version.match(/^\d{4}-\d{2}-\d{2}$/)) return meta.version;
  if (HOMEOWNER_AUTO_PUBLISH_KEYS.includes(meta.key)) return HOMEOWNER_LEGAL_EFFECTIVE_DATE;
  return '2026-08-30';
}

function metaForKey(key) {
  return LEGAL_DOCUMENTS[key] || EXTRA_DOCS[key] || null;
}

async function ensureHomeownerLegalVersions(pool) {
  for (const key of HOMEOWNER_AUTO_PUBLISH_KEYS) {
    const meta = metaForKey(key);
    if (!meta) continue;
    const { rows: current } = await pool.query(
      `SELECT id, version FROM legal_document_versions WHERE document_key=$1 AND status='current' LIMIT 1`,
      [key]
    );
    if (current[0]?.version === meta.version) continue;
    const { rows: exists } = await pool.query(
      `SELECT id FROM legal_document_versions WHERE document_key=$1 AND version=$2`,
      [key, meta.version]
    );
    if (!exists[0]) {
      await publishLegalDocumentVersion(pool, {
        documentKey: key,
        title: meta.title,
        version: meta.version,
        effectiveDate: effectiveDateForMeta(meta),
        route: meta.route,
        audience: meta.audience || 'public',
        content: contentForKey(key),
        createdBy: null,
      });
      continue;
    }
    await pool.query(
      `UPDATE legal_document_versions SET status='archived' WHERE document_key=$1 AND status='current' AND version<>$2`,
      [key, meta.version]
    );
    await pool.query(
      `UPDATE legal_document_versions SET status='current' WHERE document_key=$1 AND version=$2`,
      [key, meta.version]
    );
  }
}

function contentForKey(key) {
  return LEGAL_DOCUMENT_CONTENT[key] || EXTRA_CONTENT[key] || { heading: key, sections: [] };
}

export function listAllDocumentKeys() {
  return ALL_KEYS;
}

export async function seedLegalDocumentVersions(pool) {
  for (const key of ALL_KEYS) {
    const meta = metaForKey(key);
    if (!meta) continue;
    const { rows } = await pool.query(
      `SELECT id FROM legal_document_versions WHERE document_key=$1 AND version=$2`,
      [key, meta.version]
    );
    if (rows[0]) continue;
    await pool.query(
      `INSERT INTO legal_document_versions (
         document_key, title, version, effective_date, status, route, audience, content, created_at
       ) VALUES ($1,$2,$3,$4,'current',$5,$6,$7,NOW())`,
      [
        key,
        meta.title,
        meta.version,
        effectiveDateForMeta(meta),
        meta.route,
        meta.audience || 'public',
        JSON.stringify(contentForKey(key)),
      ]
    );
  }
  await ensureInsuranceRequirementsVersion(pool);
  await ensureContractorAgreementVersions(pool);
  await ensureHomeownerLegalVersions(pool);
}

/** Preserve historical v3 as archived; publish v4 as current without mutating acceptance rows. */
async function ensureContractorAgreementVersions(pool) {
  const key = AGREEMENT_V4_META.key;

  const { rows: v3Rows } = await pool.query(
    `SELECT id FROM legal_document_versions WHERE document_key=$1 AND version=$2`,
    [key, AGREEMENT_V3_META.version]
  );
  if (!v3Rows[0]) {
    await pool.query(
      `INSERT INTO legal_document_versions (
         document_key, title, version, effective_date, status, route, audience, content, created_at
       ) VALUES ($1,$2,$3,'2025-01-01','archived',$4,$5,$6,NOW())`,
      [
        key,
        AGREEMENT_V3_META.title,
        AGREEMENT_V3_META.version,
        AGREEMENT_V3_META.route,
        AGREEMENT_V3_META.audience,
        JSON.stringify({
          heading: AGREEMENT_V3_META.title,
          sections: [{ title: 'Archived', body: 'Superseded by FixBridge Contractor Agreement Package v4.' }],
        }),
      ]
    );
  } else {
    await pool.query(
      `UPDATE legal_document_versions SET status='archived' WHERE document_key=$1 AND version=$2`,
      [key, AGREEMENT_V3_META.version]
    );
  }

  const { rows: current } = await pool.query(
    `SELECT id, version FROM legal_document_versions WHERE document_key=$1 AND status='current' LIMIT 1`,
    [key]
  );
  const { rows: v4Exists } = await pool.query(
    `SELECT id FROM legal_document_versions WHERE document_key=$1 AND version=$2`,
    [key, AGREEMENT_V4_META.version]
  );
  if (current[0]?.version === AGREEMENT_V4_META.version) return;
  if (!v4Exists[0]) {
    await publishLegalDocumentVersion(pool, {
      documentKey: key,
      title: AGREEMENT_V4_META.title,
      version: AGREEMENT_V4_META.version,
      effectiveDate: '2026-08-30',
      route: AGREEMENT_V4_META.route,
      audience: AGREEMENT_V4_META.audience,
      content: AGREEMENT_V4_CONTENT,
      createdBy: null,
    });
    return;
  }
  await pool.query(
    `UPDATE legal_document_versions SET status='archived' WHERE document_key=$1 AND status='current' AND version<>$2`,
    [key, AGREEMENT_V4_META.version]
  );
  await pool.query(
    `UPDATE legal_document_versions SET status='current' WHERE document_key=$1 AND version=$2`,
    [key, AGREEMENT_V4_META.version]
  );
}

async function ensureInsuranceRequirementsVersion(pool) {
  const key = 'INSURANCE_REQUIREMENTS';
  const meta = metaForKey(key);
  if (!meta) return;
  const { rows } = await pool.query(
    `SELECT id, version FROM legal_document_versions WHERE document_key=$1 AND status='current' LIMIT 1`,
    [key]
  );
  if (!rows[0]) return;
  if (rows[0].version === meta.version) return;
  await publishLegalDocumentVersion(pool, {
    documentKey: key,
    title: meta.title,
    version: meta.version,
    effectiveDate: new Date().toISOString().slice(0, 10),
    route: meta.route,
    audience: meta.audience,
    content: contentForKey(key),
    createdBy: null,
  });
}

export async function getCurrentLegalDocument(pool, key) {
  const upper = String(key || '').toUpperCase();
  const { rows } = await pool.query(
    `SELECT * FROM legal_document_versions
     WHERE document_key=$1 AND status='current'
     ORDER BY effective_date DESC, id DESC LIMIT 1`,
    [upper]
  );
  if (rows[0]) return serializeVersionRow(rows[0]);
  const meta = metaForKey(upper);
  if (!meta) return null;
  return {
    key: upper,
    title: meta.title,
    version: meta.version,
    effectiveDate: effectiveDateForMeta(meta),
    route: meta.route,
    acceptanceType: meta.acceptanceType || null,
    audience: meta.audience || 'public',
    status: 'current',
    content: contentForKey(upper),
  };
}

export async function listCurrentLegalDocuments(pool, { audience = null } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM legal_document_versions WHERE status='current' ORDER BY title ASC`
  );
  const fromDb = rows.map(serializeVersionRow);
  if (fromDb.length) {
    return audience ? fromDb.filter((d) => d.audience === audience || d.audience === 'public') : fromDb;
  }
  const staticList = listLegalDocumentsForClient();
  return staticList.map((d) => ({
    key: d.key,
    title: d.title,
    version: d.version,
    effectiveDate: d.version,
    route: d.route,
    acceptanceType: d.acceptanceType,
    audience: 'public',
    status: 'current',
  }));
}

export async function listDocumentVersions(pool, documentKey) {
  const { rows } = await pool.query(
    `SELECT * FROM legal_document_versions WHERE document_key=$1 ORDER BY effective_date DESC, id DESC`,
    [String(documentKey).toUpperCase()]
  );
  return rows.map(serializeVersionRow);
}

export async function publishLegalDocumentVersion(pool, {
  documentKey,
  title,
  version,
  effectiveDate,
  route,
  audience,
  content,
  createdBy,
}) {
  const key = String(documentKey).toUpperCase();
  await pool.query(
    `UPDATE legal_document_versions SET status='archived' WHERE document_key=$1 AND status='current'`,
    [key]
  );
  const { rows } = await pool.query(
    `INSERT INTO legal_document_versions (
       document_key, title, version, effective_date, status, route, audience, content, created_by
     ) VALUES ($1,$2,$3,$4,'current',$5,$6,$7,$8)
     RETURNING *`,
    [
      key,
      title,
      version,
      effectiveDate,
      route,
      audience || 'public',
      JSON.stringify(content),
      createdBy,
    ]
  );
  return serializeVersionRow(rows[0]);
}

function serializeVersionRow(row) {
  const content =
    typeof row.content === 'string' ? JSON.parse(row.content) : row.content || { sections: [] };
  return {
    id: Number(row.id),
    key: row.document_key,
    title: row.title,
    version: row.version,
    effectiveDate: row.effective_date,
    status: row.status,
    route: row.route,
    audience: row.audience,
    acceptanceType: metaForKey(row.document_key)?.acceptanceType || null,
    content,
    createdAt: row.created_at,
    createdBy: row.created_by != null ? Number(row.created_by) : null,
  };
}

export async function getHomeownerLegalStatus(pool, userId) {
  const keys = [
    'HOMEOWNER_TERMS',
    'PRIVACY_POLICY',
    'HOMEOWNER_SERVICE_AGREEMENT',
    'DIY_SAFETY_DISCLAIMER',
    'VISIT_CANCELLATION_POLICY',
  ];
  const docs = [];
  for (const key of keys) {
    const doc = await getCurrentLegalDocument(pool, key);
    if (doc) docs.push(doc);
  }
  const { rows } = await pool.query(
    `SELECT acceptance_type, document_key, document_version, document_title, accepted_at
     FROM homeowner_acceptances
     WHERE user_id=$1 AND accepted=true
     ORDER BY accepted_at DESC`,
    [userId]
  );
  const latestByKey = {};
  for (const r of rows) {
    const k = r.document_key || r.acceptance_type;
    if (!latestByKey[k]) latestByKey[k] = r;
  }
  return keys
    .map((key) => {
      const doc = docs.find((item) => item.key === key);
      if (!doc) return null;
      const acc = latestByKey[key] || latestByKey[doc.acceptanceType];
      let accepted = Boolean(acc);
      let acceptedCurrentVersion = acc && acc.document_version === doc.version;
      if (key === 'DIY_SAFETY_DISCLAIMER') {
        const abilityAcc = latestByKey.DIY_SAFETY_ABILITY_ACK;
        const abilityVersion = STANDALONE_ACCEPTANCE_TYPES.DIY_SAFETY_ABILITY_ACK?.version || '1.0';
        accepted = Boolean(acc && abilityAcc);
        acceptedCurrentVersion =
          Boolean(acc && abilityAcc) &&
          acc.document_version === doc.version &&
          abilityAcc.document_version === abilityVersion;
      }
      return {
        ...doc,
        accepted,
        acceptedCurrentVersion,
        acceptedAt: acc?.accepted_at || null,
        acceptedVersion: acc?.document_version || null,
      };
    })
    .filter(Boolean);
}
