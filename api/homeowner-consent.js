/**
 * Homeowner consent / acceptance records — append-only, versioned, server-enforced.
 */

import {
  CONSENT_ACTIONS,
  resolveAcceptanceMeta,
  getDocumentForAcceptanceType,
} from './legal-documents.js';

export const ACCEPTANCE_TYPES = {
  ACCOUNT_TERMS: 'ACCOUNT_TERMS',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  DIY_SAFETY: 'DIY_SAFETY',
  PROFESSIONAL_DISPATCH_PROVIDER_ACK: 'PROFESSIONAL_DISPATCH_PROVIDER_ACK',
  PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK: 'PROFESSIONAL_DISPATCH_FIXBRIDGE_ACK',
  VISIT_FEE_ACK: 'VISIT_FEE_ACK',
  HOMEOWNER_SERVICE_AGREEMENT: 'HOMEOWNER_SERVICE_AGREEMENT',
  VISIT_CANCELLATION_POLICY: 'VISIT_CANCELLATION_POLICY',
  QUOTE_SCOPE_APPROVAL: 'QUOTE_SCOPE_APPROVAL',
  CHANGE_ORDER_APPROVAL: 'CHANGE_ORDER_APPROVAL',
  PAYMENT_AUTHORIZATION: 'PAYMENT_AUTHORIZATION',
  PAYMENT_VISIT_POLICY: 'PAYMENT_VISIT_POLICY',
  MARKETING_SMS_EMAIL: 'MARKETING_SMS_EMAIL',
};

/** @deprecated use ACCEPTANCE_TYPES */
export const ACKNOWLEDGMENT_TYPES = {
  DISPATCH_CONSENT: 'PROFESSIONAL_DISPATCH_PROVIDER_ACK',
  QUOTE_APPROVAL: 'QUOTE_SCOPE_APPROVAL',
  CHANGE_ORDER_APPROVAL: 'CHANGE_ORDER_APPROVAL',
  PAYMENT_AUTHORIZATION: 'PAYMENT_AUTHORIZATION',
  DIY_ACKNOWLEDGMENT: 'DIY_SAFETY',
};

function requestMeta(req) {
  return {
    ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.socket?.remoteAddress || null,
    userAgent: req?.headers?.['user-agent'] || null,
    sourceRoute: req?.originalUrl || req?.url || null,
  };
}

function parseConsentsFromBody(body = {}) {
  const out = new Set();
  if (body?.consents && typeof body.consents === 'object' && !Array.isArray(body.consents)) {
    for (const [type, val] of Object.entries(body.consents)) {
      if (val === true) out.add(String(type).toUpperCase());
    }
  }
  if (Array.isArray(body?.consents)) {
    for (const item of body.consents) {
      const type = item?.acceptanceType || item?.type;
      if (type && (item?.accepted === true || item === true)) out.add(String(type).toUpperCase());
    }
  }
  if (body?.acceptances && typeof body.acceptances === 'object') {
    for (const [type, val] of Object.entries(body.acceptances)) {
      if (val === true) out.add(String(type).toUpperCase());
    }
  }
  if (body?.acknowledged === true || body?.acknowledgment === true) {
    out.add('LEGACY_SINGLE_ACK');
  }
  for (const [key, val] of Object.entries(body || {})) {
    if (key.startsWith('ack_') && val === true) {
      out.add(key.replace(/^ack_/, '').toUpperCase());
    }
  }
  return out;
}

