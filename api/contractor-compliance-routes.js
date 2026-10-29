import {
  COI_CERTIFICATE_HOLDER,
  COI_LEGAL_NOTICE_ADDRESS,
  DOCUMENT_TYPES,
  assertContractorDispatchEligible,
  getContractorComplianceSummary,
  loadComplianceHistory,
  loadCurrentComplianceDocuments,
  recalculateDispatchEligible,
  rejectComplianceDocument,
  setDocumentApplicability,
  uploadComplianceDocument,
  verifyComplianceDocument,
} from './contractor-compliance.js';
import { getJobComplianceTier } from './contractor-compliance-matrix.js';
import { processComplianceExpirationAlerts } from './contractor-compliance-alerts.js';
import {
  getContractorAgreementStatus,
  recordContractorAgreementAcceptance,
  loadContractorAgreementAcceptances,
} from './contractor-agreement.js';
import {
  getSoloOwnerStatus,
  submitSoloOwnerAcknowledgment,
  reviewSoloOwnerAcknowledgment,
  reportSoloOwnerWorkforceChange,
} from './solo-owner.js';
import { AGREEMENT_V4_TITLE, AGREEMENT_V4_VERSION } from './contractor-agreement-content.js';

export function registerContractorComplianceRoutes(app, {
  pool,
  requireAuth,
  requireAdmin,
  requireAdminWrite,
  requirePermission,
  audit,
}) {
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  app.get('/api/contractor/compliance/summary', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const summary = await getContractorComplianceSummary(pool, req.authUser.id);
      res.json({ ok: true, summary });
    } catch (e) {
      console.error('contractor compliance summary:', e);
      res.status(500).json({ ok: false, message: 'Could not load compliance summary.' });
    }
  });

  app.get('/api/contractor/compliance/documents/:type/file', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const documentType = String(req.params.type || '').toUpperCase();
      const { rows } = await pool.query(
        `SELECT file_name, file_data FROM contractor_compliance_documents
         WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
        [req.authUser.id, documentType]
      );
      if (!rows[0]?.file_data) {
        return res.status(404).json({ ok: false, message: 'Document not found.' });
      }
      res.json({ ok: true, fileName: rows[0].file_name, fileData: rows[0].file_data });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load document.' });
    }
  });

  app.post('/api/contractor/compliance/documents/:type', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const documentType = String(req.params.type || '').toUpperCase();
      const uploadLater = req.body?.uploadLater === true;
      const result = await uploadComplianceDocument(pool, {
        contractorUserId: req.authUser.id,
        documentType,
        fileName: req.body?.fileName || req.body?.name || null,
        fileData: req.body?.fileData || req.body?.data || null,
        issueDate: req.body?.issueDate || null,
        expirationDate: req.body?.expirationDate || null,
        uploadLater,
        actorUserId: req.authUser.id,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json({ ok: true, summary: result.summary });
    } catch (e) {
      console.error('contractor compliance upload:', e);
      res.status(500).json({ ok: false, message: 'Could not upload document.' });
    }
  });

  app.get('/api/admin/contractors/:id/compliance', requireAuth, requireAdmin, need('contractors.view'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const summary = await getContractorComplianceSummary(pool, contractorUserId);
      if (!summary) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      res.json({
        ok: true,
        summary,
        certificateHolder: COI_CERTIFICATE_HOLDER,
        legalNoticeAddress: COI_LEGAL_NOTICE_ADDRESS,
        documentTypes: DOCUMENT_TYPES,
      });
    } catch (e) {
      console.error('admin compliance summary:', e);
      res.status(500).json({ ok: false, message: 'Could not load compliance.' });
    }
  });

  app.get('/api/admin/contractors/:id/compliance/documents/:type/history', requireAuth, requireAdmin, need('contractors.view'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const documentType = String(req.params.type || '').toUpperCase();
      const history = await loadComplianceHistory(pool, contractorUserId, documentType);
      res.json({ ok: true, history });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load document history.' });
    }
  });

  app.get('/api/admin/contractors/:id/compliance/documents/:type/file', requireAuth, requireAdmin, need('contractors.view'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const documentType = String(req.params.type || '').toUpperCase();
      const version = req.query.version != null ? Number(req.query.version) : null;
      const { rows } = await pool.query(
        version
          ? `SELECT file_name, file_data FROM contractor_compliance_documents
             WHERE contractor_user_id=$1 AND document_type=$2 AND version=$3 LIMIT 1`
          : `SELECT file_name, file_data FROM contractor_compliance_documents
             WHERE contractor_user_id=$1 AND document_type=$2 AND is_current=true LIMIT 1`,
        version ? [contractorUserId, documentType, version] : [contractorUserId, documentType]
      );
      if (!rows[0]?.file_data) {
        return res.status(404).json({ ok: false, message: 'Document not found.' });
      }
      res.json({ ok: true, fileName: rows[0].file_name, fileData: rows[0].file_data });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load document.' });
    }
  });

  app.post('/api/admin/contractors/:id/compliance/documents/:type/verify', requireAuth, requireAdmin, requireAdminWrite, need('contractors.verify'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const documentType = String(req.params.type || '').toUpperCase();
      const result = await verifyComplianceDocument(pool, {
        contractorUserId,
        documentType,
        adminUserId: req.authUser.id,
        notes: req.body?.notes || null,
        expirationDate: req.body?.expirationDate || null,
        issueDate: req.body?.issueDate || null,
        policyCarrier: req.body?.policyCarrier || null,
        policyNumber: req.body?.policyNumber || null,
      });
      if (!result.ok) return res.status(400).json(result);
      if (audit) {
        await audit(pool, req.authUser.id, 'contractor_document_verified', 'contractor_compliance', contractorUserId, {
          documentType,
        });
      }
      res.json({ ok: true, summary: result.summary });
    } catch (e) {
      console.error('verify compliance doc:', e);
      res.status(500).json({ ok: false, message: 'Could not verify document.' });
    }
  });

  app.post('/api/admin/contractors/:id/compliance/documents/:type/reject', requireAuth, requireAdmin, requireAdminWrite, need('contractors.verify'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const documentType = String(req.params.type || '').toUpperCase();
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ ok: false, message: 'Rejection reason is required.' });
      const result = await rejectComplianceDocument(pool, {
        contractorUserId,
        documentType,
        adminUserId: req.authUser.id,
        reason,
      });
      if (!result.ok) return res.status(400).json(result);
      if (audit) {
        await audit(pool, req.authUser.id, 'contractor_document_rejected', 'contractor_compliance', contractorUserId, {
          documentType,
          reason,
        });
      }
      res.json({ ok: true, summary: result.summary });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not reject document.' });
    }
  });

  app.put('/api/admin/contractors/:id/compliance/documents/:type/applicability', requireAuth, requireAdmin, requireAdminWrite, need('contractors.verify'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const documentType = String(req.params.type || '').toUpperCase();
      const applicability = String(req.body?.applicability || '').toUpperCase();
      const result = await setDocumentApplicability(pool, {
        contractorUserId,
        documentType,
        applicability,
        adminUserId: req.authUser.id,
      });
      if (!result.ok) return res.status(400).json(result);
      res.json({ ok: true, summary: result.summary });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not update applicability.' });
    }
  });

  app.get('/api/admin/contractors/:id/compliance/dispatch-checklist', requireAuth, requireAdmin, need('contractors.view'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const jobTier = req.query.jobTier || req.query.tier || null;
      const { rows: users } = await pool.query(`SELECT * FROM users WHERE id=$1 AND role='contractor'`, [
        contractorUserId,
      ]);
      if (!users[0]) return res.status(404).json({ ok: false, message: 'Contractor not found.' });
      const docs = await loadCurrentComplianceDocuments(pool, contractorUserId);
      const job = jobTier ? { compliance_tier: jobTier } : null;
      const summary = await getContractorComplianceSummary(pool, contractorUserId, { job });
      const tier = getJobComplianceTier(job);
      const eligible = tier === 'level_2' ? summary.level2Eligible : summary.level1Eligible;
      res.json({
        ok: true,
        eligible,
        code: eligible ? null : 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE',
        tier,
        missingRequirements: summary.missingRequirements || [],
        overallStatus: summary.overallComplianceStatus,
        blockingItems: (tier === 'level_2' ? summary.level2 : summary.level1)?.blockingItems || [],
        reviewItems: (tier === 'level_2' ? summary.level2 : summary.level1)?.reviewItems || [],
        summary,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not evaluate dispatch eligibility.' });
    }
  });

  app.post('/api/admin/compliance/expiration-sweep', requireAuth, requireAdmin, requireAdminWrite, need('contractors.verify'), async (req, res) => {
    try {
      const result = await processComplianceExpirationAlerts(pool);
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('compliance expiration sweep:', e);
      res.status(500).json({ ok: false, message: 'Expiration sweep failed.' });
    }
  });

  app.post('/api/admin/contractors/:id/compliance/recalculate', requireAuth, requireAdmin, requireAdminWrite, need('contractors.verify'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const summary = await recalculateDispatchEligible(pool, contractorUserId);
      res.json({ ok: true, summary });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not recalculate compliance.' });
    }
  });

  app.get('/api/contractor/agreement/status', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const status = await getContractorAgreementStatus(pool, req.authUser.id);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load agreement status.' });
    }
  });

  app.post('/api/contractor/agreement/accept', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      await recordContractorAgreementAcceptance(pool, {
        contractorUserId: req.authUser.id,
        documentVersion: AGREEMENT_V4_VERSION,
        documentTitle: AGREEMENT_V4_TITLE,
        req,
        sourceRoute: '/api/contractor/agreement/accept',
      });
      const summary = await recalculateDispatchEligible(pool, req.authUser.id);
      const status = await getContractorAgreementStatus(pool, req.authUser.id);
      res.json({ ok: true, status, summary });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not record agreement acceptance.' });
    }
  });

  app.get('/api/contractor/solo-owner/status', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const status = await getSoloOwnerStatus(pool, req.authUser.id);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load solo owner status.' });
    }
  });

  app.post('/api/contractor/solo-owner/acknowledgment', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const result = await submitSoloOwnerAcknowledgment(pool, req.authUser.id, req.body || {}, req);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not submit solo owner acknowledgment.' });
    }
  });

  app.post('/api/contractor/solo-owner/workforce-change', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'contractor') {
        return res.status(403).json({ ok: false, message: 'Contractors only.' });
      }
      const result = await reportSoloOwnerWorkforceChange(pool, req.authUser.id, req.body || {});
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not record workforce change.' });
    }
  });

  app.get('/api/admin/contractors/:id/agreement', requireAuth, requireAdmin, need('contractors.view'), async (req, res) => {
    try {
      const contractorUserId = Number(req.params.id);
      const status = await getContractorAgreementStatus(pool, contractorUserId);
      const history = await loadContractorAgreementAcceptances(pool, contractorUserId);
      const soloOwner = await getSoloOwnerStatus(pool, contractorUserId);
      const { rows: users } = await pool.query(
        `SELECT provider_level, solo_owner_status FROM users WHERE id=$1`,
        [contractorUserId]
      );
      res.json({
        ok: true,
        agreement: status,
        history,
        soloOwner,
        providerLevel: users[0]?.provider_level || 'level_1',
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load contractor agreement records.' });
    }
  });

  app.post(
    '/api/admin/contractors/:id/solo-owner/review',
    requireAuth,
    requireAdmin,
    need('contractors.edit'),
    async (req, res) => {
      try {
        const contractorUserId = Number(req.params.id);
        const action = String(req.body?.action || '').toLowerCase();
        const result = await reviewSoloOwnerAcknowledgment(pool, contractorUserId, req.authUser.id, {
          action,
          reason: req.body?.reason || null,
        });
        if (!result.ok) return res.status(400).json(result);
        if (audit) {
          await audit(req, 'solo_owner_review', 'contractor', contractorUserId, { action });
        }
        res.json(result);
      } catch (e) {
        res.status(500).json({ ok: false, message: 'Could not review solo owner acknowledgment.' });
      }
    }
  );

  app.post(
    '/api/admin/contractors/:id/provider-level',
    requireAuth,
    requireAdminWrite,
    need('contractors.edit'),
    async (req, res) => {
      try {
        const contractorUserId = Number(req.params.id);
        const level = String(req.body?.providerLevel || req.body?.provider_level || '').toLowerCase();
        if (!['level_1', 'level_2', 'level1', 'level2'].includes(level)) {
          return res.status(400).json({ ok: false, message: 'providerLevel must be level_1 or level_2.' });
        }
        const normalized = level.includes('2') ? 'level_2' : 'level_1';
        await pool.query(`UPDATE users SET provider_level=$2, updated_at=NOW() WHERE id=$1`, [
          contractorUserId,
          normalized,
        ]);
        const summary = await recalculateDispatchEligible(pool, contractorUserId);
        res.json({ ok: true, providerLevel: normalized, summary });
      } catch (e) {
        res.status(500).json({ ok: false, message: 'Could not update provider level.' });
      }
    }
  );
}

/** Shared dispatch gate for invite/assign endpoints. */
export async function enforceContractorDispatchGate(pool, contractorUser, res, job = null) {
  const summary = await getContractorComplianceSummary(pool, contractorUser.id);
  if (!summary) {
    res.status(404).json({ ok: false, message: 'Contractor not found.' });
    return false;
  }

  const tier = getJobComplianceTier(job || {});
  const eligible = tier === 'level_2' ? summary.level2Eligible : summary.level1Eligible;
  const tierEval = tier === 'level_2' ? summary.level2 : summary.level1;

  if (eligible) return true;

  res.status(409).json({
    ok: false,
    code: 'CONTRACTOR_NOT_DISPATCH_ELIGIBLE',
    message:
      tier === 'level_2'
        ? 'Contractor is not eligible for Level 2 (managed/facility/emergency) dispatch.'
        : 'Contractor is not eligible for live dispatch.',
    tier,
    missingRequirements: tierEval?.missingRequirements || summary.missingRequirements || [],
    complianceStatus: summary.complianceStatus,
    overallStatus: tierEval?.overallStatus || summary.overallComplianceStatus,
    overallLabel: tierEval?.label || summary.overallLabel,
    blockingItems: tierEval?.blockingItems || [],
    reviewItems: tierEval?.reviewItems || [],
    applicationStatus: summary.applicationStatus,
    dispatchEligible: false,
    level1Eligible: summary.level1Eligible,
    level2Eligible: summary.level2Eligible,
  });
  return false;
}
