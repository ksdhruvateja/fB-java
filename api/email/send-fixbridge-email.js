/**
 * Central FixBridge email send function.
 */
import { sendMail } from '../mail.js';
import { wrapLegacyEmail, isBrandedEmail } from './layout.js';
import { renderEmailTemplate } from './templates.js';
import { emailFromHeader, EMAIL_REPLY_TO } from './email-config.js';

function logEmailDelivery({ template, to, subject, result }) {
  const status = result?.ok ? 'sent' : result?.simulated ? 'simulated' : 'failed';
  console.log(
    `[FixBridge email] template=${template || 'legacy'} to=${to} subject=${subject} status=${status}` +
      (result?.messageId ? ` id=${result.messageId}` : '') +
      (result?.message && !result.ok ? ` error=${result.message}` : '')
  );
}

/**
 * Send a branded FixBridge email.
 *
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} [opts.template] - registered template id
 * @param {object} [opts.data] - template data
 * @param {string} [opts.subject] - legacy mode
 * @param {string} [opts.html] - legacy mode (auto-wrapped if not branded)
 * @param {string} [opts.text] - legacy mode
 * @param {string} [opts.firstName] - for legacy wrap greeting
 * @param {object} [opts.headers]
 */
export async function sendFixBridgeEmail({
  to,
  template,
  data = {},
  subject,
  html,
  text,
  firstName,
  headers = {},
}) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, message: 'Missing recipient.' };

  let finalSubject = subject;
  let finalHtml = html;
  let finalText = text;
  let templateId = template || null;

  if (template) {
    const rendered = renderEmailTemplate(template, data);
    finalSubject = rendered.subject;
    finalHtml = rendered.html;
    finalText = rendered.text;
    templateId = template;
  } else if (html && !isBrandedEmail(html)) {
    const wrapped = wrapLegacyEmail({ subject, html, text, firstName: firstName || data?.firstName });
    finalHtml = wrapped.html;
    finalText = wrapped.text || text;
  }

  const result = await sendMail({
    to: recipient,
    subject: finalSubject,
    html: finalHtml,
    text: finalText,
    headers,
    replyTo: EMAIL_REPLY_TO,
  });

  logEmailDelivery({
    template: templateId,
    to: recipient,
    subject: finalSubject,
    result,
  });

  return { ...result, template: templateId };
}

export function emailSystemStatus() {
  return {
    from: emailFromHeader(),
    replyTo: EMAIL_REPLY_TO,
  };
}
