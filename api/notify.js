import { brand } from './brand.js';

export async function sendEmailSafe({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.log(`[Email skipped] to=${to} subject=${subject}`);
    return { ok: true, simulated: true };
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || `${brand.productName} <onboarding@resend.dev>`,
      to,
      subject,
      html,
    });
    return { ok: true, simulated: false };
  } catch (e) {
    console.error('[Resend]', e.message);
    return { ok: false, message: e.message };
  }
}

export async function sendSmsSafe({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    console.log(`[SMS skipped] to=${to} body=${body}`);
    return { ok: true, simulated: true };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: from, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[Twilio]', text);
      return { ok: false, message: text };
    }
    return { ok: true, simulated: false };
  } catch (e) {
    console.error('[Twilio]', e.message);
    return { ok: false, message: e.message };
  }
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
    body: JSON.stringify({ text: message }),
  }).catch((e) => console.error('[Ops webhook]', e.message));
}