export async function recordHomeownerAcceptance(pool, {
  userId,
  guestSessionId = null,
  jobId = null,
  quoteId = null,
  changeOrderId = null,
  paymentId = null,
  acceptanceType,
  documentKey = null,
  documentVersion = null,
  documentTitle = null,
  metadata = null,
  snapshotId = null,
  snapshotData = null,
  actionCompleted = true,
  idempotencyKey = null,
  ipAddress = null,
  userAgent = null,
  sourceRoute = null,
}) {
  const meta = resolveAcceptanceMeta(acceptanceType);
  const docKey = documentKey || meta.documentKey;
  const docVersion = documentVersion || meta.documentVersion;
  const docTitle = documentTitle || meta.documentTitle;

  const { rows } = await pool.query(
    `INSERT INTO homeowner_acceptances (
       user_id, guest_session_id, job_id, quote_id, change_order_id, payment_id,
       acceptance_type, document_key, document_version, document_title,
       accepted, accepted_at, metadata, snapshot_id, snapshot_data,
       action_completed, idempotency_key, ip_address, user_agent, source_route
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW(),$11,$12,$13,$14,$15,$16,$17,$18
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      userId,
      guestSessionId,
      jobId,
      quoteId,
      changeOrderId,
      paymentId,
      acceptanceType,
      docKey,
      docVersion,
      docTitle,
      metadata ? JSON.stringify(metadata) : null,
      snapshotId,
      snapshotData ? JSON.stringify(snapshotData) : null,
      actionCompleted === true,
      idempotencyKey,
      ipAddress,
      userAgent,
      sourceRoute,
    ]
  );
  return rows[0]?.id || null;
}

export async function hasCurrentAcceptance(pool, userId, acceptanceType, { jobId = null } = {}) {
  const meta = resolveAcceptanceMeta(acceptanceType);
  const params = [userId, acceptanceType, meta.documentVersion];
  let sql = `
    SELECT id FROM homeowner_acceptances
    WHERE user_id=$1 AND acceptance_type=$2 AND accepted=true
      AND document_version=$3`;
  if (meta.documentKey) {
    params.push(meta.documentKey);
    sql += ` AND document_key=$${params.length}`;
  }
  if (jobId != null) {
    params.push(jobId);
    sql += ` AND (job_id IS NULL OR job_id=$${params.length})`;
  }
  sql += ` ORDER BY accepted_at DESC LIMIT 1`;
  const { rows } = await pool.query(sql, params);
  return Boolean(rows[0]);
}

export function checkActionConsentsFromBody(body, actionKey) {
  const action = CONSENT_ACTIONS[actionKey];
  if (!action) return { ok: false, code: 'INVALID_CONSENT_ACTION', missing: [] };
  const submitted = parseConsentsFromBody(body);
  const missing = action.required
    .filter((r) => !submitted.has(r.acceptanceType))
    .map((r) => r.acceptanceType);
  return { ok: missing.length === 0, code: action.code, missing };
}

export async function recordMarketingConsent(pool, {
  userId,
  consented,
  channels = ['sms', 'email'],
  req = null,
}) {
  const meta = resolveAcceptanceMeta('MARKETING_SMS_EMAIL');
  const rm = requestMeta(req);
  await pool.query(
    `INSERT INTO marketing_consent_events (
       user_id, consented, channels, consent_version, ip_address, user_agent, source_route
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, consented === true, JSON.stringify(channels), meta.documentVersion, rm.ipAddress, rm.userAgent, rm.sourceRoute]
  );
  await pool.query(
    `UPDATE users SET
       marketing_consent=$2,
       marketing_consent_at=CASE WHEN $2 THEN NOW() ELSE marketing_consent_at END,
       marketing_consent_version=$3,
       marketing_opt_out_at=CASE WHEN $2 THEN NULL ELSE NOW() END
     WHERE id=$1`,
    [userId, consented === true, meta.documentVersion]
  );
}

export async function validateAndRecordActionConsents(pool, req, {
  actionKey,
  userId,
  guestSessionId = null,
  jobId = null,
  quoteId = null,
  changeOrderId = null,
  paymentId = null,
  snapshotId = null,
  snapshotData = null,
  idempotencyPrefix = null,
  legacyAcknowledgmentType = null,
}) {
  const action = CONSENT_ACTIONS[actionKey];
  if (!action) return { ok: false, code: 'INVALID_CONSENT_ACTION', message: 'Unknown consent action.' };

  const submitted = parseConsentsFromBody(req.body);
  const missing = [];

  for (const reqItem of action.required) {
    const type = reqItem.acceptanceType;
    if (!submitted.has(type)) {
      if (legacyAcknowledgmentType && submitted.has('LEGACY_SINGLE_ACK') && action.required.length === 1) {
        submitted.add(type);
        continue;
      }
      missing.push(type);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: action.code,
      message: 'Required acknowledgments are missing.',
      missing,
      missingAcceptanceTypes: missing,
    };
  }

  const rm = requestMeta(req);
  const recorded = [];
  for (const reqItem of action.required) {
    const type = reqItem.acceptanceType;
    const meta = resolveAcceptanceMeta(type);
    const idem =
      idempotencyPrefix != null
        ? `${idempotencyPrefix}:${type}:${meta.documentVersion}`
        : null;
    const id = await recordHomeownerAcceptance(pool, {
      userId,
      guestSessionId,
      jobId,
      quoteId,
      changeOrderId,
      paymentId,
      acceptanceType: type,
      documentKey: meta.documentKey,
      documentVersion: meta.documentVersion,
      documentTitle: meta.documentTitle,
      metadata: req.body?.consentMetadata || null,
      snapshotId,
      snapshotData:
        type === 'QUOTE_SCOPE_APPROVAL' || type === 'CHANGE_ORDER_APPROVAL' || type === 'PAYMENT_AUTHORIZATION'
          ? snapshotData
          : null,
      actionCompleted: true,
      idempotencyKey: idem,
      ...rm,
    });
    if (id) recorded.push(type);
  }

  return { ok: true, recorded };
}

