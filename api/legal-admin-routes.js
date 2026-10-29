import {
  getCurrentLegalDocument,
  listCurrentLegalDocuments,
  listDocumentVersions,
  publishLegalDocumentVersion,
  getHomeownerLegalStatus,
  seedLegalDocumentVersions,
} from './legal-document-store.js';
import { listHomeownerAcceptances } from './homeowner-consent.js';
import { buildJobEvidencePackage } from './job-evidence.js';

export function registerLegalAdminRoutes(app, { pool, requireAuth, requireAdmin, requirePermission, audit }) {
  const need = typeof requirePermission === 'function'
    ? requirePermission
    : () => (_req, _res, next) => next();

  app.get('/api/legal/public', async (_req, res) => {
    try {
      const documents = await listCurrentLegalDocuments(pool);
      res.json({
        ok: true,
        documents: documents.map((d) => ({
          key: d.key,
          title: d.title,
          version: d.version,
          effectiveDate: d.effectiveDate,
          route: d.route,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load legal documents.' });
    }
  });

  app.get('/api/legal/public/:key', async (req, res) => {
    try {
      const doc = await getCurrentLegalDocument(pool, req.params.key);
      if (!doc) return res.status(404).json({ ok: false, message: 'Document not found.' });
      res.json({ ok: true, document: doc });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load document.' });
    }
  });

  app.get('/api/homeowner/legal/status', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const documents = await getHomeownerLegalStatus(pool, req.authUser.id);
      res.json({ ok: true, documents });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load legal status.' });
    }
  });

  app.get('/api/homeowner/legal/history', requireAuth, async (req, res) => {
    try {
      if (req.authUser.role !== 'homeowner') {
        return res.status(403).json({ ok: false, message: 'Homeowners only.' });
      }
      const rows = await listHomeownerAcceptances(pool, { userId: req.authUser.id, limit: 200 });
      res.json({ ok: true, acceptances: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load acceptance history.' });
    }
  });

  app.get('/api/admin/legal/documents', requireAuth, requireAdmin, need('legal.view'), async (_req, res) => {
    try {
      const documents = await listCurrentLegalDocuments(pool);
      res.json({ ok: true, documents });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load documents.' });
    }
  });

  app.get('/api/admin/legal/documents/:key/versions', requireAuth, requireAdmin, need('legal.view'), async (req, res) => {
    try {
      const versions = await listDocumentVersions(pool, req.params.key);
      res.json({ ok: true, versions });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load versions.' });
    }
  });

  app.post('/api/admin/legal/documents/:key/publish', requireAuth, requireAdmin, need('legal.edit'), async (req, res) => {
    try {
      const key = String(req.params.key || '').toUpperCase();
      const b = req.body || {};
      const current = await getCurrentLegalDocument(pool, key);
      const doc = await publishLegalDocumentVersion(pool, {
        documentKey: key,
        title: b.title || current?.title || key,
        version: String(b.version || '').trim(),
        effectiveDate: b.effectiveDate || new Date().toISOString().slice(0, 10),
        route: b.route || current?.route || `/legal/${key.toLowerCase().replace(/_/g, '-')}`,
        audience: b.audience || current?.audience || 'public',
        content: b.content || current?.content || { sections: [] },
        createdBy: req.authUser.id,
      });
      if (typeof audit === 'function') {
        await audit(pool, req.authUser.id, 'LEGAL_DOCUMENT_PUBLISHED', 'legal_document_versions', String(doc.id), {
          documentKey: key,
          version: doc.version,
        });
      }
      res.json({ ok: true, document: doc });
    } catch (e) {
      console.error('publish legal:', e);
      res.status(500).json({ ok: false, message: 'Could not publish document version.' });
    }
  });

  app.get('/api/admin/legal/acceptances', requireAuth, requireAdmin, need('legal.view'), async (req, res) => {
    try {
      const rows = await listHomeownerAcceptances(pool, {
        userId: req.query.userId != null ? Number(req.query.userId) : null,
        jobId: req.query.jobId != null ? Number(req.query.jobId) : null,
        limit: Math.min(Number(req.query.limit) || 100, 500),
      });
      res.json({ ok: true, acceptances: rows });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Could not load acceptances.' });
    }
  });

  app.get('/api/admin/jobs/:id/evidence', requireAuth, requireAdmin, need('jobs.view'), async (req, res) => {
    try {
      const pkg = await buildJobEvidencePackage(pool, Number(req.params.id));
      if (!pkg) return res.status(404).json({ ok: false, message: 'Job not found.' });
      res.json({ ok: true, evidence: pkg });
    } catch (e) {
      console.error('job evidence:', e);
      res.status(500).json({ ok: false, message: 'Could not load job evidence.' });
    }
  });

  app.post('/api/admin/legal/seed', requireAuth, requireAdmin, need('legal.edit'), async (_req, res) => {
    try {
      await seedLegalDocumentVersions(pool);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, message: 'Seed failed.' });
    }
  });
}
