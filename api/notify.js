import { brand } from './brand.js';
import { sendFixBridgeEmail } from './email/send-fixbridge-email.js';
import { mailStatus } from './mail.js';

/** Send branded FixBridge email (template or legacy HTML auto-wrapped). */
export async function sendEmailSafe({ to, subject, html, text, template, data, firstName, headers }) {
  return sendFixBridgeEmail({
    to,
    subject,
    html,
    text,
    template,
    data,
    firstName,
    headers,
  });
}

/** True only when a real SMS provider is configured (Twilio). */
export function smsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

/**
 * SMS — disabled unless Twilio env vars are set. Prefer email.
 */
export async function sendSmsSafe({ to, body }) {
  if (!smsConfigured()) {
    return {
      ok: false,
      configured: false,
      message: 'SMS delivery is not currently configured.',
    };
  }
  console.log(`[SMS stub] Twilio vars present but send not implemented — to=${to}`);
  return {
    ok: false,
    configured: true,
    message: 'SMS provider credentials are set but outbound SMS is not yet enabled in this build.',
  };
}

export function notifyOps(message) {
  const url = process.env.SLACK_WEBHOOK_URL?.trim() || process.env.N8N_WEBHOOK_URL?.trim();
  if (!url) {
    console.log(`[Ops alert] ${message}`);
    return;
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[${brand.productName || 'FixBridge'}] ${message}` }),
  }).catch((e) => console.error('[Ops webhook]', e.message));
}

export { mailStatus };
