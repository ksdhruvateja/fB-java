/**
 * Netlify scheduled function — processes due service reminders every 15 minutes.
 * Invokes the same processDueServiceReminders(pool) as admin/cron HTTP triggers.
 */
import { initDb, pool } from '../../api/app.js';
import { processDueServiceReminders } from '../../api/service-reminders.js';

let ready = false;

export const config = {
  schedule: '*/15 * * * *',
};

export const handler = async (event) => {
  const started = Date.now();
  if (!ready) {
    await initDb();
    ready = true;
  }
  console.log('[scheduled] service-reminder processor invoked', {
    nextRun: event?.next_run || null,
  });
  try {
    const result = await processDueServiceReminders(pool);
    console.log('[scheduled] service-reminder processor complete', {
      ...result,
      durationMs: Date.now() - started,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (e) {
    console.error('[scheduled] service-reminder processor failed', { error: e.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: 'processor_failed' }),
    };
  }
};
