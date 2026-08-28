/**
 * Direct Gmail SMTP mailer (nodemailer).
 * Uses a Google Account + App Password — no Resend / third-party ESP.
 *
 * Required env:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (16-char Google App Password)
 * Optional:
 *   FROM_EMAIL=FixBridge <you@gmail.com>     (defaults to GMAIL_USER)
 */
import nodemailer from 'nodemailer';
import { brand } from './brand.js';

let transporterPromise = null;

function gmailUser() {
  return (process.env.GMAIL_USER || '').trim();
}

function gmailPass() {
  return (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim();
}

function gmailConfigured() {
  return Boolean(gmailUser() && gmailPass());
}

function fromAddress() {
  const configured = (process.env.FROM_EMAIL || '').trim();
  if (configured) return configured;
  const user = gmailUser();
  const name = brand.productName || 'FixBridge';
  return user ? `${name} <${user}>` : `${name} <noreply@localhost>`;
}

async function getTransporter() {
  if (!gmailConfigured()) return null;
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser(),
          pass: gmailPass(),
        },
      })
    );
  }
  return transporterPromise;
}

/**
 * Send an email via Gmail SMTP.
 * @returns {{ ok: boolean, simulated?: boolean, messageId?: string, message?: string }}
 */
export async function sendMail({ to, subject, html, text }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, message: 'Missing recipient.' };

  const transporter = await getTransporter();
  if (!transporter) {
    console.log(
      `[Gmail not configured] to=${recipient} subject=${subject}\n` +
        `Set GMAIL_USER and GMAIL_APP_PASSWORD in .env to send email.`
    );
    if (text) console.log(text.slice(0, 500));
    return {
      ok: false,
      simulated: true,
      message: 'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.',
    };
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: recipient,
      subject: subject || `(no subject) ${brand.productName || 'FixBridge'}`,
      html: html || undefined,
      text: text || undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.error('[Gmail SMTP]', e.message);
    return { ok: false, message: e.message || 'Failed to send email.' };
  }
}

export function mailStatus() {
  return {
    provider: 'gmail',
    configured: gmailConfigured(),
    from: gmailConfigured() ? fromAddress() : null,
  };
}
