import {
  LEGAL_DOCUMENT_CONTENT,
  listLegalDocumentsForClient,
  getLegalDocument,
} from './legal-documents.js';
import { getCurrentLegalDocument, listCurrentLegalDocuments } from './legal-document-store.js';
import {
  hasCurrentAcceptance,
  listHomeownerAcceptances,
  validateAndRecordActionConsents,
} from './homeowner-consent.js';
import {
  getMarketingPreferences,
  updateMarketingPreferences,
} from './marketing-consent-service.js';

export function registerHomeownerConsentRoutes(app, { pool, requireAuth, requireAdmin, requirePermission }) {
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  app.get('/api/legal/documents', async (_req, res) => {
    try {
      const documents = await listCurrentLegalDocuments(pool);
      if (documents.length) {
        return res.json({
          ok: true,
          documents: documents.map((d) => ({
            key: d.key,
            title: d.title,
            version: d.version,
            route: d.route,
            acceptanceType: d.acceptanceType,
            effectiveDate: d.effectiveDate,
          })),
        });
      }
      res.json({ ok: true, documents: listLegalDocumentsForClient() });
    } catch (e) {
      res.json({ ok: true, documents: listLegalDocumentsForClient() });
    }
  });

  app.get('/api/legal/documents/:key', async (req, res) => {
    try {
      const doc = await getCurrentLegalDocument(pool, req.params.key);
      if (doc) {
        return res.json({ ok: true, document: doc });
      }
    } catch (e) {
      /* fallback */
    }
    const staticDoc = getLegalDocument(String(req.params.key || '').toUpperCase());
    if (!staticDoc) return res.status(404).json({ ok: false, message: 'Document not found.' });
    const content = LEGAL_DOCUMENT_CONTENT[staticDoc.key] || { heading: staticDoc.title, sections: [] };
    res.json({
      ok: true,
      document: {
        key: staticDoc.key,
        title: staticDoc.title,
        version: staticDoc.version,
        route: staticDoc.route,
        acceptanceType: staticDoc.acceptanceType,
        content,
      },
    });
  });

  app.get('/api/homeowner/consent/status', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const userId = req.authUser.role === 'admin' && req.query.userId
        ? Number(req.query.userId)
        : req.authUser.id;
      const diy = await hasCurrentAcceptance(pool, userId, 'DIY_SAFETY');
      const prefs = await getMarketingPreferences(pool, userId);
      res.json({
        ok: true,
        diySafetyAccepted: diy,
        marketingConsent: prefs?.emailMarketing?.subscribed || prefs?.smsMarketing?.subscribed || false,
        marketingEmailOptIn: prefs?.emailMarketing?.subscribed === true,
        marketingSmsOptIn: prefs?.smsMarketing?.subscribed === true,
        preferences: prefs,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load consent status.' });
    }
  });

  app.post('/api/homeowner/consent/action', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner' && req.authUser.role !== 'admin') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const actionKey = String(req.body?.actionKey || '').trim();
      if (!actionKey) {
        return res.status(400).json({ ok: false, message: 'actionKey is required.' });
      }
      const jobId = req.body?.jobId != null ? Number(req.body.jobId) : null;
      if (jobId != null && Number.isFinite(jobId)) {
        const { rows: jobs } = await pool.query(
          `SELECT homeowner_user_id FROM managed_jobs WHERE id=$1`,
          [jobId]
        );
        if (!jobs[0]) return res.status(404).json({ ok: false, message: 'Job not found.' });
        if (
          req.authUser.role !== 'admin' &&
          Number(jobs[0].homeowner_user_id) !== Number(req.authUser.id)
        ) {
          return res.status(403).json({ ok: false, message: 'Not allowed.' });
        }
      }
      const result = await validateAndRecordActionConsents(pool, req, {
        actionKey,
        userId: req.authUser.id,
        jobId: Number.isFinite(jobId) ? jobId : null,
        idempotencyPrefix: `${actionKey}:${req.authUser.id}:${jobId || 'na'}:${Date.now()}`,
      });
      if (!result.ok) {
        return res.status(400).json({
          ok: false,
          code: result.code,
          message: result.message,
          missingAcceptanceTypes: result.missingAcceptanceTypes || result.missing,
        });
      }
      if (actionKey === 'DIY_START') {
        if (jobId != null && Number.isFinite(jobId)) {
          const { rows: jobs } = await pool.query(
            `SELECT diy_risk_level, ai_assessment, description FROM managed_jobs WHERE id=$1`,
            [jobId]
          );
          const job = jobs[0];
          if (job) {
            const { classifyDiyRiskLevel } = await import('./diy-safety.js');
            const assessment =
              typeof job.ai_assessment === 'string' ? JSON.parse(job.ai_assessment) : job.ai_assessment;
            const classified = classifyDiyRiskLevel(job.description || '', assessment);
            if (classified.level === 'red' || job.diy_risk_level === 'red') {
              return res.status(400).json({
                ok: false,
                code: 'DIY_BLOCKED_RED',
                message: 'Guided DIY is not available for this safety risk. Request a professional instead.',
              });
            }
          }
        }
        await pool.query(`UPDATE users SET diy_safety_accepted_version=$2 WHERE id=$1`, [
          req.authUser.id,
          '1.0',
        ]);
      }
      res.json({ ok: true, recorded: result.recorded || [] });
    } catch (e) {
      console.error('consent action:', e);
      res.status(500).json({ ok: false, message: 'Could not record consent.' });
    }
  });

  app.post('/api/homeowner/consent/marketing', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const emailOptIn = typeof req.body?.emailOptIn === 'boolean'
        ? req.body.emailOptIn
        : req.body?.consented === true;
      const smsOptIn = typeof req.body?.smsOptIn === 'boolean'
        ? req.body.smsOptIn
        : req.body?.consented === true;
      const prefs = await updateMarketingPreferences(pool, {
        userId: req.authUser.id,
        emailOptIn,
        smsOptIn,
        source: 'homeowner_settings',
        req,
      });
      res.json({
        ok: true,
        marketingConsent: prefs.emailMarketing.subscribed || prefs.smsMarketing.subscribed,
        preferences: prefs,
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not update marketing preference.' });
    }
  });

  app.get('/api/admin/homeowner-acceptances', requireAuth, requireAdmin, need('homeowners.view'), async (req, res) => {
    try {
      const userId = req.query.userId != null ? Number(req.query.userId) : null;
      const jobId = req.query.jobId != null ? Number(req.query.jobId) : null;
      const rows = await listHomeownerAcceptances(pool, {
        userId: Number.isFinite(userId) ? userId : null,
        jobId: Number.isFinite(jobId) ? jobId : null,
        limit: Math.min(Number(req.query.limit) || 100, 500),
      });
      res.json({
        ok: true,
        acceptances: rows.map((r) => ({
          id: Number(r.id),
          userId: Number(r.user_id),
          userName: r.user_name,
          userEmail: r.user_email,
          jobId: r.job_id != null ? Number(r.job_id) : null,
          quoteId: r.quote_id != null ? Number(r.quote_id) : null,
          changeOrderId: r.change_order_id != null ? Number(r.change_order_id) : null,
          paymentId: r.payment_id != null ? Number(r.payment_id) : null,
          acceptanceType: r.acceptance_type,
          documentKey: r.document_key,
          documentVersion: r.document_version,
          documentTitle: r.document_title,
          acceptedAt: r.accepted_at,
          snapshotId: r.snapshot_id != null ? Number(r.snapshot_id) : null,
          actionCompleted: r.action_completed === true,
          sourceRoute: r.source_route,
        })),
      });
    } catch (e) {
      console.error('admin acceptances:', e);
      res.status(500).json({ ok: false, message: 'Could not load acceptance history.' });
    }
  });
}