export async function requireActionConsents(pool, req, res, options) {
  const result = await validateAndRecordActionConsents(pool, req, options);
  if (result.ok) return result;
  res.status(400).json({
    ok: false,
    code: result.code,
    message: result.message,
    missingAcceptanceTypes: result.missingAcceptanceTypes || result.missing,
  });
  return null;
}

export async function requireHomeownerAcknowledgment(pool, req, res, {
  jobId = null,
  acknowledgmentType,
  message = 'You must acknowledge the required disclosures before continuing.',
  quoteId = null,
  changeOrderId = null,
  paymentId = null,
  snapshotData = null,
  actionKey = null,
}) {
  const actionMap = {
    DISPATCH_CONSENT: 'PROFESSIONAL_DISPATCH',
    QUOTE_APPROVAL: 'QUOTE_APPROVAL',
    CHANGE_ORDER_APPROVAL: 'CHANGE_ORDER_APPROVAL',
    PAYMENT_AUTHORIZATION: 'PAYMENT_AUTHORIZATION',
    DIY_ACKNOWLEDGMENT: 'DIY_START',
  };
  const mappedAction = actionKey || actionMap[acknowledgmentType];

  if (mappedAction && CONSENT_ACTIONS[mappedAction]) {
    const result = await requireActionConsents(pool, req, res, {
      actionKey: mappedAction,
      userId: req.authUser.id,
      jobId,
      quoteId,
      changeOrderId,
      paymentId,
      snapshotData,
      idempotencyPrefix: `${mappedAction}:${req.authUser.id}:${jobId || 'na'}:${quoteId || changeOrderId || paymentId || 'x'}`,
      legacyAcknowledgmentType: acknowledgmentType,
    });
    return result != null;
  }

  const acknowledged =
    req.body?.acknowledged === true ||
    req.body?.acknowledgment === true ||
    req.body?.[`ack_${acknowledgmentType}`] === true;

  if (!acknowledged) {
    res.status(400).json({ ok: false, code: 'ACKNOWLEDGMENT_REQUIRED', message, acknowledgmentType });
    return false;
  }

  const rm = requestMeta(req);
  await recordHomeownerAcceptance(pool, {
    userId: req.authUser.id,
    jobId,
    quoteId,
    changeOrderId,
    paymentId,
    acceptanceType: acknowledgmentType,
    snapshotData,
    ...rm,
  });
  return true;
}

export async function recordHomeownerAcknowledgment(pool, args) {
  return recordHomeownerAcceptance(pool, {
    userId: args.userId,
    jobId: args.jobId,
    acceptanceType: args.acknowledgmentType,
    metadata: args.metadata,
  });
}

export async function assertHomeownerDispatchConsent(pool, userId, jobId) {
  const action = CONSENT_ACTIONS.PROFESSIONAL_DISPATCH;
  const missing = [];
  for (const reqItem of action.required) {
    const ok = await hasCurrentAcceptance(pool, userId, reqItem.acceptanceType, { jobId });
    if (!ok) missing.push(reqItem.acceptanceType);
  }
  return { ok: missing.length === 0, missing };
}

export async function listHomeownerAcceptances(pool, { userId = null, jobId = null, limit = 100 }) {
  const params = [];
  const clauses = [];
  if (userId != null) {
    params.push(userId);
    clauses.push(`a.user_id=$${params.length}`);
  }
  if (jobId != null) {
    params.push(jobId);
    clauses.push(`a.job_id=$${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS user_name, u.email AS user_email
     FROM homeowner_acceptances a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.accepted_at DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}
