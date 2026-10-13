// Replit dev server — runs the Express API on port 3001
import { randomUUID } from 'crypto'; // Imported to generate unique structural request tracking IDs
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app, { initDb, pool } from './api/app.js';
import { processDueServiceReminders } from './api/service-reminders.js';
import { processComplianceExpirationAlerts } from './api/contractor-compliance-alerts.js';
import { ensureAssessmentQueueSchema, startAssessmentQueueWorker } from './api/assessment-queue.js';
import { attachAssessmentQueue, getAssessmentProcessor } from './api/assessment-worker.js';
import { buildSitemapXml, renderPublicPageHtml } from './api/public-page-html.js';

const PORT = process.env.PORT || process.env.API_PORT || 3001;
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');

// 🔥 HOTFIX MIDDLWARE: Intercepts public incoming route requests and assigns a unique ID string
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || req.headers['X-Request-ID'] || randomUUID();
  next();
});

if (process.env.PORT) {
  let indexHtml = null;
  const readIndex = () => {
    if (indexHtml == null) indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    return indexHtml;
  };
  // Public URLs use the site's canonical domain (VITE_SITE_URL, baked into index.html at build),
  // not APP_URL, which can point at the hosting provider's domain.
  const siteUrlFor = (req) => {
    const fromBuild = readIndex().match(/<link\s+rel="canonical"\s+href="(https?:\/\/[^"]+?)\/?"/)?.[1];
    return (process.env.PUBLIC_SITE_URL || fromBuild || process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  };

  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(buildSitemapXml(siteUrlFor(req)));
  });
  app.use(express.static(distDir, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    try {
      // Public content pages (/blog, /contact, ...) get their own title and description.
      res.type('html').send(renderPublicPageHtml(readIndex(), req.path, siteUrlFor(req)));
    } catch (err) {
      next(err);
    }
  });
}

initDb()
  .then(async () => {
    // Durable AI-assessment queue. Set FIXERA_WORKER_ENABLED=false on API-only instances when a
    // separate worker service runs (with FIXERA_QUEUE_EXTERNAL_WORKER=true on the API side).
    let queueWorker = null;
    if (process.env.NEON_DATABASE_URL) {
      try {
        await ensureAssessmentQueueSchema(pool);
        if (process.env.FIXERA_WORKER_ENABLED !== 'false') {
          queueWorker = startAssessmentQueueWorker(pool, (p, payload) => getAssessmentProcessor()(p, payload));
          attachAssessmentQueue(queueWorker);
          console.log('[FixBridge API] Assessment queue worker running', queueWorker.stats());
        }
      } catch (e) {
        console.error('[FixBridge API] Assessment queue unavailable; using in-process scheduling', e.message);
      }
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[FixBridge API] Running on http://localhost:${PORT}`);
      if (process.env.ENABLE_SERVICE_REMINDER_POLL === 'true') {
        const intervalMs = Number(process.env.SERVICE_REMINDER_POLL_MS || 15 * 60 * 1000);
        console.log(`[FixBridge API] Service reminder poll enabled every ${intervalMs}ms`);
        setInterval(() => {
          processDueServiceReminders(pool).catch((err) => {
            console.error('[service-reminder poll]', err.message);
          });
        }, intervalMs);
      } else {
        console.log(
          '[FixBridge API] Service reminder poll disabled. Set ENABLE_SERVICE_REMINDER_POLL=true or call POST /api/admin/service-reminders/process'
        );
      }

      if (process.env.ENABLE_COMPLIANCE_EXPIRATION_POLL !== 'false') {
        const complianceIntervalMs = Number(process.env.COMPLIANCE_EXPIRATION_POLL_MS || 6 * 60 * 60 * 1000);
        const runComplianceSweep = () => {
          processComplianceExpirationAlerts(pool).catch((err) => {
            console.error('[compliance-expiration poll]', err.message);
          });
        };
        console.log(`[FixBridge API] Compliance expiration poll every ${complianceIntervalMs}ms`);
        setTimeout(runComplianceSweep, 30_000);
        setInterval(runComplianceSweep, complianceIntervalMs);
      }
    });

    // Graceful shutdown: on a deploy or scale-in, finish in-flight requests and return
    // database connections instead of dropping users mid-request.
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[FixBridge API] ${signal} received; draining`);
      queueWorker?.stop();
      server.close(() => {
        pool.end().catch(() => {}).finally(() => process.exit(0));
      });
      setTimeout(() => process.exit(0), Number(process.env.SHUTDOWN_GRACE_MS || 25_000)).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('[FixBridge API] DB init failed:', err.message);
    process.exit(1);
  });