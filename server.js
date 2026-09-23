// Persistent API server — local, Replit, and Railway.
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import app, { initDb, pool } from './api/app.js';
import { isRailwayRuntime } from './api/hosting.js';
import { processDueServiceReminders } from './api/service-reminders.js';
import { processComplianceExpirationAlerts } from './api/contractor-compliance-alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const HOST = '0.0.0.0';
const railway = isRailwayRuntime();
const serveSpa =
  process.env.SERVE_SPA === 'true' ||
  (railway && process.env.SERVE_SPA !== 'false');
const reminderPollEnabled =
  process.env.ENABLE_SERVICE_REMINDER_POLL === 'true' ||
  (railway && process.env.ENABLE_SERVICE_REMINDER_POLL !== 'false');

// 🔥 HOTFIX MIDDLWARE: Intercepts public incoming route requests and assigns a unique ID string
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || req.headers['X-Request-ID'] || randomUUID();
  next();
});

if (serveSpa && fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

initDb()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`[FixBridge API] Running on http://${HOST}:${PORT}`);
      if (reminderPollEnabled) {
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
  })
  .catch((err) => {
    console.error('[FixBridge API] DB init failed:', err.message);
    process.exit(1);
  });
