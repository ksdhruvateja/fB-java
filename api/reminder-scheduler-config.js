/**
 * Deploy-time reminder scheduler configuration.
 * Keep in sync with netlify.toml [functions."process-service-reminders"] schedule.
 * Health reporting uses this + explicit env overrides — not Netlify runtime inference.
 */
export const REMINDER_SCHEDULER_CONFIG = {
  scheduledFunctionName: 'process-service-reminders',
  schedule: '*/15 * * * *',
  /** Set via netlify.toml build.environment on Netlify production deploys. */
  netlifyConfiguredMode: 'netlify_scheduled_function_configured',
};
