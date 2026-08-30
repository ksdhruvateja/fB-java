// Replit dev server — runs the Express API on port 3001
import app, { initDb, pool } from './api/app.js';
import { processDueServiceReminders } from './api/service-reminders.js';
import { processComplianceExpirationAlerts } from './api/contractor-compliance-alerts.js';

const PORT = process.env.API_PORT || 3001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
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
  })
  .catch((err) => {
    console.error('[FixBridge API] DB init failed:', err.message);
    process.exit(1);
  });
